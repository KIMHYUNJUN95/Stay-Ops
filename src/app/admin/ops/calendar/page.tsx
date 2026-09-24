import { after } from "next/server";
import Link from "next/link";
import { AdminShell } from "@/components/shell/admin-shell";
import { OpsCalendarGrid } from "@/components/admin/ops/ops-calendar-grid";
import { OpsCalendarJump } from "@/components/admin/ops/ops-calendar-jump";
import { AdminMonthPicker } from "@/components/admin/shared/admin-month-picker";
import "@/components/admin/ops/ops-console.css";
import { refreshOpsCalendarRates } from "@/lib/beds24/rates-refresh";
import { getDictionary } from "@/lib/i18n";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getOpsCalendarData, OPS_CALENDAR_ROLLING_DAYS } from "@/lib/ops-calendar";
import { opsNavId } from "@/lib/ops-admin";
import { requireOpsAdminPage } from "../ops-page-session";

/**
 * 판매 캘린더 — 운영 관리자 영역의 핵심 화면.
 *
 * 1차에서는 **읽기만** 한다. 예약·블락·가격·최소 숙박일 전부 우리 DB 의 실제 데이터다
 * (가격은 `room_daily_rates`, 2026-09-17 신설).
 *
 * 쓰기(가격·최소숙박·블락·예약생성)는 병행 기간에는 켜지 않는다 —
 * docs/product/33-calendar-write-features.md → 「켜기 전까지 쓰지 않는다」.
 *
 * 상태는 전부 쿼리스트링이라 서버 렌더 한 번으로 끝난다(채용·컴플레인 콘솔과 같은 방식).
 */
export const dynamic = "force-dynamic";

type SearchParams = {
  /** `rolling`(기본) | `monthly` */
  mode?: string;
  /**
   * 월간 뷰의 대상 달(`YYYY-MM`).
   *
   * 이름이 `ym` 인 이유 — 공용 `AdminMonthPicker` 가 이 키로 이동한다. 우리만 `month` 로
   * 두면 그 컴포넌트를 못 쓰고 달력을 또 만들게 된다(CLAUDE.md §4a).
   */
  ym?: string;
  property?: string;
  /** 30일 뷰의 시작일. 없으면 도쿄 기준 어제. */
  start?: string;
  cancelled?: string;
};

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function shiftMonth(month: string, diff: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + diff;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export default async function OpsCalendarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireOpsAdminPage("calendar");
  const params = await searchParams;
  const dictionary = getDictionary(session.user.preferredLanguage);
  const copy = dictionary.opsAdmin.calendar;
  const localeTag = { en: "en-US", ja: "ja-JP", ko: "ko-KR" }[session.user.preferredLanguage];

  const data = await getOpsCalendarData(session, {
    mode: params.mode,
    month: params.ym,
    property: params.property,
    start: params.start,
    showCancelled: params.cancelled === "1",
  });

  const showCancelled = params.cancelled === "1";
  const isRolling = data.mode === "rolling";

  /*
   * **보고 있는 창이 낡았으면 그 자리에서 당겨 온다.**
   *
   * 주기 동기화(GitHub Actions)가 15분으로 걸려 있는데 실제 간격이 3~5시간이다. 그 사이
   * Beds24 화면에서 가격을 바꾸면 우리 화면은 몇 시간째 옛 값이고, **그 값을 기준으로
   * 퍼센트 조정을 하게 된다.**
   *
   * `after()` 라 **응답을 보낸 뒤에** 돈다 — 화면이 느려지지 않는다. 이번 화면은 여전히 옛
   * 값이지만 다음 화면은 맞고, 그동안 얼마나 오래됐는지는 위에 적어 둔다.
   *
   * 보이는 창 + 고른 건물만 당긴다. 9건물 × 12개월은 30초에 크레딧도 그만큼 쓴다 —
   * 화면을 열 때마다 할 일이 아니다.
   */
  /**
   * 「방금 / N분 전 / N시간 전 동기화」.
   *
   * 분 단위로만 적는다 — 초까지 적으면 새로고침마다 숫자가 달라져 **값이 바뀐 것처럼**
   * 보인다.
   */
  const syncedLabel = (() => {
    const minutes = data.ratesAgeMinutes;
    if (minutes === null) return copy.syncedNever;
    if (minutes < 1) return copy.syncedJustNow;
    if (minutes < 60) return copy.syncedMinutes.replace("{n}", String(minutes));
    return copy.syncedHours.replace("{n}", String(Math.floor(minutes / 60)));
  })();
  // 저쪽 주기(15분)와 같은 기준. 넘으면 빨갛게 적는다.
  const staleRates = data.ratesAgeMinutes === null || data.ratesAgeMinutes > 15;

  const lastVisibleDate = data.days.at(-1)?.date;
  if (lastVisibleDate) {
    const externalPropertyIds = data.selectedProperty
      ? data.propertyExternalIds[data.selectedProperty]
        ? [data.propertyExternalIds[data.selectedProperty]]
        : undefined
      : undefined;
    after(async () => {
      await refreshOpsCalendarRates({
        externalPropertyIds,
        organizationId: session.organization.id,
        supabase: getSupabaseServiceClient(),
        syncedAt: data.ratesSyncedAt,
        window: { from: data.days[0].date, to: lastVisibleDate },
      });
    });
  }

  const hrefWith = (next: Partial<SearchParams>) => {
    const query = new URLSearchParams();
    const merged: SearchParams = {
      mode: data.mode,
      ym: data.mode === "monthly" ? data.month : undefined,
      property: data.selectedProperty ?? undefined,
      start: data.mode === "rolling" ? data.start : undefined,
      cancelled: showCancelled ? "1" : undefined,
      ...next,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (typeof value === "string" && value) query.set(key, value);
    }
    return `/admin/ops/calendar${query.size > 0 ? `?${query.toString()}` : ""}`;
  };

  // 30일 뷰는 ±30일, 월간 뷰는 ±1개월. **월 단위로 바꾸지 않는다** — 바꾸면 오늘이 다시
  // 격자 끝으로 밀린다.
  const prevHref = isRolling
    ? hrefWith({ start: addDays(data.start, -OPS_CALENDAR_ROLLING_DAYS) })
    : hrefWith({ ym: shiftMonth(data.month, -1) });
  const nextHref = isRolling
    ? hrefWith({ start: addDays(data.start, OPS_CALENDAR_ROLLING_DAYS) })
    : hrefWith({ ym: shiftMonth(data.month, 1) });
  // 「오늘」은 30일 뷰에서 시작일을 다시 **어제**로 돌린다(저쪽 `goToRollingToday` 와 같다).
  const todayHref = isRolling
    ? hrefWith({ start: addDays(data.today, -1) })
    : hrefWith({ ym: data.today.slice(0, 7) });

  const first = data.days.at(0);
  const last = data.days.at(-1);
  const rangeLabel = isRolling
    ? first && last
      ? `${first.date.slice(5).replace("-", "/")} → ${last.date.slice(5).replace("-", "/")}`
      : ""
    : data.month;

  return (
    <AdminShell activeItem={opsNavId("calendar")} title={copy.title}>
      <div className="ops">
        <div className="ops__bar">
          <div className="ops__props">
            <Link
              className={`ops__prop${data.selectedProperty ? "" : " on"}`}
              href={hrefWith({ property: undefined })}
            >
              {copy.allProperties}
            </Link>
            {data.propertyOptions.map((name) => (
              <Link
                className={`ops__prop${data.selectedProperty === name ? " on" : ""}`}
                href={hrefWith({ property: name })}
                key={name}
              >
                {name}
              </Link>
            ))}
          </div>
          <div className="ops__spacer" />
          {/*
            **얼마나 오래된 값인지 적는다.**

            이 화면에서 제일 위험한 것이 「몇 시간 된 가격인지 모른 채 퍼센트 조정」이다.
            시안에도 같은 자리에 있다(`객실 22 · 판매중 20 · 동기화 3분 전`).
          */}
          <div className={`ops__meta${staleRates ? " stale" : ""}`}>
            {copy.roomCount.replace("{count}", String(data.roomTotal))}
            <span className="ops__dot2" />
            {syncedLabel}
          </div>
        </div>

        <div className="ops__bar">
          <div className="ops__seg">
            <Link
              className={`ops__segbtn${isRolling ? " on" : ""}`}
              href={hrefWith({ mode: "rolling", start: undefined, ym: undefined })}
            >
              {copy.viewRolling}
            </Link>
            <Link
              className={`ops__segbtn${isRolling ? "" : " on"}`}
              href={hrefWith({ mode: "monthly", start: undefined })}
            >
              {copy.viewMonthly}
            </Link>
          </div>
          {/*
            화살표는 30일(또는 한 달)씩 옮긴다. **먼 날짜로 가려면 여러 번 눌러야 하므로**
            라벨 자체를 달력으로 만든다 — 2027년 4월 가격을 보려면 일곱 번 누르던 것이 한 번이
            된다. 달력은 콘솔 **공용 프리미티브**를 그대로 쓴다(CLAUDE.md §4a):
            30일 뷰는 **날짜**를 고르므로 `AdminDatePicker`, 월간 뷰는 **달**을 고르므로
            `AdminMonthPicker`. 월 선택기는 화살표를 스스로 들고 있어 그쪽에서는 겹치지 않게
            우리 화살표를 접는다.
          */}
          {isRolling ? (
            <>
              <div className="ops__nav">
                <Link href={prevHref}>‹</Link>
                <Link href={todayHref}>{copy.today}</Link>
                <Link href={nextHref}>›</Link>
              </div>
              <OpsCalendarJump
                ariaLabel={dictionary.admin.shared.dateSelect}
                display={rangeLabel}
                labels={{
                  nextMonth: dictionary.admin.shared.dateNextMonth,
                  prevMonth: dictionary.admin.shared.datePrevMonth,
                  today: dictionary.admin.shared.dateToday,
                }}
                localeTag={localeTag}
                params={{
                  cancelled: showCancelled ? "1" : undefined,
                  mode: data.mode,
                  property: data.selectedProperty ?? undefined,
                }}
                start={data.start}
              />
            </>
          ) : (
            <>
              <AdminMonthPicker
                basePath="/admin/ops/calendar"
                labels={{
                  nextMonth: dictionary.admin.shared.dateNextMonth,
                  nextYear: dictionary.admin.shared.dateNextYear,
                  open: dictionary.admin.shared.dateSelect,
                  prevMonth: dictionary.admin.shared.datePrevMonth,
                  prevYear: dictionary.admin.shared.datePrevYear,
                  thisMonth: dictionary.admin.shared.dateThisMonth,
                }}
                localeTag={localeTag}
                preserveQueryKeys={["mode", "property", "cancelled"]}
                ym={data.month}
              />
              <Link className="ops__btn" href={todayHref}>
                {copy.today}
              </Link>
            </>
          )}
          <div className="ops__div" />
          <Link
            className={`ops__btn${showCancelled ? " on" : ""}`}
            href={hrefWith({ cancelled: showCancelled ? undefined : "1" })}
          >
            {copy.showCancelled}
          </Link>
          {/* 1박 갭 — 있을 때만 뜬다. 0건이면 빈 배지가 자리만 차지한다. */}
          {data.gapCells.size > 0 && (
            <span className="ops__gapbtn">
              {copy.gapLabel}
              <span className="ops__gapn">{data.gapCells.size}</span>
            </span>
          )}
        </div>

        {/* 요금이 하나도 안 들어온 경우에만 알린다. 들어와 있으면 안내가 자리만 차지한다. */}
        {!data.hasRates && (
          <div className="ops__notice">
            <span>
              <strong>{copy.priceMissingTitle}</strong>
              <br />
              {copy.priceMissingBody}
            </span>
          </div>
        )}

        <div className="ops__hint">
          <span className="ops__lg" style={{ color: "hsl(348 58% 48%)" }}>
            <span className="ops__dot" />
            Airbnb
          </span>
          <span className="ops__lg" style={{ color: "hsl(219 58% 45%)" }}>
            <span className="ops__dot" />
            Booking.com
          </span>
          <span className="ops__lg" style={{ color: "hsl(146 46% 30%)" }}>
            <span className="ops__dot" />
            {copy.legendDirect}
          </span>
          <span className="ops__lg">
            <span className="ops__hatch" />
            {copy.legendBlock}
          </span>
        </div>

        <OpsCalendarGrid
          bars={data.bars}
          blocks={data.blocks}
          copy={copy}
          days={data.days}
          gapCells={data.gapCells}
          history={data.history}
          rates={data.rates}
          rooms={data.rooms}
          today={data.today}
        />
      </div>
    </AdminShell>
  );
}
