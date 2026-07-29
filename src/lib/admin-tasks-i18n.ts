import type { Locale } from "@/lib/i18n";

// Admin Todoist 콘솔(데스크톱) 전용 i18n. 모바일/공용 tasks 문자열과 분리(공지 콘솔 패턴).
// 뷰 라벨·섹션·우선순위·상태·반복·기간·일정/공유 팝오버·빈 상태·상세·보고서·토스트.
export type AdminTasksDictionary = {
  // views
  vInbox: string;
  vToday: string;
  vTomorrow: string;
  vShared: string;
  vInstr: string;
  vCompleted: string;
  vCalendar: string;
  crumb: string;
  taskWord: string; // "N작업"
  addTask: string;
  searchPlaceholder: string;
  mobileView: string;
  sharedProjects: string;
  newProject: string;
  // filter
  filterSearch: string;
  filterDate: string;
  filterPrio: string;
  // sections / banners
  secOverdue: string;
  secToday: string;
  overdueTitle: string; // "지난(지연) 작업 {n}건"
  overdueSub: string;
  overdueReschedule: string;
  overdueClear: string;
  inboxNote: string;
  // priority / status / repeat / duration
  prioNormal: string;
  prioImportant: string;
  prioUrgent: string;
  stOpen: string;
  stInProgress: string;
  stCompleted: string;
  stOverdue: string;
  repDaily: string;
  repWeekly: string; // "매주 {wd}요일"
  repWeekdays: string;
  repMonthly: string; // "매월 {d}일"
  repYearly: string; // "매년 {m}월 {d}일"
  repCustom: string;
  repNone: string;
  repShortWeekly: string;
  repShortMonthly: string;
  repShortYearly: string;
  repShortWeekdays: string;
  repShortWeekends: string;
  durNone: string;
  dur15: string;
  dur30: string;
  dur60: string;
  dur120: string;
  durCustom: string;
  // chips / row
  today: string;
  tomorrow: string;
  noDate: string;
  instructedBy: string; // "{name} 지시"
  sharedWith: string; // "공유됨"
  andMore: string; // "{name} 외 {n}명"
  // inline add
  iaTitle: string;
  iaDesc: string;
  iaSchedule: string;
  iaPriority: string;
  iaTarget: string;
  iaAttach: string;
  iaAttachN: string; // "사진 {n}"
  iaCancel: string;
  iaSave: string;
  iaInbox: string;
  iaSendInstr: string; // "지시로 전송"
  // detail panel
  dpTask: string;
  dpInbox: string;
  dpStatus: string;
  dpSchedule: string;
  dpScheduleChange: string;
  dpDue: string;
  dpSched: string;
  dpTime: string;
  dpRepeat: string;
  dpNoDate: string;
  dpLinked: string;
  dpViewResv: string;
  dpParticipants: string; // "참여자 · {n}명 · 상태 공통"
  dpAuthor: string;
  dpFirstRecipient: string;
  dpMe: string;
  dpShareManage: string;
  dpShareCta: string; // "멤버에게 공유 / 지시"
  dpPhotos: string; // "첨부 사진 {n}"
  dpLog: string;
  dpLogCreated: string; // "{name} 님이 작업 생성"
  dpLogInput: string;
  dpEdit: string;
  dpShare: string;
  dpDelete: string;
  dpUnshareDelete: string;
  dpAuthorOnly: string; // "원문은 작성자({name})만 수정할 수 있습니다"
  dpLeave: string;
  dpMobileDetail: string;
  ctxBuilding: string;
  ctxBed: string;
  ctxTicket: string;
  ctxGuest: string;
  // schedule popover
  schApply: string;
  schCancel: string;
  schNoRepeat: string;
  schQToday: string;
  schQTomorrow: string;
  schQNextWeek: string;
  schQNextWeekend: string;
  schQNoDate: string;
  schTime: string;
  schTimeNone: string;
  schRepeat: string;
  schDuration: string;
  // share / target popover
  shTargetTitle: string;
  shShareTitle: string;
  shTargetSub: string;
  shShareSub: string;
  shTargetHint: string; // "대상에게는 “{name} 지시” 표식이 붙습니다..."
  shSearch: string;
  shTargetCta: string; // "{name}에게 지시" / "{n}명에게 지시" / "대상 선택"
  shShareCta: string; // "{n}명에게 공유" / "공유할 멤버 선택"
  shNoResult: string;
  shManager: string;
  // menus
  mScheduleChange: string;
  mPriority: string;
  mShareInstr: string;
  mMoveToday: string;
  mMoveInbox: string;
  mDelete: string;
  mLeave: string;
  // instr view
  instrRecv: string;
  instrSent: string;
  instrSentNote: string;
  instrRecvNote: string;
  instrSecUnconfirmed: string;
  instrSecInProgress: string;
  instrSecCompleted: string;
  instrSecOverdue: string;
  instrSecTodo: string;
  instrUnconfirmed: string; // "미확인"
  instrRemind: string;
  instrReply: string;
  instrChangeTarget: string;
  instrEmptySentT: string;
  instrEmptySentS: string;
  instrEmptyRecvT: string;
  instrEmptyRecvS: string;
  instrCommon: string; // "공동 {n}명"
  // shared view
  sharedRecvSec: string;
  sharedSentSec: string;
  // completed
  cmpDone: string; // "{n}건 완료"
  cmpReport: string;
  cmpBy: string; // "{name} 완료"
  cmpToday: string;
  cmpYesterday: string;
  // calendar
  calThisMonth: string;
  calLegendPersonal: string;
  calLegendShared: string;
  calLegendUrgent: string;
  calUpcoming: string;
  calMore: string; // "+{n}건 더보기"
  calNoMonth: string;
  calAddOnDay: string;
  calDayEmpty: string;
  // project
  pjBanner: string; // "공유 프로젝트 · 멤버 {n}명"
  pjMembers: string;
  pjAddTaskTo: string; // "{name}에 작업 추가"
  pjEmptyT: string;
  pjEmptyS: string;
  // new project modal
  npTitle: string;
  npName: string;
  npNamePh: string;
  npMembers: string; // "{n}명 · 나 포함"
  npSearch: string;
  npHint: string;
  npCancel: string;
  npCreate: string;
  // report
  rptTitle: string; // "업무일지 · {date}"
  rptHint: string; // "완료 {n}건을 정리한..."
  rptReset: string;
  rptClose: string;
  rptCopy: string;
  rptCopied: string;
  // empty / loading / error
  emToday: string;
  emTodayS: string;
  emTomorrow: string;
  emTomorrowS: string;
  emInbox: string;
  emInboxS: string;
  emShared: string;
  emSharedS: string;
  emFilter: string;
  emFilterS: string;
  emProject: string;
  emProjectS: string;
  emCompleted: string;
  emCompletedS: string;
  errT: string;
  errS: string;
  retry: string;
  // toasts / errors
  errAuth: string;
  errForbidden: string;
  errSave: string;
  errGeneric: string;
  tCreated: string;
  tUpdated: string;
  tCompleted: string;
  tReopened: string;
  tShared: string;
  tInstructed: string;
  tDeleted: string;
  tMoved: string;
  tRescheduled: string;
  tNoteAdded: string;
  tProjectCreated: string;
  tReminded: string;
  // confirm modal (destructive)
  confirmTitle: string;
  confirmDeleteMsg: string;
  confirmLeaveMsg: string;
  confirmClearMsg: string;
  confirmDeleteBtn: string;
  // rail
  railTodayTitle: string;
  railTodayProgress: string;
  railUpcomingEmpty: string;
  // undo toast
  undoBtn: string;
  undoNext: string; // "다음: {date}"
  tDeletedUndoable: string;
};

const ko: AdminTasksDictionary = {
  vInbox: "관리함", vToday: "오늘", vTomorrow: "내일", vShared: "공유함", vInstr: "지시",
  vCompleted: "완료 · 기록", vCalendar: "캘린더", crumb: "사무실 · 투두이스트", taskWord: "{n}작업",
  addTask: "작업 추가", searchPlaceholder: "작업 · 담당자 · 객실 검색", mobileView: "모바일 보기",
  sharedProjects: "공유 프로젝트", newProject: "새 프로젝트",
  filterSearch: "제목 · 작성자 검색", filterDate: "날짜", filterPrio: "우선순위",
  secOverdue: "지연", secToday: "오늘",
  overdueTitle: "지난(지연) 작업 {n}건", overdueSub: "마감이 지난 작업입니다. 오늘로 옮기거나 정리하세요.",
  overdueReschedule: "일정 변경", overdueClear: "지난 미완료 삭제",
  inboxNote: "프로젝트 밖의 모든 작업이 여기 모입니다. 날짜를 정하면 오늘·캘린더에도 함께 표시됩니다.",
  prioNormal: "일반", prioImportant: "중요", prioUrgent: "긴급",
  stOpen: "대기", stInProgress: "진행 중", stCompleted: "완료", stOverdue: "지연",
  repDaily: "매일", repWeekly: "매주 {wd}요일", repWeekdays: "평일마다 (월–금)", repMonthly: "매월 {d}일",
  repYearly: "매년 {m}월 {d}일", repCustom: "사용자 정의…", repNone: "반복 없음",
  repShortWeekly: "매주", repShortMonthly: "매월", repShortYearly: "매년", repShortWeekdays: "평일", repShortWeekends: "주말",
  durNone: "기간 없음", dur15: "15분", dur30: "30분", dur60: "1시간", dur120: "2시간", durCustom: "사용자 정의",
  today: "오늘", tomorrow: "내일", noDate: "날짜 없음", instructedBy: "{name} 지시", sharedWith: "공유됨", andMore: "{name} 외 {n}명",
  iaTitle: "작업 이름", iaDesc: "설명", iaSchedule: "일정", iaPriority: "우선순위", iaTarget: "대상 (지시)",
  iaAttach: "첨부", iaAttachN: "사진 {n}", iaCancel: "취소", iaSave: "작업 추가", iaInbox: "관리함", iaSendInstr: "지시로 전송",
  dpTask: "작업", dpInbox: "관리함", dpStatus: "상태", dpSchedule: "일정", dpScheduleChange: "일정 변경",
  dpDue: "마감", dpSched: "예정", dpTime: "시간", dpRepeat: "반복", dpNoDate: "일정 없음",
  dpLinked: "연결됨", dpViewResv: "예약 보기", dpParticipants: "참여자 · {n}명 · 상태 공통",
  dpAuthor: "작성자", dpFirstRecipient: "최초 수신", dpMe: "나", dpShareManage: "멤버 추가 / 공유 관리",
  dpShareCta: "멤버에게 공유 / 지시", dpPhotos: "첨부 사진 {n}", dpLog: "업데이트 로그",
  dpLogCreated: "{name} 님이 작업 생성", dpLogInput: "노트 추가…", dpEdit: "편집", dpShare: "공유",
  dpDelete: "삭제", dpUnshareDelete: "공유 해제·삭제", dpAuthorOnly: "원문은 작성자({name})만 수정할 수 있습니다",
  dpLeave: "나만 빠지기", dpMobileDetail: "모바일 상세",
  ctxBuilding: "건물", ctxBed: "객실", ctxTicket: "예약", ctxGuest: "게스트",
  schApply: "적용", schCancel: "취소", schNoRepeat: "반복 안 함",
  schQToday: "오늘", schQTomorrow: "내일", schQNextWeek: "다음 주", schQNextWeekend: "다음 주말", schQNoDate: "날짜 없음",
  schTime: "시간", schTimeNone: "시간 없음", schRepeat: "반복", schDuration: "기간",
  shTargetTitle: "대상 지정 (업무 지시)", shShareTitle: "멤버 공유",
  shTargetSub: "1명 이상 선택하면 지시로 전송됩니다.", shShareSub: "활성 멤버를 선택해 함께 진행합니다.",
  shTargetHint: "대상에게는 “{name} 지시” 표식이 붙습니다. 담당자 지정이 아닌 공유 기반입니다.",
  shSearch: "멤버 검색", shTargetCta: "지시", shShareCta: "공유", shNoResult: "검색 결과가 없습니다.", shManager: "매니저",
  mScheduleChange: "일정 변경", mPriority: "우선순위", mShareInstr: "공유 / 지시", mMoveToday: "오늘로 이동",
  mMoveInbox: "관리함으로", mDelete: "삭제", mLeave: "나만 빠지기",
  instrRecv: "받은 지시", instrSent: "보낸 지시",
  instrSentNote: "지시한 업무는 대상자의 일정으로 잡힙니다. 내 “오늘” 목록에는 들어오지 않고, 이 화면에서 진행 상황만 챙깁니다.",
  instrRecvNote: "나에게 부여된 업무입니다. 내 “오늘 · 캘린더”에도 함께 표시되며, 상황을 바꾸면 지시한 사람에게 바로 공유됩니다.",
  instrSecUnconfirmed: "미확인 · 대기", instrSecInProgress: "진행 중", instrSecCompleted: "완료", instrSecOverdue: "지연", instrSecTodo: "해야 할 지시",
  instrUnconfirmed: "미확인", instrRemind: "리마인드 보내기", instrReply: "답장 · 노트", instrChangeTarget: "대상 변경",
  instrEmptySentT: "보낸 지시가 없습니다", instrEmptySentS: "작업을 만들 때 “대상(지시)”을 지정하면 여기에서 진행을 추적합니다.",
  instrEmptyRecvT: "받은 지시가 없습니다", instrEmptyRecvS: "매니저가 부여한 업무가 여기에 모입니다.", instrCommon: "공동 {n}명",
  sharedRecvSec: "다른 멤버가 공유함", sharedSentSec: "내가 공유함",
  cmpDone: "{n}건 완료", cmpReport: "보고서 (업무일지)", cmpBy: "{name} 완료", cmpToday: "오늘", cmpYesterday: "어제",
  calThisMonth: "이번 달", calLegendPersonal: "개인", calLegendShared: "공유", calLegendUrgent: "긴급 · 지연",
  calUpcoming: "다가오는 일정", calMore: "+{n}건 더보기", calNoMonth: "이번 달 예정된 작업이 없습니다.",
  calAddOnDay: "이 날짜에 작업 추가", calDayEmpty: "이 날짜에 예정된 작업이 없습니다.",
  pjBanner: "공유 프로젝트 · 멤버 {n}명", pjMembers: "멤버 관리", pjAddTaskTo: "{name}에 작업 추가",
  pjEmptyT: "이 프로젝트에 작업이 없습니다", pjEmptyS: "첫 작업을 추가해 프로젝트를 시작하세요.",
  npTitle: "새 공유 프로젝트", npName: "프로젝트 이름", npNamePh: "예: 성수기 오픈 준비",
  npMembers: "{n}명 · 나 포함", npSearch: "이름 · 직무 검색", npHint: "프로젝트 작업은 멤버 전원이 같은 상태를 공유합니다.",
  npCancel: "취소", npCreate: "프로젝트 만들기",
  rptTitle: "업무일지 · {date}", rptHint: "완료 {n}건을 정리한 텍스트입니다. 필요한 부분을 직접 수정한 뒤 복사해 붙여 넣으세요.",
  rptReset: "원본으로", rptClose: "닫기", rptCopy: "전체 복사", rptCopied: "복사했습니다.",
  emToday: "오늘 처리할 일이 없습니다", emTodayS: "관리함을 정리하거나 새 작업을 추가해 보세요.",
  emTomorrow: "내일 예정된 작업이 없습니다", emTomorrowS: "일정을 잡아두면 여기에서 미리 볼 수 있어요.",
  emInbox: "관리함이 비어 있습니다", emInboxS: "프로젝트 밖의 작업이 여기에 모두 모입니다.",
  emShared: "공유 중인 작업이 없습니다", emSharedS: "작업에 멤버를 추가하면 함께 진행할 수 있어요.",
  emFilter: "조건에 맞는 작업이 없습니다", emFilterS: "검색어나 필터를 바꿔 보세요.",
  emProject: "이 프로젝트에 작업이 없습니다", emProjectS: "첫 작업을 추가해 프로젝트를 시작하세요.",
  emCompleted: "완료된 작업이 없습니다", emCompletedS: "작업을 완료하면 날짜별로 여기에 기록됩니다.",
  errT: "작업을 불러오지 못했습니다", errS: "네트워크 연결을 확인하고 다시 시도해 주세요.", retry: "다시 시도",
  errAuth: "다시 로그인해 주세요.", errForbidden: "권한이 없습니다.", errSave: "저장하지 못했습니다.", errGeneric: "처리하지 못했습니다. 다시 시도해 주세요.",
  tCreated: "작업을 추가했습니다.", tUpdated: "작업을 수정했습니다.", tCompleted: "완료 처리했습니다.", tReopened: "다시 열었습니다.",
  tShared: "공유했습니다.", tInstructed: "지시를 보냈습니다.", tDeleted: "삭제했습니다.", tMoved: "이동했습니다.",
  tRescheduled: "일정을 변경했습니다.", tNoteAdded: "노트를 추가했습니다.", tProjectCreated: "프로젝트를 만들었습니다.", tReminded: "리마인드를 보냈습니다.",
  confirmTitle: "확인",
  confirmDeleteMsg: "이 작업을 삭제할까요? 되돌릴 수 없습니다.",
  confirmLeaveMsg: "이 작업에서 나만 빠질까요?",
  confirmClearMsg: "지난 미완료 작업을 모두 정리할까요? 되돌릴 수 없습니다.",
  confirmDeleteBtn: "삭제",
  railTodayTitle: "오늘 진행 현황", railTodayProgress: "오늘 작업 진척률", railUpcomingEmpty: "다가오는 일정이 없습니다",
  undoBtn: "실행 취소", undoNext: "다음: {date}", tDeletedUndoable: "작업을 삭제했습니다",
};

const ja: AdminTasksDictionary = {
  vInbox: "管理箱", vToday: "今日", vTomorrow: "明日", vShared: "共有", vInstr: "指示",
  vCompleted: "完了 · 記録", vCalendar: "カレンダー", crumb: "オフィス · Todoist", taskWord: "{n}件",
  addTask: "タスク追加", searchPlaceholder: "タスク · 担当者 · 部屋 検索", mobileView: "モバイル表示",
  sharedProjects: "共有プロジェクト", newProject: "新規プロジェクト",
  filterSearch: "タイトル · 作成者 検索", filterDate: "日付", filterPrio: "優先度",
  secOverdue: "遅延", secToday: "今日",
  overdueTitle: "過ぎた(遅延)タスク {n}件", overdueSub: "締切を過ぎたタスクです。今日に移すか整理してください。",
  overdueReschedule: "日程変更", overdueClear: "過去の未完了を削除",
  inboxNote: "プロジェクト外のすべてのタスクがここに集まります。日付を決めると今日・カレンダーにも表示されます。",
  prioNormal: "通常", prioImportant: "重要", prioUrgent: "緊急",
  stOpen: "待機", stInProgress: "進行中", stCompleted: "完了", stOverdue: "遅延",
  repDaily: "毎日", repWeekly: "毎週{wd}曜日", repWeekdays: "平日ごと (月–金)", repMonthly: "毎月{d}日",
  repYearly: "毎年{m}月{d}日", repCustom: "カスタム…", repNone: "繰り返しなし",
  repShortWeekly: "毎週", repShortMonthly: "毎月", repShortYearly: "毎年", repShortWeekdays: "平日", repShortWeekends: "週末",
  durNone: "期間なし", dur15: "15分", dur30: "30分", dur60: "1時間", dur120: "2時間", durCustom: "カスタム",
  today: "今日", tomorrow: "明日", noDate: "日付なし", instructedBy: "{name} 指示", sharedWith: "共有中", andMore: "{name} 他 {n}名",
  iaTitle: "タスク名", iaDesc: "説明", iaSchedule: "日程", iaPriority: "優先度", iaTarget: "対象 (指示)",
  iaAttach: "添付", iaAttachN: "写真 {n}", iaCancel: "キャンセル", iaSave: "タスク追加", iaInbox: "管理箱", iaSendInstr: "指示で送信",
  dpTask: "タスク", dpInbox: "管理箱", dpStatus: "状態", dpSchedule: "日程", dpScheduleChange: "日程変更",
  dpDue: "締切", dpSched: "予定", dpTime: "時間", dpRepeat: "繰り返し", dpNoDate: "日程なし",
  dpLinked: "リンク", dpViewResv: "予約を見る", dpParticipants: "参加者 · {n}名 · 状態共通",
  dpAuthor: "作成者", dpFirstRecipient: "最初の受信", dpMe: "自分", dpShareManage: "メンバー追加 / 共有管理",
  dpShareCta: "メンバーに共有 / 指示", dpPhotos: "添付写真 {n}", dpLog: "更新ログ",
  dpLogCreated: "{name} さんがタスク作成", dpLogInput: "ノート追加…", dpEdit: "編集", dpShare: "共有",
  dpDelete: "削除", dpUnshareDelete: "共有解除・削除", dpAuthorOnly: "本文は作成者({name})のみ編集できます",
  dpLeave: "自分だけ抜ける", dpMobileDetail: "モバイル詳細",
  ctxBuilding: "建物", ctxBed: "部屋", ctxTicket: "予約", ctxGuest: "ゲスト",
  schApply: "適用", schCancel: "キャンセル", schNoRepeat: "繰り返さない",
  schQToday: "今日", schQTomorrow: "明日", schQNextWeek: "来週", schQNextWeekend: "次の週末", schQNoDate: "日付なし",
  schTime: "時間", schTimeNone: "時間なし", schRepeat: "繰り返し", schDuration: "期間",
  shTargetTitle: "対象指定 (業務指示)", shShareTitle: "メンバー共有",
  shTargetSub: "1名以上選ぶと指示として送信されます。", shShareSub: "アクティブなメンバーを選んで一緒に進めます。",
  shTargetHint: "対象には「{name} 指示」の表示が付きます。担当者指定ではなく共有ベースです。",
  shSearch: "メンバー検索", shTargetCta: "指示", shShareCta: "共有", shNoResult: "検索結果がありません。", shManager: "マネージャー",
  mScheduleChange: "日程変更", mPriority: "優先度", mShareInstr: "共有 / 指示", mMoveToday: "今日に移動",
  mMoveInbox: "管理箱へ", mDelete: "削除", mLeave: "自分だけ抜ける",
  instrRecv: "受けた指示", instrSent: "送った指示",
  instrSentNote: "指示した業務は対象者の日程に入ります。自分の「今日」には入らず、この画面で進捗のみ確認します。",
  instrRecvNote: "自分に付与された業務です。自分の「今日 · カレンダー」にも表示され、状態を変えると指示者にすぐ共有されます。",
  instrSecUnconfirmed: "未確認 · 待機", instrSecInProgress: "進行中", instrSecCompleted: "完了", instrSecOverdue: "遅延", instrSecTodo: "やるべき指示",
  instrUnconfirmed: "未確認", instrRemind: "リマインド送信", instrReply: "返信 · ノート", instrChangeTarget: "対象変更",
  instrEmptySentT: "送った指示がありません", instrEmptySentS: "タスク作成時に「対象(指示)」を指定するとここで進捗を追跡します。",
  instrEmptyRecvT: "受けた指示がありません", instrEmptyRecvS: "マネージャーが付与した業務がここに集まります。", instrCommon: "共同 {n}名",
  sharedRecvSec: "他のメンバーが共有", sharedSentSec: "自分が共有",
  cmpDone: "{n}件完了", cmpReport: "レポート (業務日報)", cmpBy: "{name} 完了", cmpToday: "今日", cmpYesterday: "昨日",
  calThisMonth: "今月", calLegendPersonal: "個人", calLegendShared: "共有", calLegendUrgent: "緊急 · 遅延",
  calUpcoming: "今後の予定", calMore: "+{n}件 もっと見る", calNoMonth: "今月の予定はありません。",
  calAddOnDay: "この日にタスク追加", calDayEmpty: "この日の予定はありません。",
  pjBanner: "共有プロジェクト · メンバー {n}名", pjMembers: "メンバー管理", pjAddTaskTo: "{name}にタスク追加",
  pjEmptyT: "このプロジェクトにタスクがありません", pjEmptyS: "最初のタスクを追加してプロジェクトを始めましょう。",
  npTitle: "新規共有プロジェクト", npName: "プロジェクト名", npNamePh: "例: 繁忙期オープン準備",
  npMembers: "{n}名 · 自分含む", npSearch: "名前 · 職務 検索", npHint: "プロジェクトのタスクはメンバー全員が同じ状態を共有します。",
  npCancel: "キャンセル", npCreate: "プロジェクト作成",
  rptTitle: "業務日報 · {date}", rptHint: "完了{n}件をまとめたテキストです。必要な部分を編集してコピー・貼り付けしてください。",
  rptReset: "元に戻す", rptClose: "閉じる", rptCopy: "全体コピー", rptCopied: "コピーしました。",
  emToday: "今日やることはありません", emTodayS: "管理箱を整理するか新しいタスクを追加しましょう。",
  emTomorrow: "明日の予定はありません", emTomorrowS: "日程を入れておくとここで先に見られます。",
  emInbox: "管理箱が空です", emInboxS: "プロジェクト外のタスクがすべてここに集まります。",
  emShared: "共有中のタスクがありません", emSharedS: "タスクにメンバーを追加すると一緒に進められます。",
  emFilter: "条件に合うタスクがありません", emFilterS: "検索語やフィルターを変えてみてください。",
  emProject: "このプロジェクトにタスクがありません", emProjectS: "最初のタスクを追加してプロジェクトを始めましょう。",
  emCompleted: "完了したタスクがありません", emCompletedS: "タスクを完了すると日付ごとにここに記録されます。",
  errT: "タスクを読み込めませんでした", errS: "ネットワーク接続を確認して再試行してください。", retry: "再試行",
  errAuth: "再度ログインしてください。", errForbidden: "権限がありません。", errSave: "保存できませんでした。", errGeneric: "処理できませんでした。もう一度お試しください。",
  tCreated: "タスクを追加しました。", tUpdated: "タスクを更新しました。", tCompleted: "完了しました。", tReopened: "再度開きました。",
  tShared: "共有しました。", tInstructed: "指示を送りました。", tDeleted: "削除しました。", tMoved: "移動しました。",
  tRescheduled: "日程を変更しました。", tNoteAdded: "ノートを追加しました。", tProjectCreated: "プロジェクトを作成しました。", tReminded: "リマインドを送りました。",
  confirmTitle: "確認",
  confirmDeleteMsg: "このタスクを削除しますか？元に戻せません。",
  confirmLeaveMsg: "このタスクから自分だけ抜けますか？",
  confirmClearMsg: "過去の未完了タスクをすべて整理しますか？元に戻せません。",
  confirmDeleteBtn: "削除",
  railTodayTitle: "今日の進捗", railTodayProgress: "今日のタスク進捗率", railUpcomingEmpty: "今後の予定はありません",
  undoBtn: "元に戻す", undoNext: "次回: {date}", tDeletedUndoable: "タスクを削除しました",
};

const en: AdminTasksDictionary = {
  vInbox: "Inbox", vToday: "Today", vTomorrow: "Tomorrow", vShared: "Shared", vInstr: "Directives",
  vCompleted: "Completed", vCalendar: "Calendar", crumb: "Office · Todoist", taskWord: "{n} tasks",
  addTask: "Add task", searchPlaceholder: "Search tasks · people · rooms", mobileView: "Mobile view",
  sharedProjects: "Shared projects", newProject: "New project",
  filterSearch: "Search title · author", filterDate: "Date", filterPrio: "Priority",
  secOverdue: "Overdue", secToday: "Today",
  overdueTitle: "{n} overdue task(s)", overdueSub: "Past their due date. Move them to today or clear them out.",
  overdueReschedule: "Reschedule", overdueClear: "Clear past unfinished",
  inboxNote: "Every task outside a project lives here. Give it a date and it also shows in Today · Calendar.",
  prioNormal: "Normal", prioImportant: "Important", prioUrgent: "Urgent",
  stOpen: "Open", stInProgress: "In progress", stCompleted: "Done", stOverdue: "Overdue",
  repDaily: "Daily", repWeekly: "Weekly on {wd}", repWeekdays: "Every weekday (Mon–Fri)", repMonthly: "Monthly on the {d}",
  repYearly: "Yearly on {m}/{d}", repCustom: "Custom…", repNone: "No repeat",
  repShortWeekly: "Weekly", repShortMonthly: "Monthly", repShortYearly: "Yearly", repShortWeekdays: "Weekdays", repShortWeekends: "Weekends",
  durNone: "No duration", dur15: "15 min", dur30: "30 min", dur60: "1 hour", dur120: "2 hours", durCustom: "Custom",
  today: "Today", tomorrow: "Tomorrow", noDate: "No date", instructedBy: "{name} directive", sharedWith: "Shared", andMore: "{name} +{n}",
  iaTitle: "Task name", iaDesc: "Description", iaSchedule: "Schedule", iaPriority: "Priority", iaTarget: "Target (directive)",
  iaAttach: "Attach", iaAttachN: "{n} photos", iaCancel: "Cancel", iaSave: "Add task", iaInbox: "Inbox", iaSendInstr: "Send as directive",
  dpTask: "Task", dpInbox: "Inbox", dpStatus: "Status", dpSchedule: "Schedule", dpScheduleChange: "Reschedule",
  dpDue: "Due", dpSched: "Scheduled", dpTime: "Time", dpRepeat: "Repeat", dpNoDate: "No date",
  dpLinked: "Linked", dpViewResv: "View reservation", dpParticipants: "Participants · {n} · shared status",
  dpAuthor: "Author", dpFirstRecipient: "First recipient", dpMe: "You", dpShareManage: "Add member / manage sharing",
  dpShareCta: "Share / assign directive", dpPhotos: "Attached photos {n}", dpLog: "Update log",
  dpLogCreated: "{name} created the task", dpLogInput: "Add a note…", dpEdit: "Edit", dpShare: "Share",
  dpDelete: "Delete", dpUnshareDelete: "Unshare · delete", dpAuthorOnly: "Only the author ({name}) can edit the content",
  dpLeave: "Leave (me only)", dpMobileDetail: "Mobile detail",
  ctxBuilding: "Building", ctxBed: "Room", ctxTicket: "Reservation", ctxGuest: "Guest",
  schApply: "Apply", schCancel: "Cancel", schNoRepeat: "No repeat",
  schQToday: "Today", schQTomorrow: "Tomorrow", schQNextWeek: "Next week", schQNextWeekend: "Next weekend", schQNoDate: "No date",
  schTime: "Time", schTimeNone: "No time", schRepeat: "Repeat", schDuration: "Duration",
  shTargetTitle: "Assign target (directive)", shShareTitle: "Share with members",
  shTargetSub: "Selecting 1+ sends it as a directive.", shShareSub: "Pick active members to collaborate.",
  shTargetHint: "The target sees a “{name} directive” marker. Share-based, not a formal assignee.",
  shSearch: "Search members", shTargetCta: "Assign", shShareCta: "Share", shNoResult: "No results.", shManager: "Manager",
  mScheduleChange: "Reschedule", mPriority: "Priority", mShareInstr: "Share / directive", mMoveToday: "Move to today",
  mMoveInbox: "Move to inbox", mDelete: "Delete", mLeave: "Leave (me only)",
  instrRecv: "Received", instrSent: "Sent",
  instrSentNote: "Directives land on the recipient's schedule. They don't enter your Today; track progress here.",
  instrRecvNote: "Assigned to you. Also shown in your Today · Calendar; status changes are shared back to the sender.",
  instrSecUnconfirmed: "Unconfirmed · open", instrSecInProgress: "In progress", instrSecCompleted: "Done", instrSecOverdue: "Overdue", instrSecTodo: "To do",
  instrUnconfirmed: "Unconfirmed", instrRemind: "Send reminder", instrReply: "Reply · note", instrChangeTarget: "Change target",
  instrEmptySentT: "No sent directives", instrEmptySentS: "Set a Target (directive) when creating a task to track it here.",
  instrEmptyRecvT: "No received directives", instrEmptyRecvS: "Tasks assigned by a manager collect here.", instrCommon: "{n} shared",
  sharedRecvSec: "Shared by others", sharedSentSec: "Shared by me",
  cmpDone: "{n} done", cmpReport: "Report (work log)", cmpBy: "done by {name}", cmpToday: "Today", cmpYesterday: "Yesterday",
  calThisMonth: "This month", calLegendPersonal: "Personal", calLegendShared: "Shared", calLegendUrgent: "Urgent · overdue",
  calUpcoming: "Upcoming", calMore: "+{n} more", calNoMonth: "No tasks scheduled this month.",
  calAddOnDay: "Add a task on this date", calDayEmpty: "No tasks scheduled on this date.",
  pjBanner: "Shared project · {n} members", pjMembers: "Manage members", pjAddTaskTo: "Add task to {name}",
  pjEmptyT: "No tasks in this project", pjEmptyS: "Add the first task to start the project.",
  npTitle: "New shared project", npName: "Project name", npNamePh: "e.g. Peak-season opening prep",
  npMembers: "{n} · incl. you", npSearch: "Search name · role", npHint: "Project tasks share one status across all members.",
  npCancel: "Cancel", npCreate: "Create project",
  rptTitle: "Work log · {date}", rptHint: "A text summary of {n} completed tasks. Edit as needed, then copy and paste.",
  rptReset: "Reset", rptClose: "Close", rptCopy: "Copy all", rptCopied: "Copied.",
  emToday: "Nothing due today", emTodayS: "Clear your inbox or add a new task.",
  emTomorrow: "No tasks scheduled for tomorrow", emTomorrowS: "Schedule tasks to preview them here.",
  emInbox: "Your inbox is empty", emInboxS: "Every task outside a project collects here.",
  emShared: "No shared tasks", emSharedS: "Add members to a task to work on it together.",
  emFilter: "No matching tasks", emFilterS: "Try a different search or filter.",
  emProject: "No tasks in this project", emProjectS: "Add the first task to start the project.",
  emCompleted: "No completed tasks", emCompletedS: "Completed tasks are logged here by day.",
  errT: "Couldn't load tasks", errS: "Check your connection and try again.", retry: "Retry",
  errAuth: "Please sign in again.", errForbidden: "You don't have permission.", errSave: "Couldn't save.", errGeneric: "Couldn't complete. Please try again.",
  tCreated: "Task added.", tUpdated: "Task updated.", tCompleted: "Marked complete.", tReopened: "Reopened.",
  tShared: "Shared.", tInstructed: "Directive sent.", tDeleted: "Deleted.", tMoved: "Moved.",
  tRescheduled: "Rescheduled.", tNoteAdded: "Note added.", tProjectCreated: "Project created.", tReminded: "Reminder sent.",
  confirmTitle: "Confirm",
  confirmDeleteMsg: "Delete this task? This can't be undone.",
  confirmLeaveMsg: "Leave this task (you only)?",
  confirmClearMsg: "Clear all past unfinished tasks? This can't be undone.",
  confirmDeleteBtn: "Delete",
  railTodayTitle: "Today's progress", railTodayProgress: "Today's completion", railUpcomingEmpty: "Nothing upcoming",
  undoBtn: "Undo", undoNext: "Next: {date}", tDeletedUndoable: "Task deleted",
};

const dictionaries: Record<Locale, AdminTasksDictionary> = { ko, ja, en };

export function getAdminTasksDictionary(locale: Locale): AdminTasksDictionary {
  return dictionaries[locale] ?? ko;
}
