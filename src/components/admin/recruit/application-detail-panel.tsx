import Link from "next/link";
import { FileText, Info, X } from "lucide-react";
import type { Dictionary } from "@/lib/i18n";
import type { ApplicationDetail, ApplicationHistoryRow } from "@/lib/recruit/applications";
import { JOB_APPLICATION_STATUSES, resumeKindOf } from "@/lib/recruit/status";
import { RecruitPanelActions, RecruitContactBlock } from "./recruit-panel-client";

/**
 * 지원서 상세 패널 — 서버 컴포넌트. 디자인 「StayOps Recruiting Console」 1b·1c·1f 구현.
 *
 * **패널 순서는 판단에 쓰이는 순서다:** 근무 조건 → 경험·동기 → 체류 자격 → 첨부 → 기본 정보.
 * 연락처가 맨 아래인 것은 의도다 — 열어보는 이유가 「연락하려고」가 아니라 「검토하려고」이기
 * 때문이고, 어깨너머 노출도 줄어든다.
 *
 * `ComplaintDetailPanel` 과 같은 `.panel` 프리미티브·오버레이를 쓴다. 새 라우트를 만들지 않고
 * `?application=<id>` 쿼리로 연다(CLAUDE.md §4).
 *
 * 도메인 계약: docs/product/30-recruit-workflow.md
 */

/**
 * 폼이 `work_days` 에 저장한 값 그대로 — **표시용이 아니라 대조용 키다.** 지원자가 고른 요일을
 * 맞춰 보려면 저장된 문자열과 같아야 하므로 번역하지 않는다. 화면에 찍히는 글자는
 * `copy.weekDays` (ko/ja/en)가 만든다.
 */
// i18n-ignore-start -- stored form values, matched not displayed
const WEEK_DAY_KEYS = ["월", "화", "수", "목", "금", "토", "일"] as const;
// i18n-ignore-end

type Props = {
  application: ApplicationDetail;
  history: ApplicationHistoryRow[];
  resumeUrl: string | null;
  copy: Dictionary["recruit"];
  closeHref: string;
};

function Row({
  label,
  value,
  mono = false,
  missing = false,
  missingLabel,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  missing?: boolean;
  missingLabel?: string;
}) {
  return (
    <>
      <span className="rckv__k">{label}</span>
      {value ? (
        <span className={`rckv__v ${mono ? "rckv__v--mono" : ""}`}>{value}</span>
      ) : (
        // 빈 항목은 행을 지우지 않는다 — 「구 폼 미수집」으로 이유를 밝혀야 담당자가
        // 「입력 안 한 사람」과 「물어보지 않은 항목」을 구분할 수 있다.
        <span className="rckv__v rckv__v--none">
          <span className="rckv__v--mono">—</span>
          {missing && missingLabel ? <span className="rcemp">{missingLabel}</span> : null}
        </span>
      )}
    </>
  );
}

export function ApplicationDetailPanel({ application, history, resumeUrl, copy, closeHref }: Props) {
  const resume = resumeKindOf(application.resumeFileName);
  const stepIndex = JOB_APPLICATION_STATUSES.indexOf(application.status);

  return (
    <>
      <Link href={closeHref} className="panel-scrim" aria-label={copy.close} data-panel-close />
      <aside className="panel" role="dialog" aria-label={copy.detailAria}>
        <div className="panel__h">
          <div className="panel__top">
            <span className="panel__kicker">{copy.detailAria}</span>
            <Link href={closeHref} className="panel__x" aria-label={copy.close} data-panel-close>
              <X />
            </Link>
          </div>

          <div className="panel__title">
            {application.name}
            <span className="rcrow__meta" style={{ marginLeft: 9, fontWeight: 400 }}>
              {[application.age, application.gender].filter(Boolean).join(" · ")}
            </span>
          </div>
          <div className="panel__chips">
            <span className={`rcstat rcstat--${application.status}`}>
              {copy.status[application.status]}
            </span>
            {application.jobTitle && <span className="rchip void">{application.jobTitle}</span>}
            {application.employmentType && (
              <span className="rchip void">{application.employmentType}</span>
            )}
          </div>

          {/* 상태 진행 표시 — 지금 어디까지 왔는지가 액션 바보다 먼저 보여야 한다. */}
          <div className="rcsteps">
            {JOB_APPLICATION_STATUSES.map((status, index) => (
              <span key={status} style={{ display: "contents" }}>
                {index > 0 && <span className="rcsteps__line" />}
                <span className={`rcsteps__s ${index <= stepIndex ? "on" : ""}`}>
                  <span className="rcsteps__dot" />
                  {copy.status[status]}
                </span>
              </span>
            ))}
          </div>
        </div>

        <div className="panel__b">
          {application.isLegacyForm && (
            <div className="rcinfo">
              <Info size={14} aria-hidden="true" />
              <span>
                <b>{copy.legacyNoticeTitle}</b> {copy.legacyNoticeBody}
              </span>
            </div>
          )}

          <div className="pblock">
            <div className="pblock__t">{copy.sectionWork}</div>
            <div className="rckv">
              <span className="rckv__k">{copy.labelWorkDays}</span>
              <span className="rcdays">
                {WEEK_DAY_KEYS.map((day, index) => (
                  <span
                    key={day}
                    className={`rcday ${application.workDays.includes(day) ? "on" : ""}`}
                  >
                    {copy.weekDays[index]}
                  </span>
                ))}
              </span>
              <Row label={copy.labelDaysPerWeek} value={application.daysPerWeek} />
              <Row
                label={copy.labelDuration}
                value={application.duration}
                missing={application.isLegacyForm}
                missingLabel={copy.notCollected}
              />
              <Row label={copy.labelStart} value={application.startDate} mono />
              <Row label={copy.labelCommute} value={application.commuteTime} />
              <Row
                label={copy.labelUniform}
                value={application.uniformSize}
                missing={application.isLegacyForm}
                missingLabel={copy.notCollected}
              />
            </div>
          </div>

          <div className="pblock">
            <div className="pblock__t">{copy.sectionExperience}</div>
            <div className="rcrow__chips" style={{ marginBottom: 9 }}>
              <span className={`rcchip ${application.hasIndustryExp ? "rcchip--good" : ""}`}>
                {application.hasIndustryExp ? copy.labelExperienceYes : copy.labelExperienceNo}
              </span>
              {application.industryTasks.map((task) => (
                <span key={task} className="rcchip">
                  {task}
                </span>
              ))}
            </div>
            {/* 지원 동기는 접지 않고 전량 노출한다 — 패널에 이미 스크롤이 있고, 잘린 문장은
                판단에 쓸 수 없다. 목록에는 아예 넣지 않는 이유도 같다. */}
            {application.motivation && <div className="rcnote">{application.motivation}</div>}
            {application.sourceChannel && (
              <div className="rckv" style={{ marginTop: 9 }}>
                <Row label={copy.labelSource} value={application.sourceChannel} />
              </div>
            )}
          </div>

          <div className="pblock">
            <div className="pblock__t">{copy.sectionVisa}</div>
            <div className="rckv">
              <Row label={copy.labelNationality} value={application.nationality} />
              <Row label={copy.labelVisaType} value={application.visaType} />
              <span className="rckv__k">{copy.labelVisaPeriod}</span>
              <span className="rckv__v">
                {application.visaPeriodRaw ? (
                  <>
                    <span className="rckv__v--mono">{application.visaPeriodRaw}</span>
                    {/* 날짜로 읽지 못한 값은 원문만 보여주고 D-day 를 지어내지 않는다. */}
                    {application.visaExpiryDate === null && (
                      <span className="rcemp" style={{ marginLeft: 8 }}>
                        {copy.visaUnreadable}
                      </span>
                    )}
                    {application.visaDaysLeft !== null && application.visaAlert && (
                      <span
                        className={`rcchip rcchip--${
                          application.visaAlert === "soon" ? "warn" : "danger"
                        }`}
                        style={{ marginLeft: 8 }}
                      >
                        {application.visaAlert === "expired"
                          ? copy.chipVisaExpired
                          : copy.chipVisaDays.replace("{n}", String(application.visaDaysLeft))}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="rckv__v--none">—</span>
                )}
              </span>
            </div>
          </div>

          <div className="pblock">
            <div className="pblock__t">{copy.sectionResume}</div>
            {application.hasResume ? (
              <div className="rcfile">
                <div className="rcfile__b">
                  <div className="rcfile__n">{application.resumeFileName ?? "—"}</div>
                  <div className="rcfile__m">
                    <span className={`rcext ${resume.previewable ? "" : "rcext--plain"}`}>
                      {resume.ext || "file"}
                    </span>
                    <span>
                      {resume.previewable ? copy.resumePreviewable : copy.resumeNotPreviewable}
                    </span>
                  </div>
                  <div className="rcfile__acts">
                    {/* 열 수 없는 형식에 「열기」를 두면 빈 탭이 뜨고 담당자는 파일이 깨졌다고
                        판단한다. 컨테이너는 그대로 두고 **액션 라벨만** 바꾼다. */}
                    {resumeUrl ? (
                      <a
                        className="btn btn--pri btn--sm"
                        href={resumeUrl}
                        target="_blank"
                        rel="noreferrer"
                        download={resume.previewable ? undefined : (application.resumeFileName ?? true)}
                      >
                        {resume.previewable ? copy.resumeOpen : copy.resumeDownload}
                      </a>
                    ) : (
                      <span className="rcemp">{copy.resumeUnavailable}</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              // 첨부 없음은 결함이 아니라 **다른 검토 경로**다. 경고색을 쓰지 않는다.
              <div className="rcnofile">
                <div className="rcnofile__t">
                  <FileText size={16} aria-hidden="true" />
                  {copy.noResumeTitle}
                </div>
                <div className="rcnofile__s">{copy.noResumeBody}</div>
              </div>
            )}
          </div>

          {history.length > 0 && (
            <div className="pblock">
              <div className="pblock__t">
                {copy.sectionHistory}
                <span className="rcrow__sub" style={{ marginLeft: 8 }}>
                  {copy.historyMatchNote}
                </span>
              </div>
              <div className="rchist">
                <div className="rchist__row">
                  <span className="rchist__dot on" />
                  <div className="rchist__b">
                    <div className="rchist__h">
                      <span className="rchist__d">
                        {application.appliedAt?.slice(0, 10) ?? "—"}
                      </span>
                      <span className="rcchip rcchip--info">{copy.historyThis}</span>
                    </div>
                    <span className="rchist__s">
                      {[application.jobTitle, application.employmentType, application.daysPerWeek]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </span>
                  </div>
                </div>
                {history.map((row) => (
                  <div key={row.id} className="rchist__row">
                    <span className="rchist__dot" />
                    <div className="rchist__b">
                      <div className="rchist__h">
                        <span className="rchist__d">{row.appliedAt?.slice(0, 10) ?? "—"}</span>
                        <span className="rcchip rcchip--warn">
                          {copy.historyStoppedAt.replace("{status}", copy.status[row.status])}
                        </span>
                      </div>
                      <span className="rchist__s">
                        {[row.jobTitle, row.employmentType, row.daysPerWeek]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </span>
                      {/* 이전 판정 사유를 보지 않고 같은 결정을 반복하는 게 가장 큰 손실이다. */}
                      {row.reviewNote && <span className="rchist__note">{row.reviewNote}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <RecruitContactBlock application={application} copy={copy} />
          <RecruitPanelActions application={application} copy={copy} closeHref={closeHref} />
        </div>
      </aside>
    </>
  );
}
