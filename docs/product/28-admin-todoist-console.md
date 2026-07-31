# Admin Todoist Console (Dashboard) — Spec + As-Built

Status: **Implemented (2026-07-27).** 이 문서는 대시보드(어드민 웹) Todoist의 기획/IA/동작 스펙 +
실제 구현(as-built)이다. `/admin/tasks` 에 라이브. 구현 상세는 §12 참조.

> 개정 메모(2026-07-27): 기획 단계에서는 "보낸/받은 지시 전용 화면을 대표님이 별도 설계"(구 §7.2)로
> 두었으나, 실제 확정 디자인은 **지시(받은/보낸)를 메인 콘솔의 한 탭으로 통합**했다(콘솔 서브내비의
> "지시" 탭 안에서 받은/받은 세그먼트 전환). §7·§12를 이 as-built 기준으로 갱신했다.

기준 문서:
- 모바일 Todoist 전체 스펙 — `docs/product/18-todo-task-workflow.md`
- 프로젝트 스펙 — `docs/product/23-project-workflow.md`
- 기술 설계(as-built) — `docs/engineering/09-todo-task-technical-design.md`
- 어드민 IA — `docs/product/05-admin-web-ia.md`

---

## 1. Purpose & Scope (심플 원칙)

대시보드 Todoist는 **모바일 Todoist의 본래 목적을 큰 화면에서 그대로 쓰는 것**이 전부다. 여기에 사무실
관리자를 위한 **업무 지시(Work Directive)** 하나만 얹는다.

**In scope**
- 모바일 Todoist **코어 기능 전부**(생성/편집/완료/공유/반복/기간/태그/사진/컨텍스트 링크/캘린더/프로젝트)를
  데스크톱 레이아웃으로.
- **업무 지시** — 사무실 관리자가 특정 멤버에게 "오늘 이 업무 하라"고 보내는 기능 (§7). 보낸 지시는
  **보낸 사람 개인 일정엔 안 뜨고 받는 사람 일정에 뜬다.** **보낸 지시 / 받은 지시 전용 화면은 대표님이
  직접 설계**(메인 콘솔 프롬프트에는 미포함). 받는 사람은 "[매니저] 지시"로 누가·무엇을 명확히 봄.

**Out of scope (일부러 넣지 않음 — "번거롭지도 무겁지도 않게")**
- 팀 전체 조망/감사 대시보드, 멤버별 워크로드/완료율 KPI, 업무일지 취합 등 **관리자 분석/오버사이트 레이어**.
- 저장된 필터·라벨, 미리 알림, 전역 검색 등 **부가 기능**.
- **정식 담당자(assignee) 필드** — §8(향후 확장)으로 보류.

> 대시보드 Todoist는 "관리 콘솔"이 아니라 **"큰 화면 Todoist + 사무실 업무 지시"** 다. 다른 어드민
> 모듈(주문·분실물·수리·공지)이 "관리 느낌"인 것과 달리, Todoist는 **기능이 모바일과 같아야** 한다.

---

## 2. Locked Decisions (2026-07-24 기획 회의)

| 항목 | 결정 |
| --- | --- |
| 성격 | 모바일 투두 코어 그대로 + 업무 지시 1개. 관리자 분석/오버사이트/부가기능은 **미포함**. |
| 사용자 | 어드민 웹 접근 = 정직원(owner / senior_managing_director / office_admin / cs_staff / field_manager / staff). **파트타이머는 모바일 전용**(웹 미접근, 기능/데이터는 동일). |
| 레이아웃 | **Todoist 데스크톱식** — 좌 사이드바 + 메인 뷰 + 인라인 작업추가, 작업 클릭 시 우측 상세. |
| 뷰(IA) | 모바일과 동일: 오늘 / 내일 / 관리함 / 프로젝트 / 공유함 / 완료·기록 / 캘린더. |
| 담당자(assignee) | **미도입** (향후 확장 후보). |
| 업무 지시 | **공유 모델 재사용** — 매니저 = 지시자(작성자), 대상 = 수행자(참여자). 받는 사람 쪽 "지시" 표시 포함. |
| 동기화 | 같은 DB·같은 서버 액션 → 모바일↔대시보드 **자동 반영**(별도 동기화 계층 없음). |

---

## 3. Layout & IA (Todoist Desktop)

벤치마크: Todoist 데스크톱 앱. `/admin/*` 공용 콘솔의 "관리형" 패턴이 **아니라**, Todoist 본연의
개인 작업 워크스페이스를 따른다.

```
┌───────────────┬───────────────────────────────────────────┐
│  Sidebar       │  Main pane                                 │
│  ─────────     │  ───────────                               │
│  ＋ 작업 추가   │  [뷰 제목: 오늘 · N작업]                    │
│  🔎 검색       │  ◯ 작업 …                        (관리함) │
│  📥 관리함  N   │  ◯ 작업 …                        (관리함) │
│  📅 오늘   N   │  ┌ 인라인 작업추가 카드 ─────────────────┐ │
│  ▷ 내일        │  │ 작업 이름 / 설명                        │ │
│  🗂 프로젝트    │  │ [📅 날짜] [🏳 우선순위] [👤 대상] [＋]  │ │
│  📤 공유함      │  │                     [취소] [작업 추가]  │ │
│  ✓ 완료·기록   │  └─────────────────────────────────────────┘ │
│  🗓 캘린더      │                                            │
│  ───────       │                                            │
│  🗂 프로젝트     │      (작업 클릭 → 우측 상세 패널/모달)      │
│   # Haru-Ops    │                                            │
│   # PMS         │                                            │
└───────────────┴───────────────────────────────────────────┘
```

- **사이드바** — ＋작업추가(상단), 검색, 뷰 목록(관리함·오늘·내일·공유함·완료·캘린더 + 카운트 배지),
  프로젝트 목록(멤버 있는 공유 프로젝트). 하단 계정.
- **메인** — 선택한 뷰의 작업 목록 + **인라인 작업추가 카드**(Todoist처럼 목록 하단/상단에서 바로 입력).
- **우측 상세** — 작업 클릭 시 상세 패널(또는 모달). 모바일 상세와 동일 정보(본문/일정/기간/반복/태그/
  사진/컨텍스트/공유·참여자/업데이트 로그).
- 반응형: 좁은 폭에선 사이드바 접힘(햄버거). 데스크톱 우선.

> 공용 어드민 콘솔 계약(§4 admin-console.css: opsbar/qtbl/panel 등)을 **강제 적용하지 않는다.**
> Todoist 워크스페이스는 별도 시각 언어를 갖는다(디자인은 대표님이 진행).

---

## 4. Views (모바일 패리티)

모바일 7뷰를 그대로 데스크톱에. 각 뷰의 정의·정렬·필터 규칙은 **모바일과 동일**(18 문서 기준).

| 뷰 | 내용 | 비고 |
| --- | --- | --- |
| 오늘 | 지연(overdue) + 오늘 기준일 작업 + **반복은 오늘 회차** | 반복(2026-07-30 회차 모델): 완료해도 롤포워드 안 함, 오늘 회차가 독립 표시. 지연은 일회성=기존 배너, **반복=작업별 1건 "N일 밀림" + [오늘로 가져오기]/[삭제]** |
| 내일 | 내일 기준일 작업 | |
| 관리함 | **프로젝트 밖 모든 활성 작업**(날짜 무관) | Todoist Inbox 모델. 오늘/내일은 이 집합의 필터. **드래그 재정렬**(호버 시 왼쪽 그립, `reorderConsoleTasks`→`sort_order`) — 랭크된 작업 위, 미랭크는 최신순(새 작업 top). 검색/필터 중엔 비활성 |
| 프로젝트 | 프로젝트+섹션별 작업 | 프로젝트 작업은 이 뷰에만. 상단 배너에 멤버 요약(owner 포함 dedup 카운트) + **owner 전용 "프로젝트 삭제"**(confirm→cascade) |
| 공유함 | 내가 공유한(peer) 작업 | 업무 지시는 별도 "보낸 지시" 화면(§7, 별도 설계) |
| 완료·기록 | 완료일별 그룹 | **완료 로그(`task_updates` net) 기준** — 반복 완료 포함. 업무일지(보고서) 버튼 |
| 캘린더 | 월/아젠다 | 반복은 가상 미리보기. 상단 **"반복 숨기기" 토글**로 고정 반복 회차를 그리드·다가오는 일정·날짜 시트 전부에서 숨김(세션 상태, 기본 표시) |

- 뷰 전환은 사이드바. 목록/정렬/그룹핑/검색·날짜필터 규칙은 모바일 `TasksWorkspace`와 동일 규칙을
  따른다(중복 로직이 아니라 **동일 데이터·동일 정의** 재현).
- 데스크톱 편의: 넓은 화면이므로 목록 + 우측 상세를 **동시에** 볼 수 있다(모바일은 화면 전환).

---

## 5. Create / Edit (인라인 추가 + 업무 지시)

- **인라인 작업추가** — Todoist처럼 메인에서 바로 입력(작업 이름 → 엔터로 추가). 확장 시 설명/날짜/
  우선순위/공유 칩. "작업 추가"로 저장.
- **일정 피커** — 모바일과 **동일한 통합 일정 피커**(단일 날짜 + 빠른옵션 오늘/내일/다음 주/다음 주말/
  날짜 없음 + 달력 + 시간 + 기간(duration) + 반복(문맥형: 매일/매주 {요일}/평일마다/매월 {일}/매년 {월일})).
  데스크톱은 팝오버로 뜨는 형태(모바일은 BottomSheet) — **동작·데이터는 동일**.
- **상세 편집** — 작성자만 핵심 편집(모바일 규칙 동일). 참여자는 업데이트 로그.
- **업무 지시는 여기 인라인 추가가 아니라 별도 "보낸 지시" 화면에서 처리**(§7, 대표님 직접 설계). 메인
  콘솔의 작업 생성은 개인 작업 + peer 공유까지만 다룬다.

---

## 6. Detail Panel

모바일 상세와 **동일 정보**를 우측 패널로:
- 제목 / 상태(완료·다시 열기) / 우선순위 / 일정(날짜·시간·기간·반복) / 태그
- 본문 / 첨부 사진(뷰어) / 컨텍스트 링크(건물·객실·예약·게스트, "예약 보기")
- 공유·참여자(원작성자·첫 수신자·현재 참여자) / 받은 지시면 **"[매니저] 지시" 표식**(§7)
- 통합 업데이트 로그(노트 + system 이벤트: edited/shared/completed/reopened)
- 액션: 완료/다시 열기, 편집(작성자), 공유(peer), 참여자 관리, 삭제 — 모바일과 동일 권한 규칙
  (지시 보내기는 메인 콘솔이 아니라 별도 "보낸 지시" 화면)

---

## 7. Work Directive (업무 지시) — 별도 화면 (개정 2026-07-27)

### 7.1 개념 (개정)
사무실 관리자가 특정 멤버에게 "이 업무를 (오늘) 하라"고 보내는 것. **보낸 지시는 보낸 사람(매니저)의
개인 일정(오늘/관리함/캘린더)에는 생기지 않고, 받는 사람의 일정에 생긴다.** 지시는 개인 작업과 섞이지
않도록 **보낸 쪽·받은 쪽 각각 전용 화면**으로 다룬다.

- **받는 사람** — 지시받은 작업이 자기 **일정(오늘/캘린더)에 뜬다** + 별도 **"받은 지시"** 화면에서
  모아 본다. 받는 사람은 **"[매니저 이름]이 지시"** 를 명확히 본다(누가·무엇을).
- **보내는 사람(매니저)** — **자기 개인 일정엔 안 뜨고**, 별도 **"보낸 지시"** 화면에서 누구에게 무엇을
  보냈고 완료됐는지 추적한다.

### 7.2 화면 — 콘솔 내 "지시" 탭으로 통합 (as-built 2026-07-27)
확정 디자인은 지시를 **메인 콘솔 서브내비의 "지시" 탭**으로 통합했다. 탭 안에서 **받은 지시 / 보낸 지시**
세그먼트를 전환한다.
- **받은 지시** — 상단 안내 배너(`.sentnote--recv`) + 지연/해야 할 지시/진행 중/완료 섹션. 각 행에
  체크박스(완료 토글) · **"[작성자] 지시"** 칩 · 일정 칩(리스케줄 팝오버) · 대기/진행 중 상태 세그 ·
  답장(상세 열기) 버튼. 받은 지시 작업은 받는 사람의 **오늘/캘린더**에도 함께 뜬다(`myOwn`).
- **보낸 지시** — 상단 안내 배너(`.sentnote`) + 미확인·대기/진행 중/완료 섹션. 각 행에 대상자 칩 ·
  일정 칩 · 상태 pill · 대상 변경(공유 팝오버) · 상세 열기 버튼. 보낸 지시는 보낸 사람의 개인 뷰
  (오늘/내일/관리함/캘린더/공유함)에서 **제외**된다(`sentInstr` → `myOwn=false`).
- 지시 지정은 **인라인 작업추가**의 "대상 (지시)" 칩(공유 팝오버 `target` 모드)에서 이뤄진다. 1명 이상
  대상을 고르면 `is_directive` 로 생성되어 대상자 일정에 잡힌다.

### 7.3 데이터/구현 메모 (기획 관점)
- 지시 = `tasks`(작성자=매니저) + 받는 사람이 **doer**. **보낸 사람은 개인 뷰(오늘/관리함/캘린더)에서
  제외**되어야 하므로, 지시를 구분·분리하는 **표식 컬럼**이 필요하다(예: `directed_by_user_id`, 또는
  `is_directive` + 대상). 이 표식으로:
  - 받는 사람: 개인 뷰엔 뜨되(일정 생김) "받은 지시" 화면으로도 필터.
  - 보낸 사람: 개인 뷰에선 제외, "보낸 지시" 화면으로만 조회(`directed_by = 나`).
- peer 공유(동료끼리 공유, 공유함)는 지시와 **별개로 그대로 유지**.
- 알림: 기존 `task_shared` 재사용(문구만 "지시").
- **거절 불가(강제)·승인 워크플로는 넣지 않는다**(무겁고 Todoist 철학과 어긋남).

---

## 8. Sync & Route

- **동기화** — 대시보드와 모바일은 **같은 `tasks`/`task_participants`/`task_updates`/`projects` 테이블,
  같은 서버 액션**을 쓴다. 한쪽에서 만들거나 완료하면 다른 쪽에 그대로 반영. 실시간 구독은 불필요(다른
  콘솔처럼 액션 후 `router.refresh()`/revalidate로 충분).
- **읽기** — `getVisibleTasks` / `getTaskDetail` / `getVisibleProjects` / `getProjectDetail` 등 기존
  세션 스코프 lib를 그대로 재사용(표면 무관).
- **쓰기** — 기존 서버 액션 재사용. 데스크톱 인플레이스 UX를 위해 필요한 경우 결과 반환형 얇은 래퍼를
  둔다(공지 콘솔에서 쓴 `{ok}` 반환 패턴). 기존 모바일 액션 동작은 건드리지 않는다.
- **라우트** — 신설 `/admin/tasks` 권장(사이드바 라벨 "Todoist"). legacy `/admin/recurring-work`는
  `/admin/tasks`로 리다이렉트. (현재 `/admin/recurring-work`는 "준비 중" 플레이스홀더.)

---

## 9. Mobile Parity Mapping (체크리스트)

대시보드 구현 시 아래가 모바일과 **동일 동작**인지 확인한다(as-built 2026-07-27; 차이는 §12.5).

- [x] 오늘/내일/관리함/공유함/완료/캘린더/프로젝트 뷰 + **지시 탭** + 카운트 배지
- [x] 인라인 빠른추가(→관리함/오늘/내일/지시) — 날짜/우선순위/대상(지시) 칩. **사진·태그 입력은 축소**(§12.5)
- [x] 통합 일정 피커(단일 날짜 · 빠른옵션 · 달력 · 시간 · 기간 · 문맥형 반복). **yearly 제외**(백엔드 미지원)
- [x] 완료/다시 열기(상태 세그) + 완료·기록 그룹 + 업무일지(서버 `generateDailyReport`, 본인)
- [x] 공유(다중 참여자) / 참여자 관리 / 원작성자 leave = 삭제 / 참여자 self-remove
- [x] 반복 롤포워드(완료 시 다음 회차, 서버) · 지난-작업 일정변경(단일 날짜 피커) · 삭제 · 지연 일괄(오늘로/삭제)
- [x] 프로젝트 + 섹션 + 프로젝트 작업 + 멤버 초대(새 프로젝트 모달) + **프로젝트 삭제**(owner, confirm, cascade). 사진 20장은 상세/모바일에서
- [x] 컨텍스트 링크(건물·객실·예약·게스트) + "예약 보기"(→ /admin/calendar)
- [x] 캘린더 월/아젠다(반복 가상 미리보기는 서버 데이터 기준) · "반복 숨기기" 토글(세션, 그리드+다가오는일정+날짜시트 일괄)
- [x] **업무 지시** — 콘솔 "지시" 탭(받은/보낸 세그) + 받은 지시가 받는 사람 오늘/캘린더에 뜸 + "[작성자] 지시" 표식
- [x] i18n ko/ja/en / 권한(part-time 제외 웹 접근, 서버 게이트) / Tokyo 기준일(helpers)

---

## 10. Out of Scope / Future

- **정식 담당자(assignee) 필드** — 지금은 업무 지시(공유 재사용)로 충분. 현장에서 "작업마다 담당자 배정
  + 나에게 배정된 일 뷰"가 진짜 필요해지면 그때 모바일까지 함께 추가(모델 변경 동반).
- 관리자 조망/분석(팀 KPI·워크로드·업무일지 취합), 저장된 필터·라벨, 전역 검색, 거절 불가(강제) 지시.
- 프로젝트↔일반 작업 이동, 프로젝트 진행률/아카이브, 드래그 리스케줄(캘린더).

---

## 11. Design Handoff Note

디자인은 대표님이 직접 진행한다. Claude Design 등으로 넘길 때 이 문서의 §3(레이아웃/IA), §4(뷰),
§5(생성·일정 피커), §6(상세), §7(업무 지시)이 화면의 기준이다. 시각(색·타이포·간격)은 자유이되,
**Todoist 데스크톱의 가벼운 워크스페이스 감각**과 **모바일 기능 패리티**를 지킨다.

---

## 12. As-Built (구현 2026-07-27)

### 12.1 파일
- **라우트** — `src/app/admin/tasks/page.tsx` (thin: `requireAdminPageSession` → `getAdminTasksData` →
  `<AdminShell activeItem="recurring-work">` 안에 `<AdminTasksConsole>`). legacy
  `src/app/admin/recurring-work/page.tsx` 는 `/admin/tasks` 로 `redirect()`. 내비(`src/config/navigation.ts`)
  의 `recurring-work` href 를 `/admin/tasks` 로 변경.
- **데이터 로더** — `src/lib/admin-tasks.ts` `getAdminTasksData(session)`:
  `getVisibleTasks`/`getVisibleProjects`/`getShareableUsers`/`getCompletionRecords` 를 `Promise.all` 로 읽어
  `{ tasks, projects, users, completions, me, loadError }` 반환(실패 시 `loadError`).
  - `completions`: `task_updates`(`completed`/`reopened`, RLS-scoped, 최근 ~120일)를 (작업,토쿄일) 단위
    net(완료−재개)으로 집계한 완료 이력. **완료·기록 탭이 이걸 소스로 쓴다** — 반복 완료는 행이
    `open` 으로 롤포워드되어 `status=completed` 가 아니므로, 로그를 봐야 보고서(같은 소스)와 목록이 일치한다.
    렌더 시 각 record 를 `tasks` 에서 조회해 행으로 그리고, 반복 이력 행은 `forceDone`(완료 표시 + 체크박스 토글 금지).
- **서버 액션** — `src/app/admin/tasks/actions.ts` (모두 `{ok:true,id?}|{ok:false,error}` 반환):
  `createConsoleTask` · `setConsoleTaskStatus`/`toggleConsoleComplete`(반복은 `occurrenceDate` 인자로
  회차 완료 → `task_occurrence_state`, 롤포워드 없음) · `carryConsoleOverdueToToday`/`skipConsoleOverdue`
  (반복 지연 backlog 오늘로/스킵) · `updateConsoleTaskCore`(작성자) ·
  `rescheduleConsoleTask`(참여자) · `shareConsoleTask`(작성자) · `addConsoleNote` · `deleteConsoleTask`(작성자) ·
  `leaveConsoleTask`(작성자=전체 삭제) · `moveConsoleToToday` · `moveConsoleToInbox` · `createConsoleProject` ·
  `deleteConsoleProject`(owner 전용, 조직 스코프, cascade 하드 삭제 — 참가자·섹션·프로젝트 작업까지. 되돌릴 수
  없는 확정 삭제라 confirm 유지, task soft-delete/undo 경로 미사용. 모바일 `deleteProject` 미러) ·
  `generateConsoleReport`(모바일 `generateDailyReport` 위임) · `getConsoleTaskDetail`(상세: updates+context) ·
  `getConsoleProjectDetail`(프로젝트 섹션+작업). 세션+조직 컨텍스트는 `resolveSession`, 개별 작업 권한은
  `getTaskDetail`(RLS-scoped) non-null = 참여 증명. 서비스롤 쓰기는 `.eq("organization_id", …)` 로 스코프.
- **i18n** — `src/lib/admin-tasks-i18n.ts` `getAdminTasksDictionary(locale)` (ko/ja/en, 공용 tasks 문자열과
  분리 — 공지 콘솔 패턴). 하드코딩 UI 문자열 없음.
- **클라이언트** — `src/components/admin/tasks/admin-tasks-console.tsx` (메인, 단일 파일: 서브내비 + 필터 +
  뷰 라우팅 + 작업 행 + 인라인 추가 + 상세 패널 + 팝오버 + 우산 레일 + day sheet + 보고서/새 프로젝트 모달 +
  토스트) · `helpers.ts` (클라이언트 안전 Tokyo 날짜/술어/포맷/아바타; `@/lib/tasks` 는 server-only 라 독립
  정의) · `admin-tasks-console.css` (Claude Design `todo.css` 를 `.adm` 스코프로 포팅).

### 12.2 뷰(구현) & 우산 레일
- 서브내비 탭: 오늘 · 내일 · 관리함 · **지시**(받은/보낸 세그) · 공유함 · 캘린더 · 완료·기록 + 카운트 배지
  (오늘=오늘+지연, 지시=받은+보낸, 지연/받은지시 있으면 `alert`). 프로젝트 칩 줄 + "새 프로젝트".
- 와이드 뷰(오늘/내일/관리함/공유함/지시/프로젝트)는 우측 **우산 레일**(진행 현황 · 받은 지시 · 보낸 지시 ·
  다가오는 일정 · 멤버별 공유 카드) 동반. 완료·캘린더는 레일 없음.
- 진행 현황 스탯의 **"오늘 완료"** 는 완료 로그(`data.completions`, task_updates net) 중 `오늘 · 본인 · 개인 작업`
  건수 — `status=completed` 만 세면 반복 완료(롤포워드로 open)가 빠져 실제보다 적게 나오므로 로그 기준으로 집계.
- 상세 패널 `.dp` 는 `position:fixed` 우측 슬라이드오버. 작업 클릭 시 `getConsoleTaskDetail` 로 로그+컨텍스트
  lazy 로드.

### 12.3 데이터 모델 변경
- **`tasks.is_directive boolean not null default false`** 추가
  (`supabase/migrations/202607270001_task_directive.sql`, 프로덕션 적용 완료). `src/types/database.ts`,
  `src/lib/tasks.ts`(TASK_SELECT · `TaskRecord.isDirective` · hydrate) 반영. 지시 = `is_directive=true` +
  대상 참여자. `sentInstr`(작성자=나 & 지시 & 대상≥1) 는 개인 뷰에서 제외, `recvInstr`(내가 대상) 는 개인
  뷰에도 노출.
- 날짜 없는 개인/공유 빠른추가는 관리함(`is_inbox`)으로 저장(dated/project 작업은 아님).

### 12.4 공용 콘솔 계약 예외 (문서화)
- 이 콘솔은 `/admin/*` 공용 콘솔 계약(§4 admin-console.css opsbar/qtbl/panel, §4a 공용 date picker,
  §4b 공용 export)을 **의도적으로 강제 적용하지 않는다** — Todoist 워크스페이스 독립 시각 언어(§3, §11).
  일정 피커는 모바일과 동일한 통합 피커(팝오버)이며 공용 `AdminDatePicker`/`.calpop` 을 쓰지 않는다.
- CSS 포팅 시 base `admin-console.css` 와 충돌한 3종을 리네임: `.subnav→.tsubnav`, `.empty→.tempty`,
  `.wgrid→.tgrid`. 셸(사이드바/탑바)은 AdminShell 이 소유.

### 12.5 알려진 차이(모바일 대비 의도적 축소)
- ~~인라인 추가에 첨부(사진)·태그 입력 없음 … 사진·태그·컨텍스트 링크와 제목/본문 편집은 모바일에서.~~
  **2026-07-29 폐기 — §16에서 콘솔에 전부 구현됨.** 사진·태그·컨텍스트 링크·제목/본문 모두 콘솔에서
  생성·편집할 수 있고, 상세 패널의 연필 버튼은 모바일로 나가는 링크가 아니라 인라인 편집 토글이다.
- 반복은 백엔드 지원 규칙만: 매일/매주/평일/주말/매월(문맥형). **yearly 는 백엔드 미지원이라 제외**,
  `custom` 은 round-trip 전용. 기간(duration)은 프리셋(없음/15/30/60/120분)만.
- 날짜 필터는 프리셋(오늘/이번 주/지연/날짜 없음). 받은 지시의 "답장·노트" 버튼은 상세 패널(노트 입력)로
  연결(전용 리마인드 알림은 알림 일괄 구현 시점에 — 그때까지 보낸 지시의 리마인드 버튼은 제공하지 않음).
- **우선순위 변경은 작성자만**(코어 편집 규칙) — 비작성자 행/메뉴에는 우선순위 항목을 노출하지 않음.

### 12.6 상호작용 QA 반영 (2026-07-27, 정적 감사 후속)
- **팝오버/모달 표시 버그 수정:** 포털 오버레이가 `.adm` 스코프 밖이라 CSS/토큰 미적용으로 안 보이던 문제 →
  각 포털을 `<div class="adm" style="display:contents">`로 감싸 복구. 상세 패널 `.dp` 는 `.dp.on` 으로 표시.
  `.tpop-anchor`/`.tpop-scrim` 로 팝오버를 계산 좌표에 fixed 배치(+ `max-height`/스크롤).
- **입력 포커스 유실 제거:** 내부 렌더 헬퍼(Detail/Popover/Schedule/Share/Report/NewProject/Section/
  InlineAdd 등)를 컴포넌트(`<X/>`)가 아니라 함수 호출(`X()`)로 인라인해 매 렌더 remount 방지.
- **일정 "날짜 없음" + 적용**으로 기존 작업의 날짜 제거 가능(→ 관리함, `rescheduleConsoleTask` 빈 날짜 처리).
- **관리함 이동 시 날짜/시간/반복 제거**(`moveConsoleToInbox`) — 관리함="날짜 없는 스테이징" 불변식 유지
  (오늘/캘린더 중복 노출 방지).
- **파괴적 작업 확인 UX:** 삭제 / 나만 빠지기 / 지난 미완료 정리는 중앙 확인 모달을 거친다(하드삭제 정책 준수).
- **지연 배너 "일정 변경"은 일정 팝오버를 연다:** 이전엔 곧바로 "전부 오늘로 이동"이었으나, 다른 "일정 변경"
  트리거(상세/행 메뉴/날짜 칩)와 동일하게 일정 팝오버(빠른옵션·달력·시간·반복)를 띄우고, 선택한 날짜로
  지연 작업을 **일괄 이동**한다(각 작업의 시간/반복은 유지).
- **관리함 = 프로젝트 밖 모든 활성 작업 (모바일과 동일 모델로 정렬, 2026-07-27):** 이전 대시보드는 관리함을
  `is_inbox`(날짜 없는 것만)로 필터했으나, 모바일과 벤치마크(Todoist)처럼 **관리함 = 프로젝트에 속하지 않은
  모든 활성 작업**(날짜 유무 무관)으로 바꿨다. 콘솔은 `personalTasks = tasks.filter(!projectId)` 를 만들어
  오늘/내일/관리함/공유함/지시/캘린더/레일을 **프로젝트 제외** 집합으로 렌더하고(모바일 `page.tsx` 와 동일
  분리), 프로젝트 작업은 프로젝트 뷰에만 나온다. 오늘/내일은 이 집합의 **필터**라 날짜 있는 작업은 관리함과
  오늘에 함께 뜬다. "관리함으로 이동"(`moveConsoleToInbox`)은 **프로젝트에서 빼는 것**(날짜 유지)으로 조정.
  `is_inbox` 컬럼은 더 이상 뷰를 가르지 않는다(잔존). 완료·기록만 전체(`tasks`) 기준이라 프로젝트 완료도 포함.

### 12.7 디버그 QA 2차 (2026-07-29, 정적 전수 감사 후속)
- **공유 관리에서 참가자 제거 지원:** 공유 팝오버가 기존 참가자를 미리 체크로 보여주므로, 체크 해제 후
  적용하면 실제로 제거되도록 `shareConsoleTask`를 "추가만"에서 **원하는 집합으로 reconcile(추가+제거)** 로 변경.
  기존 작업 관리(src=task)는 0명(전원 제거→비공개)도 적용 가능(인라인 추가 대상만 0에서 비활성).
- **레일 "다가오는 일정"** 이 전체 `tasks`(프로젝트/보낸지시 포함)를 쓰던 것을 `personalTasks + myOwn`로 수정
  (레일↔캘린더 일치). inbound/sent 레일도 personalTasks 로 정렬.
- **삭제/나가기 시 상세 패널 슬라이드아웃 유지:** `closePanel`이 `detail`을 즉시 비우지 않고 exit 완료 시점에
  `panelTask`와 함께 정리 → 삭제 후 `tasks`에서 빠져도 슬라이드아웃 애니메이션 유지.
- **"관리함으로 이동"은 프로젝트 작업에만 노출**(비프로젝트는 이미 관리함 → 무동작이라 숨김). `moveConsoleToInbox`는
  `project_id/section_id`만 null(날짜 유지), `is_inbox`는 건드리지 않음(crumb 오표시 방지).
- **업무일지(보고서)는 본인 완료만** 집계(`generateDailyReport`)이므로, 보고서 모달 힌트 건수도 본인 기준으로 정정
  (완료·기록 리스트는 팀 완료를 기록으로 계속 표시).
- **캘린더 진입 시 필터 초기화:** 캘린더는 필터바가 없어 활성 필터를 해제할 UI가 없으므로, 캘린더로 이동할 때
  검색/우선순위/날짜 필터를 초기화한다(`goView`). 다른 뷰로 이동하는 탭/레일 링크도 `goView`로 통일.
- **today 자동 롤오버:** `today`를 상태로 두고 1분 간격 + 창 포커스/가시성 변경 시 Tokyo 날짜를 재확인해
  갱신(변경 없으면 리렌더 스킵). 콘솔을 열어둔 채 Tokyo 자정을 넘겨도 오늘/내일/지연 기준이 새로고침 없이 롤오버.

### 12.8 되돌리기(실행 취소) 토스트 + soft-delete (2026-07-29, 오너 승인)
- **소프트 삭제:** 작업 삭제는 hard-delete → `deleted_at`(마이그레이션 `202607290001`). 모든 조회는
  `deleted_at is null` 필터. `deleteConsoleTask`/author `leaveConsoleTask` 가 `deleted_at` 세팅,
  `restoreConsoleTask` 가 복구(삭제행 직접 조회 + 작성자 검증). See CLAUDE.md 규칙 9 예외.
- **되돌리기 토스트(`.undobar`)**: Todoist식 다크 하단-좌측 바(메시지 + 서브 + "실행 취소" + X, 6초).
  - **완료**: 체크박스/상세 완료 시 "완료 처리했습니다"(+반복이면 "다음: {날짜}") · 실행 취소 = reopen.
    재오픈은 정정이라 일반 토스트(undo 없음).
  - **삭제**: 단일 작업 삭제는 **확인 모달 제거 → 즉시 soft-delete + "작업을 삭제했습니다 · 실행 취소"**(restore).
    나가기·지난 정리(벌크)는 확인 모달 유지.
- i18n: `undoBtn`/`undoNext`/`tDeletedUndoable`. 모바일도 동일 패턴(완료 undo 확장 + 삭제 `?deleted` 토스트).
- **상세 패널 바깥 클릭 닫기 + 슬라이드 인/아웃:** 우측 상세 슬라이드오버 뒤에 스크림(`.dp-scrim`, 어드민
  `.panel-scrim` 계약과 동일한 dim)을 두어 빈 공간 클릭 시 닫힌다(Esc·X 동일). 패널은 열 때 우측에서
  슬라이드로 들어오고 닫을 때 슬라이드로 나간다 — `sel`(열림 의도)와 `panelTask`(렌더 콘텐츠, exit 트랜지션
  동안 유지)를 분리하고 `.dp.on`/`.dp-scrim.on` 토글을 rAF/타이머로 구동(닫힘 후 280~300ms에 언마운트).
- **중앙 모달 오프셋 버그:** 공용 `.pop`의 `top:calc(100%+8px)`/`right:0` 이 `.day-wrap .pop`(relative)에서
  리셋되지 않아 모달이 뷰포트 밖으로 밀리던 문제 → `.day-wrap .pop`에 `top/right/left/bottom:auto` 리셋.
- **팝오버 화면 내 배치(스크롤 통일):** 팝오버(일정/우선순위/공유/메뉴)는 `useLayoutEffect`로 paint 전에
  높이를 측정해 "아래에 들어가면 아래, 안 되면 위, 그래도 안 되면 클램프"로 배치한다(imperative DOM, setState
  없음 → 재렌더/깜빡임/점프 없음). 항상 통째로 보이므로 정상 화면에선 **스크롤이 생기지 않는다**(뷰포트보다
  큰 극단 상황에서만 내부 스크롤).
- **오버레이는 포털 대신 인라인 렌더:** 초기 `document.body` 포털이 `.adm` 스코프 CSS를 못 받아 미표시 →
  콘솔 내부(=`.adm` 자식) 인라인 렌더로 전환(조상 transform 없음 → `position:fixed` 정상). 필터 검색
  돋보기는 `.filt__search .ic`(absolute) 규칙을 받도록 `<span class="ic">`로 감쌈.
- 캘린더 "이 날짜에 작업 추가", 보고서 오류 메시지 정확화, 지시 안내문 다국어(마침표) 렌더 수정 포함.

---

## 13. 상태 세그먼트 컨트롤 — 누름 피드백 (2026-07-29)

상세 패널의 **대기 / 진행 중 / 완료** 세그먼트가 "누르는 느낌이 없다"는 피드백을 받아 수정했다.
원인은 세 가지가 겹친 것이었다.

1. `.dp__status button`에 `cursor: pointer`가 없어 클릭 가능한 요소로 보이지 않았다.
2. `:hover` / `:active`가 없어 누르는 순간의 물리적 피드백이 전혀 없었다.
3. `setConsoleTaskStatus` → `router.refresh()` 서버 왕복이 끝날 때까지 활성 칩이 옛 값에 멈춰
   있다가 갑자기 점프했다. `transition`도 없어서 이동이 아니라 깜빡임으로 보였다.

### 확정 구현

**활성 배경은 버튼별 `background`가 아니라 슬라이딩 썸 하나다.** `.dp__status`에
`.dp__status__thumb` 한 장을 절대 배치하고, 컨테이너의 `data-active` 속성으로
`translateX(0 / 100% / 200%)` 시킨다. 버튼별로 배경을 켜고 끄면 중간 프레임이 없어 구조적으로
애니메이션이 불가능하다. 썸은 `cubic-bezier(.34, 1.32, .5, 1)`로 살짝 오버슈트해서 멈추지 않고
자리를 잡는다 — 이게 "임팩트"의 실체다. 완료 칸에서는 썸이 `--done` 초록으로 물든다.

> 썸 CSS는 세그먼트가 **정확히 3개**라고 가정한다(`width: calc((100% - 8px) / 3)` + 100% 단위 이동).
> 항목을 추가하려면 `admin-tasks-console.css`의 `.dp__status__thumb` 폭·오프셋도 같이 고쳐야 한다.
> 코드 쪽 순서는 `admin-tasks-console.tsx`의 `STATUS_SEGMENTS` 상수 하나로 관리한다.

**클릭 즉시 움직인다 (낙관적 업데이트).** 부모 컴포넌트의 `statusDraft` state가 눌린 값을 들고
있고, 세그먼트는 서버 응답을 기다리지 않고 바로 이동한다. 서버 액션이 실패하면 `run()`에 새로
추가된 `onError` 콜백이 draft를 버려 원래 칸으로 되돌아가고 에러 토스트가 뜬다.

`statusDraft`가 **부모에 있는 이유**: `DetailPanel`은 `{panelTask && DetailPanel()}`로 조건부
호출되는 일반 함수라, 그 안에 훅을 두면 훅 순서가 깨진다.

`statusDraft`가 **스스로 만료되는 방식**: draft는 `{ id, from, status }`를 저장하고, 렌더 시
`t.status === draft.from`인 동안에만 적용된다. 서버 데이터(또는 한 틱 뒤 갱신되는 `detail`)가
따라잡는 순간 조건이 깨지면서 실제 상태가 자동으로 인계받는다. 정리용 `useEffect`가 필요 없다 —
effect 안에서 동기 `setState`를 호출하면 lint 규칙(cascading renders)에 걸린다. 다른 컨트롤이
상태를 되돌려 우연히 `from` 값으로 복귀하는 경우를 대비해 `openTask`와 `toggleComplete`에서
draft를 명시적으로 비운다.

**접근성**: 각 버튼에 `type="button"`과 `aria-pressed`, 컨테이너에 `role="group"`,
`:focus-visible` 링을 추가했다. `prefers-reduced-motion: reduce`에서는 썸 이동과 눌림 스케일을
끄고 색 전환만 남긴다.

**범위**: 어드민 콘솔 전용. 모바일 작업 화면(`src/components/tasks/tasks-workspace.tsx`)은 별도
시각 언어(BottomSheet 계약)라 이번 변경에 포함하지 않았다.

**변경 파일**: `src/components/admin/tasks/admin-tasks-console.tsx`,
`src/components/admin/tasks/admin-tasks-console.css`. i18n·서버 액션·DB 변경 없음
(`run()`에 선택적 `onError` opt만 추가).

**검증**: `npx tsc --noEmit` 0, `npm run lint` 0 errors, `npm run build` 통과.

### 13.1 "작업 추가" 트리거 정렬 (2026-07-29)

`.iadd-trigger`(오늘 / 내일 / 관리함 / 프로젝트 섹션이 공유하는 인라인 추가 트리거)의 `+` 원이
바로 위 작업 행의 체크박스 열과 어긋나 있었다. 호버 시 파란 원이 켜지면서 그 어긋남이 드러났다.

| | 원/체크박스 범위 | 중심 | 텍스트 시작 |
| --- | --- | --- | --- |
| `.trow` (padding 8px, gap 12px, `.tchk` 24px) | 8 → 32px | 20px | 44px |
| `.iadd-trigger` (수정 전: gap 11px, `.p` 22px) | 8 → 30px | 19px | 41px |

원 중심 1px, 라벨 3px 어긋남. `.iadd-trigger`의 `gap`을 12px, `.p`를 24px로 맞춰 작업 행과 동일한
수직선에 올렸다.

**규칙**: 목록 안에 들어가는 리딩 원형 컨트롤(체크박스, 추가 트리거 등)은 같은 컬럼에 서야 한다 —
좌측 패딩·gap·원 지름 세 값을 모두 `.trow`와 일치시킨다.

함께 정리: `.iadd-trigger .p .ic { font-size: 17px }`는 lucide SVG에 `.ic` 클래스가 없어 동작한
적이 없는 죽은 규칙이었다. `.tchk svg`와 같은 형태의 `.p svg { width: 14px; height: 14px;
display: block; }`로 교체해, 원 안에서의 아이콘 중앙 정렬이 JSX `size` prop과 무관하게 고정된다.

**변경 파일**: `src/components/admin/tasks/admin-tasks-console.css`(CSS 전용, TSX 변경 없음).
**검증**: `npm run lint` 0 errors, `npm run build` 통과.

---

## 14. 선택 모드 + 일괄 삭제 (2026-07-29)

목록에 작업이 쌓였을 때 하나씩 지우는 것 말고 **선택해서 한 번에 삭제**할 수단이 필요하다는
요청으로 추가했다.

### 14.1 UX

- **진입**: 필터 바(검색 / 날짜 / 우선순위) 우측 끝의 **"선택"** 토글 칩. 모드를 명시적으로 켜고
  끄기 때문에 실수로 지울 위험이 가장 낮다. 캘린더 뷰처럼 필터 바가 없는 화면에는 나오지 않는다
  (`filterableView` 게이트 공유).
- **선택 모드 ON**: 각 행의 완료 토글(`.tchk`, 원형)이 같은 24px 자리에서 **사각 체크박스**
  (`.tpick`)로 교체된다. 모양을 다르게 한 이유는 "완료"와 "선택"이 절대 헷갈리면 안 되기 때문이고,
  채움색도 완료의 `--done` 초록이 아니라 `--primary`를 쓴다. 선택된 행은 상세 패널 선택(`.trow.sel`)과
  같은 좌측 액센트 바 + `--primary-soft` 배경을 받아, 콘솔 전체에서 "선택된 행"이 한 가지 언어로 읽힌다.
  행 아무 곳이나 클릭하면 선택/해제되고, 상세 패널은 열리지 않는다. 선택 중에는 행 안의 날짜 칩·
  `⋯` 메뉴가 클릭을 받지 않는다(선택을 만드는 중에 팝오버가 열리는 것을 막음).
- **선택 바 `.selbar`**: 이 콘솔의 **지연 배너(`.odbanner`) 골격**을 그대로 따른다 — 아이콘 타일 →
  텍스트 블록 → 우측 액션. danger 톤 대신 primary 톤이고, 아이콘 타일은 선택 개수가 1 이상이면
  숫자 뱃지(진한 primary 채움)로 바뀐다. 구성: 개수 타일 · 제목/힌트 · **전체 선택** · **선택 해제** ·
  **삭제**(danger) · **X**(모드 종료).
  > **공용 `.bulkbar`를 먼저 써봤다가 되돌렸다.** 근태 검토 큐와 통일하려는 의도였지만 두 가지가
  > 깨졌다. (1) `.bulkbar`가 놓이던 자리는 `.tgrid` 바깥이라 전체 폭 — 우측 레일 위까지 뻗어
  > 작업 리스트 카드와 세로선이 전혀 맞지 않았다. (2) 솔리드 네이비 채움이 이 콘솔의 밝은 카드
  > 언어와 충돌했다. 지금은 `.wcol` **안**에서 렌더돼 리스트 카드와 정확히 같은 폭에 선다.
- **"선택" 칩은 필터들과 같은 줄에 인라인**으로 둔다. `.filt`도 `.tgrid` 바깥의 전체 폭 컨테이너라,
  `flex:1` 스페이서로 우측 정렬하면 칩이 리스트 카드를 지나 레일 위까지 날아간다.
- **전체 지우기**는 별도 버튼이 아니라 "전체 선택 → 삭제"로 커버한다. 한 번의 오클릭으로 목록이
  날아가는 버튼을 만들지 않기 위함.
- **뷰를 벗어나면 선택이 해제된다**(`goView`, 프로젝트 칩). 보이지 않는 선택이 일괄 삭제에 끌려
  들어가지 않게 하기 위한 것.

### 14.2 "전체 선택"의 범위

각 뷰가 자기 목록을 인라인으로 만든다(오늘 = 지난 + 오늘, 공유함 = 받음 + 보냄, …). 그래서
`selectAllVisible`은 **클릭 시점에 렌더된 `.trow[data-task-id]`를 읽는다**. 일곱 개 뷰의 필터
표현식을 여기서 다시 계산하면 두 번째 진실 원본이 생겨 조용히 어긋난다. DOM을 읽으면 검색·날짜·
우선순위 필터가 적용된 "지금 화면에 보이는 것"과 정의상 일치한다. 렌더 중에는 절대 실행되지 않는다
(React Compiler lint가 렌더 중 ref 접근을 금지하므로 ref 수집 방식은 쓸 수 없다).

### 14.3 권한 — 삭제 vs 나만 빠지기

`deleteConsoleTask`가 작성자에게만 허용되는 것과 같은 규칙을 일괄 경로도 따른다.

| 대상 | 처리 | 실행 취소 |
| --- | --- | --- |
| 내가 만든 작업 | soft delete (`deleted_at`) | **가능** |
| 공유·지시받은 작업 | `task_participants`에서 나만 제거 | **불가** |

참여자가 남의 작업을 지울 권리는 없으므로 "나만 빠지기"로 대체된다. 나가기를 되돌리려면 참여자
행을 다시 만들어야 해서 `deleted_at`을 지우는 방식으로는 복구되지 않는다. 그래서 **선택에 남의
작업이 섞여 있으면 확인 모달에 그 사실을 명시**하고(`confirmBulkSharedNote`), 실행 취소 토스트는
내가 만든 작업에만 걸린다. 남의 작업만 지웠을 때는 실행 취소 없이 일반 토스트만 뜬다.

### 14.4 서버

신규 `bulkDeleteConsoleTasks(ids)` — id 배열을 한 번에 처리한다.

- 각 id를 `getTaskDetail`(RLS 스코프)로 해석해 접근 권한과 작성자를 동시에 확인한다. 해석되지
  않는 id는 조용히 버리지 않고 `failedIds`로 보고한다.
- 내 작업은 `.in("id", mine)` 한 번의 UPDATE로 soft delete, 남의 작업은 `.in("task_id", theirs)`
  한 번의 DELETE로 참여자 해제. 단건 나가기와 동일하게, 작성자 외 참여자가 0이 되면 해당 작업은
  `is_shared`/`is_directive`를 해제해 다시 비공개로 돌린다.
- 반환: `{ ok, deletedIds, leftIds, failedIds }`. 부분 실패 시 `tBulkPartial`로 개수를 알린다.

신규 `restoreConsoleTasks(ids)` — 일괄 실행 취소. 삭제된 행은 `getTaskDetail`에 안 잡히므로
작성자 검사를 직접 하고, 내가 만든 것만 `deleted_at`을 지운다.

**기존 "지난 미완료 삭제"도 이 액션으로 교체했다.** 이전에는 클라이언트에서 `for` 루프로 작업
수만큼 서버를 왕복했다(`clearOverdue`). 이제 한 번에 처리되고, 덤으로 실행 취소도 붙었다 —
그에 맞춰 `confirmClearMsg`의 "되돌릴 수 없습니다" 문구를 ko/ja/en 모두에서 걷어냈다(작업이
소프트 삭제로 바뀐 뒤로 사실이 아니었다).

### 14.5 범위

어드민 콘솔 전용. 모바일 작업 화면은 이번 변경에 포함하지 않았다.

**i18n**(ko/ja/en 동시 추가): `selMode`, `selSelected`, `selAll`, `selClear`, `selDelete`,
`selEmptyHint`, `selHint`, `confirmBulkMsg`, `confirmBulkSharedNote`, `tBulkDeleted`, `tBulkPartial`.

**변경 파일**: `src/app/admin/tasks/actions.ts`, `src/components/admin/tasks/admin-tasks-console.tsx`,
`src/components/admin/tasks/admin-tasks-console.css`, `src/lib/admin-tasks-i18n.ts`. DB 스키마·
마이그레이션 변경 없음(기존 `deleted_at` 재사용).

**검증**: `npx tsc --noEmit` 0, `npm run lint` 0 errors, `npm run build` 통과. 로그인 세션이 필요한
실제 삭제·실행 취소 동작은 라이브 테스트하지 못했다.

---

## 15. 행 메뉴 이동 항목 — 날짜 기준 분기 (2026-07-29)

행 `⋯` 메뉴가 작업 날짜와 무관하게 **항상 "오늘로 이동"** 하나만 렌더해서, 오늘 탭에서는 눌러도
아무 일도 안 하는 항목이 떠 있었다.

**규칙 (확정).** 이동 대상은 탭이 아니라 **작업 자신의 날짜**로 정한다.

| 작업 날짜 | 메뉴 항목 |
| --- | --- |
| 오늘 | **내일로 이동** (`moveConsoleToTomorrow`) |
| 그 외 (내일 · 지난 · 날짜 없음) | **오늘로 이동** (`moveConsoleToToday`) |

**둘 중 하나만** 보인다 — 현재 날짜와 같은 쪽으로 옮기는 무의미한 항목은 아예 렌더하지 않는다.

**탭 기준이 아닌 이유.** 이 메뉴는 오늘/내일뿐 아니라 관리함 · 공유함 · 지시 · 캘린더 · 프로젝트
뷰에서도 똑같이 뜬다. 탭을 기준으로 삼으면 그 화면들에서 판단 근거가 없어진다. 날짜 기준이면
요청받은 오늘↔내일 동작이 그대로 나오면서 나머지 화면에서도 의미가 통한다.

**서버.** `moveConsoleToTomorrow`는 기존 `moveConsoleToToday`와 동일한 앵커 로직을 Tokyo 기준
하루 뒤로 적용한다 — `due_at`에 시각 보존, `all_day` 재계산, `is_inbox: false`, 그리고 반복
시리즈면 `recurrence_instance_date`도 함께 이동. 모바일의 `moveTaskToTomorrow`
(`src/app/mobile/tasks/[id]/actions.ts`)와 같은 패턴이다.

**범위**: 어드민 콘솔만. 모바일 작업 카드·상세의 이동 메뉴는 구조가 달라 이번에 건드리지 않았다.

**i18n**: `mMoveTomorrow` (ko "내일로 이동" / ja "明日に移動" / en "Move to tomorrow").

**변경 파일**: `src/app/admin/tasks/actions.ts`, `src/components/admin/tasks/admin-tasks-console.tsx`,
`src/lib/admin-tasks-i18n.ts`. DB 변경 없음.

**검증**: `npx tsc --noEmit` 0, `npm run lint` 0 errors.

---

## 16. 모바일 패리티 채우기 — 컨텍스트 · 사진 · 태그 · 코어 편집 (2026-07-29)

§12.5가 "작성/편집이 필요한 것은 모바일에서"로 남겨뒀던 축소를 걷어냈다. 콘솔이 조회 표면에
머무르면 관리자가 지시를 내릴 때마다 모바일로 넘어가야 해서, `05-admin-web-ia.md`의 원칙
("모바일에서 가능한 기능은 관리자 대시보드에서도 가능해야 한다")과 정면으로 어긋났다.

### 16.1 결과

| 기능 | 표시 | 인라인 추가 | 상세 편집 |
| --- | --- | --- | --- |
| 건물 · 객실 · 예약 · 게스트 | ✅ | ✅ | ✅ |
| 작업 사진 | ✅ | ✅ | ✅ |
| 노트 사진 | ✅ | ✅ | 추가만 |
| 태그 | ✅ | ✅ | ✅ |
| 제목 · 본문 | ✅ | ✅ | ✅ |

### 16.2 서버

세 액션이 확장됐다(`src/app/admin/tasks/actions.ts`).

- `createConsoleTask` / `updateConsoleTaskCore` — `context`(`ConsoleTaskContext`)와 `imageUrls` 추가.
  모바일과 **같은 네 컬럼**(`property_id`/`room_id`/`reservation_id`/`guest_name`)에 쓰므로 어느
  표면에서 만들었든 링크 모양이 같다. 장수 제한은 클라이언트를 믿지 않고 서버에서 다시 적용한다
  (프로젝트 20 / 일반 5).
- `updateConsoleTaskCore`의 두 필드는 **선택적 패치**다. 생략하면 기존 값을 건드리지 않는다 —
  제목만 고치는 호출이 링크를 지우거나 사진을 전부 떼어내면 안 되기 때문.
- `addConsoleNote` — 사진 인자 추가. 본문이 비어도 사진만 있으면 저장된다(서버·UI 같은 규칙).

**`src/lib/task-images.ts` 신규.** 스토리지 경로 검증(`extractRequestImagePath`)과 삭제
(`cleanupRemovedTaskImages`)가 모바일 액션 파일 안에 private으로 있었다. 실제로 객체를 지우는
코드라 두 벌로 두면 한쪽만 고쳐질 위험이 있어 공용 모듈로 추출하고 모바일도 이걸 쓰도록 바꿨다.
삭제 후보는 **서버 진실값**에서만 뽑고, `${org}/task-images/` prefix에 해당하는 경로만 지운다.

### 16.3 UI

- **컨텍스트 피커** `context-picker-popover.tsx` — 건물 → 객실 → 예약 3단계. 조회는 모바일의
  기존 서버 액션 4개(`fetchPickerBuildings`/`fetchPickerRooms`/`fetchRoomReservations`/
  `searchReservations`)를 그대로 쓴다. 모바일 시트는 탭할 때마다 즉시 커밋하지만, 이 팝오버는
  **로컬 draft + 하단 적용 버튼**으로 콘솔의 다른 팝오버(일정·우선순위·공유)와 동작을 맞췄다.
- **사진 업로더** `task-photo-uploader.tsx` — 인라인 추가 · 코어 편집 · 노트 세 자리 공용.
  `compact` 변형은 **`display: contents`** 로 래퍼를 없애 칩 줄의 직접 자식이 된다. 래퍼를 남기면
  전체 폭 점선 띠가 되어 칩 줄과 겉돈다. 치수는 `.achip`과 픽셀 단위로 동일.
- **칩 줄 순서**: `날짜 · 우선순위 · 대상 · 예약 연결 · 사진 · 태그`. 사진 썸네일은
  `order: 99`로 항상 마지막 줄 — 썸네일이 `flex-basis: 100%`라 줄바꿈을 강제해서, 순서를 안 고정하면
  사진과 태그 사이를 끊는다.
- **코어 편집**: 상세 패널 연필 버튼이 인라인 편집 모드를 연다. 제목·본문·태그·사진을 그 자리에서
  고친다. 모바일 상세로 가는 링크는 상단에 별도로 남아 있다.
  > `updateConsoleTaskCore`는 날짜·시간·반복·우선순위를 **전부 다시 쓰는** 액션이라, 이 편집에서
  > 건드리지 않는 값도 현재 값으로 되돌려 넘겨야 한다. 안 그러면 제목만 고쳤는데 일정이 지워진다.

### 16.4 알려진 경계

- **노트 사진은 추가만** 된다. 삭제·수정을 열려면 `cleanupRemovedTaskImages`가 `task-images/`
  prefix만 검증하므로 `task-update-images/`까지 다루도록 확장해야 한다. 모바일도 노트 사진 수정이
  없어 현재 패리티는 맞다.
- **인라인 추가는 행 생성 전에 사진을 먼저 올린다.** 최종 경로(`${org}/task-images/${id}/`)로
  올려야 하기 때문이며 모바일과 같은 순서다. insert가 실패하면 파일이 고아로 남는데, 그 반대(행이
  참조하는 업로드가 없는 상태)보다 낫다고 판단했다. 회수 경로는 아직 없다.

### 16.5 부수 수정 (2026-07-30)

- **`yearly` 반복이 "반복 없음"으로 표시되던 버그.** `helpers.ts`의 `repeatLabel`/`repeatShort`에
  `yearly` 분기가 없어 `default`로 떨어졌다. 콘솔에서 새로 지정할 수는 없지만(`REPEAT_RULES` 제외)
  **모바일이 만든 값은 반드시 제대로 읽어야 한다** — 화면이 데이터를 부정하면 운영 판단을 오도한다.
  `repYearly`/`repShortYearly` 문구는 사전에 이미 있었고 쓰이지 않고 있었다.
- **에러 문구가 뭉개지던 문제.** `errMsg`가 auth/forbidden/save_failed 외 전부를
  "처리하지 못했습니다"로 떨어뜨려, 제목 누락인지 날짜 누락인지 화면에서 구분할 수 없었다(실제로
  반복 저장 실패 원인을 못 찾은 사례가 있었다). 서버가 돌려주는 코드 전체를 매핑하고
  `errMissingTitle`/`errTimeNeedsDate`/`errRepeatNeedsDate`/`errNotFound`/`errInvalidDate`/
  `errEmpty`를 ko·ja·en에 추가했다.

### 16.6 i18n

신규 키(전부 ko/ja/en 동시): 사진 업로더 9개(`ph*`), 컨텍스트 피커 27개(`cp*`),
코어 편집 2개(`dpSave`/`dpTagAdd`), 에러 6개(`err*`).

### 16.7 변경 파일

`src/lib/task-images.ts`(신규), `src/components/admin/tasks/context-picker-popover.tsx`(신규),
`src/components/admin/tasks/task-photo-uploader.tsx`(신규),
`src/app/admin/tasks/{actions.ts,page.tsx}`,
`src/components/admin/tasks/{admin-tasks-console.tsx,admin-tasks-console.css,helpers.ts}`,
`src/app/mobile/tasks/[id]/actions.ts`(공용 헬퍼로 전환), `src/lib/admin-tasks-i18n.ts`.
DB 스키마·마이그레이션 변경 없음.

---

## 17. 프로젝트 섹션 · 멤버 관리 (2026-07-30)

모바일에만 있던 프로젝트 구성 기능을 콘솔로 가져왔다. 관리자가 프로젝트를 짜는 화면인데 섹션과
멤버를 만질 수 없던 것은 `05-admin-web-ia.md`의 원칙과 어긋난다.

### 17.1 서버

`src/app/admin/tasks/actions.ts`에 5개 추가. 모바일 액션(`mobile/tasks/projects/actions.ts`)은
`FormData` + `redirect` 시그니처라 콘솔에서 그대로 쓸 수 없어, 콘솔 관례인 `TaskActionResult`
반환형으로 다시 썼다. **권한 규칙과 부수 효과는 모바일과 동일하게 유지**했다.

| 액션 | 부수 효과 |
| --- | --- |
| `addConsoleProjectSection` | `sort_order` 는 기존 최대값+1 |
| `renameConsoleProjectSection` | — |
| `deleteConsoleProjectSection` | **섹션 안의 작업도 함께 소프트 삭제**(삭제 정책상 reads 가 `deleted_at` 필터) 후 섹션 행 제거 |
| `inviteConsoleProjectMembers` | `projects.is_shared = true`, 첫 수신자 지정, 참여자 알림 발송 |
| `removeConsoleProjectMember` | 비소유 멤버가 0이 되면 `is_shared = false` 로 되돌림 |

공통 게이트는 `resolveOwnedProject` — **소유자만** 통과한다(`getProjectDetail` 이 RLS 스코프라
non-null 자체가 참여자 증명이고, 그 위에 `viewerIsOwner` 를 얹는다). 생성자는
`removeConsoleProjectMember` 로 절대 제거되지 않는다.

> 반환 타입은 판별 유니온(`{ok:false,error} | {ok:true,…}`)으로 명시한다. 처음에 추론에 맡겼더니
> `"error" in r` 가 좁히지 못해 `id` 가 `string | undefined` 로 새어나왔다.

### 17.2 UI

- **멤버 관리**: 프로젝트 배너의 `멤버 관리` 버튼(소유자만) → 기존 공유 팝오버 재사용
  (`SharePop.src = "project"`). 적용 시 **선택 집합과 현재 멤버를 diff** 해서 제거 → 초대 순으로
  호출한다. 소유자는 양쪽에서 제외하고 비교한다(서버도 생성자 제거를 거부하므로 diff 에 넣을 이유가
  없다).
- **섹션 이름 변경**: 헤더 인라인 입력. Enter 저장 / Esc 취소 / blur 저장. **빈 이름은 취소로
  처리** — blur 로도 저장이 불리므로 막지 않으면 실패 토스트가 뜬다.
- **섹션 삭제**: 확인 모달에 "안의 작업도 함께 삭제" 명시. 이름 변경·삭제 버튼은 헤더 호버 시에만
  드러나 목록이 조용하게 유지된다.
- **섹션 추가**: 목록 하단 점선 입력 + 버튼.
- `__default`(섹션이 없는 프로젝트의 가상 그룹)는 실제 행이 없으므로 이름 변경·삭제 대상에서 제외.

### 17.3 남은 것 — 드래그 정렬

`reorderTasks` / `reorderProjectSections` 는 **여전히 모바일 전용**이다. 모바일은 롱프레스+드래그
상호작용이고 데스크톱은 별도 설계가 필요해(포인터 드래그·드롭 인디케이터·키보드 대체 수단) 이번
슬라이스에서 분리했다.

### 17.4 i18n

`pjSectionAdd` / `pjSectionNamePh` / `pjSectionRename` / `pjSectionDelete` / `pjSectionDeleteMsg` /
`pjMembersManage` (ko·ja·en 동시).

## 2026-07-31 "오늘 진행 현황" 레일이 반복 회차를 빼고 세던 문제

**증상.** 오늘 탭 목록과 탭 배지는 9건인데 레일의 **대기가 2**로 떴다.

**원인.** 레일의 집계 범위가 `isTodayTask(t) || isOverdue(t)` 뿐이었다. `isTodayTask` 는
**반복 작업을 명시적으로 제외한다**(`helpers.ts` — 반복은 `openOccursOn` 등 회차 헬퍼가 따로
처리하는 것이 이 콘솔의 규약). 그래서 오늘 목록 9건 중 반복 회차 7건이 통째로 빠지고 일회성 2건만
남았다.

**수정.** 레일의 집계 단위를 **탭 배지(`todayCount`)와 같은 기준**으로 맞췄다.

```
scope = 일회성(오늘 + 지연) + 오늘 미완료 반복 회차 + 반복 지연 backlog
```

- 반복 회차에는 회차별 상태가 없으므로 **행 `status`** 로 대기/진행 중을 가른다 — 목록의 상태 칩과
  같은 기준이다.
- 한 작업이 오늘 회차와 지연 회차를 동시에 가지면 두 번 세지만, 목록도 그 작업을 두 줄로
  보여주므로(지연 섹션 + 오늘) 화면과 숫자가 일치한다.
- `오늘 완료` 는 원래대로 완료 로그(`task_updates` net) 기준이라 반복 완료가 이미 잡히고 있었다.
  진척률(`pct`)은 분모가 고쳐지면서 함께 정상화된다.

**교훈.** 이 콘솔에서 "오늘 몇 건인가"를 세는 곳은 탭 배지 · 목록 · 레일 셋이다. 반복은 날짜 술어가
아니라 회차 헬퍼로만 잡히므로, 새로 세는 곳을 만들 때 `isTodayTask` 만 쓰면 **반복이 조용히 빠진다.**

