import Link from "next/link";
import "./admin-console.css";
import { CleaningLiveCard } from "./cleaning-live-card";
import type { AdminDashboardData, QueueKind } from "@/lib/admin-dashboard";
import type { Dictionary } from "@/lib/i18n";

type Console = Dictionary["admin"]["console"];

/* ── inline icons (match the mobile icon language) ── */
const I = {
  clean: (
    <svg viewBox="0 0 24 24" fill="none"><path d="M12 4l1.4 3.6L17 9l-3.6 1.4L12 14l-1.4-3.6L7 9l3.6-1.4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M5 20l4-7M19 20l-4-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
  ),
  inbox: (
    <svg viewBox="0 0 24 24" fill="none"><path d="M4 13l2.5-7.5A2 2 0 018.4 4h7.2a2 2 0 011.9 1.5L20 13v5a2 2 0 01-2 2H6a2 2 0 01-2-2z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M4 13h4l1.5 2.5h5L16 13h4" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" /><path d="M12 7.5v5l3.2 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  board: (
    <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="16" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.7" /><path d="M8 9h8M8 13h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  bed: (
    <svg viewBox="0 0 24 24" fill="none"><path d="M3 8v10M3 12h18v6M21 12v-1.5a2.5 2.5 0 00-2.5-2.5H11v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /><circle cx="7" cy="11" r="1.6" stroke="currentColor" strokeWidth="1.6" /></svg>
  ),
  arrowIn: (
    <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="none"><path d="M10 4H6a1.5 1.5 0 00-1.5 1.5v13A1.5 1.5 0 006 20h4M16 8l4 4-4 4M20 12H10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  wrench: (
    <svg viewBox="0 0 24 24" fill="none"><path d="M14.5 6.5a3.5 3.5 0 00-4.6 4.3l-5.1 5.1a1.6 1.6 0 002.3 2.3l5.1-5.1a3.5 3.5 0 004.3-4.6l-2 2-1.8-1.8z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
  ),
  found: (
    <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" /><path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
  ),
  box: (
    <svg viewBox="0 0 24 24" fill="none"><path d="M4 8l8-4 8 4-8 4-8-4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M4 8v8l8 4 8-4V8M12 12v8" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
  ),
  chevR: (
    <svg viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
};

function Ic({ children }: { children: React.ReactNode }) {
  return <span className="ic">{children}</span>;
}

function relDay(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric", timeZone: "Asia/Tokyo" }).format(
    new Date(iso),
  );
}
function initial(name: string): string {
  return name.trim().slice(0, 1) || "·";
}

const QUEUE_ICON: Record<QueueKind, { icon: React.ReactNode; bg: string }> = {
  maintenance: { icon: I.wrench, bg: "bg-danger" },
  lost: { icon: I.found, bg: "bg-info" },
  order: { icon: I.box, bg: "bg-pri" },
};

export function DashboardHome({ data, c, locale }: { data: AdminDashboardData; c: Console; locale: string }) {
  const mCount = data.queue.filter((q) => q.kind === "maintenance").length;
  const lCount = data.queue.filter((q) => q.kind === "lost").length;
  const oCount = data.queue.filter((q) => q.kind === "order").length;
  const occPct = data.ops.totalRooms > 0 ? Math.round((data.ops.occupiedRooms / data.ops.totalRooms) * 100) : 0;

  const opsCells: {
    href: string;
    label: string;
    value: number;
    total?: number;
    unit?: string;
    delta?: string;
    deltaCls?: "up" | "down" | "flat";
    bar?: number;
    icon: React.ReactNode;
  }[] = [
    {
      href: "/admin/calendar",
      label: c.opsOccupied,
      value: data.ops.occupiedRooms,
      total: data.ops.totalRooms,
      unit: c.unitRooms,
      delta: c.occupancyRate(occPct),
      deltaCls: "flat",
      bar: occPct,
      icon: I.bed,
    },
    { href: "/admin/calendar", label: c.opsCheckIn, value: data.ops.checkIns, icon: I.arrowIn },
    { href: "/admin/calendar", label: c.opsCheckOut, value: data.ops.checkOuts, icon: I.logout },
    { href: "/admin/cleaning", label: c.opsCleaning, value: data.ops.cleaningInProgress, unit: c.unitRooms, icon: I.clean },
    {
      href: "/admin/maintenance",
      label: c.opsRequests,
      value: data.ops.openRequests,
      unit: c.unitCount,
      delta: `${c.kindMaintenance} ${mCount} · ${c.kindLost} ${lCount} · ${c.kindOrder} ${oCount}`,
      deltaCls: "flat",
      icon: I.inbox,
    },
  ];

  return (
    <>
      {/* Ops summary bar */}
      <div className="opsbar">
        {opsCells.map((cell, i) => (
          <Link key={i} href={cell.href} className="opscell">
            <div className="opscell__k"><Ic>{cell.icon}</Ic>{cell.label}</div>
            <div className="opscell__v">
              {cell.value}
              {cell.total != null ? (
                <small> / {cell.total}{cell.unit}</small>
              ) : cell.unit ? (
                <small> {cell.unit}</small>
              ) : null}
            </div>
            {cell.delta ? <div className={`opscell__delta ${cell.deltaCls ?? "flat"}`}>{cell.delta}</div> : null}
            {cell.bar != null ? (
              <div className="opscell__bar"><i style={{ width: `${cell.bar}%` }} /></div>
            ) : null}
          </Link>
        ))}
      </div>

      {/* Section 1 — 진행 중 청소 + 미처리 큐 (top-priority: 문서 05-admin-web-ia.md) */}
      <div className="secthead">
        <span className="secthead__t">{c.sectQueueTitle}</span>
        <span className="secthead__c">{data.queue.length}</span>
        <span className="secthead__line" />
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(12,1fr)" }}>
        {/* 진행 중 청소 — 행 클릭 시 우측 상세 패널 */}
        <CleaningLiveCard cleaning={data.cleaning} locale={locale} />

        {/* 미처리 정비 / 분실물 / 주문 */}
        <div className="card" style={{ gridColumn: "span 5" }}>
          <div className="card__h">
            <span className="card__ic bg-warn"><Ic>{I.inbox}</Ic></span>
            <div className="card__ti"><span className="card__t">{c.queueTitle}</span></div>
            <span className="card__cnt">{data.queue.length}{c.unitCount}</span>
          </div>
          <div style={{ paddingBottom: 6 }}>
            {data.queue.length === 0 ? (
              <div className="empty">{c.queueEmpty}</div>
            ) : (
              data.queue.slice(0, 5).map((q) => {
                const meta = QUEUE_ICON[q.kind];
                const href =
                  q.kind === "maintenance" ? "/admin/maintenance" : q.kind === "lost" ? "/admin/lost-found" : "/admin/orders";
                const kindLabel = q.kind === "maintenance" ? c.kindMaintenance : q.kind === "lost" ? c.kindLost : c.kindOrder;
                return (
                  <Link key={`${q.kind}-${q.id}`} href={href} className="qrow">
                    <span className={`qrow__ic ${meta.bg}`}><Ic>{meta.icon}</Ic></span>
                    <div className="qrow__b">
                      <div className="qrow__t">{q.title}</div>
                      <div className="qrow__s">{kindLabel}{q.location ? ` · ${q.location}` : ""}</div>
                    </div>
                    <div className="qrow__meta">
                      {q.urgent ? <span className="pill pill--danger">{c.urgentTag}</span> : null}
                      <span className="qrow__time">{relDay(q.createdAt, locale)}</span>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Section 2 — 이상 근태 / 정정 요청 + 중요 공지 (top-priority: 문서 05-admin-web-ia.md) */}
      <div className="secthead">
        <span className="secthead__t">{c.sectReviewTitle}</span>
        <span className="secthead__line" />
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(12,1fr)" }}>
        {/* 이상 근태 / 정정 요청 */}
        <div className="card" style={{ gridColumn: "span 7" }}>
          <div className="card__h">
            <span className="card__ic bg-warn"><Ic>{I.clock}</Ic></span>
            <div className="card__ti">
              <span className="card__t">{c.attTitle}</span>
              <span className="card__live" style={{ color: "var(--warn)" }}>
                <span className="d" style={{ background: "var(--warn)" }} />{c.attReviewNeeded}
              </span>
            </div>
            <span className="card__cnt">{data.attendance.length}{c.unitCount}</span>
            <div className="card__act">
              <Link href="/admin/attendance" className="linkmore">{c.attModule}<Ic>{I.chevR}</Ic></Link>
            </div>
          </div>
          <div style={{ paddingBottom: 6 }}>
            {data.attendance.length === 0 ? (
              <div className="empty">{c.attEmpty}</div>
            ) : (
              data.attendance.slice(0, 4).map((a) => (
                <Link key={a.sessionId} href="/admin/attendance" className="qrow">
                  <span className="avatar qrow__av" style={{ background: "var(--primary)" }}>{initial(a.userName)}</span>
                  <div className="qrow__b">
                    <div className="qrow__t">
                      {a.userName} · <span style={{ color: "var(--ink-soft)", fontWeight: 600 }}>{a.dateLabel}</span>
                    </div>
                    <div className="qrow__s">
                      {a.clockInLabel ?? "—"} → {a.clockOutLabel ?? "—"}
                      {a.clockInSiteName ? ` · ${a.clockInSiteName}` : ""}
                    </div>
                  </div>
                  <div className="qrow__meta">
                    <span className={`pill ${a.reviewState === "pending_correction" ? "pill--info" : "pill--warn"}`}>
                      {a.reviewState === "pending_correction" ? c.attCorrection : c.attAbnormal}
                    </span>
                  </div>
                  <span className="ic qrow__chev">{I.chevR}</span>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* 중요 공지 */}
        <div className="card" style={{ gridColumn: "span 5" }}>
          <div className="card__h">
            <span className="card__ic bg-info"><Ic>{I.board}</Ic></span>
            <div className="card__ti"><span className="card__t">{c.noticeTitle}</span></div>
            <div className="card__act">
              <Link href="/admin/announcements" className="linkmore">{c.noticeBoard}<Ic>{I.chevR}</Ic></Link>
            </div>
          </div>
          <div style={{ paddingBottom: 6 }}>
            {data.notices.length === 0 ? (
              <div className="empty">{c.noticeEmpty}</div>
            ) : (
              data.notices.map((n) => (
                <Link key={n.id} href={`/admin/announcements/${n.id}`} className="nrow">
                  <span className={`nrow__ic ${n.important ? "bg-danger" : "bg-surf"}`}><Ic>{I.board}</Ic></span>
                  <div className="nrow__b">
                    {n.important ? (
                      <div className="nrow__h"><span className="pill pill--danger">{c.noticeImportant}</span></div>
                    ) : null}
                    <div className="nrow__t">{n.title}</div>
                  </div>
                  <span className="nrow__time">{relDay(n.createdAt, locale)}</span>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Section 3 — 오늘 할 일 + 예약/체크인아웃 (secondary block: 문서 05-admin-web-ia.md) */}
      <div className="secthead">
        <span className="secthead__t">{c.sectTodayTitle}</span>
        <span className="secthead__line" />
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(12,1fr)" }}>
        {/* 오늘 할 일 */}
        <div className="card" style={{ gridColumn: "span 4" }}>
          <div className="card__h">
            <span className="card__ic bg-pri"><Ic>{I.check}</Ic></span>
            <div className="card__ti"><span className="card__t">{c.todoTitle}</span></div>
            <span className="card__cnt">{data.todos.filter((t) => t.done).length} / {data.todos.length}</span>
          </div>
          <div style={{ paddingBottom: 6 }}>
            {data.todos.length === 0 ? (
              <div className="empty">{c.todoEmpty}</div>
            ) : (
              data.todos.map((t) => (
                <div key={t.id} className={`todo${t.done ? " is-done" : ""}`}>
                  <span className={`todo__chk${t.done ? " done" : ""}`}>{t.done ? <Ic>{I.check}</Ic> : null}</span>
                  <span className="todo__t">{t.title}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 예약 / 체크인 / 체크아웃 현황 */}
        <div className="card" style={{ gridColumn: "span 8" }}>
          <div className="card__h">
            <span className="card__ic bg-pri"><Ic>{I.bed}</Ic></span>
            <div className="card__ti"><span className="card__t">{c.resvTitle}</span></div>
            <div className="card__act">
              <div className="minirow" style={{ gap: 0, marginRight: 6 }}>
                <div className="ministat"><div className="ministat__v" style={{ fontSize: 17, color: "var(--info)" }}>{data.ops.checkIns}</div><div className="ministat__k">{c.resvCheckIn}</div></div>
                <div className="minisep" />
                <div className="ministat"><div className="ministat__v" style={{ fontSize: 17, color: "var(--done)" }}>{data.ops.checkOuts}</div><div className="ministat__k">{c.resvCheckOut}</div></div>
              </div>
              <Link href="/admin/calendar" className="linkmore">{c.viewAll}<Ic>{I.chevR}</Ic></Link>
            </div>
          </div>
          <div className="card__body">
            {data.reservations.checkIns.length === 0 && data.reservations.checkOuts.length === 0 ? (
              <div className="empty">{c.resvEmpty}</div>
            ) : (
              <div className="tl" style={{ marginTop: 4 }}>
                {data.reservations.checkIns.map((r) => (
                  <div key={`in-${r.id}`} className="tlrow">
                    <span className="tlrow__dot on" />
                    <div className="tlrow__b">
                      <div className="tlrow__t"><span className="mono">{r.roomLabel}</span> <span style={{ color: "var(--muted)", fontWeight: 600 }}>{r.guestName}</span></div>
                      <div className="tlrow__s">{r.propertyName}{r.source ? ` · ${r.source}` : ""}</div>
                    </div>
                    <span className="tlrow__kind" style={{ background: "var(--info-bg)", color: "var(--info)" }}>{c.resvCheckIn}</span>
                  </div>
                ))}
                {data.reservations.checkOuts.map((r) => (
                  <div key={`out-${r.id}`} className="tlrow">
                    <span className="tlrow__dot done" />
                    <div className="tlrow__b">
                      <div className="tlrow__t"><span className="mono">{r.roomLabel}</span> <span style={{ color: "var(--muted)", fontWeight: 600 }}>{r.guestName}</span></div>
                      <div className="tlrow__s">{r.propertyName}{r.source ? ` · ${r.source}` : ""}</div>
                    </div>
                    <span className="tlrow__kind" style={{ background: "var(--done-bg)", color: "var(--done)" }}>{c.resvCheckOut}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
