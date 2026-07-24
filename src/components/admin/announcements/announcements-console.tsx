"use client";

// Admin 공지 관리(Announcements) console — content area for /admin/announcements
// (AdminShell owns the sidebar/topbar). 3 상태 세그먼트(게시중/초안/보관) + KPI 요약 바 +
// 고밀도 목록 표 + 우측 상세 패널 + 새 공지/편집·확인·읽음 현황·이미지 뷰어 모달.
// 작성 권한 ↔ 운영 권한을 UI 위계로 분리. Ported 1:1 from the Claude Design handoff
// (announce-views.js / announce.css). See docs/product/11-announcement-workflow.md.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  Bell,
  EyeOff,
  Megaphone,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { AdminToast, useAdminToast } from "@/components/admin/shared/admin-toast";
import { getAnnouncementDictionary } from "@/lib/announcement-i18n";
import type { Locale } from "@/lib/i18n";
import type { OrganizationRole } from "@/config/roles";
import type {
  AdminAnnouncementVM,
  AdminAnnouncementsData,
} from "@/lib/admin-announcements";
import {
  deleteAnnouncementConsole,
  setAnnouncementStatusConsole,
} from "@/app/admin/announcements/actions";
import "@/components/admin/maintenance/maintenance-console.css";
import "./announcements-console.css";
import {
  AuthorCell,
  FlagChips,
  Ic,
  StatusPill,
  TargetChip,
  fmtDateShort,
  tpl,
} from "./announcements-console-shared";
import {
  AnnouncementDetailPanel,
  type AnnActionKind,
} from "./announcement-detail-panel";
import { AnnouncementFormModal } from "./announcement-form-modal";
import { AnnouncementConfirmModal } from "./announcement-confirm-modal";
import { AnnouncementReadModal } from "./announcement-read-modal";

type ConsoleProps = {
  locale: Locale;
  data: AdminAnnouncementsData;
};

type Tab = "published" | "drafts" | "archived";
const TAB_STATUS: Record<Tab, AdminAnnouncementVM["status"]> = {
  published: "published",
  drafts: "draft",
  archived: "archived",
};

type FormState = { mode: "new" | "edit"; item: AdminAnnouncementVM | null };

function listDate(a: AdminAnnouncementVM): string | null {
  return a.status === "draft" ? a.updatedAt : a.publishedAt;
}

export function AnnouncementsConsole({ locale, data }: ConsoleProps) {
  const router = useRouter();
  const dictionary = getAnnouncementDictionary(locale);
  const t = dictionary.console;
  const roleLabel = (role: OrganizationRole) => dictionary.targetRoles[role];
  const { toast, showToast, dismiss } = useAdminToast();

  const { announcements, loadError } = data;
  const [tab, setTab] = useState<Tab>("published");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [confirm, setConfirm] = useState<{ kind: AnnActionKind; id: string } | null>(
    null,
  );
  const [readItem, setReadItem] = useState<AdminAnnouncementVM | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const kpi = useMemo(() => {
    const published = announcements.filter((a) => a.status === "published");
    return {
      published: published.length,
      drafts: announcements.filter((a) => a.status === "draft").length,
      important: published.filter((a) => a.isImportant).length,
      popup: announcements.filter((a) => a.isPopupActive).length,
      impUnread: published.filter((a) => a.isImportant && a.unreadCount > 0).length,
    };
  }, [announcements]);

  const rows = useMemo(() => {
    const status = TAB_STATUS[tab];
    const q = query.trim().toLowerCase();
    let list = announcements.filter((a) => a.status === status);
    if (q) {
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.authorName.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q),
      );
    }
    return list.slice().sort((x, y) => {
      if (Boolean(x.isPinned) !== Boolean(y.isPinned)) return x.isPinned ? -1 : 1;
      return (listDate(y) ?? "").localeCompare(listDate(x) ?? "");
    });
  }, [announcements, tab, query]);

  const tabTotal = useMemo(
    () => announcements.filter((a) => a.status === TAB_STATUS[tab]).length,
    [announcements, tab],
  );

  const selected = selectedId
    ? (announcements.find((a) => a.id === selectedId) ?? null)
    : null;
  const confirmItem = confirm
    ? (announcements.find((a) => a.id === confirm.id) ?? null)
    : null;

  function handleTab(next: Tab) {
    if (next === tab) return;
    setTab(next);
    setQuery("");
    setSelectedId(null);
  }

  function runConfirm(kind: AnnActionKind, id: string) {
    startTransition(async () => {
      const result =
        kind === "del"
          ? await deleteAnnouncementConsole(id)
          : await setAnnouncementStatusConsole(
              id,
              kind === "archive" ? "archived" : kind === "revert" ? "draft" : "published",
            );
      if (!result.ok) {
        showToast(t.errProcess);
        return;
      }
      setConfirm(null);
      if (kind === "del") setSelectedId(null);
      showToast(
        kind === "publish"
          ? t.tPublished
          : kind === "republish"
            ? t.tRepublished
            : kind === "archive"
              ? t.tArchived
              : kind === "revert"
                ? t.tReverted
                : t.tDeleted,
      );
      router.refresh();
    });
  }

  function handleSaved() {
    setForm(null);
    showToast(t.tSaved);
    router.refresh();
  }

  const V = (value: number) => (loadError ? "–" : value);

  return (
    <>
      {/* KPI ops bar */}
      <div className="opsbar opsbar--5">
        <div className="opscell">
          <div className="opscell__k">
            <Ic>
              <Megaphone />
            </Ic>
            {t.kpiPublished}
          </div>
          <div className={`opscell__v${loadError ? " is-muted" : " is-done"}`}>
            {V(kpi.published)}
          </div>
          <div className="opscell__sub">{t.kpiPublishedSub}</div>
        </div>
        <div className="opscell">
          <div className="opscell__k">
            <Ic>
              <Sparkles />
            </Ic>
            {t.kpiDrafts}
          </div>
          <div
            className={`opscell__v${!loadError && kpi.drafts > 0 ? " is-progress" : " is-muted"}`}
          >
            {V(kpi.drafts)}
          </div>
          <div className="opscell__sub">{t.kpiDraftsSub}</div>
        </div>
        <div className="opscell">
          <div className="opscell__k">
            <Ic>
              <ShieldAlert />
            </Ic>
            {t.kpiImportant}
          </div>
          <div
            className={`opscell__v${!loadError && kpi.important > 0 ? " is-danger" : " is-muted"}`}
          >
            {V(kpi.important)}
          </div>
          <div className="opscell__sub">{t.kpiImportantSub}</div>
        </div>
        <div className="opscell">
          <div className="opscell__k">
            <Ic>
              <Bell />
            </Ic>
            {t.kpiPopup}
          </div>
          <div
            className={`opscell__v${!loadError && kpi.popup > 0 ? " is-violet" : " is-muted"}`}
          >
            {V(kpi.popup)}
          </div>
          <div className="opscell__sub">{t.kpiPopupSub}</div>
        </div>
        <div className="opscell">
          <div className="opscell__k">
            <Ic>
              <Users />
            </Ic>
            {t.kpiImpUnread}
          </div>
          <div
            className={`opscell__v${!loadError && kpi.impUnread > 0 ? " is-danger" : " is-muted"}`}
          >
            {V(kpi.impUnread)}
          </div>
          <div className="opscell__sub">
            {loadError ? (
              " "
            ) : kpi.impUnread > 0 ? (
              <span className="opscell__flag">
                <Ic>
                  <TriangleAlert />
                </Ic>
                {t.kpiImpUnreadRemain}
              </span>
            ) : (
              <span style={{ color: "var(--done)", fontWeight: 800 }}>
                {t.kpiImpUnreadClear}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* tabs + legend + 새 공지 */}
      <div className="abar">
        <div className="lviews">
          <button
            type="button"
            className={tab === "published" ? "on" : ""}
            onClick={() => handleTab("published")}
          >
            <Ic>
              <Megaphone />
            </Ic>
            {t.tabPublished}
            <span style={{ opacity: 0.7, fontVariantNumeric: "tabular-nums" }}>
              {kpi.published}
            </span>
          </button>
          <button
            type="button"
            className={tab === "drafts" ? "on" : ""}
            onClick={() => handleTab("drafts")}
          >
            <Ic>
              <Sparkles />
            </Ic>
            {t.tabDrafts}
            <span style={{ opacity: 0.7, fontVariantNumeric: "tabular-nums" }}>
              {kpi.drafts}
            </span>
          </button>
          <button
            type="button"
            className={tab === "archived" ? "on" : ""}
            onClick={() => handleTab("archived")}
          >
            <Ic>
              <Archive />
            </Ic>
            {t.tabArchived}
            <span style={{ opacity: 0.7, fontVariantNumeric: "tabular-nums" }}>
              {announcements.filter((a) => a.status === "archived").length}
            </span>
          </button>
        </div>
        <span style={{ flex: 1 }} />
        <span className="perm-legend">
          <Ic>
            <ShieldCheck />
          </Ic>
          <b>{t.permLegend}</b>
        </span>
        <button type="button" className="newbtn" onClick={() => setForm({ mode: "new", item: null })}>
          <Ic>
            <Plus />
          </Ic>
          {t.newBtn}
        </button>
      </div>

      {/* body */}
      <div className="cbody">
        {loadError ? (
          <div className="card">
            <div className="state">
              <div className="state__ic err">
                <TriangleAlert aria-hidden="true" />
              </div>
              <div className="state__t">{t.errT}</div>
              <div className="state__s">{t.errS}</div>
              <button
                type="button"
                className="btn btn--pri btn--sm"
                style={{ marginTop: 16 }}
                onClick={() => router.refresh()}
              >
                {t.retry}
              </button>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="card">
            <div className="state">
              <div className="state__ic">
                <Megaphone aria-hidden="true" />
              </div>
              <div className="state__t">
                {tab === "published"
                  ? t.emptyPubT
                  : tab === "drafts"
                    ? t.emptyDraftT
                    : t.emptyArcT}
              </div>
              <div className="state__s">
                {query
                  ? t.emptySearchS
                  : tab === "published"
                    ? t.emptyPubS
                    : tab === "drafts"
                      ? t.emptyDraftS
                      : t.emptyArcS}
              </div>
              {tab !== "archived" ? (
                <button
                  type="button"
                  className="btn btn--pri btn--sm"
                  style={{ marginTop: 16 }}
                  onClick={() => setForm({ mode: "new", item: null })}
                >
                  <Ic>
                    <Plus aria-hidden="true" />
                  </Ic>
                  {t.newBtn}
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <div className="ahint">
              <b>
                {rows.length}
                {t.countUnit}
              </b>
              {query ? ` · ${tpl(t.searchResult, tabTotal)}` : ""}
              <span className="chan">
                <Ic>
                  <Megaphone />
                </Ic>
                {t.channelNote}
              </span>
            </div>
            <div className="card" style={{ overflow: "visible" }}>
              <table className="qtbl mtbl atbl">
                <colgroup>
                  <col style={{ width: 104 }} />
                  <col />
                  <col style={{ width: 132 }} />
                  <col style={{ width: 118 }} />
                  <col style={{ width: 98 }} />
                  <col style={{ width: 150 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 16 }}>{t.colStatus}</th>
                    <th>{t.colAnnouncement}</th>
                    <th>{t.colTarget}</th>
                    <th>{t.colAuthor}</th>
                    <th>{tab === "drafts" ? t.colUpdatedAt : t.colPublishedAt}</th>
                    <th>{t.colRead}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => {
                    const hasRead =
                      a.status === "published" || a.status === "archived";
                    const alert = a.isImportant && a.unreadCount > 0;
                    const pct =
                      a.targetTotal > 0
                        ? Math.round((a.readCount / a.targetTotal) * 100)
                        : 0;
                    return (
                      <tr
                        key={a.id}
                        className={`${a.isPinned ? "pinned" : ""} ${selectedId === a.id ? "sel" : ""}`}
                        onClick={() => setSelectedId(a.id)}
                      >
                        <td style={{ paddingLeft: 16 }}>
                          <StatusPill status={a.status} t={t} />
                        </td>
                        <td className="an-titlecell">
                          <div className="an-titlerow">
                            <span className="an-title">{a.title}</span>
                            <FlagChips a={a} t={t} />
                          </div>
                          <div className="an-sub">
                            <span className="id">{a.id.slice(0, 8)}</span>
                            <span className="sep" />
                            {a.organizationName}
                          </div>
                        </td>
                        <td>
                          <TargetChip a={a} t={t} roleLabel={roleLabel} />
                        </td>
                        <td>
                          <AuthorCell name={a.authorName} />
                        </td>
                        <td className="datecell">
                          <span className="k">
                            {a.status === "draft"
                              ? t.dateKindUpdated
                              : t.dateKindPublished}
                          </span>
                          {fmtDateShort(listDate(a))}
                        </td>
                        <td className="readcell">
                          {hasRead ? (
                            <div className="readsum">
                              <div className="readsum__top">
                                <span className="readsum__n">{a.readCount}</span>
                                <span className="readsum__t">/ {a.targetTotal}</span>
                                <span
                                  className={`readsum__u${alert ? " is-alert" : ""}`}
                                >
                                  {tpl(t.unreadN, a.unreadCount)}
                                </span>
                              </div>
                              <div className={`readbar${alert ? " is-alert" : ""}`}>
                                <i style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          ) : (
                            <span className="readsum--na">
                              <Ic>
                                <EyeOff />
                              </Ic>
                              {t.readUnsent}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <AnnouncementDetailPanel
        item={selected}
        t={t}
        locale={locale}
        roleLabel={roleLabel}
        onClose={() => setSelectedId(null)}
        onEdit={(annItem) => setForm({ mode: "edit", item: annItem })}
        onAction={(kind, id) => setConfirm({ kind, id })}
        onOpenReaders={(annItem) => setReadItem(annItem)}
        onOpenImage={(url) => setImgUrl(url)}
        disabled={confirm !== null || form !== null || readItem !== null}
      />

      {form ? (
        <AnnouncementFormModal
          mode={form.mode}
          item={form.item}
          t={t}
          roleLabel={roleLabel}
          organizations={data.organizations}
          roleCountsByOrg={data.roleCountsByOrg}
          onClose={() => setForm(null)}
          onSaved={handleSaved}
        />
      ) : null}

      {confirm && confirmItem ? (
        <AnnouncementConfirmModal
          kind={confirm.kind}
          item={confirmItem}
          t={t}
          roleLabel={roleLabel}
          pending={pending}
          onCancel={() => setConfirm(null)}
          onConfirm={runConfirm}
        />
      ) : null}

      {readItem ? (
        <AnnouncementReadModal
          key={readItem.id}
          item={readItem}
          t={t}
          onClose={() => setReadItem(null)}
        />
      ) : null}

      {imgUrl ? (
        <div className="imgview-scrim" onClick={() => setImgUrl(null)}>
          <div className="imgview" onClick={(e) => e.stopPropagation()}>
            <div className="imgview__bar">
              <span className="imgview__ttl">
                <Ic>
                  <Megaphone />
                </Ic>
                {t.imgViewTitle}
              </span>
              <button
                type="button"
                className="imgview__x"
                onClick={() => setImgUrl(null)}
                aria-label={t.close}
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <div className="imgview__stage">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" src={imgUrl} />
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <AdminToast message={toast.message} onDismiss={dismiss} /> : null}
    </>
  );
}
