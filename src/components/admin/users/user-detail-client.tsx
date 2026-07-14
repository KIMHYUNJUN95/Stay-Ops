"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Check,
  Info,
  KeyRound,
  Lock,
  Mail,
  Phone,
  Plus,
  Power,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import "@/components/admin/users-console.css";
import { AdmDropdown, type AdmOption } from "../shared/adm-dropdown";
import { AdminDatePicker } from "@/components/admin/shared/admin-date-picker";
import { AdminTimePicker } from "@/components/admin/shared/admin-time-picker";
import {
  assignDeveloper,
  deleteMember,
  grantPermissionOverrideAction,
  revokePermissionOverrideAction,
  setMemberLeaveApprover,
  setMemberManageUsers,
  setMemberPayrollAdmin,
  setMemberReportAccess,
  setMemberRole,
  setMemberStatus,
  setMemberTeam,
} from "@/app/admin/users/actions";
import { organizationRoles } from "@/config/roles";
import { getDictionary, type Locale } from "@/lib/i18n";

export type UserDetailVM = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  joinedAt: string | null;
  isSelf: boolean;
  reportAccess: boolean;
  payrollAdmin: boolean;
  leaveApprover: boolean;
  isDeveloper: boolean;
  manageUsers: boolean;
  teamId: string | null;
};

export type TeamOption = { id: string; kind: string; name: string };

export type Override = {
  id: string;
  key: string;
  by: string;
  granted: string; // ISO
  expires: string; // ISO / datetime-local
  reason: string;
};

export function UserDetailClient({
  member,
  locale,
  canManagePermissions,
  isDeveloperViewer = false,
  currentUserName,
  initialOverrides = [],
  teams = [],
}: {
  member: UserDetailVM;
  locale: Locale;
  canManagePermissions: boolean;
  /** Viewer is a platform developer — gates the 개발자·사용자 관리 card. */
  isDeveloperViewer?: boolean;
  currentUserName: string;
  initialOverrides?: Override[];
  teams?: TeamOption[];
}) {
  const router = useRouter();
  const dictionary = getDictionary(locale);
  const u = dictionary.admin.users;
  const c = u.console;

  const roleLabel = (role: string) => (dictionary.roles as Record<string, string>)[role] ?? role;
  // Two-state active/inactive; 비활성(inactive) writes "suspended" and bans login server-side.
  const statusLabel = (status: string) => (status === "active" ? c.statusActive : c.statusInactive);

  const roleOptions: AdmOption[] = organizationRoles.map((role) => ({ value: role, label: roleLabel(role) }));
  const statusOptions: AdmOption[] = [
    { value: "active", label: c.statusActive },
    { value: "suspended", label: c.statusInactive },
  ];
  const reportOptions: AdmOption[] = [
    { value: "on", label: u.reportAccessGrant },
    { value: "off", label: u.reportAccessDeny },
  ];
  const permOptions: AdmOption[] = [
    { value: "grant", label: c.grant },
    { value: "revoke", label: c.revoke },
  ];
  const keyOptions: AdmOption[] = Object.entries(c.keys).map(([key, meta]) => ({
    value: key,
    key,
    label: meta.label,
    desc: meta.desc,
  }));
  // Team (현장/사무실 소속). Phase 1: one team per kind, so label each by its kind. Sub-teams (later)
  // will need the team name too.
  const teamLabel = (kind: string) => (kind === "field" ? c.teamFieldOption : c.teamOfficeOption);
  const teamOptions: AdmOption[] = [
    { value: "", label: c.teamUnassigned },
    ...teams.map((team) => ({ value: team.id, label: teamLabel(team.kind) })),
  ];

  // Local prototype state (committed = "saved"; draft = current select). Persistence lands after
  // design confirmation.
  const initial = {
    role: member.role,
    status: member.status === "active" ? "active" : "suspended",
    report: member.reportAccess ? "on" : "off",
    payroll: member.payrollAdmin ? "grant" : "revoke",
    approver: member.leaveApprover ? "grant" : "revoke",
    developer: member.isDeveloper ? "grant" : "revoke",
    manageUsers: member.manageUsers ? "grant" : "revoke",
    team: member.teamId ?? "",
  };
  const [committed, setCommitted] = useState(initial);
  const [draft, setDraft] = useState(initial);

  const [overrides, setOverrides] = useState<Override[]>(initialOverrides);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ key: "", expires: "", reason: "" });
  // Expiry is picked as separate date + time (custom pickers, not the native datetime-local); combined
  // into form.expires only when both are set.
  const [expDate, setExpDate] = useState("");
  const [expTime, setExpTime] = useState("");
  const setExpiry = (d: string, t: string) => {
    setExpDate(d);
    setExpTime(t);
    setForm((prev) => ({ ...prev, expires: d && t ? `${d}T${t}` : "" }));
  };
  const resetGrantForm = () => {
    setForm({ key: "", expires: "", reason: "" });
    setExpDate("");
    setExpTime("");
  };
  const [revoking, setRevoking] = useState<string | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [toast, setToast] = useState<{ id: number; msg: string; kind: "ok" | "danger" } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);
  // id from the previous toast (functional update) — avoids a render-scope ref the compiler flags.
  const showToast = (msg: string, kind: "ok" | "danger" = "ok") =>
    setToast((prev) => ({ id: (prev?.id ?? 0) + 1, msg, kind }));

  // Capture "now" once at mount (React Compiler disallows argless Date.now()/new Date() during render).
  const [nowMs] = useState(() => Date.now());
  const [nowLocal] = useState(() => new Date().toISOString().slice(0, 16));

  const fmtJoined = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(new Date(value))
      : "—";
  const fmtDT = (iso: string) =>
    new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

  const [, startTransition] = useTransition();

  const errMsg = (code?: string) => {
    switch (code) {
      case "forbidden":
        return c.errForbidden;
      case "self_update_blocked":
      case "self_grant_blocked":
        return c.permSelfBlocked;
      case "min_one_approver":
        return c.errMinApprover;
      case "hourly_excluded":
        return c.errHourly;
      case "expiry_in_past":
      case "invalid_expiry":
        return c.errExpiry;
      default:
        return c.errSaveFailed;
    }
  };

  function commit(field: keyof typeof initial, toastMsg: string) {
    const value = draft[field];
    const mid = member.membershipId;
    startTransition(async () => {
      let res: { ok: boolean; error?: string };
      switch (field) {
        case "role":
          res = await setMemberRole(mid, value);
          break;
        case "status":
          res = await setMemberStatus(mid, value);
          break;
        case "report":
          res = await setMemberReportAccess(mid, value === "on");
          break;
        case "team":
          res = await setMemberTeam(mid, value || null);
          break;
        case "payroll":
          res = await setMemberPayrollAdmin(mid, value === "grant");
          break;
        case "approver":
          res = await setMemberLeaveApprover(mid, value === "grant");
          break;
        case "developer":
          res = await assignDeveloper(mid, value === "grant");
          break;
        default:
          res = await setMemberManageUsers(mid, value === "grant");
      }
      if (res.ok) {
        setCommitted((prev) => ({ ...prev, [field]: value }));
        showToast(toastMsg);
      } else {
        showToast(errMsg(res.error), "danger");
      }
    });
  }

  function roleForm(
    label: string,
    field: keyof typeof initial,
    options: AdmOption[],
    toastMsg: string,
  ) {
    const dirty = draft[field] !== committed[field];
    return (
      <div className="roleform" style={{ alignItems: "stretch" }}>
        <AdmDropdown
          options={options}
          value={draft[field]}
          onChange={(value) => setDraft((prev) => ({ ...prev, [field]: value }))}
          ariaLabel={label}
        />
        <button
          type="button"
          className={`ui-btn ui-btn--primary fw-black h10${dirty ? "" : " dim"}`}
          onClick={() => commit(field, toastMsg)}
        >
          {label}
        </button>
      </div>
    );
  }

  function expBadge(iso: string) {
    const days = Math.ceil((new Date(iso).getTime() - nowMs) / 86_400_000);
    const tone = days < 0 ? "muted" : days <= 2 ? "amber" : "blue";
    const tail =
      days < 0 ? c.ovExpired : days === 0 ? c.ovExpiresToday : <span className="badge-dd">{`D-${days}`}</span>;
    return (
      <span className={`ui-badge ui-badge--${tone}`}>
        <span className="ic">
          <Calendar />
        </span>
        {fmtDT(iso)} · {tail}
      </span>
    );
  }

  const formValid = form.key && form.expires && form.reason.trim();

  function submitGrant() {
    if (!formValid) return;
    startTransition(async () => {
      const res = await grantPermissionOverrideAction({
        membershipId: member.membershipId,
        permissionKey: form.key,
        expiresAt: form.expires,
        reason: form.reason.trim(),
      });
      if (res.ok && res.override) {
        setOverrides((prev) => [{ ...res.override!, by: currentUserName }, ...prev]);
        resetGrantForm();
        setFormOpen(false);
        showToast(c.toastGranted);
      } else {
        showToast(errMsg(res.error), "danger");
      }
    });
  }

  function doRevoke(id: string) {
    startTransition(async () => {
      const res = await revokePermissionOverrideAction({ membershipId: member.membershipId, overrideId: id });
      if (res.ok) {
        setOverrides((prev) => prev.filter((o) => o.id !== id));
        setRevoking(null);
        showToast(c.toastRevoked, "danger");
      } else {
        showToast(errMsg(res.error), "danger");
      }
    });
  }

  function doDelete() {
    startTransition(async () => {
      const res = await deleteMember(member.membershipId);
      if (res.ok) {
        router.push("/admin/users");
      } else {
        setDeleteConfirming(false);
        showToast(res.error === "has_activity" ? c.errHasActivity : c.errSaveFailed, "danger");
      }
    });
  }

  const initialName = member.name.replace(/\(.*\)/, "").trim().charAt(0) || "?";

  return (
    <div className="uwrap">
      <div className="backrow">
        <button type="button" className="backbtn" onClick={() => router.push("/admin/users")}>
          <span className="ic">
            <ArrowLeft />
          </span>
          {u.backToList}
        </button>
        <span className="backrow__crumb">
          {c.breadcrumb} / <b>{member.name}</b>
        </span>
      </div>

      {/* Profile card */}
      <section className="ui-card p6">
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <span className="ui-avatar" style={{ fontWeight: 900, fontSize: 22 }}>
            {initialName}
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="uname">
              {member.name}
              {member.isSelf ? (
                <span className="urow__self" style={{ fontSize: 11, marginLeft: 8, verticalAlign: "middle" }}>
                  {c.selfChip}
                </span>
              ) : null}
            </div>
            <div className="umeta">
              <span className={`spill spill--${member.status === "active" ? "active" : "removed"}`}>
                <span className="d" />
                {statusLabel(member.status)}
              </span>
              <span className="umeta__role">
                {member.isDeveloper ? c.devRole : roleLabel(member.role)}
              </span>
            </div>
          </div>
        </div>
        <div className="udl">
          <div className="row">
            <span className="row__k">
              <span className="ic">
                <Mail />
              </span>
              {u.email}
            </span>
            <span className="row__v">{member.email || "—"}</span>
          </div>
          <div className="row">
            <span className="row__k">
              <span className="ic">
                <Phone />
              </span>
              {c.contact}
            </span>
            <span className="row__v">
              {member.phone ? <a href={`tel:${member.phone}`}>{member.phone}</a> : "—"}
            </span>
          </div>
          <div className="row">
            <span className="row__k">
              <span className="ic">
                <Calendar />
              </span>
              {u.joinedAt}
            </span>
            <span className="row__v">{fmtJoined(member.joinedAt)}</span>
          </div>
        </div>
      </section>

      {/* Role · status · report — hidden on your own profile (you don't configure yourself) */}
      {!member.isSelf ? (
      <section className="ui-card p5">
        <h3 className="ctitle">{c.roleStatusTitle}</h3>
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {roleForm(u.saveRole, "role", roleOptions, c.toastRole)}
          {roleForm(u.saveStatus, "status", statusOptions, c.toastStatus)}
          {teams.length > 0 ? roleForm(c.teamSave, "team", teamOptions, c.toastTeam) : null}
          {roleForm(u.saveReportAccess, "report", reportOptions, c.toastReport)}
          <p className="chint">{u.reportAccessHint}</p>
        </div>
      </section>
      ) : null}

      {/* Developer & user-management access (platform developer only) */}
      {isDeveloperViewer && !member.isSelf ? (
        <section className="ui-card p5">
          <h3 className="ctitle">{c.devMgmtTitle}</h3>
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="roleform" style={{ alignItems: "stretch" }}>
              <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
                <span className="umeta__role" style={{ fontWeight: 800, color: "var(--ui-fg)" }}>
                  {c.devAssignLabel}
                </span>
              </span>
              <AdmDropdown
                options={permOptions}
                value={draft.developer}
                onChange={(value) => setDraft((prev) => ({ ...prev, developer: value }))}
                ariaLabel={c.devAssignLabel}
              />
              <button
                type="button"
                className={`ui-btn ui-btn--primary fw-black h10${draft.developer !== committed.developer ? "" : " dim"}`}
                onClick={() => commit("developer", c.toastDeveloper)}
              >
                {c.savePermission}
              </button>
            </div>
            <div className="roleform" style={{ alignItems: "stretch" }}>
              <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
                <span className="umeta__role" style={{ fontWeight: 800, color: "var(--ui-fg)" }}>
                  {c.manageUsersLabel}
                </span>
              </span>
              <AdmDropdown
                options={permOptions}
                value={draft.manageUsers}
                onChange={(value) => setDraft((prev) => ({ ...prev, manageUsers: value }))}
                ariaLabel={c.manageUsersLabel}
              />
              <button
                type="button"
                className={`ui-btn ui-btn--primary fw-black h10${draft.manageUsers !== committed.manageUsers ? "" : " dim"}`}
                onClick={() => commit("manageUsers", c.toastManageUsers)}
              >
                {c.savePermission}
              </button>
            </div>
            <p className="chint">{c.devMgmtHint}</p>
          </div>
        </section>
      ) : null}

      {/* Attendance permissions (owner/developer only) */}
      {canManagePermissions && !member.isSelf ? (
        <section className="ui-card p5">
          <h3 className="ctitle">{c.attnPermTitle}</h3>
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="roleform" style={{ alignItems: "stretch" }}>
              <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
                <span className="umeta__role" style={{ fontWeight: 800, color: "var(--ui-fg)" }}>
                  {c.payrollAdmin}
                </span>
              </span>
              <AdmDropdown
                options={permOptions}
                value={draft.payroll}
                onChange={(value) => setDraft((prev) => ({ ...prev, payroll: value }))}
                ariaLabel={c.payrollAdmin}
              />
              <button
                type="button"
                className={`ui-btn ui-btn--primary fw-black h10${draft.payroll !== committed.payroll ? "" : " dim"}`}
                onClick={() => commit("payroll", c.toastPayroll)}
              >
                {c.savePermission}
              </button>
            </div>
            <div className="roleform" style={{ alignItems: "stretch" }}>
              <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
                <span className="umeta__role" style={{ fontWeight: 800, color: "var(--ui-fg)" }}>
                  {c.leaveApprover}
                </span>
              </span>
              <AdmDropdown
                options={permOptions}
                value={draft.approver}
                onChange={(value) => setDraft((prev) => ({ ...prev, approver: value }))}
                ariaLabel={c.leaveApprover}
              />
              <button
                type="button"
                className={`ui-btn ui-btn--primary fw-black h10${draft.approver !== committed.approver ? "" : " dim"}`}
                onClick={() => commit("approver", c.toastApprover)}
              >
                {c.savePermission}
              </button>
            </div>
            <p className="chint">{c.attnPermHint}</p>
          </div>
        </section>
      ) : null}

      {/* Permission overrides (owner/developer only) */}
      {canManagePermissions && !member.isSelf ? (
        <section className="ui-card p5 ui-card--feature">
          <div className="permhead">
            <span className="permhead__ic">
              <span className="ic">
                <KeyRound />
              </span>
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h3 className="ctitle">{c.permTitle}</h3>
              <div className="chint" style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                <span className="ic" style={{ display: "inline-flex" }}>
                  <Lock style={{ width: 14, height: 14 }} />
                </span>
                {c.permSubline}
              </div>
            </div>
            <div style={{ flex: "0 0 auto" }}>
              {member.isSelf ? (
                <span className="selfnote">
                  <span className="ic">
                    <Info />
                  </span>
                  {c.permSelfBlocked}
                </span>
              ) : formOpen ? null : (
                <button
                  type="button"
                  className="ui-btn ui-btn--primary ui-btn--sm fw-black"
                  onClick={() => {
                    setFormOpen(true);
                    setRevoking(null);
                  }}
                >
                  <span className="ic">
                    <Plus />
                  </span>
                  {c.permGrant}
                </button>
              )}
            </div>
          </div>

          {!member.isSelf && formOpen ? (
            <div style={{ marginTop: 16 }}>
              <div className="grant">
                <div className="grant__t">{c.grantTitle}</div>
                <div className="gfield">
                  <label className="gfield__l">
                    {c.fieldKey}
                    <span className="req">*</span>
                  </label>
                  <AdmDropdown
                    options={keyOptions}
                    value={form.key}
                    onChange={(value) => setForm((prev) => ({ ...prev, key: value }))}
                    rich
                    wide
                    placeholder={c.fieldKeyPh}
                    ariaLabel={c.fieldKey}
                  />
                </div>
                <div className="gfield">
                  <label className="gfield__l">
                    {c.fieldExpires}
                    <span className="req">*</span>
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <AdminDatePicker
                        value={expDate}
                        onChange={(d) => setExpiry(d, expTime)}
                        min={nowLocal.slice(0, 10)}
                        localeTag={locale}
                        ariaLabel={c.fieldExpires}
                        placeholder={c.datePlaceholder}
                        labels={{ prevMonth: c.datePrev, nextMonth: c.dateNext, today: c.dateToday }}
                      />
                    </div>
                    <AdminTimePicker
                      value={expTime}
                      onChange={(t) => setExpiry(expDate, t)}
                      ariaLabel={c.fieldExpires}
                    />
                  </div>
                  <span className="gfield__hint">
                    <span className="ic">
                      <Info />
                    </span>
                    {c.fieldExpiresHint}
                  </span>
                </div>
                <div className="gfield">
                  <label className="gfield__l">
                    {c.fieldReason}
                    <span className="req">*</span>
                  </label>
                  <textarea
                    className="ui-textarea"
                    rows={2}
                    placeholder={c.fieldReasonPh}
                    value={form.reason}
                    onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))}
                  />
                </div>
                <div className="grant__foot">
                  <span className="sp" />
                  <button
                    type="button"
                    className="ui-btn ui-btn--secondary ui-btn--sm"
                    onClick={() => {
                      setFormOpen(false);
                      resetGrantForm();
                    }}
                  >
                    {c.cancel}
                  </button>
                  <button
                    type="button"
                    className={`ui-btn ui-btn--primary ui-btn--sm fw-black${formValid ? "" : " dim"}`}
                    onClick={submitGrant}
                  >
                    <span className="ic">
                      <Check />
                    </span>
                    {c.grantSubmit}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {overrides.length > 0 ? (
            <div className="ovlist" style={{ marginTop: 16 }}>
              {overrides.map((o) => {
                const meta = c.keys[o.key];
                return (
                  <div className="ov" key={o.id}>
                    <div className="ov__top">
                      <span className="ov__key">{o.key}</span>
                      <span className="ov__keylabel">{meta?.label ?? ""}</span>
                      <span className="ov__act">
                        <button type="button" className="revbtn" onClick={() => setRevoking(o.id)}>
                          <span className="ic">
                            <Power />
                          </span>
                          {c.ovRevokeBtn}
                        </button>
                      </span>
                    </div>
                    <div className="ov__reason">{o.reason}</div>
                    <div className="ov__meta">
                      <span className="ov__m">
                        <span className="k">{c.ovExpiry}</span>
                        {expBadge(o.expires)}
                      </span>
                      <span className="ov__m">
                        <span className="k">{c.ovGrantedBy}</span>
                        <span className="v">{o.by}</span>
                      </span>
                      <span className="ov__m">
                        <span className="k">{c.ovGrantedAt}</span>
                        <span className="v mono">{fmtDT(o.granted)}</span>
                      </span>
                    </div>
                    {revoking === o.id ? (
                      <div className="ovconfirm">
                        <span className="ovconfirm__t">{c.ovRevokeConfirm}</span>
                        <div className="ovconfirm__act">
                          <button
                            type="button"
                            className="ui-btn ui-btn--secondary ui-btn--sm"
                            onClick={() => setRevoking(null)}
                          >
                            {c.cancel}
                          </button>
                          <button
                            type="button"
                            className="ui-btn ui-btn--destructive ui-btn--sm"
                            onClick={() => doRevoke(o.id)}
                          >
                            <span className="ic">
                              <Check />
                            </span>
                            {c.confirmRevoke}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="ovempty">
              <span className="ovempty__ic">
                <span className="ic">
                  <ShieldCheck />
                </span>
              </span>
              <div className="ovempty__t">{c.permEmptyTitle}</div>
              <div className="ovempty__s">{c.permEmptyBody}</div>
            </div>
          )}
        </section>
      ) : null}

      {/* Danger zone — guarded hard delete (not for your own account) */}
      {!member.isSelf ? (
        <section className="ui-card p5">
          <h3 className="ctitle" style={{ color: "var(--ui-destructive)" }}>{c.deleteTitle}</h3>
          <p className="chint" style={{ marginTop: 6 }}>{c.deleteHint}</p>
          {deleteConfirming ? (
            <div className="ovconfirm" style={{ marginTop: 14 }}>
              <span className="ovconfirm__t">{c.deleteConfirm}</span>
              <div className="ovconfirm__act">
                <button
                  type="button"
                  className="ui-btn ui-btn--secondary ui-btn--sm"
                  onClick={() => setDeleteConfirming(false)}
                >
                  {c.cancel}
                </button>
                <button type="button" className="ui-btn ui-btn--destructive ui-btn--sm" onClick={doDelete}>
                  <span className="ic">
                    <Trash2 />
                  </span>
                  {c.deleteBtn}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 14 }}>
              <button
                type="button"
                className="ui-btn ui-btn--destructive ui-btn--sm"
                onClick={() => setDeleteConfirming(true)}
              >
                <span className="ic">
                  <Trash2 />
                </span>
                {c.deleteBtn}
              </button>
            </div>
          )}
        </section>
      ) : null}

      <div className="toastlayer">
        {toast ? (
          <div className={`toast toast--${toast.kind} on`} role="status">
            <span className="ic">{toast.kind === "danger" ? <Power /> : <Check />}</span>
            {toast.msg}
          </div>
        ) : null}
      </div>
    </div>
  );
}
