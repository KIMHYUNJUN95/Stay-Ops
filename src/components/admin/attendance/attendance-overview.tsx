import Link from "next/link";
import {
  AlertTriangle,
  Bus,
  ChevronRight,
  Clock,
  Info,
  Pencil,
  Shield,
  Wallet,
} from "lucide-react";
import type {
  AdminAttendanceOverviewData,
  AdminCorrectionField,
  AdminCorrectionRow,
} from "@/lib/admin-attendance";
import type { ReviewQueueItem } from "@/lib/attendance-review";
import type { Dictionary } from "@/lib/i18n";
import { formatAdminYen } from "../shared/admin-format";

type Att = Dictionary["admin"]["attendanceConsole"];

function Ic({ children }: { children: React.ReactNode }) {
  return <span className="ic">{children}</span>;
}

function initial(name: string): string {
  return name.trim().slice(0, 1) || "·";
}

function corrFieldLabel(field: AdminCorrectionField, c: Att): string {
  if (field === "clock_in") return c.corrFieldClockIn;
  if (field === "clock_out") return c.corrFieldClockOut;
  if (field === "site") return c.corrFieldSite;
  return c.corrFieldOther;
}

function ReviewRow({ item, c, ym }: { item: ReviewQueueItem; c: Att; ym: string }) {
  const isUrgent = item.reviewState === "review_required" && (item.isAbnormal || !item.clockOutLabel);
  const subParts = [
    item.dateLabel,
    item.clockInSiteName ?? null,
    item.clockInLabel
      ? `${item.clockInLabel} → ${item.clockOutLabel ?? "—"}`
      : null,
  ].filter(Boolean) as string[];
  return (
    <Link href={`/admin/attendance/queue?ym=${ym}&sessionId=${item.sessionId}`} className="qrow">
      <span className="avatar qrow__av" style={{ background: "var(--primary)" }}>
        {initial(item.userName)}
      </span>
      <div className="qrow__b">
        <div className="qrow__t">
          {item.userName}
          {isUrgent ? (
            <>
              {" "}
              <span className="pill pill--danger" style={{ height: 18 }}>
                {c.tagUrgent}
              </span>
            </>
          ) : null}
        </div>
        <div className="qrow__s">{subParts.join(" · ")}</div>
      </div>
      <div className="qrow__meta">
        <span className="pill pill--warn">
          <span className="d" />
          {c.cardReviewLive}
        </span>
      </div>
      <span className="ic qrow__chev">
        <ChevronRight />
      </span>
    </Link>
  );
}

function CorrectionRow({ item, c, ym }: { item: AdminCorrectionRow; c: Att; ym: string }) {
  const field = corrFieldLabel(item.field, c);
  const subParts = [
    item.dateLabel ?? c.corrColTargetDate,
    `${item.beforeLabel} → ${item.afterLabel}`,
    item.submittedLabel,
  ];

  return (
    <Link href={`/admin/attendance/queue?ym=${ym}`} className="qrow">
      <span className="avatar qrow__av" style={{ background: "var(--info)" }}>
        {initial(item.requesterName)}
      </span>
      <div className="qrow__b">
        <div className="qrow__t">{item.requesterName}</div>
        <div className="qrow__s">{subParts.join(" · ")}</div>
      </div>
      <div className="qrow__meta">
        <span className="pill pill--info">
          <span className="d" />
          {field}
        </span>
      </div>
      <span className="ic qrow__chev">
        <ChevronRight />
      </span>
    </Link>
  );
}

export function AttendanceOverview({
  data,
  c,
  localeTag,
}: {
  data: AdminAttendanceOverviewData;
  c: Att;
  localeTag: string;
}) {
  const k = data.kpi;
  const yen = (n: number) => `${c.yenSym}${formatAdminYen(n, localeTag)}`;

  const opsCells: {
    label: string;
    value: string;
    sub: string;
    tag?: { label: string; cls: "pill--danger" | "pill--info" };
    icon: React.ReactNode;
  }[] = [
    {
      label: c.kpiReviewSessions,
      value: `${k.reviewSessions}`,
      sub: c.kpiReviewUrgent(k.urgent),
      tag: k.urgent > 0 ? { label: c.tagUrgent, cls: "pill--danger" } : undefined,
      icon: <Clock />,
    },
    {
      label: c.kpiCorrOpen,
      value: `${k.corrOpen}`,
      sub: c.kpiCorrSub,
      icon: <Pencil />,
    },
    {
      label: c.kpiPayEstimated,
      value: yen(k.payTotal),
      sub: c.kpiPaySub(k.payEstimated),
      tag: { label: c.tagEstimated, cls: "pill--info" },
      icon: <Wallet />,
    },
    {
      label: c.kpiPayExcluded,
      value: `${k.payExcluded}`,
      sub: c.kpiPayExcludedSub,
      icon: <AlertTriangle />,
    },
    {
      label: c.kpiTrPending,
      value: `${k.trPending}`,
      sub: c.kpiTrSub(yen(k.trTotal)),
      icon: <Bus />,
    },
  ];

  return (
    <>
      {!data.isPrivileged ? <div className="privnote">{c.privilegedNotice}</div> : null}

      {/* KPI bar */}
      <div className="opsbar">
        {opsCells.map((cell, i) => (
          <div key={i} className="opscell">
            <div className="opscell__k">
              <Ic>{cell.icon}</Ic>
              {cell.label}
            </div>
            <div className="opscell__v">{cell.value}</div>
            <div className="opscell__sub">{cell.sub}</div>
            {cell.tag ? (
              <span className="opscell__tag">
                <span className={`pill ${cell.tag.cls}`}>
                  <span className="d" />
                  {cell.tag.label}
                </span>
              </span>
            ) : null}
          </div>
        ))}
      </div>

      {/* Section — immediate review */}
      <div className="secthead">
        <span className="secthead__t">{c.sectImmediate}</span>
        <span className="secthead__c">{c.sectImmediateCount(k.urgent, k.reviewSessions)}</span>
        <span className="secthead__line" />
        <Link href={`/admin/attendance/queue?ym=${data.ym}`} className="secthead__a">
          {c.goQueue} →
        </Link>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(12,1fr)" }}>
        {/* Review card */}
        <div className="card" style={{ gridColumn: "span 7" }}>
          <div className="card__h">
            <span className="card__ic bg-warn">
              <Ic>
                <Clock />
              </Ic>
            </span>
            <div className="card__ti">
              <span className="card__t">{c.cardReview}</span>
              <span className="card__live" style={{ color: "var(--warn)" }}>
                <span className="d" style={{ background: "var(--warn)" }} />
                {c.cardReviewLive}
              </span>
            </div>
            <span className="card__cnt">
              {k.reviewSessions}
              {c.unitCount}
            </span>
            <div className="card__act">
              <Link href={`/admin/attendance/queue?ym=${data.ym}`} className="linkmore">
                {c.tabQueue}
                <Ic>
                  <ChevronRight />
                </Ic>
              </Link>
            </div>
          </div>
          <div style={{ paddingBottom: 6 }}>
            {data.reviewSample.length === 0 ? (
              <div className="empty">{c.cardReviewEmpty}</div>
            ) : (
              data.reviewSample.map((item) => (
                <ReviewRow key={item.sessionId} item={item} c={c} ym={data.ym} />
              ))
            )}
          </div>
        </div>

        {/* Correction card */}
        <div className="card" style={{ gridColumn: "span 5" }}>
          <div className="card__h">
            <span className="card__ic bg-info">
              <Ic>
                <Pencil />
              </Ic>
            </span>
            <div className="card__ti">
              <span className="card__t">{c.cardCorr}</span>
            </div>
            <span className="card__cnt">
              {k.corrOpen}
              {c.unitCount}
            </span>
            <div className="card__act">
              <Link href={`/admin/attendance/queue?ym=${data.ym}`} className="linkmore">
                {c.goQueue}
                <Ic>
                  <ChevronRight />
                </Ic>
              </Link>
            </div>
          </div>
          <div style={{ paddingBottom: 6 }}>
            {data.correctionSample.length === 0 ? (
              <div className="empty">{c.cardCorrEmpty}</div>
            ) : (
              data.correctionSample.map((item) => (
                <CorrectionRow key={item.id} item={item} c={c} ym={data.ym} />
              ))
            )}
          </div>
          <div className="card__foot">
            <span className="locknote" style={{ background: "transparent", padding: 0 }}>
              <Ic>
                <Shield />
              </Ic>
              {c.cardCorrPermNote}
            </span>
          </div>
        </div>
      </div>

      {/* Section — payroll/transport summary */}
      <div className="secthead">
        <span className="secthead__t">{c.sectSummary}</span>
        <span className="secthead__line" />
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(12,1fr)" }}>
        {/* Payroll summary */}
        <div className="card" style={{ gridColumn: "span 6" }}>
          <div className="card__h">
            <span className="card__ic bg-pri">
              <Ic>
                <Wallet />
              </Ic>
            </span>
            <div className="card__ti">
              <span className="card__t">{c.cardPayroll(data.monthLabel)}</span>
              <span className="pill pill--info" style={{ marginLeft: 2 }}>
                <span className="d" />
                {c.tagEstimated}
              </span>
            </div>
            <div className="card__act">
              <Link href={`/admin/attendance/payroll?ym=${data.ym}`} className="linkmore">
                {c.tabPayroll}
                <Ic>
                  <ChevronRight />
                </Ic>
              </Link>
            </div>
          </div>
          <div className="card__body" style={{ paddingTop: 4 }}>
            <div className="minirow" style={{ padding: "6px 0 14px" }}>
              <div className="ministat">
                <div className="ministat__v">{k.payEstimated}</div>
                <div className="ministat__k">{c.payHourlyTarget}</div>
              </div>
              <div className="minisep" />
              <div className="ministat">
                <div className="ministat__v mono" style={{ fontSize: 18 }}>
                  {yen(k.payTotal)}
                </div>
                <div className="ministat__k">{c.payPretaxTotal}</div>
              </div>
              <div className="minisep" />
              <div className="ministat">
                <div className="ministat__v" style={{ color: "var(--warn)" }}>
                  {k.payExcluded}
                </div>
                <div className="ministat__k">{c.payExcluded}</div>
              </div>
            </div>
            <div className="locknote">
              <Ic>
                <Info />
              </Ic>
              {c.payNote(k.payExcluded)}
            </div>
          </div>
          <div className="card__foot">
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)" }}>
              {c.payFootNote}
            </span>
          </div>
        </div>

        {/* Transport summary */}
        <div className="card" style={{ gridColumn: "span 6" }}>
          <div className="card__h">
            <span className="card__ic bg-info">
              <Ic>
                <Bus />
              </Ic>
            </span>
            <div className="card__ti">
              <span className="card__t">{c.cardTransport(data.monthLabel)}</span>
            </div>
            <div className="card__act">
              <Link href={`/admin/attendance/transport?ym=${data.ym}`} className="linkmore">
                {c.tabTransport}
                <Ic>
                  <ChevronRight />
                </Ic>
              </Link>
            </div>
          </div>
          <div className="card__body" style={{ paddingTop: 4 }}>
            <div className="minirow" style={{ padding: "6px 0 14px" }}>
              <div className="ministat">
                <div className="ministat__v">{k.trPending}</div>
                <div className="ministat__k">{c.trPending}</div>
              </div>
              <div className="minisep" />
              <div className="ministat">
                <div className="ministat__v mono" style={{ fontSize: 18 }}>
                  {yen(k.trTotal)}
                </div>
                <div className="ministat__k">{c.trSubmittedTotal}</div>
              </div>
              <div className="minisep" />
              <div className="ministat">
                <div className="ministat__v" style={{ color: "var(--warn)" }}>
                  {k.trMissing}
                </div>
                <div className="ministat__k">{c.trMissing}</div>
              </div>
            </div>
            <div className="locknote">
              <Ic>
                <AlertTriangle />
              </Ic>
              {c.trNote(k.trMissing)}
            </div>
          </div>
          <div className="card__foot">
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)" }}>
              {c.trFootNote}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
