"use client";

import { useState } from "react";
import Link from "next/link";
import "./complaints.css";
import { CIc, CxIcon } from "./cx-icons";
import { PLATFORMS, platformName } from "./cx-platform";
import { ComplaintDeleteSheet } from "./complaint-delete-sheet";
import { MobileFab } from "@/components/shell/mobile-fab";
import { getDictionary } from "@/lib/i18n";
import { getCanonicalPropertyName, localizePropertyName } from "@/lib/room-label-normalization";
import type { Complaint } from "@/lib/complaints";

function formatShortDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" }).format(new Date(iso));
}

/** 아바타 이니셜. 한글·한자는 첫 글자, 라틴 이름은 성·이름 첫 글자 두 개. */
function initialsOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  if (/^[\x20-\x7E]+$/.test(trimmed)) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  }
  return trimmed.slice(0, 1);
}

/**
 * S5 수동 컴플레인 목록 (v2 디자인).
 *
 * v1 에서 뺀 것: 평점 필 · 상태 점(칩과 중복) · 사진 아이콘 · 플랫폼 필터 칩.
 * 그 자리를 **작성자명**이 대신한다 — 현장에서 «누가 올린 건인지»가 평점보다 훨씬 자주 필요하다.
 *
 * 삭제는 목록에서 바로 되지만 **권한이 있는 건에만** 휴지통이 붙는다. 실제 권한은 서버가 다시
 * 검증하며, 여기 판단은 «누를 수 있는 것만 보여 준다» 는 UI 규칙일 뿐이다.
 */
export function ComplaintList({
  locale,
  complaints,
  canCreate,
  currentUserId,
  canModerate,
}: {
  locale: string;
  complaints: Complaint[];
  canCreate: boolean;
  /** 삭제 버튼 노출 판단용 — 작성자 본인 여부. */
  currentUserId: string;
  /** owner / office_admin / super-admin 이면 전체 삭제 가능. */
  canModerate: boolean;
}) {
  const dict = getDictionary(locale);
  const t = dict.complaints;
  const buildingLabels = dict.cleaning.buildingLabels;
  const [seg, setSeg] = useState<"open" | "resolved">("open");
  const [pendingDelete, setPendingDelete] = useState<Complaint | null>(null);

  const openCount = complaints.filter((c) => c.status === "open").length;
  const resolvedCount = complaints.length - openCount;
  const rows = complaints.filter((c) => c.status === seg);

  return (
    <div className="cx cx-manual">
      <div className="cx-seg cx-seg--status">
        <button type="button" className={seg === "open" ? "on" : ""} onClick={() => setSeg("open")}>
          {t.segOpen} <span className="cnt mono">{openCount}</span>
        </button>
        <button
          type="button"
          className={seg === "resolved" ? "on" : ""}
          onClick={() => setSeg("resolved")}
        >
          {t.segDone} <span className="cnt mono">{resolvedCount}</span>
        </button>
      </div>

      <div className="cx-rlist">
        {rows.length === 0 ? (
          <div className="cx-rempty">
            <span className="cx-rempty__ic">
              <CIc>{CxIcon.chat}</CIc>
            </span>
            <div className="cx-rempty__t">{t.manualEmptyTitle}</div>
            <p className="cx-rempty__s">{t.manualEmptySub}</p>
          </div>
        ) : (
          rows.map((c) => {
            const plat = PLATFORMS[c.platform];
            const canDelete = canModerate || c.createdByUserId === currentUserId;
            return (
              <div className="cx-mcard" key={c.id}>
                <Link href={`/mobile/complaints/${c.id}`} className="cx-mcard__link">
                  <div className="cx-mcard__h">
                    <span className="cx-mcard__t">{c.title}</span>
                    <span className={`cx-statuschip is-${c.status}`}>
                      {c.status === "open" ? t.statusOpen : t.statusDone}
                    </span>
                  </div>

                  <div className="cx-mcard__meta">
                    <span className="cx-psrc" style={{ background: plat.bg, color: plat.ink }}>
                      <span className="d" style={{ background: plat.solid }} />
                      {platformName(c.platform, dict)}
                    </span>
                    {c.propertyName && (
                      <span className="cx-mcard__place">
                        {localizePropertyName(
                          getCanonicalPropertyName(c.propertyName),
                          buildingLabels,
                        )}
                      </span>
                    )}
                    {c.roomLabel && (
                      <>
                        <span className="sep">·</span>
                        <span>{c.roomLabel}</span>
                      </>
                    )}
                    <span className="sep">·</span>
                    <span className="mono">{formatShortDate(c.createdAt, locale)}</span>
                  </div>

                  <div className="cx-mcard__author">
                    <span className="cx-avatar">{initialsOf(c.authorName)}</span>
                    {c.authorName}
                    {!canDelete && <span className="cx-mcard__nodel">{t.noDeletePermission}</span>}
                  </div>
                </Link>

                {canDelete && (
                  <button
                    type="button"
                    className="cx-mcard__del"
                    aria-label={t.deleteAction}
                    onClick={() => setPendingDelete(c)}
                  >
                    <CIc>{CxIcon.trash}</CIc>
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {pendingDelete && (
        <ComplaintDeleteSheet
          complaintId={pendingDelete.id}
          complaintTitle={pendingDelete.title}
          onClose={() => setPendingDelete(null)}
          labels={{
            title: t.deleteTitle,
            body: t.deleteBody,
            linkedNote: t.deleteLinkedNote,
            cancel: t.cancel,
            confirm: t.deleteConfirm,
            failed: dict.common.deleteFailed,
          }}
        />
      )}

      {canCreate && <MobileFab href="/mobile/complaints/new" label={t.createTitle} />}
    </div>
  );
}
