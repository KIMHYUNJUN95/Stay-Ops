/**
 * 업무일지 본문 조립 — **서버와 클라이언트가 공유하는 단일 출처.**
 *
 * 보고서는 원래 서버에서 완성된 문자열 하나로 내려왔다. 그래서 사용자가 특정 항목을 빼려면
 * textarea 에서 직접 지우고 번호를 다시 매겨야 했다. 2026-08-03 부터 서버는 **항목 배열 +
 * 조립에 필요한 조각들**(`DailyReportDraft`)을 함께 내려주고, 클라이언트가 체크한 항목만으로
 * 본문을 다시 만든다. 토글마다 서버를 왕복하지 않기 위해서다.
 *
 * 조립 로직이 서버/클라이언트 양쪽에 복제되면 번호 매김이나 요약 문구가 갈라진다(이 저장소는
 * 반복 일정 규칙을 두 파일에 복제했다가 실제 데이터 손실을 낸 적이 있다). 그래서 조립은
 * 여기 한 곳에만 두고 양쪽이 이 함수를 부른다.
 *
 * `"use server"` 파일은 export 가 전부 async 여야 하므로 이 모듈은 별도로 분리되어 있다.
 */

/** 서버가 이미 로케일에 맞춰 만들어 둔 조각들. 함수는 직렬화되지 않으므로 문구만 담는다. */
export type DailyReportTemplate = {
  header: string;
  labelDate: string;
  labelName: string;
  sectionDone: string;
  /** 이미 로케일 포맷을 마친 날짜 문자열. */
  dateLabel: string;
  /** 작성자 이름. */
  name: string;
  /** 합계 문구. `{n}` 자리에 개수가 들어간다. 영어 단복수 때문에 1건/그 외를 나눠 둔다. */
  summaryOne: string;
  summaryMany: string;
};

export type DailyReportDraft = {
  /** 전체 항목을 포함한 기본 본문. 클라이언트의 초기 textarea 값. */
  text: string;
  /** 정리를 마친 완료 업무 제목들(완료 순서, 중복 제거). 체크박스 목록의 원본. */
  items: string[];
  template: DailyReportTemplate;
};

/**
 * 선택된 항목만으로 보고서 본문을 만든다. 번호는 **선택된 것 기준으로 다시 매겨져서**,
 * 3번을 빼면 4번이 3번이 된다. 합계도 선택 개수를 따른다.
 */
export function buildDailyReportText(template: DailyReportTemplate, items: string[]): string {
  const numbered = items.map((title, i) => `${i + 1}. ${title}`).join("\n");
  const summary = (items.length === 1 ? template.summaryOne : template.summaryMany).replace(
    "{n}",
    String(items.length),
  );

  return [
    template.header,
    `${template.labelDate}: ${template.dateLabel}`,
    `${template.labelName}: ${template.name}`,
    "",
    template.sectionDone,
    numbered,
    "",
    summary,
  ].join("\n");
}
