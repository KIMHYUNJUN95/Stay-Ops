# 23. 게시판(Board) 워크플로우

> **상태**: 기획 확정 / UI 디자인 대기 중  
> **최초 작성**: 2026-06-25  
> **관련 기능**: Announcements(공지), Suggestions(제안함)와 완전히 분리된 별도 기능

---

## 1. 기능 개요

### 목적
전 직원이 자유롭게 글을 올리고 소통하는 공개 게시판. 관리자 전용인 공지사항(Announcements)과 달리 모든 구성원이 동등하게 글쓴이가 될 수 있다.

### 공지사항(Announcements)과의 차이

| | 공지사항 | 게시판 |
|---|---|---|
| 작성 권한 | staff 이상 (part_time 제외) | 전 직원 (part_time 포함) |
| 독자 범위 | 역할/전체 필터링 가능 | 조직 전체 공개 |
| 팝업 | 앱 열 때 팝업 지원 | 없음 |
| 성격 | 하향식 공지 | 수평적 자유 소통 |
| 이모지 반응 | 없음 | 있음 |

### 핵심 기능
- **글 작성**: 제목(선택), 본문(필수), 이미지(최대 5장), 자유 태그
- **이모지 반응**: 👍 ❤️ 😂 😮 😢 — 사용자당 이모지별 1회 (토글)
- **댓글**: 텍스트 + 이미지(최대 3장), 소프트 삭제
- **고정(Pin)**: 관리자가 글을 상단 고정
- **읽음 추적**: 읽지 않은 글 배지 표시
- **소프트 삭제**: 글·댓글 모두 `deleted_at` 논리 삭제

---

## 2. 사용자 흐름

### 목록 화면
1. 고정 글(is_pinned = true)이 상단에 노출
2. 나머지 글은 최신순
3. 읽지 않은 글에 배지 표시 (board_post_reads 기반)
4. 태그 필터링 (선택 시 해당 태그 글만 표시)

### 글 작성
1. 작성 버튼 탭
2. 제목(선택) · 본문(필수) 입력
3. 이미지 첨부 (최대 5장, 클라이언트 측 압축)
4. 태그 입력 (자유 입력, 엔터/쉼표로 구분)
5. 제출 → 목록으로 복귀

### 글 상세
1. 글 내용 · 이미지 표시
2. 이모지 반응 (탭으로 토글, 반응 수 표시)
3. 댓글 목록 (최신순 or 등록순)
4. 댓글 작성 (텍스트 + 이미지 최대 3장)
5. 읽음 자동 기록

### 수정·삭제
- **수정**: 작성자 본인만 가능 (댓글은 수정 불가, 삭제 후 재작성)
- **삭제**: 작성자 또는 office_admin/owner

---

## 3. 데이터 모델

### 3.1 `board_posts` — 게시글

```sql
CREATE TABLE board_posts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_user_id   UUID NOT NULL REFERENCES auth.users(id),
  title                TEXT,                          -- nullable: 제목 없는 짧은 글 허용
  content              TEXT NOT NULL,
  tags                 TEXT[] NOT NULL DEFAULT '{}',  -- 자유 태그
  image_urls           TEXT[] NOT NULL DEFAULT '{}',  -- 최대 5장
  is_pinned            BOOLEAN NOT NULL DEFAULT false,
  allow_comments       BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMPTZ                    -- 소프트 삭제
);
```

### 3.2 `board_post_reads` — 읽음 추적

```sql
CREATE TABLE board_post_reads (
  post_id   UUID NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
```

### 3.3 `board_comments` — 댓글

```sql
CREATE TABLE board_comments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id              UUID NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_user_id   UUID NOT NULL REFERENCES auth.users(id),
  content              TEXT NOT NULL,
  image_urls           TEXT[] NOT NULL DEFAULT '{}',  -- 최대 3장
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMPTZ                    -- 소프트 삭제
);
```

### 3.4 `board_reactions` — 이모지 반응

```sql
CREATE TABLE board_reactions (
  post_id    UUID NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,  -- '👍' | '❤️' | '😂' | '😮' | '😢'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id, emoji)  -- 같은 이모지 중복 불가
);
```

### 지원 이모지 목록
`👍` `❤️` `😂` `😮` `😢` — 총 5종 (추후 확장 가능)

---

## 4. RLS (Row Level Security) 정책

> 읽기는 RLS 직접 적용, 쓰기는 server actions에서 SERVICE_ROLE로 처리

### `board_posts`
| 조작 | 허용 조건 |
|------|-----------|
| SELECT | 같은 org 활성 멤버 + `deleted_at IS NULL` |
| INSERT | 같은 org 활성 멤버 (전 직원) |
| UPDATE | `created_by_user_id = auth.uid()` (작성자 본인) |
| DELETE | 작성자 본인 OR org 내 office_admin/owner |

### `board_comments`
| 조작 | 허용 조건 |
|------|-----------|
| SELECT | 같은 org 활성 멤버 + `deleted_at IS NULL` |
| INSERT | 같은 org 활성 멤버 + 해당 글의 `allow_comments = true` |
| DELETE | 작성자 본인 OR org 내 office_admin/owner |

> 댓글 수정 없음 — 삭제 후 재작성

### `board_reactions`
| 조작 | 허용 조건 |
|------|-----------|
| SELECT | 같은 org 활성 멤버 |
| INSERT | `user_id = auth.uid()` + 같은 org 활성 멤버 |
| DELETE | `user_id = auth.uid()` (본인 반응만 취소) |

### `board_post_reads`
| 조작 | 허용 조건 |
|------|-----------|
| INSERT/UPDATE | `user_id = auth.uid()` (본인 읽음만 기록) |
| SELECT | `user_id = auth.uid()` |

---

## 5. 서버 액션 (Server Actions)

파일 위치: `src/app/mobile/board/actions.ts`

### 글 관련
```typescript
createBoardPost(formData: FormData): Promise<{ id: string } | { error: string }>
// 필드: title?, content, tags[], image_urls[]
// 검증: content 필수, image_urls 최대 5개, tags 최대 10개

updateBoardPost(id: string, formData: FormData): Promise<void | { error: string }>
// 작성자 본인 확인 후 수정
// 수정 시 updated_at 갱신

deleteBoardPost(id: string): Promise<void | { error: string }>
// 작성자 본인 OR office_admin/owner 확인
// deleted_at = now() 소프트 삭제

pinBoardPost(id: string, pin: boolean): Promise<void>
// office_admin/owner 전용
```

### 댓글 관련
```typescript
addBoardComment(postId: string, content: string, imageUrls: string[]): Promise<{ id: string } | { error: string }>
// allow_comments 확인
// image_urls 최대 3개
// 작성 후 글 작성자에게 알림 발송

deleteBoardComment(commentId: string): Promise<void | { error: string }>
// 작성자 본인 OR office_admin/owner 확인
// deleted_at = now() 소프트 삭제
```

### 반응 관련
```typescript
toggleBoardReaction(postId: string, emoji: string): Promise<void>
// emoji 유효성 검사 (허용 목록 내)
// 이미 있으면 DELETE, 없으면 INSERT
```

### 읽음 처리
```typescript
markBoardPostRead(postId: string): Promise<void>
// UPSERT board_post_reads
// 상세 페이지 진입 시 자동 호출 (서버 컴포넌트에서)
```

---

## 6. 쿼리 모듈

파일 위치: `src/lib/board.ts`

```typescript
// 목록 조회 (페이지네이션 포함)
getBoardPosts(session, options: { tag?: string; cursor?: string; limit?: number })
  → { posts: BoardPost[]; nextCursor: string | null }

// 단건 조회
getBoardPost(session, postId: string)
  → BoardPost | null

// 댓글 조회
getBoardComments(session, postId: string)
  → BoardComment[]

// 반응 집계 (이모지별 카운트 + 내가 반응했는지)
getBoardReactions(session, postId: string)
  → { emoji: string; count: number; myReaction: boolean }[]

// 읽지 않은 글 수 (배지용)
getUnreadBoardPostCount(session)
  → number
```

---

## 7. 이미지 스토리지

기존 `request-images` 버킷 사용. 새 경로 타입 추가:

```
{organization_id}/board-posts/{post_id}/{filename}
{organization_id}/board-comments/{comment_id}/{filename}
```

Storage RLS에 `board-posts`, `board-comments` 경로 패턴 추가 필요.  
이미지 압축: 기존 `compressImageFile()` 유틸 재사용 (`src/components/announcements/announcement-image-uploader.tsx`).

---

## 8. 네비게이션 통합

### 사이드 메뉴 등록 (`src/config/navigation.ts`)
```typescript
{
  id: "board",
  href: "/mobile/board",
  icon: Newspaper,                  // lucide-react
  labelKey: "board",
  roles: ALL_ROLES,                 // 전 직원 접근 가능
}
```

### 하단 탭 커스터마이징
기존 `defaultBottomNavTabIds` 에 추가하지 않음 — 사용자가 커스터마이징으로 직접 추가 가능.

### 읽지 않은 글 배지
상단 탭 아이콘 옆에 미읽음 카운트 표시 (기존 `announcements` 배지 패턴과 동일).

---

## 9. 알림 연동

### 새 notification_type
| 타입 | 발생 시점 | 수신자 |
|------|-----------|--------|
| `board_post_commented` | 내 글에 댓글 | 글 작성자 |
| `board_comment_replied` | 내가 댓글 단 글에 새 댓글 | 해당 글의 다른 댓글 작성자들 (선택 구현) |

### 알림 생성 위치
`addBoardComment()` server action 내에서 `notifyBoardComment()` 호출.  
기존 패턴: `src/lib/notifications/create.ts`의 `notifySuggestionParticipants()` 참고.

---

## 10. i18n 키 구조

파일: `src/lib/i18n.ts` → `board` 섹션 추가

```typescript
board: {
  // 네비게이션
  navLabel: { ko: "게시판", ja: "掲示板", en: "Board" },

  // 목록
  listTitle: { ko: "게시판", ja: "掲示板", en: "Board" },
  newPost: { ko: "글쓰기", ja: "投稿する", en: "New Post" },
  pinned: { ko: "고정", ja: "固定", en: "Pinned" },
  noPost: { ko: "아직 게시글이 없어요", ja: "まだ投稿がありません", en: "No posts yet" },
  filterByTag: { ko: "태그 필터", ja: "タグで絞り込む", en: "Filter by tag" },

  // 작성
  composeTitle: { ko: "글쓰기", ja: "投稿作成", en: "Write Post" },
  fieldTitle: { ko: "제목", ja: "タイトル", en: "Title" },
  fieldTitlePlaceholder: { ko: "제목 (선택)", ja: "タイトル（任意）", en: "Title (optional)" },
  fieldContent: { ko: "내용", ja: "内容", en: "Content" },
  fieldContentPlaceholder: { ko: "내용을 입력하세요", ja: "内容を入力してください", en: "What's on your mind?" },
  fieldTags: { ko: "태그", ja: "タグ", en: "Tags" },
  fieldTagsPlaceholder: { ko: "태그 입력 후 Enter", ja: "タグを入力してEnter", en: "Add tag and press Enter" },
  fieldImages: { ko: "사진", ja: "写真", en: "Photos" },
  submit: { ko: "게시", ja: "投稿", en: "Post" },
  submitEdit: { ko: "수정 완료", ja: "更新する", en: "Save Changes" },

  // 상세
  commentCount: { ko: "댓글", ja: "コメント", en: "Comments" },
  commentPlaceholder: { ko: "댓글을 입력하세요", ja: "コメントを入力", en: "Write a comment..." },
  commentSubmit: { ko: "등록", ja: "送信", en: "Send" },
  deleteComment: { ko: "댓글 삭제", ja: "コメントを削除", en: "Delete comment" },
  noComments: { ko: "아직 댓글이 없어요", ja: "まだコメントがありません", en: "No comments yet" },
  commentsDisabled: { ko: "댓글이 비활성화된 글입니다", ja: "コメントは無効です", en: "Comments are disabled" },

  // 수정/삭제
  editPost: { ko: "글 수정", ja: "投稿を編集", en: "Edit Post" },
  deletePost: { ko: "글 삭제", ja: "投稿を削除", en: "Delete Post" },
  deletePostConfirm: { ko: "이 글을 삭제할까요?", ja: "この投稿を削除しますか？", en: "Delete this post?" },
  deleteCommentConfirm: { ko: "이 댓글을 삭제할까요?", ja: "このコメントを削除しますか？", en: "Delete this comment?" },
  pinPost: { ko: "글 고정", ja: "投稿を固定", en: "Pin Post" },
  unpinPost: { ko: "고정 해제", ja: "固定を解除", en: "Unpin Post" },

  // 반응
  reactions: { ko: "반응", ja: "リアクション", en: "Reactions" },
  addReaction: { ko: "반응 추가", ja: "リアクションを追加", en: "Add reaction" },

  // 오류
  errorContentRequired: { ko: "내용을 입력해주세요", ja: "内容を入力してください", en: "Content is required" },
  errorImageLimit: { ko: "이미지는 최대 5장입니다", ja: "画像は最大5枚です", en: "Max 5 images allowed" },
  errorCommentImageLimit: { ko: "댓글 이미지는 최대 3장입니다", ja: "コメント画像は最大3枚です", en: "Max 3 images per comment" },
}
```

---

## 11. 라우트 구조

```
/mobile/board/
├── page.tsx                — 목록 (고정 글 상단 + 최신순 피드)
├── new/
│   └── page.tsx            — 글 작성
└── [id]/
    ├── page.tsx            — 글 상세 (반응 · 댓글)
    └── edit/
        └── page.tsx        — 글 수정 (작성자만 접근)
```

---

## 12. 구현 순서 (Phase 3)

UI 디자인 핸드오프 후 아래 순서로 진행:

1. **DB 마이그레이션** — `supabase/migrations/YYYYMMDDXXXX_board.sql`
2. **DB 타입 업데이트** — `src/types/database.ts` 동기화
3. **쿼리 모듈** — `src/lib/board.ts`
4. **서버 액션** — `src/app/mobile/board/actions.ts`
5. **스토리지 RLS 업데이트** — board-posts, board-comments 경로 추가
6. **페이지 & 컴포넌트** — UI 디자인 기반으로 구현
7. **네비게이션 등록** — `src/config/navigation.ts`
8. **알림 연동** — `src/lib/notifications/create.ts`
9. **i18n 등록** — `src/lib/i18n.ts`
10. **lint + build 검증**

---

## 13. 미결 사항

| 항목 | 상태 |
|------|------|
| UI/UX 디자인 | 사용자 진행 예정 |
| 피드 방식 (최신순 무한스크롤 vs 페이지네이션) | 디자인 확정 후 결정 |
| 댓글 정렬 (등록순 vs 최신순) | 미정 |
| `board_comment_replied` 알림 구현 여부 | 선택 구현 (Phase 3에서 결정) |
| 글 신고 기능 | 미기획 (추후 검토) |
