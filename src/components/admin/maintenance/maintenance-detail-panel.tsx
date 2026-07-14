"use client";

// Admin 수리·점검 console — 우측 상세 패널. Read-centric: 처리(확인·상태 변경·메모)는 현장 모바일이
// 담당하고, 여기서는 기록 열람 + 관리자 예외 개입(강제 완료 / 무효 / 삭제)만 한다.
// Mirrors maint-views.js panel().
import {
  Ban,
  BedDouble,
  Camera,
  ChevronRight,
  Info,
  Link2,
  Lock,
  Trash2,
  ShieldCheck,
  Smartphone,
  SprayCan,
  User,
  X,
} from "lucide-react";
import { useAdminPanelA11y } from "@/components/admin/shared/use-admin-panel-a11y";
import type { Locale } from "@/lib/i18n";
import type { AdminMaintenanceReport } from "@/lib/admin-maintenance";
import { fmtDate, fmtDateTime, isActive } from "./maintenance-console-data";
import {
  AgingTag,
  CategoryChip,
  OccupiedBadge,
  PriorityBadge,
  StatusPill,
  type MaintCopy,
} from "./maintenance-console-shared";

export type MaintExceptionKind = "force" | "void" | "del";

type PanelProps = {
  report: AdminMaintenanceReport | null;
  t: MaintCopy;
  locale: Locale;
  onClose: () => void;
  onException: (kind: MaintExceptionKind, id: string) => void;
  onOpenLink: (kind: "clean" | "resv") => void;
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

export function MaintenanceDetailPanel({
  report,
  t,
  locale,
  onClose,
  onException,
  onOpenLink,
  disabled,
}: PanelProps) {
  const panelRef = useAdminPanelA11y<HTMLElement>(onClose, { disabled });
  if (!report) return null;

  const occupied = report.occupied;
  const aging = report.aging;
  const canAct = isActive(report);

  return (
    <>
      <div className="panel-scrim on" onClick={onClose} />
      <aside ref={panelRef} className="panel on" role="dialog" aria-label={t.pKicker} tabIndex={-1}>
        <div className="panel__h">
          <div className="panel__top">
            <span className="panel__kicker">
              {t.pKicker} · {report.shortId}
            </span>
            <button type="button" className="panel__x" onClick={onClose} aria-label={t.close}>
              <X />
            </button>
          </div>
          <div className="mpanel__title" style={{ marginTop: 11 }}>
            {report.title}
          </div>
          <div className="mpanel__chips">
            <StatusPill status={report.status} t={t} />
            <PriorityBadge priority={report.priority} t={t} />
            <CategoryChip category={report.category} t={t} />
            {occupied ? <OccupiedBadge t={t} /> : null}
            {aging ? <AgingTag t={t} /> : null}
          </div>
        </div>

        <div className="panel__body">
          {occupied ? (
            <div className="occnote">
              <span className="occnote__ic">
                <span className="ic">
                  <User aria-hidden="true" />
                </span>
              </span>
              <div>
                <div className="occnote__t">{t.occupied}</div>
                <div className="occnote__s">{t.occNote}</div>
              </div>
            </div>
          ) : null}

          <div className="pblock">
            <div className="pblock__t">
              {report.photos.length ? `${t.pPhotos} · ${report.photos.length}` : t.pPhotos}
            </div>
            {report.photos.length ? (
              <div className="pgal">
                {report.photos.map((url) => (
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

          <div className="pblock">
            <div className="pblock__t">{t.pDesc}</div>
            <div className="mdesc">{report.description || "—"}</div>
          </div>

          <div className="pblock">
            <div className="pblock__t">{t.pInfo}</div>
            <Kv label={t.pLocation}>
              {`${report.buildingLabel} · ${report.room ?? t.buildingOnly}`}
            </Kv>
            <Kv label={t.pCategory}>
              <CategoryChip category={report.category} t={t} align="end" />
            </Kv>
            <Kv label={t.pPriority}>
              <PriorityBadge priority={report.priority} t={t} />
            </Kv>
            <Kv label={t.pStatus}>
              <StatusPill status={report.status} t={t} />
            </Kv>
            <Kv label={t.pReporter}>{report.reporterName}</Kv>
            <Kv label={t.pReportedAt}>
              <span className="mono">{fmtDateTime(report.createdAt, locale)}</span>
            </Kv>
            <Kv label={t.pUpdatedAt}>
              <span className="mono">{fmtDateTime(report.updatedAt, locale)}</span>
            </Kv>
            {report.completedAt ? (
              <Kv label={t.pCompletedAt}>
                <span className="mono">{fmtDateTime(report.completedAt, locale)}</span>
              </Kv>
            ) : null}
            {report.completedByName ? (
              <Kv label={t.pCompletedBy}>{report.completedByName}</Kv>
            ) : null}
          </div>

          <div className="pblock">
            <div className="pblock__t">{t.pMemo}</div>
            {report.memo ? (
              <div className="infonote">{report.memo}</div>
            ) : (
              <div className="dimnote">
                <span className="ic">
                  <Info aria-hidden="true" />
                </span>
                {t.noMemo}
              </div>
            )}
          </div>

          {report.status === "closed" ? (
            <div className="pblock">
              <div className="pblock__t">
                {report.resolutionPhotos.length
                  ? `${t.pResPhotos} · ${report.resolutionPhotos.length}`
                  : t.pResPhotos}
              </div>
              {report.resolutionPhotos.length ? (
                <div className="pgal pgal--res">
                  {report.resolutionPhotos.map((url) => (
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

          <div className="pblock">
            <div className="pblock__t">{t.pLinked}</div>
            {report.link.cleaning || report.link.reservation ? (
              <div className="rptiles">
                {report.link.cleaning ? (
                  <button type="button" className="rptile rptile--clean" onClick={() => onOpenLink("clean")}>
                    <span className="rptile__ic">
                      <span className="ic">
                        <SprayCan aria-hidden="true" />
                      </span>
                    </span>
                    <span className="rptile__b">
                      <span className="rptile__t">{t.pCleaning}</span>
                      <span className="rptile__s">
                        {report.link.cleaning.room} · {fmtDate(report.link.cleaning.date, locale)} ·{" "}
                        {report.link.cleaning.staff}
                      </span>
                    </span>
                    <span className="ic rptile__go">
                      <ChevronRight aria-hidden="true" />
                    </span>
                  </button>
                ) : null}
                {report.link.reservation ? (
                  <button type="button" className="rptile rptile--resv" onClick={() => onOpenLink("resv")}>
                    <span className="rptile__ic">
                      <span className="ic">
                        <BedDouble aria-hidden="true" />
                      </span>
                    </span>
                    <span className="rptile__b">
                      <span className="rptile__t">{t.pReservation}</span>
                      <span className="rptile__s">
                        {report.link.reservation.guest} · {fmtDate(report.link.reservation.checkIn, locale)} –{" "}
                        {fmtDate(report.link.reservation.checkOut, locale)}
                      </span>
                    </span>
                    <span className="ic rptile__go">
                      <ChevronRight aria-hidden="true" />
                    </span>
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="dimnote">
                <span className="ic">
                  <Link2 aria-hidden="true" />
                </span>
                {t.noLinked}
              </div>
            )}
          </div>

          <div className="mobnote">
            <span className="mobnote__ic">
              <span className="ic">
                <Smartphone aria-hidden="true" />
              </span>
            </span>
            <div className="mobnote__t">{t.pMobileNote}</div>
          </div>

          <div className="exczone">
            <div className="exczone__t">
              <span className="ic">
                <ShieldCheck aria-hidden="true" />
              </span>
              {t.exceptionT}
            </div>
            <div className="exczone__s">{t.exceptionS}</div>
            <div className="exczone__btns">
              {canAct ? (
                <>
                  <button
                    type="button"
                    className="excbtn excbtn--force"
                    onClick={() => onException("force", report.id)}
                  >
                    <span className="ic">
                      <Lock aria-hidden="true" />
                    </span>
                    {t.forceClose}
                  </button>
                  <button type="button" className="excbtn excbtn--void" onClick={() => onException("void", report.id)}>
                    <span className="ic">
                      <Ban aria-hidden="true" />
                    </span>
                    {t.voidReport}
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="excbtn excbtn--del"
                title={t.del}
                aria-label={t.del}
                onClick={() => onException("del", report.id)}
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
