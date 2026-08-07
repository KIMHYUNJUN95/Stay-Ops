import Link from "next/link";
import "./complaints.css";
import { CIc, CxIcon } from "./cx-icons";
import { PLATFORMS } from "./cx-platform";
import { ReviewRangeChip } from "./review-range-chip";
import { RANGE_PRESET_DAYS } from "./review-list";
import { getDictionary, type Locale } from "@/lib/i18n";
import type { BuildingSummary, PlaceSummary, PlatformStat } from "@/lib/external-reviews";

/**
 * `PlaceSummary.riskRatio` 는 **이미 퍼센트 단위(0~100)** 다 — 분수가 아니다.
 * 어드민 콘솔도 `ratio.toFixed(1)}%` 로 그대로 쓴다. 여기서 다시 100을 곱하면 `2220%` 가 된다.
 */
const RATIO_BAD = 25;
const RATIO_WARN = 10;

/** 25% 이상은 붉게, 10% 이상은 앰버, 그 아래는 초록. 목업 «문제 비율 막대» 기준. */
function ratioTone(ratio: number | null): "bad" | "warn" | "ok" | "none" {
  if (ratio === null) return "none";
  if (ratio >= RATIO_BAD) return "bad";
  if (ratio >= RATIO_WARN) return "warn";
  return "ok";
}

function fmtRatio(ratio: number | null): string {
  return ratio === null ? "—" : `${Math.round(ratio)}%`;
}

/** 막대 너비(%). 비율이 100을 넘을 일은 없지만 데이터가 이상해도 막대가 넘치지 않게 잠근다. */
function barWidth(ratio: number | null): string {
  return `${Math.min(100, Math.max(0, ratio ?? 0))}%`;
}

type Props = {
  locale: Locale;
  summaries: BuildingSummary[];
  from: string | null;
  to: string | null;
  rangeDays: number | null;
};

/**
 * S4 문제 객실 — 모바일 신규 화면.
 *
 * 데스크톱은 8열 표지만 390px 에 표는 성립하지 않는다. **건물 카드 + 객실 아코디언**으로 바꾸고,
 * 플랫폼 행은 `모노그램 / 평균 / 리뷰 / 문제` **4열 그리드**로 정렬해 EN 라벨에서도 열이 흔들리지
 * 않게 했다.
 *
 * 집계는 어드민과 **같은 `summarizeReviewsByPlace`** 를 쓴다 — 화면별 집계를 따로 만들면 두
 * 화면의 숫자가 갈라진다.
 *
 * Airbnb 5점 / Booking 10점은 척도가 달라 **평균을 합치지 않는다.** 반면 문제 비율은 척도에
 * 의존하지 않아 합쳐도 되며, 그래서 정렬 기준이 된다.
 */
export function ReviewRoomsBoard({ locale, summaries, from, to, rangeDays }: Props) {
  const dict = getDictionary(locale);
  const t = dict.complaints;

  const baseParams: Record<string, string> = { view: "rooms" };
  const rangeChipLabel = rangeDays
    ? t.rangeDays.replace("{n}", String(rangeDays))
    : from && to
      ? `${from.slice(5).replace("-", ".")} – ${to.slice(5).replace("-", ".")}`
      : t.rangeTitle;

  /** 객실 미연결 리뷰만 보는 링크. 객실을 못 붙였다고 리뷰 내용까지 못 보게 두지 않는다. */
  function unmappedHref(propertyId: string | null): string {
    const params = new URLSearchParams({ view: "reviews", unmapped: "1" });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (propertyId) params.set("propertyId", propertyId);
    return `/mobile/complaints?${params.toString()}`;
  }

  /** 문제 건수 링크 → 그 건물/객실로 필터된 외부 리뷰 목록. */
  function riskHref(propertyId: string | null): string {
    const params = new URLSearchParams({ view: "reviews", risk: "1" });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (propertyId) params.set("propertyId", propertyId);
    return `/mobile/complaints?${params.toString()}`;
  }

  function PlatformRow({
    plat,
    stat,
    href,
  }: {
    plat: "airbnb" | "booking";
    stat: PlatformStat;
    href: string;
  }) {
    const def = PLATFORMS[plat];
    const scale = plat === "airbnb" ? 5 : 10;
    if (stat.reviewCount === 0) {
      return (
        <>
          <span className="cx-mono" style={{ background: def.bg, color: def.ink }}>
            {def.mono}
          </span>
          <span className="cx-pgrid__none">{t.noReviewsShort}</span>
          <span />
          <span />
        </>
      );
    }
    return (
      <>
        <span className="cx-mono" style={{ background: def.bg, color: def.ink }}>
          {def.mono}
        </span>
        <span className="cx-pgrid__avg mono">
          {stat.average === null ? "—" : stat.average}
          <i> / {scale}</i>
        </span>
        <span className="cx-pgrid__n mono">{stat.reviewCount}</span>
        {stat.riskCount > 0 ? (
          <Link className="cx-pgrid__risk mono" href={href}>
            {stat.riskCount}
          </Link>
        ) : (
          <span className="cx-pgrid__n mono">0</span>
        )}
      </>
    );
  }

  /** 플랫폼별 4열 표. 독채는 이것만, 다객실은 객실 블록 안에서 쓴다. */
  function PlaceGrid({ place, propertyId }: { place: PlaceSummary; propertyId: string | null }) {
    return (
      <div className="cx-pgrid">
        <span />
        <span className="cx-pgrid__hd">{t.colAverage}</span>
        <span className="cx-pgrid__hd">{t.colReviews}</span>
        <span className="cx-pgrid__hd">{t.colRisk}</span>
        <PlatformRow plat="airbnb" stat={place.airbnb} href={riskHref(propertyId)} />
        <PlatformRow plat="booking" stat={place.booking} href={riskHref(propertyId)} />
      </div>
    );
  }

  function PlaceBlock({
    place,
    propertyId,
    highlight,
    name,
  }: {
    place: PlaceSummary;
    propertyId: string | null;
    highlight: boolean;
    name: string;
  }) {
    const tone = ratioTone(place.riskRatio);
    return (
      <div className={`cx-roomblk${highlight ? " is-hot" : ""}`}>
        <div className="cx-roomblk__h">
          <span className="cx-roomblk__n">{name}</span>
          <span className={`cx-roomblk__r mono is-${tone}`}>{fmtRatio(place.riskRatio)}</span>
        </div>
        <span className="cx-bar">
          <span
            className={`cx-bar__f is-${tone}`}
            style={{ width: barWidth(place.riskRatio) }}
          />
        </span>
        <PlaceGrid place={place} propertyId={propertyId} />
      </div>
    );
  }

  return (
    <div className="cx cx-reviews cx-rooms">
      <div className="cx-ctrlrow">
        <ReviewRangeChip
          from={from}
          to={to}
          locale={locale}
          baseParams={baseParams}
          labels={{
            chip: rangeChipLabel,
            title: t.rangeTitle,
            apply: dict.common.apply,
            clear: dict.common.clear,
            close: dict.common.close,
            previousMonth: t.rangePrevMonth,
            nextMonth: t.rangeNextMonth,
            selectStart: t.rangeHintStart,
            selectEnd: t.rangeHintEnd,
            summary: t.rangeSummary,
            presets: RANGE_PRESET_DAYS.map((days) => ({
              days,
              label: t.rangeDays.replace("{n}", String(days)),
            })),
          }}
        />
        <span className="cx-sortnote">{t.sortRatio}</span>
      </div>

      <div className="cx-note cx-note--tight">
        <CIc>{CxIcon.info}</CIc>
        <span>{t.scaleNote}</span>
      </div>

      {summaries.length === 0 ? (
        <div className="cx-rempty">
          <span className="cx-rempty__ic">
            <CIc>{CxIcon.building}</CIc>
          </span>
          <div className="cx-rempty__t">{t.roomsEmptyTitle}</div>
          <p className="cx-rempty__s">{t.roomsEmptyBody}</p>
        </div>
      ) : (
        <div className="cx-rlist">
          {summaries.map((building, index) => {
            const tone = ratioTone(building.riskRatio);
            // 현지화는 집계(`summarizeReviewsByPlace`)가 끝냈다 — 어드민과 같은 라벨을 쓴다.
            const label = building.label || building.name;
            const empty = building.reviewCount === 0;
            return (
              /**
               * 건물 카드를 접는다. 건물 7개를 전부 펼치면 객실이 40개 넘게 이어져 스캔이 안 된다.
               *
               * `<details>` 를 쓰는 이유: 이 화면은 서버 컴포넌트라 열림 상태를 들 수 없는데,
               * 이걸 위해 클라이언트 컴포넌트로 바꾸거나 쿼리스트링에 상태를 넣는 건 과하다.
               * 브라우저 기본 동작이라 JS 없이 동작하고 키보드·스크린리더도 그대로 지원된다.
               *
               * 기본으로 **문제 비율이 가장 높은 건물 하나만** 펼친다(정렬이 비율 내림차순이라
               * 첫 번째다). 화면을 열자마자 «지금 봐야 할 곳»이 보이는 것이 이 화면의 목적이다.
               */
              <details className="cx-bldcard" key={building.key} open={index === 0 && !empty}>
                <summary className="cx-bldcard__sum">
                  <div className="cx-bldcard__h">
                    <div className="cx-bldcard__hb">
                      <span className="cx-bldcard__n">
                        {label}
                        {building.standalone && (
                          <span className="cx-tag">{t.standalone}</span>
                        )}
                      </span>
                      <span className="cx-bldcard__s">
                        {empty
                          ? t.roomsNoneInPeriod
                          : `${t.colReviews} ${building.reviewCount} · ${t.riskChip} ${building.riskCount}`}
                      </span>
                    </div>
                    <span className={`cx-bldcard__r mono is-${tone}`}>
                      {fmtRatio(building.riskRatio)}
                    </span>
                    {!empty && (
                      <span className="cx-bldcard__chev">
                        <CIc>{CxIcon.chevR}</CIc>
                      </span>
                    )}
                  </div>
                  {/* 막대는 접혀 있어도 보인다 — 목록을 훑을 때 비교 기준이 된다. */}
                  {!empty && (
                    <span className="cx-bar cx-bar--wide">
                      <span
                        className={`cx-bar__f is-${tone}`}
                        style={{ width: barWidth(building.riskRatio) }}
                      />
                    </span>
                  )}
                </summary>

                {!empty && (
                  <>
                    <div className="cx-bldcard__b">
                      {/* 독채는 «건물 = 객실» 이다. 객실 행을 또 만들면 같은 이름·같은 비율이 두 번
                          나오므로, 헤더는 위 summary 로 끝내고 여기서는 플랫폼 표만 보여 준다. */}
                      {building.standalone ? (
                        <PlaceGrid place={building} propertyId={building.propertyId} />
                      ) : (
                        building.rooms.map((room) => (
                          <PlaceBlock
                            key={room.key}
                            place={room}
                            propertyId={building.propertyId}
                            highlight={ratioTone(room.riskRatio) === "bad"}
                            name={room.name}
                          />
                        ))
                      )}

                      {/* 독채는 «건물 = 객실» 이라 미연결이든 아니든 같은 방이다 — 표시하지 않는다.
                          다객실 건물에서는 객실별 숫자의 합이 건물 합계와 다른 이유를 설명하므로 남긴다.
                          누르면 그 리뷰들만 볼 수 있다 — 객실을 못 붙였다고 내용까지 못 보게 두면 손해다. */}
                      {!building.standalone && building.unmappedCount > 0 && (
                        <Link className="cx-unmapped" href={unmappedHref(building.propertyId)}>
                          <CIc>{CxIcon.link}</CIc>
                          <span className="cx-unmapped__n">
                            {t.unmapped.replace("{n}", String(building.unmappedCount))}
                          </span>
                          <span className="cx-unmapped__pct mono">
                            {building.reviewCount > 0
                              ? `${Math.round((building.unmappedCount / building.reviewCount) * 100)}%`
                              : ""}
                          </span>
                          <span className="cx-unmapped__s">{t.unmappedShort}</span>
                          <CIc>{CxIcon.chevR}</CIc>
                        </Link>
                      )}
                      {building.unratedCount > 0 && (
                        <p className="cx-unrated">
                          {t.unratedFoot.replace("{n}", String(building.unratedCount))} —{" "}
                          {t.unratedNote}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
