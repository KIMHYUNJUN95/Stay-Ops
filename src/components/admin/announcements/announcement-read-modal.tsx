"use client";

// Admin 공지 관리 콘솔 — 읽음 현황 모달. 열릴 때 서버 액션으로 대상자 명단(읽음/미읽음)을 로드한다.
// Ported from the Claude Design handoff (announce-views.js → readModal). 감사용 명단.
// See docs/product/11-announcement-workflow.md → Read Tracking.
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, Megaphone, Users, X } from "lucide-react";
import { useAdminPanelA11y } from "@/components/admin/shared/use-admin-panel-a11y";
import { getAnnouncementReadStatusConsole } from "@/app/admin/announcements/actions";
import type { AdminAnnouncementVM } from "@/lib/admin-announcements";
import { AnnCopy, Ic, initial, tpl2 } from "./announcements-console-shared";

type ReadModalProps = {
  item: AdminAnnouncementVM;
  t: AnnCopy;
  onClose: () => void;
};

type ReaderRow = { id: string; name: string; read: boolean };
type Filter = "all" | "read" | "unread";

export function AnnouncementReadModal({ item, t, onClose }: ReadModalProps) {
  const modalRef = useAdminPanelA11y<HTMLDivElement>(onClose);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ReaderRow[]>([]);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let active = true;
    getAnnouncementReadStatusConsole(item.id).then((result) => {
      if (!active) return;
      if (result.ok) {
        const next: ReaderRow[] = [
          ...result.readers.map((r) => ({ id: r.id, name: r.name, read: true })),
          ...result.unreadUsers.map((u) => ({ id: u.id, name: u.name, read: false })),
        ].sort((a, b) => a.name.localeCompare(b.name));
        setRows(next);
      } else {
        setRows([]);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [item.id]);

  const readCount = useMemo(() => rows.filter((r) => r.read).length, [rows]);
  const unreadCount = rows.length - readCount;
  const total = rows.length;
  const filtered = rows.filter((r) =>
    filter === "read" ? r.read : filter === "unread" ? !r.read : true,
  );

  return (
    <>
      <div className="modal-scrim on" onClick={onClose} />
      <div
        ref={modalRef}
        className="modal on"
        style={{ width: 520 }}
        role="dialog"
        aria-modal="true"
        aria-label={t.rKicker}
        tabIndex={-1}
      >
        <div className="modal__h">
          <div>
            <div className="modal__kicker">{t.rKicker}</div>
            <div className="modal__t" style={{ fontSize: 16 }}>
              {item.title}
            </div>
          </div>
          <button
            type="button"
            className="panel__x"
            onClick={onClose}
            aria-label={t.close}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="modal__body">
          <div className="rdstat">
            <div className="rdstat__cell">
              <div className="rdstat__v read">{loading ? "—" : readCount}</div>
              <div className="rdstat__k">{t.rStatRead}</div>
            </div>
            <div className="rdstat__cell">
              <div className="rdstat__v unread">{loading ? "—" : unreadCount}</div>
              <div className="rdstat__k">{t.rStatUnread}</div>
            </div>
            <div className="rdstat__cell">
              <div className="rdstat__v">{loading ? "—" : total}</div>
              <div className="rdstat__k">{t.rStatTotal}</div>
            </div>
          </div>

          <div className="rdseg" style={{ marginTop: 14, marginBottom: 12 }}>
            <button
              type="button"
              className={filter === "all" ? "on" : ""}
              onClick={() => setFilter("all")}
            >
              {t.rSegAll} {loading ? "" : total}
            </button>
            <button
              type="button"
              className={filter === "read" ? "on" : ""}
              onClick={() => setFilter("read")}
            >
              {t.rSegRead} {loading ? "" : readCount}
            </button>
            <button
              type="button"
              className={filter === "unread" ? "on" : ""}
              onClick={() => setFilter("unread")}
            >
              {t.rSegUnread} {loading ? "" : unreadCount}
            </button>
          </div>

          {loading ? (
            <div className="rdloading">{t.rLoading}</div>
          ) : filtered.length > 0 ? (
            <div className="rdlist">
              {filtered.map((row) => (
                <div className="rdrow" key={row.id}>
                  <span className="rdrow__av">{initial(row.name)}</span>
                  <span className="rdrow__nm">{row.name}</span>
                  <span className={`rdrow__st ${row.read ? "read" : "unread"}`}>
                    <Ic>
                      {row.read ? (
                        <CheckCircle2 aria-hidden="true" />
                      ) : (
                        <Circle aria-hidden="true" />
                      )}
                    </Ic>
                    {row.read ? t.rRowRead : t.rRowUnread}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rdempty">
              <Ic>
                <CheckCircle2 aria-hidden="true" />
              </Ic>
              <div className="t">{t.rEmpty}</div>
            </div>
          )}

          {item.popup ? (
            <div className="pnote" style={{ marginTop: 12 }}>
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
        </div>
        <div className="modal__foot">
          <span className="modal__foot-note">
            <Ic>
              <Users aria-hidden="true" />
            </Ic>
            {t.rFootNote}
          </span>
          <button type="button" className="btn btn--pri" onClick={onClose}>
            {t.rConfirm}
          </button>
        </div>
      </div>
    </>
  );
}
