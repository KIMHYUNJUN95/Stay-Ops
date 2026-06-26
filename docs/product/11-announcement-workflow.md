# Announcement Workflow

## Purpose

Announcements are used for **official internal notices only**: company notices, operational updates,
building-specific instructions, and important information staff must read.

They are **not** a discussion board, not a feedback thread, and not a free conversation surface.
Questions / discussion / reactions should be handled in other modules, not inside announcements.

## Write Permission

All roles except Part-time Staff can create announcements.

Can create:

- Developer / Super Admin
- Owner
- Office Admin
- CS Staff
- Field Manager
- Staff

Cannot create:

- Part-time Staff

## Read Permission

Users can read announcements that target them.

Announcements can target:

- Everyone
- Specific role
- Specific property/building (deferred — requires property setup)
- Combination of property/building and role (deferred)

Current implementation:

- `everyone` scope: 조직 전체 대상
- `roles` scope: 지정된 역할에게만 노출
- Property/building targeting은 property setup 구현 전까지 보류 상태

## Required Fields

Announcement fields:

```txt
id
organization_id
title
content
image_urls
created_by_user_id
target_scope
target_property_ids
target_roles
is_important
is_pinned
show_popup_on_app_open
popup_until
allow_comments
created_at
updated_at
published_at
archived_at
```

## Mobile UI

### 목록 화면

날짜 타임라인 레이아웃으로 공지를 표시한다 (Wired 2026-06-26).

구성:

- 공지는 Tokyo 시간 기준 `published_at` 날짜로 그룹핑된다.
- 각 날짜 그룹 상단에 날짜 라벨 (`년 월 일` 형식, 로케일 적용)이 표시된다.
- 각 항목은 좌측에 도트+라인 타임라인 마커가 붙는다.
  - 중요 공지: `bg-red-600` 도트
  - 일반 공지: `bg-primary` 도트
  - 같은 날짜 그룹 내 마지막 항목 아래에는 세로 연결선을 표시하지 않음
- 항목 콘텐츠 영역:
  - 상단: 중요 공지는 빨간 AlertIcon + "중요" 칩, 일반 공지는 target label을 작은 캡션으로 표시
  - 제목 (`font-extrabold`, 최대 2줄 clamp)
  - 메타 한 줄: `{target label} · {author_name}`
  - 이미지 첨부 여부는 우측 `ImageIcon` 으로 표시

Current implementation:

- `getVisibleAnnouncements(session)` 서버 함수로 조직 내 표시 가능한 공지 목록을 가져온다.
- DB 정렬은 pinned 먼저, 이후 `published_at` 내림차순으로 반환된다.
- 날짜 그룹핑은 서버 컴포넌트에서 Tokyo timezone 기준으로 수행된다.

### 상세 화면

URL: `/mobile/announcements/[id]`

구성:

1. **중요 칩** — `is_important` 가 true일 때 AlertIcon + "중요" 텍스트의 빨간 pill 칩 표시
2. **제목** — `text-[21px] font-black` 대제목
3. **메타 블록** — `rounded-[13px] border bg-surface` 카드 안에 3행:
   - 게시일 (`published_at`)
   - 대상 (`target_scope` / `target_roles`)
   - 작성자 (`author_name`)
4. **본문** — `whitespace-pre-line` 으로 줄바꿈 보존, `text-[14px] font-medium`
5. **이미지** — `image_urls` 가 있으면 `AnnouncementImageGrid` (variant: `feature`) + "탭하여 확대" 힌트 표시

읽음 확인 UI 블록과 댓글 섹션은 모바일 상세 화면에 더 이상 렌더링되지 않는다 (2026-06-26 제거).
읽음 추적 서버 로직은 그대로 유지된다 (아래 Current implementation 참고).

Current implementation:

- `getVisibleAnnouncementById(session, id)` 로 공지를 조회하며 대상/조직 권한이 확인된다.
- 페이지 진입 시 `ensureAnnouncementRead(announcement, session.user.id)` 가 서버에서 자동으로 읽음 처리한다 (반환값은 UI에 표시하지 않음).
- 공지가 존재하지 않거나 표시 권한이 없으면 `notFound()` 처리된다.

### 팝업

URL 진입 시 팝업 조건을 충족한 공지가 있으면 `AnnouncementPopup` 컴포넌트가 렌더링된다.

현재 구현 (Wired 2026-06-26 — BottomSheet 전환 완료):

- `AnnouncementPopup` 은 공유 `BottomSheet` 컴포넌트를 사용한다.
- BottomSheet 내부 구성:
  1. 상단: 중요 칩 (AlertIcon + "중요") + 짧은 날짜 (`published_at`, 로케일 적용)
  2. 제목 (`text-[19px] font-black`)
  3. 본문 프리뷰 (최대 6줄 clamp, `whitespace-pre-line`)
  4. 이미지 (`AnnouncementImageGrid`, `imageUrls` 가 있을 때)
  5. 7일 숨기기 체크박스
  6. CTA 2버튼: 확인(ghost, `close` 호출) + 자세히 보기(primary, 상세 페이지로 이동)
- 드래그 내리기 / 스크림 탭으로 닫기 → `dismissCurrentAnnouncement()` 호출
- BottomSheet는 `max-h-[calc(100dvh-2rem)] overflow-y-auto` 로 긴 콘텐츠를 스크롤 처리

팝업 표시 조건:

- `show_popup_on_app_open` = true
- `popup_until` 이 현재 시각보다 미래이거나 null
- 서버 측 dismissal 레코드가 없음 (페이지 로드 전 필터링)
- 클라이언트 localStorage에 hide-until 기록이 없음 (즉시 숨기기 fast path)

## Image Attachments

공지에 이미지를 첨부할 수 있다.

제한:

- 공지당 최대 5장
- 장당 최대 8MB

권장 압축:

- 긴 쪽 최대 1600px 리사이즈
- JPEG/WebP quality 약 70-80%

Current implementation:

- 이미지는 공개 `announcement-images` Supabase Storage 버킷에 저장된다.
- 허용 포맷: JPEG, PNG, WebP, GIF
- 업로드는 브라우저에서 anon key + Storage RLS INSERT 정책을 통해 직접 수행된다 (Server Action body size 제한 우회).
- 클라이언트 측 압축 후 업로드: JPEG/PNG/WebP는 long edge 1600px + quality 0.75. GIF는 애니메이션 보존을 위해 무압축 통과.
- 이미지는 제출 전 개별 제거 가능.
- 업로드 완료 후 클라이언트가 public URL과 announcement UUID를 `createAnnouncement` server action에 전달한다.
- Server action은 URL을 Supabase 프로젝트 hostname / `announcement-images` 버킷 / `{orgId}/{announcementId}/{filename}` 3-segment 경로로 검증한다.
- 검증·권한·DB insert 실패 시 service role client로 업로드된 이미지를 정리한다 (미저장 announcement ID 한정).
- 고아 이미지 정리: platform admin 전용 `purgeOrphanAnnouncementImages` server action. 60분 유예 기간 적용, `/admin/announcements` 하단 버튼으로 실행.

관련 마이그레이션:

```txt
202605100003_announcement_images.sql            -- image_urls 컬럼 + 버킷 생성
202605170001_announcement_images_upload_policy.sql  -- Storage INSERT 정책
202605190001, 202605190002                      -- 경로 검증 강화 (UUID 세그먼트, 안전 파일명)
```

## Mobile Image Viewing

공지 이미지는 스크린샷, 안내문, 표 등 운영상 중요한 콘텐츠를 포함할 수 있다.

필수 모바일 동작:

- 이미지 탭 → 독립된 확대 이미지 뷰어 진입
- 뷰어에서 **두 손가락 핀치 줌** 지원
- 줌인 / 줌아웃 / 팬 이동 가능

권장 인터랙션 구조:

- 중요 공지 팝업 (BottomSheet) 에서 이미지를 탭하면 별도 줌 가능한 뷰어 레이어 진입
- BottomSheet 자체를 줌 표면으로 사용하지 말 것

이유:

- 핀치/드래그 이미지 제스처와 BottomSheet 드래그-닫기 제스처가 충돌함
- 이미지 뷰어는 이미지 콘텐츠 자체 열람에 최적화되어야 함

## Read Tracking

읽음 확인은 서버에서 자동으로 처리된다.

추적 정보:

```txt
announcement_id
user_id
read_at
```

Admin 사용자는 중요 공지를 누가 읽었는지 / 읽지 않았는지 조회할 수 있어야 한다.

Current implementation:

- `announcement_reads` 테이블에 공지별·사용자별 읽음 레코드 1건이 저장된다.
- `(announcement_id, user_id)` unique pair로 최초 읽음 시각을 보존한다.
- 상세 페이지 진입 시 `ensureAnnouncementRead()` server function 이 자동으로 읽음 처리한다 (mobile 및 admin 공통).
- 모바일 상세 화면에는 읽음 확인 UI 블록을 표시하지 않는다 (2026-06-26 제거). 읽음 처리는 백그라운드 서버 로직으로만 동작한다.
- Admin 공지 상세에서 읽음/미읽음 카운트 및 대상 사용자 목록 (역할·읽음 시각 포함) 조회가 가능하다.
- 팝업 닫기는 읽음 처리가 아님. 읽음 추적은 상세 페이지 진입에만 연결된다.

관련 마이그레이션:

```txt
202605100002_announcement_reads.sql
```

## Important and Pinned Announcements

Important announcement:

- 목록에서 빨간 AlertIcon 칩으로 강조 표시
- 팝업 트리거 가능 (독립 플래그)
- 더 강한 알림 동작 적용 가능

Pinned announcement:

- 공지 목록 최상단 고정

두 플래그는 별도로 관리된다. 중요하지 않은 공지도 고정할 수 있고, 중요 공지도 고정하지 않을 수 있다.

## App Open Popup

공지 작성자가 앱 오픈 시 팝업 표시 여부를 공지별로 설정한다.

팝업 동작:

- 대상 사용자에게만 표시
- 공지별로 독립 설정
- 사용자가 확인/숨기기 처리한 후 반복 표시되지 않음 (7일 후 재표시 여부는 Open Questions 참고)

Current implementation:

- 모바일 공지 목록 페이지와 어드민 공지 목록 페이지 진입 시 팝업 후보를 서버 측에서 pre-filter한다.
  - 서버 측 dismissal 레코드 (`announcement_popup_dismissals`) 를 먼저 제외하므로 어떤 기기에서도 dismissed 팝업이 페이지 로드 시 플래시되지 않는다.
- 사용자는 현재 세션에서만 닫거나, 7일 숨기기 체크박스를 통해 서버에 영구 저장할 수 있다.
- 7일 hide preference는 `announcement_popup_dismissals` (user x announcement 1행) 에 서버 측 저장된다. 모든 브라우저·기기에 적용된다.
- localStorage는 동일 페이지 내 즉시 숨기기 fast path로만 사용된다.
- 팝업 닫기는 읽음 처리가 아님. 읽음 추적은 상세 페이지 진입과 연결된다.
- 팝업 "자세히 보기" CTA: mobile → `/mobile/announcements/[id]`, admin → `/admin/announcements/[id]`
- 팝업은 공유 `BottomSheet` 컴포넌트로 표시된다 (2026-06-26 전환 완료).

## Comments

댓글은 **공지 방향성에 포함되지 않는다**.

이유:

- 공지는 깔끔한 공식 안내 채널로 유지되어야 한다.
- 토론은 게시판 또는 건의 플로우에서 처리되어야 한다.
- 댓글 스레드가 붙으면 공지가 운영 안내 도구가 아닌 커뮤니티 피드처럼 보인다.

Current implementation (레거시 처리 상태):

- 모바일 상세 페이지 (`/mobile/announcements/[id]`) 에서 `AnnouncementCommentsSection` 렌더링을 제거했다 (2026-06-26). `getAnnouncementComments` 호출과 댓글 관련 `searchParams` 처리도 함께 제거. 읽음 추적 (`ensureAnnouncementRead`) 은 유지.
- 어드민 상세 페이지 (`/admin/announcements/[id]`) 에서는 여전히 `AnnouncementCommentsSection` 이 렌더링되며 댓글 제출/수정/삭제가 가능하다.
- DB 스키마 (`announcement_comments` 테이블, `allow_comments` 컬럼) 가 유지되고 있다.
- 댓글 관련 server action (`createAnnouncementComment`, `updateAnnouncementComment`, `deleteAnnouncementComment` — `src/app/announcements/actions.ts`) 과 공유 컴포넌트 `AnnouncementCommentsSection`, lib 함수 `getAnnouncementComments` 는 어드민 사용을 위해 유지된다.
- 모바일 UI에서만 댓글을 제거했고, 어드민 댓글 및 서버 구현 전체는 **향후 클린업 대상** 으로 간주한다.

관련 마이그레이션:

```txt
202605100004_announcement_comments.sql
```

## Notifications

잠재적 알림 트리거:

- 새 중요 공지 게시
- 사용자 대상 새 공지 게시
- 팝업 공지 게시

## Open Questions

- Staff가 전체 대상으로 게시할 수 있는가, 아니면 자신의 property/역할만 가능한가?
- 공지 게시 전 승인 절차가 필요한가?
- 팝업 공지를 필수 확인 공지로 지정할 수 있어야 하는가?
- 읽음 추적을 전체 공지에 적용할 것인가, 중요 공지에만 적용할 것인가?
- 팝업이 첫 읽음 후 영구 사라져야 하는가?
- 중요 팝업이 사용자가 "확인/읽음" 탭할 때까지 반복 표시되어야 하는가?
