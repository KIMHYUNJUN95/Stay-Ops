import { Beds24LiveDot } from "@/components/shared/beds24-live-dot";
import { AdminShell } from "@/components/shell/admin-shell";
import { OpsCalendarGrid } from "@/components/admin/ops/ops-calendar-grid";
import { OpsCalendarJump } from "@/components/admin/ops/ops-calendar-jump";
import { OpsNavLink, OpsNavScope } from "@/components/admin/ops/ops-nav";
import { OpsGapButton } from "@/components/admin/ops/ops-gap-button";
import { OpsPropertyTabs } from "@/components/admin/ops/ops-property-tabs";
import { AdminMonthPicker } from "@/components/admin/shared/admin-month-picker";
import { shiftMonthKey } from "@/components/admin/shared/admin-month-key";
import "@/components/admin/ops/ops-console.css";
import { countOpsHistoryAlerts } from "@/lib/beds24/ops-history-alerts";
import { getDictionary } from "@/lib/i18n";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getOpsCalendarData, OPS_CALENDAR_ROLLING_DAYS } from "@/lib/ops-calendar";
import { scheduleOpsCalendarOpenRefresh } from "@/lib/ops-calendar-open-refresh";
import { opsNavId } from "@/lib/ops-admin";
import { isOpsRatesStale, opsRatesSyncedLabel } from "@/lib/ops-rates-freshness";
import {
  buildOpsCalendarHref,
  parsePropertyParam,
  togglePropertySelection,
} from "@/lib/ops-calendar-properties";
import { requireOpsAdminPage } from "../ops-page-session";
import { Beds24LiveRefresh } from "@/components/shared/beds24-live-refresh";

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
  /**
   * 고른 건물. **반복될 수 있다**(`?property=A&property=B`, 2026-09-30 다중 선택) — Next 는 반복 키를
   * 배열로 준다. 하나면 예전과 같은 `?property=A`.
   */
  property?: string | string[];
  /** 30일 뷰의 시작일. 없으면 도쿄 기준 어제. */
  start?: string;
  cancelled?: string;
};

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
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

  // 「이력」 버튼의 빨간 숫자(최근 7일 전송 실패 + 멈춘 작업)도 **같이** 센다 — 달력 데이터를 다 받은
  // 뒤에 따로 세면 그만큼 화면이 늦게 온다(2026-09-30 속도).
  const [data, historyAlerts] = await Promise.all([
    getOpsCalendarData(session, {
      mode: params.mode,
      month: params.ym,
      properties: parsePropertyParam(params.property),
      start: params.start,
      showCancelled: params.cancelled === "1",
    }),
    countOpsHistoryAlerts(getSupabaseServiceClient(), session.organization.id),
  ]);

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
  // 「가격 실시간 반영 중」 / 웹훅 반영이 밀렸거나 24시간 넘게 아무것도 못 받았으면 빨강 — 모바일과 같은 규칙(`ops-rates-freshness.ts`).
  const syncedLabel = opsRatesSyncedLabel({ ageMinutes: data.ratesAgeMinutes, pending: data.ratesPendingRefresh }, copy);
  const staleRates = isOpsRatesStale({ ageMinutes: data.ratesAgeMinutes, pending: data.ratesPendingRefresh });

  const firstVisibleDate = data.days.at(0)?.date;
  const lastVisibleDate = data.days.at(-1)?.date;
  // 대기 작업 깨우기 + 낡은 창 당기기 — 모바일과 같은 규칙(`ops-calendar-open-refresh.ts`).
  scheduleOpsCalendarOpenRefresh(session.organization.id, data);

  // 건물이 여럿이면 `property` 를 **반복**해 싣는다(탭 순서). 빈 목록은 키 자체를 뺀다 = 전체.
  const hrefWith = (next: Partial<SearchParams>) =>
    buildOpsCalendarHref({
      mode: data.mode,
      ym: data.mode === "monthly" ? data.month : undefined,
      property: data.selectedProperties,
      start: data.mode === "rolling" ? data.start : undefined,
      cancelled: showCancelled ? "1" : undefined,
      ...next,
    });

  const selectedSet = new Set(data.selectedProperties);
  const propertyTabs = data.propertyOptions.map((name) => ({
    href: hrefWith({ property: name }),
    name,
    selected: selectedSet.has(name),
    toggleHref: hrefWith({
      property: togglePropertySelection(data.selectedProperties, name, data.propertyOptions),
    }),
  }));

  // 30일 뷰는 ±30일, 월간 뷰는 ±1개월. **월 단위로 바꾸지 않는다** — 바꾸면 오늘이 다시
  // 격자 끝으로 밀린다.
  const prevHref = isRolling
    ? hrefWith({ start: addDays(data.start, -OPS_CALENDAR_ROLLING_DAYS) })
    : hrefWith({ ym: shiftMonthKey(data.month, -1) });
  const nextHref = isRolling
    ? hrefWith({ start: addDays(data.start, OPS_CALENDAR_ROLLING_DAYS) })
    : hrefWith({ ym: shiftMonthKey(data.month, 1) });
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
      {/* 이 화면이 그리는 건물·날짜(갭 판정용 앞뒤 하루 포함)에 닿는 신호만 받는다 — 다른 건물 동기화로
          다시 읽지 않는다. */}
      <Beds24LiveRefresh
        organizationId={session.organization.id}
        scope={{
          from: firstVisibleDate ? addDays(firstVisibleDate, -1) : null,
          propertyNames: data.selectedProperties.length > 0 ? data.selectedProperties : null,
          to: lastVisibleDate ? addDays(lastVisibleDate, 1) : null,
        }}
      />
      <OpsNavScope>
        <div className="ops__bar">
          {/* 건물 탭 — 그냥 누르면 그 건물만, 체크 동그라미 · Ctrl/⌘ + 클릭은 여러 건물 함께(2026-09-30). */}
          <OpsPropertyTabs
            allHref={hrefWith({ property: undefined })}
            copy={{
              allProperties: copy.allProperties,
              propertyAdd: copy.propertyAdd,
              propertyClear: copy.propertyClear,
              propertyGroupLabel: copy.propertyGroupLabel,
              propertyRemove: copy.propertyRemove,
              propertySelectedCount: copy.propertySelectedCount,
              propertyTabHint: copy.propertyTabHint,
            }}
            tabs={propertyTabs}
          />
          <div className="ops__spacer" />
          {/*
            **얼마나 오래된 값인지 적는다.**

            이 화면에서 제일 위험한 것이 「몇 시간 된 가격인지 모른 채 퍼센트 조정」이다.
            시안에도 같은 자리에 있다(`객실 22 · 판매중 20 · 동기화 3분 전`).
          */}
          <div className={`ops__meta${staleRates ? " stale" : ""}`}>
            {copy.roomCount.replace("{count}", String(data.roomTotal))}
            <span className="ops__dot2" />
            {/* 「N시간 전 동기화」는 예약까지 늦는 것처럼 읽혔다(2026-09-30 사용자) — 무엇이 몇 시간 전인지
                라벨에 적고, 기준(가장 오래된 칸 · 예약·차단은 실시간)은 마우스를 올리면 보인다. */}
            <span title={copy.syncedHint}>{syncedLabel}</span>
            <Beds24LiveDot offLabel={copy.liveOff} onLabel={copy.liveOn} />
          </div>
        </div>

        <div className="ops__bar">
          <div className="ops__seg">
            <OpsNavLink
              className={`ops__segbtn${isRolling ? " on" : ""}`}
              href={hrefWith({ mode: "rolling", start: undefined, ym: undefined })}
            >
              {copy.viewRolling}
            </OpsNavLink>
            <OpsNavLink
              className={`ops__segbtn${isRolling ? "" : " on"}`}
              href={hrefWith({ mode: "monthly", start: undefined })}
            >
              {copy.viewMonthly}
            </OpsNavLink>
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
                <OpsNavLink href={prevHref}>‹</OpsNavLink>
                <OpsNavLink href={todayHref}>{copy.today}</OpsNavLink>
                <OpsNavLink href={nextHref}>›</OpsNavLink>
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
                  property: data.selectedProperties,
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
              <OpsNavLink className="ops__btn" href={todayHref}>
                {copy.today}
              </OpsNavLink>
            </>
          )}
          <div className="ops__div" />
          <OpsNavLink
            className={`ops__btn${showCancelled ? " on" : ""}`}
            href={hrefWith({ cancelled: showCancelled ? undefined : "1" })}
          >
            {/* 켠 뒤에는 **무엇이 보이는 중인지**를 적는다 — 「취소 보기」인 채로 두면
                일반 예약이 왜 사라졌는지 알 수 없다. 저쪽도 켜면 「Cancelled Only」로 바뀐다. */}
            {showCancelled ? copy.showCancelledOn : copy.showCancelled}
          </OpsNavLink>
          {/* 1박 갭 — 고를 수 있는 칸(오늘 이후)이 있을 때만 뜬다. 지난 날짜 갭은 눌러도 골라지지 않는다. */}
          {data.selectableGapCount > 0 && (
            <OpsGapButton count={data.selectableGapCount} hint={copy.gapOpenHint} label={copy.gapLabel} />
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
          {/* 최소숙박은 **2박이 기본**이라 범례에 안 적는다 — 예외 둘만 적는다.
              12,412칸이 2박이고 1박은 388칸뿐이다(2026-09-25 실측). */}
          <span className="ops__lg ops__lgms">
            <span className="ops__msk one">1</span>
            {copy.legendOneNight}
          </span>
          <span className="ops__lg ops__lgms">
            <span className="ops__msk many">3</span>
            {copy.legendLongStay}
          </span>
          {/* 운영 중 유닛끼리 최소숙박이 다른 칸(2026-09-30) — 칸에는 짧은 값이 보이고 모서리 표시가 붙는다. */}
          <span className="ops__lg ops__lgms">
            <span className="ops__msk mixed">1</span>
            {copy.legendMixed}
          </span>
        </div>

        {/* 격자에는 **행 단위** 데이터만 간다(`ops-calendar-rows.ts`) — 칸 이력 목록과 가격 개입 판정은
            격자가 필요할 때 서버 액션으로 따로 받는다(2026-09-30 속도). */}
        <OpsCalendarGrid
          copy={copy}
          days={data.days}
          historyAlerts={historyAlerts}
          properties={data.selectedProperties}
          rows={data.rows}
          showCancelled={showCancelled}
          today={data.today}
        />
      </OpsNavScope>
    </AdminShell>
  );
}
