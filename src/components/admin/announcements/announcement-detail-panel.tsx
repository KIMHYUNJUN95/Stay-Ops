"use client";

// Admin 공지 관리 콘솔 — 우측 상세 패널. 공지 전문 + 첨부 + 읽음 요약 + 권한 zone(작성 ↔ 운영).
// Ported from the Claude Design handoff (announce-views.js → panel). Mirrors the shared
// .panel/.pblock/.kv slide-over contract. See docs/product/11-announcement-workflow.md.
import { Fragment } from "react";
import {
  Archive,
  ChevronRight,
  Image as ImageIcon,
  Lock,
  Megaphone,
  Pencil,
  Pin,
  Send,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useAdminPanelA11y } from "@/components/admin/shared/use-admin-panel-a11y";
import type { Locale } from "@/lib/i18n";
import type { AdminAnnouncementVM } from "@/lib/admin-announcements";
import {
  AnnCopy,
  Ic,
  RoleLabel,
  StatusPill,
  fmtDateLong,
  targetLabel,
  tpl,
  tpl2,
} from "./announcements-console-shared";

export type AnnActionKind =
  | "publish"
  | "republish"
  | "archive"
  | "revert"
  | "del";

type PanelProps = {
  item: AdminAnnouncementVM | null;
  t: AnnCopy;
  locale: Locale;
  roleLabel: RoleLabel;
  onClose: () => void;
  onEdit: (item: AdminAnnouncementVM) => void;
  onAction: (kind: AnnActionKind, id: string) => void;
  onOpenReaders: (item: AdminAnnouncementVM) => void;
  onOpenImage: (url: string) => void;
  disabled?: boolean;
};

function Kv({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="kv">
      <span className="kv__k">{label}</span>
      <span className="kv__v">{children}</span>
    </div>
  );
}

export function AnnouncementDetailPanel({
  item,
  t,
  locale,
  roleLabel,
  onClose,
  onEdit,
  onAction,
  onOpenReaders,
  onOpenImage,
  disabled,
}: PanelProps) {
  const panelRef = useAdminPanelA11y<HTMLElement>(onClose, { disabled });
  if (!item) return null;

  const everyone = item.targetScope === "everyone";
  const hasRead = item.status === "published" || item.status === "archived";
  const readPct =
    item.targetTotal > 0
      ? Math.round((item.readCount / item.targetTotal) * 100)
      : 0;
  const clear = item.unreadCount === 0;

  return (
    <>
      <div className="panel-scrim on" onClick={onClose} />
      <aside
        ref={panelRef}
        className="panel on"
        role="dialog"
        aria-label={item.title}
        tabIndex={-1}
      >
        <div className="panel__h">
          <div className="panel__top">
            <span className="panel__kicker">
              {t.colAnnouncement} · {item.id.slice(0, 8)}
            </span>
            <button
              type="button"
              className="panel__x"
              onClick={onClose}
              aria-label={t.close}
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <div className="apanel__title" style={{ marginTop: 11 }}>
            {item.title}
          </div>
          <div className="apanel__chips">
            <StatusPill status={item.status} t={t} />
            {item.isImportant ? (
              <span className="achip achip--imp">
                <Ic>
                  <ShieldAlert aria-hidden="true" />
                </Ic>
                {t.flImportant}
              </span>
            ) : null}
            {item.isPinned ? (
              <span className="achip achip--pin">
                <Ic>
                  <Pin aria-hidden="true" />
                </Ic>
                {t.flPinned}
              </span>
            ) : null}
            {item.popup ? (
              <span className="achip achip--popup">
                <Ic>
                  <Megaphone aria-hidden="true" />
                </Ic>
                {t.flPopup}
                {item.isPopupActive ? "" : ` · ${t.flPopupOff}`}
              </span>
            ) : null}
          </div>
        </div>

        <div className="panel__body">
          {/* 공지 정보 */}
          <div className="pblock">
            <div className="pblock__t">{t.pInfo}</div>
            <Kv label={t.pOrg}>{item.organizationName}</Kv>
            <Kv label={t.pAuthor}>{item.authorName || "—"}</Kv>
            <Kv label={t.pTarget}>
              {everyone ? t.everyone : targetLabel(item, t, roleLabel)}{" "}
              <span style={{ color: "var(--muted)", fontWeight: 600 }}>
                · {tpl(t.pCountSuffix, item.targetTotal)}
              </span>
            </Kv>
            <Kv label={t.pPublishedAt}>{fmtDateLong(item.publishedAt, locale)}</Kv>
            {item.archivedAt ? (
              <Kv label={t.pArchivedAt}>{fmtDateLong(item.archivedAt, locale)}</Kv>
            ) : null}
            {item.popup ? (
              <Kv label={t.pPopupUntil}>
                <span className="mono">
                  {item.popupUntil ? item.popupUntil.slice(0, 16).replace("T", " ") : "—"}
                </span>
              </Kv>
            ) : null}
          </div>

          {/* 본문 */}
          <div className="pblock">
            <div className="pblock__t">{t.pBody}</div>
            <div className="abody">
              {item.body.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          </div>

          {/* 첨부 이미지 */}
          {item.images.length > 0 ? (
            <div className="pblock">
              <div className="pblock__t">
                {t.pImages} · {item.images.length}
              </div>
              <div className="agallery">
                {item.images.map((url, i) => (
                  <button
                    type="button"
                    className="ashot"
                    key={url}
                    onClick={() => onOpenImage(url)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="" src={url} />
                    <span className="ashot__ic">
                      <Ic>
                        <ImageIcon aria-hidden="true" />
                      </Ic>
                    </span>
                    <span className="ashot__cap">#{i + 1}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* 읽음 요약 */}
          <div className="pblock">
            <div className="pblock__t">{t.pReadTitle}</div>
            {hasRead ? (
              <>
                <div className="rdbox">
                  <div className="rdbox__row">
                    <div className="rdbox__cell">
                      <div className="rdbox__v read">{item.readCount}</div>
                      <div className="rdbox__k">{t.pRead}</div>
                    </div>
                    <div className="rdbox__cell">
                      <div className={`rdbox__v unread${clear ? " is-clear" : ""}`}>
                        {item.unreadCount}
                      </div>
                      <div className="rdbox__k">{t.pUnread}</div>
                    </div>
                    <div className="rdbox__cell">
                      <div className="rdbox__v total">{item.targetTotal}</div>
                      <div className="rdbox__k">{t.pTotal}</div>
                    </div>
                  </div>
                  <div className="rdbox__bar">
                    <i style={{ width: `${readPct}%` }} />
                  </div>
                </div>
                <button
                  type="button"
                  className="rdbtn"
                  onClick={() => onOpenReaders(item)}
                >
                  <span className="rdbtn__ic">
                    <Ic>
                      <Users aria-hidden="true" />
                    </Ic>
                  </span>
                  <span className="rdbtn__t">
                    <b>{t.pOpenReaders}</b>
                    <small>{t.pOpenReadersSub}</small>
                  </span>
                  <span className="ic rdbtn__go">
                    <ChevronRight aria-hidden="true" />
                  </span>
                </button>
                {item.popup ? (
                  <div className="pnote">
                    <span className="pnote__ic">
                      <Ic>
                        <Megaphone aria-hidden="true" />
                      </Ic>
                    </span>
                    <div>
                      <div className="pnote__t">{t.pnoteTitle}</div>
                      <div className="pnote__s">
                        {tpl2(t.pnoteBody, item.popupDismissed, item.readCount)}
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="notsent">
                <Ic>
                  <Sparkles aria-hidden="true" />
                </Ic>
                <div>
                  <b>{t.notSentTitle}</b>
                  <small>{tpl(t.notSentSub, item.targetTotal)}</small>
                </div>
              </div>
            )}
          </div>

          {/* 작성 zone */}
          <div className={`anzone anzone--author${item.canEdit ? "" : " is-locked"}`}>
            <div className="anzone__h">
              <div className="anzone__t">
                <Ic>
                  <Pencil aria-hidden="true" />
                </Ic>
                {t.zAuthorTitle}
              </div>
              <span className="anzone__tag">
                <Ic>
                  <User aria-hidden="true" />
                </Ic>
                {t.zAuthorTag}
              </span>
            </div>
            <div className="anzone__s">{t.zAuthorDesc}</div>
            <div className="anzone__btns">
              <button
                type="button"
                className="zbtn zbtn--primary"
                onClick={() => onEdit(item)}
                disabled={!item.canEdit}
              >
                <Ic>
                  <Pencil aria-hidden="true" />
                </Ic>
                {item.status === "draft" ? t.zEditDraft : t.zEditContent}
              </button>
            </div>
            {item.canEdit ? null : (
              <div className="permlock">
                <Ic>
                  <Lock aria-hidden="true" />
                </Ic>
                {t.zAuthorLocked}
              </div>
            )}
          </div>

          {/* 운영 zone */}
          <div className={`anzone anzone--operate${item.canOperate ? "" : " is-locked"}`}>
            <div className="anzone__h">
              <div className="anzone__t">
                <Ic>
                  <ShieldCheck aria-hidden="true" />
                </Ic>
                {t.zOpTitle}
              </div>
              <span className="anzone__tag">
                <Ic>
                  <ShieldCheck aria-hidden="true" />
                </Ic>
                {t.zOpTag}
              </span>
            </div>
            <div className="anzone__s">{t.zOpDesc}</div>
            <div className="anzone__btns">
              {item.status === "draft" ? (
                <Fragment>
                  <button
                    type="button"
                    className="zbtn zbtn--publish"
                    onClick={() => onAction("publish", item.id)}
                    disabled={!item.canOperate}
                  >
                    <Ic>
                      <Send aria-hidden="true" />
                    </Ic>
                    {t.zPublish}
                  </button>
                  <button
                    type="button"
                    className="zbtn zbtn--del"
                    title={t.zDelete}
                    aria-label={t.zDelete}
                    onClick={() => onAction("del", item.id)}
                    disabled={!item.canOperate}
                  >
                    <Ic>
                      <Trash2 aria-hidden="true" />
                    </Ic>
                  </button>
                </Fragment>
              ) : item.status === "published" ? (
                <Fragment>
                  <button
                    type="button"
                    className="zbtn"
                    onClick={() => onAction("revert", item.id)}
                    disabled={!item.canOperate}
                  >
                    <Ic>
                      <Sparkles aria-hidden="true" />
                    </Ic>
                    {t.zRevert}
                  </button>
                  <button
                    type="button"
                    className="zbtn"
                    onClick={() => onAction("archive", item.id)}
                    disabled={!item.canOperate}
                  >
                    <Ic>
                      <Archive aria-hidden="true" />
                    </Ic>
                    {t.zArchive}
                  </button>
                  <button
                    type="button"
                    className="zbtn zbtn--del"
                    title={t.zDelete}
                    aria-label={t.zDelete}
                    onClick={() => onAction("del", item.id)}
                    disabled={!item.canOperate}
                  >
                    <Ic>
                      <Trash2 aria-hidden="true" />
                    </Ic>
                  </button>
                </Fragment>
              ) : (
                <Fragment>
                  <button
                    type="button"
                    className="zbtn zbtn--publish"
                    onClick={() => onAction("republish", item.id)}
                    disabled={!item.canOperate}
                  >
                    <Ic>
                      <Send aria-hidden="true" />
                    </Ic>
                    {t.zRepublish}
                  </button>
                  <button
                    type="button"
                    className="zbtn"
                    onClick={() => onAction("revert", item.id)}
                    disabled={!item.canOperate}
                  >
                    <Ic>
                      <Sparkles aria-hidden="true" />
                    </Ic>
                    {t.zRevert}
                  </button>
                  <button
                    type="button"
                    className="zbtn zbtn--del"
                    title={t.zDelete}
                    aria-label={t.zDelete}
                    onClick={() => onAction("del", item.id)}
                    disabled={!item.canOperate}
                  >
                    <Ic>
                      <Trash2 aria-hidden="true" />
                    </Ic>
                  </button>
                </Fragment>
              )}
            </div>
            {item.canOperate ? null : (
              <div className="permlock">
                <Ic>
                  <Lock aria-hidden="true" />
                </Ic>
                {t.zOpLocked}
              </div>
            )}
          </div>
        </div>

        <div className="panel__foot">
          <Link
            className="btn btn--ghost"
            href={`/admin/announcements/${item.id}`}
            style={{ flex: "0 0 auto" }}
          >
            <Ic>
              <Smartphone aria-hidden="true" />
            </Ic>
            {t.mobileDetail}
          </Link>
          <button
            type="button"
            className="btn btn--subtle btn--block"
            onClick={onClose}
          >
            {t.close}
          </button>
        </div>
      </aside>
    </>
  );
}
