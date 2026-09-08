import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";
import type { Complaint } from "@/lib/complaints";
import type { Dictionary } from "@/lib/i18n";
import { getCanonicalPropertyName, localizePropertyName } from "@/lib/room-label-normalization";

// 수동 컴플레인 상세 패널 — 서버 컴포넌트.
//
// **왜 새 라우트가 아니라 패널인가.** 이 콘솔은 상태를 전부 쿼리스트링으로 들고 서버 렌더 한 번으로
// 끝낸다(`?review=<id>` 와 동일). `/admin/complaints/[id]` 라우트를 새로 파면 같은 콘솔인데 화면
// 전환 방식만 다른 곳이 생겨, 「하나의 운영 콘솔」 계약을 깬다(CLAUDE.md §4). `ReviewDetailPanel`
// 과 **같은 `.panel` 프리미티브와 오버레이**(`ReviewDetailOverlay`)를 그대로 쓴다.
//
// 그전에는 수동 컴플레인의 본문·사진·평점·게스트를 콘솔에서 **볼 방법이 아예 없었다** — 목록 행은
// 제목·상태·건물·날짜·작성자만 보여 주고 클릭도 되지 않았다. 외부 리뷰의 「연결된 컴플레인」 링크도
// 갈 곳이 없어 수동 목록 전체로 보냈다(2026-09-08 신설).
//
// 도메인 계약: docs/product/25-complaint-workflow.md

export type ComplaintPanelLabels = {
  building: string;
  room: string;
  reservation: string;
  guest: string;
  close: string;
};

type Props = {
  complaint: Complaint;
  copy: Dictionary["complaints"];
  /** `dictionary.cleaning.buildingLabels` — 캘린더·청소와 같은 건물 표기를 쓴다. */
  buildingLabels: Record<string, string>;
  labels: ComplaintPanelLabels;
  closeHref: string;
};

function Kv({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="kv">
      <span className="kv__k">{label}</span>
      <span className="kv__v">{children}</span>
    </div>
  );
}

export function ComplaintDetailPanel({
  complaint,
  copy,
  buildingLabels,
  labels,
  closeHref,
}: Props) {
  const isOpen = complaint.status === "open";
  const propertyName = complaint.propertyName
    ? localizePropertyName(getCanonicalPropertyName(complaint.propertyName), buildingLabels)
    : "—";

  return (
    <>
      <Link href={closeHref} className="panel-scrim" aria-label={labels.close} data-panel-close />
      <aside className="panel" role="dialog" aria-label={copy.viewManual}>
        <div className="panel__h">
          <div className="panel__top">
            <span className="panel__kicker">{copy.viewManual}</span>
            <Link href={closeHref} className="panel__x" aria-label={labels.close} data-panel-close>
              <X />
            </Link>
          </div>
          <div className="panel__chips">
            <span className="rchip void">{complaint.platform}</span>
            <span className={isOpen ? "rchip review" : "rchip done"}>
              {isOpen ? copy.statusOpen : copy.statusDone}
            </span>
          </div>

          <div className="cxhero">
            {/* 평점은 있을 때만 — 수동 컴플레인은 점수 없이 등록되는 경우가 더 흔하다. */}
            {complaint.rating !== null ? (
              <div className="cxhero__score">
                <span className="cxhero__v is-bad">{complaint.rating}</span>
                <span className="cxhero__scale">/ 5</span>
              </div>
            ) : null}
            <div className="cxhero__title">{complaint.title}</div>
          </div>
        </div>

        <div className="panel__b">
          <div className="cxbody">
            {complaint.description ? (
              <p className="cxbodypart__b">{complaint.description}</p>
            ) : (
              <div className="cxscoreonly">
                <p>{copy.noDescription}</p>
              </div>
            )}
          </div>

          {/* 첨부 사진 — 목록에서는 있는지조차 알 수 없었다. 원본은 새 탭에서 연다(콘솔에는
              라이트박스 프리미티브가 없고, 여기서 새로 만들면 모바일과 두 벌이 된다). */}
          {complaint.imageUrls.length > 0 ? (
            <div className="pblock">
              <div className="pblock__t">{copy.photosTitle}</div>
              <div className="cxshots">
                {complaint.imageUrls.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="cxshot"
                    aria-label={copy.photosTitle}
                  >
                    <Image src={url} alt="" width={96} height={96} className="cxshot__img" />
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          <div className="pblock">
            <div className="pblock__t">{copy.contextTitle}</div>
            <Kv label={labels.building}>{propertyName}</Kv>
            <Kv label={labels.room}>{complaint.roomLabel ?? "—"}</Kv>
            <Kv label={labels.reservation}>
              {complaint.platformRef ? (
                <span className="mono">{complaint.platformRef}</span>
              ) : (
                copy.noReservationLink
              )}
            </Kv>
            <Kv label={labels.guest}>{complaint.guestName ?? copy.noGuestName}</Kv>
            <Kv label={copy.authorLabel}>{complaint.authorName}</Kv>
            <Kv label={copy.createdAtLabel}>
              <span className="mono">{complaint.createdAt.slice(0, 10)}</span>
            </Kv>
            {complaint.resolvedAt ? (
              <Kv label={copy.resolvedAtLabel}>
                <span className="mono">{complaint.resolvedAt.slice(0, 10)}</span>
              </Kv>
            ) : null}
          </div>
        </div>
      </aside>
    </>
  );
}
