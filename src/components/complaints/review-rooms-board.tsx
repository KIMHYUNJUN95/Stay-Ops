import Link from "next/link";
import "./complaints.css";
import { CIc, CxIcon } from "./cx-icons";
import { PLATFORMS } from "./cx-platform";
import { ReviewRangeChip } from "./review-range-chip";
import { RANGE_PRESET_DAYS } from "./review-list";
import { getDictionary, type Locale } from "@/lib/i18n";
import { getCanonicalPropertyName, localizePropertyName } from "@/lib/room-label-normalization";
import type { BuildingSummary, PlaceSummary, PlatformStat } from "@/lib/external-reviews";

/** 25% 이상은 붉게, 10% 이상은 앰버, 그 아래는 초록. 목업 «문제 비율 막대» 기준. */
function ratioTone(ratio: number | null): "bad" | "warn" | "ok" | "none" {
  if (ratio === null) return "none";
  if (ratio >= 0.25) return "bad";
  if (ratio >= 0.1) return "warn";
  return "ok";
}

function fmtRatio(ratio: number | null): string {
  return ratio === null ? "—" : `${Math.round(ratio * 100)}%`;
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
  const buildingLabels = dict.cleaning.buildingLabels;

  const baseParams: Record<string, string> = { view: "rooms" };
  const rangeChipLabel = rangeDays
    ? t.rangeDays.replace("{n}", String(rangeDays))
    : from && to
      ? `${from.slice(5).replace("-", ".")} – ${to.slice(5).replace("-", ".")}`
      : t.rangeTitle;

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

  function PlaceBlock({
    place,
    propertyId,
    highlight,
  }: {
    place: PlaceSummary;
    propertyId: string | null;
    highlight: boolean;
  }) {
    const tone = ratioTone(place.riskRatio);
    return (
      <div className={`cx-roomblk${highlight ? " is-hot" : ""}`}>
        <div className="cx-roomblk__h">
          <span className="cx-roomblk__n">{place.name}</span>
          <span className={`cx-roomblk__r mono is-${tone}`}>{fmtRatio(place.riskRatio)}</span>
        </div>
        <span className="cx-bar">
          <span
            className={`cx-bar__f is-${tone}`}
            style={{ width: `${Math.round((place.riskRatio ?? 0) * 100)}%` }}
          />
        </span>
        <div className="cx-pgrid">
          <span />
          <span className="cx-pgrid__hd">{t.colAverage}</span>
          <span className="cx-pgrid__hd">{t.colReviews}</span>
          <span className="cx-pgrid__hd">{t.colRisk}</span>
          <PlatformRow plat="airbnb" stat={place.airbnb} href={riskHref(propertyId)} />
          <PlatformRow plat="booking" stat={place.booking} href={riskHref(propertyId)} />
        </div>
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
          {summaries.map((building) => {
            const tone = ratioTone(building.riskRatio);
            const label = localizePropertyName(
              getCanonicalPropertyName(building.name),
              buildingLabels,
            );
            const empty = building.reviewCount === 0;
            return (
              <div className="cx-bldcard" key={building.key}>
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
                </div>

                {!empty && (
                  <>
                    <span className="cx-bar cx-bar--wide">
                      <span
                        className={`cx-bar__f is-${tone}`}
                        style={{ width: `${Math.round((building.riskRatio ?? 0) * 100)}%` }}
                      />
                    </span>

                    <div className="cx-bldcard__b">
                      {/* 독채는 객실 행을 만들지 않는다 — 건물 = 객실이라 같은 숫자가 두 번 나온다. */}
                      {building.standalone ? (
                        <PlaceBlock
                          place={building}
                          propertyId={building.propertyId}
                          highlight={tone === "bad"}
                        />
                      ) : (
                        building.rooms.map((room) => (
                          <PlaceBlock
                            key={room.key}
                            place={room}
                            propertyId={building.propertyId}
                            highlight={ratioTone(room.riskRatio) === "bad"}
                          />
                        ))
                      )}

                      {building.unmappedCount > 0 && (
                        <div className="cx-unmapped">
                          <CIc>{CxIcon.link}</CIc>
                          <span>{t.unmapped.replace("{n}", String(building.unmappedCount))}</span>
                          <span className="cx-unmapped__s">{t.unmappedNote}</span>
                        </div>
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
