"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, MoveRight, Search } from "lucide-react";
import { AdmDropdown } from "@/components/admin/shared/adm-dropdown";
import { AdminDateRangePicker } from "@/components/admin/shared/admin-date-range-picker";
import { AdminExportButtons } from "@/components/admin/shared/admin-export-buttons";
import { AdminToast, useAdminToast } from "@/components/admin/shared/admin-toast";
import {
  exportRecruitReport,
  exportRecruitWorkbook,
  setApplicationStatus,
  type RecruitExportRow,
} from "@/app/admin/recruit/actions";
import type { Dictionary, Locale } from "@/lib/i18n";
import type {
  ApplicationFilter,
  ApplicationListRow,
  ApplicationSummary,
} from "@/lib/recruit/applications";
import { filterApplicationsBySearch } from "@/lib/recruit/search";
import { nextStatusOf, type JobApplicationStatus } from "@/lib/recruit/status";

/**
 * 채용 지원서 목록 — 디자인 「StayOps Recruiting Console」 1a·1d·1f 구현.
 *
 * **표이고 카드가 아니다.** 하루 10건이 몰릴 때 필요한 건 비교와 훑기이고, 카드 그리드는 같은
 * 항목을 눈으로 정렬하기 어렵다. 표가 못 담는 판단 근거(경험·재지원·비자 만료·첨부 없음)는
 * 행 안의 **신호 칩** 한 줄이 맡는다.
 *
 * **전화·주소·국적은 목록에 없다.** 어깨너머 노출을 줄이고, 「열어볼 가치가 있는가」 판단에는
 * 필요하지 않기 때문이다. 국적을 목록 앞에 세우면 국적으로 훑는 화면이 된다.
 *
 * **전진은 목록에서, 되돌리기는 상세에서.** 194건을 훑으며 서류검토로 넘기는 건 대량 작업이라
 * 행 hover 버튼과 벌크 바로 처리한다. 되돌리기는 개별 확인이 필요해 패널 하단에만 둔다.
 *
 * 도메인 계약: docs/product/30-recruit-workflow.md
 */

const PAGE_SIZE = 14;

type Props = {
  copy: Dictionary["recruit"];
  sharedCopy: Dictionary["admin"]["shared"];
  locale: Locale;
  localeTag: string;
  rows: ApplicationListRow[];
  summary: ApplicationSummary;
  facets: { jobTitles: string[]; employmentTypes: string[] };
  filter: ApplicationFilter;
  selectedId: string | null;
};

function fmtRecv(value: string | null): string {
  return value ? value.slice(5, 10) : "—";
}

export function RecruitConsole({
  copy,
  sharedCopy,
  localeTag,
  rows,
  summary,
  facets,
  filter,
  selectedId,
}: Props) {
  const router = useRouter();
  const { toast, showToast, dismiss } = useAdminToast();
  const [picked, setPicked] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [pending, startTransition] = useTransition();

  /** 필터는 전부 쿼리스트링이다 — 서버 렌더 한 번으로 끝나고, 링크로 공유된다. */
  function pushFilter(patch: Record<string, string | null>) {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    // 조건이 바뀌면 선택과 페이지는 의미를 잃는다.
    params.delete("application");
    setPicked([]);
    setPage(0);
    router.push(`/admin/recruit?${params.toString()}`);
  }

  /**
   * 검색어는 **브라우저에만 있다.** 다른 필터처럼 쿼리스트링에 넣지 않는다.
   *
   * 넣으면 글자마다 서버를 다시 타고, 그 사이 목록은 이전 결과에 머문다. 특히 글자를 **지울 때**
   * 손에 있는 건 이미 좁혀진 목록뿐이라 응답이 올 때까지 넓어지지 않는다 — 「한 글자만 쳐도 바로,
   * 지우면 바로 전체」가 안 되던 원인이다. 목록은 탭 기준 전량이 이미 와 있으므로
   * (`page.tsx` 가 `query: null` 로 부른다) 여기서 거르면 즉시 끝난다.
   *
   * 링크로 들어온 `?q=` 는 초기값으로만 받는다.
   */
  const [query, setQuery] = useState(filter.query ?? "");

  const visibleRows = useMemo(() => filterApplicationsBySearch(rows, query), [rows, query]);

  // 검색 결과가 줄면 보고 있던 페이지가 사라진다. 마지막 페이지로 당긴다.
  const lastPage = Math.max(0, Math.ceil(visibleRows.length / PAGE_SIZE) - 1);
  const safePage = Math.min(page, lastPage);
  const pageRows = useMemo(
    () => visibleRows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [visibleRows, safePage],
  );

  function togglePick(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  function advance(ids: string[], to: JobApplicationStatus) {
    startTransition(async () => {
      const result = await setApplicationStatus(ids, to);
      showToast(result.ok ? copy.statusChanged : copy.actionFailed);
      if (result.ok) {
        setPicked([]);
        router.refresh();
      }
    });
  }

  /**
   * 벌크는 **다음 단계로 미는 것만** 가능하다. 선택한 건들의 상태가 섞여 있을 수 있으므로,
   * 각자의 다음 단계로 보낸다 — 「전부 면접으로」처럼 단계를 건너뛰지 않는다.
   */
  function advancePicked() {
    const byTarget = new Map<JobApplicationStatus, string[]>();
    for (const id of picked) {
      const row = rows.find((r) => r.id === id);
      const to = row ? nextStatusOf(row.status) : null;
      if (!to) continue;
      byTarget.set(to, [...(byTarget.get(to) ?? []), id]);
    }
    if (byTarget.size === 0) return;
    startTransition(async () => {
      const results = await Promise.all(
        Array.from(byTarget.entries()).map(([to, ids]) => setApplicationStatus(ids, to)),
      );
      showToast(results.every((r) => r.ok) ? copy.statusChanged : copy.actionFailed);
      setPicked([]);
      router.refresh();
    });
  }

  /**
   * 내보낼 대상 — **선택이 있으면 선택한 것만.**
   *
   * 목록에서 몇 건만 골라 넘기는 일이 실제 업무다(면접 후보를 뽑아 공유하는 등). 선택이 없으면
   * 지금 필터에 걸린 전부를 낸다.
   *
   * 목록은 이미 필터를 통과한 행이므로 여기서 다시 서버에 묻지 않는다.
   */
  const exportRows = useMemo(
    () => (picked.length > 0 ? rows.filter((row) => picked.includes(row.id)) : visibleRows),
    [rows, visibleRows, picked],
  );

  const exportPayload = useMemo(
    () => ({
      rows: exportRows.map<RecruitExportRow>((row) => ({
        appliedAt: row.appliedAt ? row.appliedAt.slice(0, 10) : "—",
        name: row.name,
        age: row.age ?? "—",
        gender: row.gender ?? "—",
        jobTitle: row.jobTitle ?? "—",
        employmentType: row.employmentType ?? "—",
        daysPerWeek: row.daysPerWeek ?? "—",
        workDays: row.workDays.join(" "),
        startDate: row.startDate ?? "—",
        experience: row.hasIndustryExp ? copy.labelExperienceYes : copy.labelExperienceNo,
        visa:
          row.visaDaysLeft === null
            ? "—"
            : copy.chipVisaDays.replace("{n}", String(row.visaDaysLeft)),
        resume: row.hasResume ? "O" : "—",
        status: row.status,
      })),
      // 파일 제목에도 「선택분」임을 남긴다. 1건짜리 파일에 「전체 기간」이 찍혀 있으면 나중에
      // 그 파일을 받은 사람이 전수로 오해한다.
      rangeLabel:
        picked.length > 0
          ? copy.exportSelected.replace("{n}", String(picked.length))
          : filter.from && filter.to
            ? `${filter.from} ~ ${filter.to}`
            : copy.exportRangeAll,
    }),
    [exportRows, picked.length, filter.from, filter.to, copy],
  );

  const statusTabs: { key: JobApplicationStatus | "all"; label: string; count: number }[] = [
    { key: "pending", label: copy.status.pending, count: summary.byStatus.pending },
    { key: "screening", label: copy.status.screening, count: summary.byStatus.screening },
    { key: "interview", label: copy.status.interview, count: summary.byStatus.interview },
    { key: "all", label: copy.statusAll, count: summary.total },
  ];

  /** 빈 상태에서 하나씩 떼어낼 수 있도록, 지금 걸린 조건을 사람이 읽을 문장으로 모은다. */
  const activeFilters: {
    label: string;
    /** 쿼리스트링 필터는 URL 을 고쳐 지운다. */
    clear?: Record<string, string | null>;
    /** 검색어는 URL 에 없으므로 로컬 상태를 지운다. */
    onClear?: () => void;
  }[] = [];
  if (filter.status !== "all") {
    activeFilters.push({ label: copy.status[filter.status], clear: { status: "all" } });
  }
  // 검색 결과가 0건일 때 「무엇 때문에 비었는지」가 보여야 한다. 검색어는 URL 에 없으므로
  // 다른 칩들과 달리 로컬 상태를 지우는 칩으로 넣는다.
  if (query.trim()) activeFilters.push({ label: query.trim(), onClear: () => setQuery("") });
  if (filter.jobTitle) activeFilters.push({ label: filter.jobTitle, clear: { job: null } });
  if (filter.employmentType) {
    activeFilters.push({ label: filter.employmentType, clear: { employment: null } });
  }
  if (filter.from && filter.to) {
    activeFilters.push({ label: `${filter.from} ~ ${filter.to}`, clear: { from: null, to: null } });
  }
  if (filter.withResumeOnly) {
    activeFilters.push({ label: copy.filterResumeOnly, clear: { resume: null } });
  }


  return (
    <div className="rc">
      <div className="ctoolbar">
        <div>
          <h2 className="rc__title" style={{ margin: 0 }}>
            {copy.title}
          </h2>
        </div>
        <div className="ctoolbar__spacer" />
        <AdminExportButtons
          onExportXls={() => exportRecruitWorkbook(exportPayload)}
          onExportPdf={() => exportRecruitReport(exportPayload)}
          onToast={showToast}
          disabled={exportRows.length === 0}
          labels={sharedCopy}
        />
      </div>

      <div className="rc__kpis">
        <div className="rckpi">
          <span className="rckpi__k">{copy.kpiPendingLabel}</span>
          <span className="rckpi__v rckpi__v--pri">{summary.pending}</span>
          <span className="rckpi__s">{copy.kpiPendingSub}</span>
        </div>
        <div className="rckpi">
          <span className="rckpi__k">{copy.kpiTodayLabel}</span>
          <span className="rckpi__v">{summary.today}</span>
          <span className="rckpi__s">{copy.kpiTodaySub.replace("{n}", String(summary.last7))}</span>
        </div>
        <div className="rckpi">
          <span className="rckpi__k">{copy.kpiResumeLabel}</span>
          <span className="rckpi__v">
            {summary.withResume}
            <span className="rckpi__unit"> / {summary.total}</span>
          </span>
          <span className="rckpi__s">{copy.kpiResumeSub}</span>
        </div>
        <div className="rckpi">
          {/* 「확인 필요」는 90일 이내 만료만 센다. 날짜로 읽지 못한 값과 영주는 빠진다. */}
          <span className="rckpi__k">{copy.kpiVisaLabel}</span>
          <span className="rckpi__v rckpi__v--warn">{summary.visaAttention}</span>
          <span className="rckpi__s">{copy.kpiVisaSub}</span>
        </div>
      </div>

      <div className="rc__filters">
        <div className="rcseg" role="tablist">
          {statusTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={filter.status === tab.key}
              className={`rcseg__b ${filter.status === tab.key ? "on" : ""}`}
              onClick={() => pushFilter({ status: tab.key === "pending" ? null : tab.key })}
            >
              {tab.label} <span className="rcseg__n">{tab.count}</span>
            </button>
          ))}
        </div>

        <AdmDropdown
          size="sm"
          ariaLabel={copy.filterJob}
          value={filter.jobTitle ?? ""}
          onChange={(value) => pushFilter({ job: value || null })}
          options={[
            { value: "", label: `${copy.filterJob} · ${copy.filterAll}` },
            ...facets.jobTitles.map((title) => ({ value: title, label: title })),
          ]}
        />
        <AdmDropdown
          size="sm"
          ariaLabel={copy.filterEmployment}
          value={filter.employmentType ?? ""}
          onChange={(value) => pushFilter({ employment: value || null })}
          options={[
            { value: "", label: `${copy.filterEmployment} · ${copy.filterAll}` },
            ...facets.employmentTypes.map((type) => ({ value: type, label: type })),
          ]}
        />
        <AdminDateRangePicker
          from={filter.from ?? ""}
          to={filter.to ?? ""}
          onChange={(from, to) => pushFilter({ from: from || null, to: to || null })}
          localeTag={localeTag}
          ariaLabel={sharedCopy.pickRange}
          emptyLabel={copy.exportRangeAll}
          labels={{
            prevMonth: sharedCopy.datePrevMonth,
            nextMonth: sharedCopy.dateNextMonth,
            thisMonth: sharedCopy.dateThisMonth,
            reset: sharedCopy.dateReset,
            apply: sharedCopy.dateApply,
          }}
        />
        <button
          type="button"
          className="chipbtn"
          aria-pressed={filter.withResumeOnly}
          onClick={() => pushFilter({ resume: filter.withResumeOnly ? null : "1" })}
        >
          <span className={`rcsel ${filter.withResumeOnly ? "on" : ""}`} aria-hidden="true">
            <Check strokeWidth={3} />
          </span>
          {copy.filterResumeOnly}
        </button>

        {/* 제출이 없다. 타이핑이 곧 검색이다 — Enter 로 페이지가 새로 뜨지 않도록 막아만 둔다. */}
        <form className="rc__spacer" onSubmit={(event) => event.preventDefault()} role="search">
          <span className="qsearch qsearch--inline">
            <Search size={15} aria-hidden="true" />
            <input
              name="q"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              placeholder={copy.searchPlaceholder}
              aria-label={copy.searchPlaceholder}
              autoComplete="off"
              type="search"
            />
          </span>
        </form>
      </div>

      {picked.length > 0 && (
        <div className="rcbulk">
          <span className="rcsel on" aria-hidden="true">
            <Check strokeWidth={3} />
          </span>
          <span className="rcbulk__n">{copy.bulkSelected.replace("{n}", String(picked.length))}</span>
          <span className="rcbulk__hint">
            {copy.exportSelectedHint.replace("{n}", String(picked.length))}
          </span>
          <span className="rc__spacer" />
          <button type="button" className="rcbulk__cta" onClick={advancePicked} disabled={pending}>
            {copy.advanceTo.screening}
          </button>
          <button type="button" className="rcbulk__ghost" onClick={() => setPicked([])}>
            {copy.bulkClear}
          </button>
        </div>
      )}

      {visibleRows.length === 0 ? (
        <div className="rcempty">
          <span className="rcempty__ic" aria-hidden="true">
            <Search size={22} />
          </span>
          <span className="rcempty__t">
            {summary.total === 0 ? copy.emptyNoData : copy.emptyTitle}
          </span>
          {summary.total > 0 && (
            <>
              {/* 「없습니다」로 끝내지 않고 어떤 조건이 걸려 0건인지 그 자리에 보여 준다. */}
              <span className="rcempty__s">{copy.emptyBodyPrefix}</span>
              <div className="rcempty__acts">
                {activeFilters.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="rcactive"
                    onClick={() => {
                      if (item.onClear) item.onClear();
                      else if (item.clear) pushFilter(item.clear);
                    }}
                  >
                    {item.label} ✕
                  </button>
                ))}
              </div>
              <div className="rcempty__acts">
                {filter.status !== "pending" && summary.byStatus.pending > 0 && (
                  <button
                    type="button"
                    className="btn btn--pri btn--sm"
                    onClick={() => pushFilter({ status: null })}
                  >
                    {copy.emptyResetOne.replace("{n}", String(summary.byStatus.pending))}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() =>
                    pushFilter({
                      status: null,
                      job: null,
                      employment: null,
                      from: null,
                      to: null,
                      resume: null,
                      q: null,
                    })
                  }
                >
                  {copy.emptyResetAll}
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="rctbl">
          <div className="rctbl__h">
            <span aria-hidden="true" />
            <span>{copy.colApplicant}</span>
            <span>{copy.colJob}</span>
            <span>{copy.colWork}</span>
            <span>{copy.colStart}</span>
            <span>{copy.colApplied}</span>
            <span className="rccol--end">{copy.colStatus}</span>
          </div>

          {pageRows.map((row) => {
            const next = nextStatusOf(row.status);
            return (
              <div
                key={row.id}
                className={`rcrow ${selectedId === row.id ? "on" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/admin/recruit?${detailQuery(row.id)}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(`/admin/recruit?${detailQuery(row.id)}`);
                  }
                }}
              >
                <button
                  type="button"
                  className={`rcsel ${picked.includes(row.id) ? "on" : ""}`}
                  aria-label={copy.selectRow}
                  aria-pressed={picked.includes(row.id)}
                  onClick={(event) => {
                    event.stopPropagation();
                    togglePick(row.id);
                  }}
                >
                  <Check strokeWidth={3} aria-hidden="true" />
                </button>

                <div className="rcrow__cell">
                  <span className="rcrow__name">
                    <span className="rcrow__nm">{row.name}</span>
                    <span className="rcrow__meta">
                      {[row.age, row.gender].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="rcrow__chips">
                    <RowChips row={row} copy={copy} />
                  </span>
                </div>

                <div className="rcrow__cell">
                  <span className="rcrow__main">{row.jobTitle ?? "—"}</span>
                  {row.employmentType ? (
                    <span className="rcemp">{row.employmentType}</span>
                  ) : (
                    <span className="rcemp">{copy.notCollected}</span>
                  )}
                </div>

                <div className="rcrow__cell">
                  <span className="rcrow__main">{row.daysPerWeek ?? "—"}</span>
                  <span className="rcrow__sub">{row.workDays.join(" ") || "—"}</span>
                </div>

                <span className="rcrow__mono">{row.startDate ?? "—"}</span>
                <span className="rcrow__mono rcrow__mono--soft">{fmtRecv(row.appliedAt)}</span>

                <div className="rcrow__end">
                  {next && (
                    <button
                      type="button"
                      className="rcadv"
                      disabled={pending}
                      onClick={(event) => {
                        event.stopPropagation();
                        advance([row.id], next);
                      }}
                    >
                      {copy.advanceTo[next]}
                      <MoveRight size={12} aria-hidden="true" />
                    </button>
                  )}
                  <span className={`rcstat rcstat--${row.status}`}>{copy.status[row.status]}</span>
                </div>
              </div>
            );
          })}

          <div className="rcpager">
            <span className="rcpager__t">
              <b>
                {safePage * PAGE_SIZE + 1}–{Math.min(visibleRows.length, (safePage + 1) * PAGE_SIZE)}
              </b>{" "}
              / {visibleRows.length}
            </span>
            <span className="rc__spacer" />
            <button
              type="button"
              className="rcpager__b"
              aria-label={copy.prevPage}
              disabled={safePage === 0}
              onClick={() => setPage(Math.max(0, safePage - 1))}
            >
              <ChevronLeft size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="rcpager__b"
              aria-label={copy.nextPage}
              disabled={safePage >= lastPage}
              onClick={() => setPage(Math.min(lastPage, safePage + 1))}
            >
              <ChevronRight size={13} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {toast ? <AdminToast message={toast.message} onDismiss={dismiss} /> : null}
    </div>
  );
}

function detailQuery(id: string): string {
  const params = new URLSearchParams(window.location.search);
  params.set("application", id);
  return params.toString();
}

/**
 * 신호 칩 — 표 칸으로는 표현 못 하는 판단 근거.
 *
 * **체류 자격은 만료 기간만 띄운다(90일 이내).** 국적·비자 종류는 패널의 체류 자격 블록에서만
 * 본다. 채용 판단을 바꾸는 것은 만료 시점이고, 국적을 목록에 세우면 국적으로 훑는 화면이 된다.
 */
function RowChips({ row, copy }: { row: ApplicationListRow; copy: Dictionary["recruit"] }) {
  return (
    <>
      {row.hasIndustryExp && <span className="rcchip rcchip--good">{copy.chipExperience}</span>}
      {row.repeatCount > 0 && (
        <span className="rcchip rcchip--info">
          {copy.chipRepeat.replace("{n}", String(row.repeatCount + 1))}
        </span>
      )}
      {row.visaAlert === "expired" && (
        <span className="rcchip rcchip--danger">{copy.chipVisaExpired}</span>
      )}
      {(row.visaAlert === "critical" || row.visaAlert === "soon") && row.visaDaysLeft !== null && (
        <span className={`rcchip rcchip--${row.visaAlert === "critical" ? "danger" : "warn"}`}>
          {copy.chipVisaDays.replace("{n}", String(row.visaDaysLeft))}
        </span>
      )}
      {!row.hasResume && <span className="rcchip">{copy.chipNoResume}</span>}
      {row.isLegacyForm && <span className="rcchip">{copy.chipLegacy}</span>}
    </>
  );
}
