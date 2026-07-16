"use client";

// Admin 분실물 console — 우측 상세 패널. 진행(active) 항목은 반환/폐기/보관연장 액션 존을, 종결
// (반환·폐기) 항목은 처리 이력을 보여준다. 예외 개입(상태 정정/삭제)은 항상 하단에 노출.
// Mirrors maintenance-detail-panel.tsx.
import {
  ArchiveRestore,
  Camera,
  CalendarPlus,
  Hourglass,
  Info,
  MapPin,
  Pencil,
  Handshake,
  ShieldCheck,
  Trash2,
  Truck,
  Undo2,
  User,
  X,
} from "lucide-react";
import { useAdminPanelA11y } from "@/components/admin/shared/use-admin-panel-a11y";
import type { Locale } from "@/lib/i18n";
import type { AdminLostItemVM } from "@/lib/admin-lost-found";
import { LOST_FOUND_DISPOSAL_RETENTION_DAYS } from "@/lib/lost-found-constants";
import { fmtDate, fmtDateTime, isActive, tpl } from "./lost-found-console-data";
import {
  CategoryChip,
  DdayBadge,
  DelDdayBadge,
  ExtBadge,
  StatusPill,
  type LFCopy,
} from "./lost-found-console-shared";

export type LFActionKind = "return" | "dispose" | "extend" | "correct" | "restore" | "delete";

type PanelProps = {
  item: AdminLostItemVM | null;
  t: LFCopy;
  locale: Locale;
  onClose: () => void;
  onAction: (kind: LFActionKind, id: string) => void;
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

function storagePct(storedDays: number, daysLeft: number): number {
  const total = storedDays + Math.max(daysLeft, 0);
  if (total <= 0) return 100;
  return Math.min(100, Math.max(0, (storedDays / total) * 100));
}

function deletePct(deleteDaysLeft: number): number {
  const elapsed = LOST_FOUND_DISPOSAL_RETENTION_DAYS - Math.max(deleteDaysLeft, 0);
  return Math.min(100, Math.max(0, (elapsed / LOST_FOUND_DISPOSAL_RETENTION_DAYS) * 100));
}

export function LostFoundDetailPanel({ item, t, locale, onClose, onAction, disabled }: PanelProps) {
  const panelRef = useAdminPanelA11y<HTMLElement>(onClose, { disabled });
  if (!item) return null;

  const active = isActive(item);
  const terminal = item.status === "returned" || item.status === "disposed";

  return (
    <>
      <div className="panel-scrim on" onClick={onClose} />
      <aside ref={panelRef} className="panel on" role="dialog" aria-label={t.pKicker} tabIndex={-1}>
        <div className="panel__h">
          <div className="panel__top">
            <span className="panel__kicker">
              {t.pKicker} · {item.shortId}
            </span>
            <button type="button" className="panel__x" onClick={onClose} aria-label={t.close}>
              <X />
            </button>
          </div>
          <div className="mpanel__title" style={{ marginTop: 11 }}>
            {item.itemName}
          </div>
          <div className="mpanel__chips">
            <StatusPill status={item.status} t={t} />
            <CategoryChip category={item.category} t={t} />
            {item.isExtended ? <ExtBadge t={t} /> : null}
            {active ? <DdayBadge item={item} t={t} /> : null}
            {item.status === "disposed" ? (
              <DelDdayBadge daysLeft={item.deleteDaysLeft ?? 0} soon={item.isDeleteSoon} t={t} />
            ) : null}
          </div>
        </div>

        <div className="panel__body">
          {/* 사진 */}
          <div className="pblock">
            <div className="pblock__t">{item.photos.length ? `${t.pPhotos} · ${item.photos.length}` : t.pPhotos}</div>
            {item.photos.length ? (
              <div className="pgal">
                {item.photos.map((url) => (
                  <a className="pshot" href={url} key={url} rel="noreferrer" target="_blank">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="" src={url} />
                  </a>
                ))}
              </div>
            ) : (
              <div className="pnophoto">
                <span className="ic">
                  <Camera aria-hidden="true" />
                </span>
                {t.noPhoto}
              </div>
            )}
          </div>

          {/* 설명 */}
          <div className="pblock">
            <div className="pblock__t">{t.pDesc}</div>
            <div className="mdesc">{item.description || "—"}</div>
          </div>

          {/* 기본정보 */}
          <div className="pblock">
            <div className="pblock__t">{t.pInfo}</div>
            <Kv label={t.pCategory}>
              <CategoryChip category={item.category} t={t} align="end" />
            </Kv>
            <Kv label={t.pLocation}>
              <span className="mono">{item.room ?? t.buildingWhole}</span> · {item.buildingLabel}
            </Kv>
            <Kv label={t.pStatus}>
              <StatusPill status={item.status} t={t} />
            </Kv>
            <Kv label={t.pReporter}>{item.reporterName}</Kv>
            <Kv label={t.pFoundAt}>
              <span className="mono">{fmtDateTime(item.foundAt, locale)}</span>
            </Kv>
          </div>

          {/* 게스트 */}
          <div className="pblock">
            <div className="pblock__t">{t.pGuest}</div>
            {item.guest ? (
              <div className="rptile rptile--guest">
                <span className="rptile__ic">
                  <span className="ic">
                    <User aria-hidden="true" />
                  </span>
                </span>
                <span className="rptile__b">
                  <span className="rptile__t">{item.guest.name}</span>
                  <span className="rptile__s">
                    {fmtDate(item.guest.checkIn, locale)} – {fmtDate(item.guest.checkOut, locale)}
                  </span>
                </span>
              </div>
            ) : (
              <div className="dimnote">
                <span className="ic">
                  <Info aria-hidden="true" />
                </span>
                {t.noGuest}
              </div>
            )}
          </div>

          {/* 보관 시계 (active) */}
          {active ? (
            <div className="pblock">
              <div className="pblock__t">{t.pStorage}</div>
              {item.isExpired || item.isDueSoon ? (
                <div className={`stnote${item.isExpired ? " stnote--expired" : " stnote--soon"}`}>
                  <span className="stnote__ic">
                    <span className="ic">
                      {item.isExpired ? <Trash2 aria-hidden="true" /> : <Hourglass aria-hidden="true" />}
                    </span>
                  </span>
                  <div>
                    <div className="stnote__t">{item.isExpired ? t.kpiExpired : t.kpiSoon}</div>
                    <div className="stnote__s">{item.isExpired ? t.expiredNote : t.dueSoonNote}</div>
                  </div>
                </div>
              ) : null}
              <div className="sgrid" style={{ marginTop: 10 }}>
                <div className="scell">
                  <div className="scell__k">{t.pStoredDays}</div>
                  <div className="scell__v">
                    {item.storedDays}
                    <span className="u">{t.days}</span>
                  </div>
                </div>
                <div className="scell">
                  <div className="scell__k">{t.pDueDate}</div>
                  <div className={`scell__v${item.isExpired ? " is-expired" : item.isDueSoon ? " is-soon" : ""}`}>
                    <span className="mono">{fmtDate(item.dueDate, locale)}</span>
                  </div>
                </div>
              </div>
              <div className="sbar">
                <div
                  className={`sbar__fill${item.isExpired ? " is-expired" : item.isDueSoon ? " is-soon" : ""}`}
                  style={{ width: `${storagePct(item.storedDays, item.daysLeft)}%` }}
                />
              </div>
              <div className="stnote__s" style={{ marginTop: 8 }}>
                {item.daysLeft >= 0 ? tpl(t.daysLeft, item.daysLeft) : tpl(t.dOver, Math.abs(item.daysLeft))}
              </div>
              {item.isExtended ? (
                <div className="infonote" style={{ marginTop: 10 }}>
                  {item.holdReason || t.extended}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* 삭제 시계 (disposed) */}
          {item.status === "disposed" ? (
            <div className="pblock">
              <div className="pblock__t">{t.pDelDate}</div>
              {item.isDeleteSoon ? (
                <div className="stnote stnote--soon">
                  <span className="stnote__ic">
                    <span className="ic">
                      <Trash2 aria-hidden="true" />
                    </span>
                  </span>
                  <div>
                    <div className="stnote__t">{t.deleteSoon}</div>
                    <div className="stnote__s">{t.delSoonNote}</div>
                  </div>
                </div>
              ) : null}
              <div className="sgrid" style={{ marginTop: 10 }}>
                <div className="scell">
                  <div className="scell__k">{t.pDisposedAt}</div>
                  <div className="scell__v">
                    <span className="mono">{item.disposedDate ? fmtDate(item.disposedDate, locale) : "—"}</span>
                  </div>
                </div>
                <div className="scell">
                  <div className="scell__k">{t.pDelDate}</div>
                  <div className={`scell__v${item.isDeleteSoon ? " is-soon" : ""}`}>
                    <span className="mono">{item.deleteDate ? fmtDate(item.deleteDate, locale) : "—"}</span>
                  </div>
                </div>
              </div>
              <div className="sbar">
                <div
                  className={`sbar__fill${item.isDeleteSoon ? " is-soon" : ""}`}
                  style={{ width: `${deletePct(item.deleteDaysLeft ?? 0)}%` }}
                />
              </div>
              <div className="stnote__s" style={{ marginTop: 8 }}>
                {t.pDelClock} · {item.deleteDaysLeft ?? 0}
                {t.days}
              </div>
            </div>
          ) : null}

          {/* 처리 이력 (terminal) */}
          {terminal ? (
            <div className="pblock">
              <div className="pblock__t">{t.pHistory}</div>
              <Kv label={t.pStatus}>
                <StatusPill status={item.status} t={t} />
              </Kv>
              <Kv label={t.pClosedBy}>{item.handledByName ?? t.sysAuto}</Kv>
              <Kv label={t.pClosedAt}>
                <span className="mono">{fmtDateTime(item.handledAt, locale)}</span>
              </Kv>
              {item.status === "returned" && item.returnMethod ? (
                <Kv label={t.pMethod}>
                  <span className="methline">
                    <span className="ic">
                      {item.returnMethod === "delivery" ? (
                        <Truck aria-hidden="true" />
                      ) : (
                        <Handshake aria-hidden="true" />
                      )}
                    </span>
                    {item.returnMethod === "delivery" ? t.methodDelivery : t.methodPickup}
                  </span>
                </Kv>
              ) : null}
              {item.status === "returned" && item.returnMethod === "delivery" && item.returnTrackingNo ? (
                <Kv label={t.pTracking}>
                  <span className="mono">{item.returnTrackingNo}</span>
                </Kv>
              ) : null}
              {item.status === "disposed" ? (
                <Kv label={t.pMethod}>
                  {item.isAutoDisposed ? (
                    <span className="syschip">
                      <span className="ic">
                        <Hourglass aria-hidden="true" />
                      </span>
                      {t.sysAuto}
                    </span>
                  ) : (
                    <span className="methline">
                      <span className="ic">
                        <Pencil aria-hidden="true" />
                      </span>
                      {t.modeManual}
                    </span>
                  )}
                </Kv>
              ) : null}

              <div className="pblock__t" style={{ marginTop: 12 }}>
                {t.pCloseMemo}
              </div>
              {item.handlingMemo ? (
                <div className="infonote">{item.handlingMemo}</div>
              ) : (
                <div className="dimnote">
                  <span className="ic">
                    <Info aria-hidden="true" />
                  </span>
                  {t.noMemo}
                </div>
              )}

              <div className="pblock__t" style={{ marginTop: 12 }}>
                {item.handlingPhotos.length ? `${t.pResPhotos} · ${item.handlingPhotos.length}` : t.pResPhotos}
              </div>
              {item.handlingPhotos.length ? (
                <div className="pgal pgal--res">
                  {item.handlingPhotos.map((url) => (
                    <a className="pshot pshot--res" href={url} key={url} rel="noreferrer" target="_blank">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img alt="" src={url} />
                    </a>
                  ))}
                </div>
              ) : (
                <div className="dimnote">
                  <span className="ic">
                    <Camera aria-hidden="true" />
                  </span>
                  {t.noResPhoto}
                </div>
              )}
            </div>
          ) : null}

          {/* 능동 처리 (active) */}
          {active ? (
            <div className="actzone">
              <div className="actzone__t">
                <span className="ic">
                  <MapPin aria-hidden="true" />
                </span>
                {t.activeT}
              </div>
              <div className="actzone__s">{t.activeS}</div>
              <div className="actzone__btns">
                <button type="button" className="actbtn actbtn--return" onClick={() => onAction("return", item.id)}>
                  <span className="ic">
                    <Undo2 aria-hidden="true" />
                  </span>
                  {t.actReturn}
                </button>
                <button type="button" className="actbtn actbtn--dispose" onClick={() => onAction("dispose", item.id)}>
                  <span className="ic">
                    <Trash2 aria-hidden="true" />
                  </span>
                  {t.actDispose}
                </button>
                <button type="button" className="actbtn actbtn--extend" onClick={() => onAction("extend", item.id)}>
                  <span className="ic">
                    <CalendarPlus aria-hidden="true" />
                  </span>
                  {t.actExtend}
                </button>
              </div>
            </div>
          ) : null}

          {/* 예외 개입 */}
          <div className="exczone">
            <div className="exczone__t">
              <span className="ic">
                <ShieldCheck aria-hidden="true" />
              </span>
              {t.exceptionT}
            </div>
            <div className="exczone__s">{t.exceptionS}</div>
            <div className="exczone__btns">
              {active ? (
                <button type="button" className="excbtn excbtn--force" onClick={() => onAction("correct", item.id)}>
                  <span className="ic">
                    <Pencil aria-hidden="true" />
                  </span>
                  {t.actCorrect}
                </button>
              ) : null}
              {terminal ? (
                <button type="button" className="excbtn excbtn--restore" onClick={() => onAction("restore", item.id)}>
                  <span className="ic">
                    <ArchiveRestore aria-hidden="true" />
                  </span>
                  {t.actRestore}
                </button>
              ) : null}
              <button
                type="button"
                className="excbtn excbtn--del"
                title={t.del}
                aria-label={t.del}
                onClick={() => onAction("delete", item.id)}
              >
                <span className="ic">
                  <Trash2 aria-hidden="true" />
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className="panel__foot">
          <button type="button" className="btn btn--ghost btn--block" onClick={onClose}>
            {t.close}
          </button>
        </div>
      </aside>
    </>
  );
}
