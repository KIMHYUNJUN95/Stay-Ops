"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Search } from "lucide-react";
import "@/components/admin/users-console.css";
import { AdmDropdown, type AdmOption } from "../shared/adm-dropdown";
import { setMemberRole, setMemberStatus } from "@/app/admin/users/actions";
import { organizationRoles } from "@/config/roles";
import { getDictionary, type Locale } from "@/lib/i18n";

export type DirectoryMemberVM = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  joinedAt: string | null;
  isSelf: boolean;
  isDeveloper: boolean;
  teamKind: string | null;
};

export function UsersDirectoryClient({
  members,
  orgName,
  locale,
}: {
  members: DirectoryMemberVM[];
  orgName: string;
  locale: Locale;
}) {
  const router = useRouter();
  const dictionary = getDictionary(locale);
  const u = dictionary.admin.users;
  const c = u.console;

  const roleLabel = (role: string) =>
    (dictionary.roles as Record<string, string>)[role] ?? role;
  // Status is a two-state active/inactive concept on this screen (inactive fully disables the account).
  const statusLabel = (status: string) => (status === "active" ? c.statusActive : c.statusInactive);

  const roleOptions: AdmOption[] = organizationRoles.map((role) => ({
    value: role,
    label: roleLabel(role),
  }));
  // Saving 비활성 writes "suspended" (the canonical inactive status + auth ban); filtering uses the
  // active/inactive concept (inactive = any non-active status).
  const statusSetOptions: AdmOption[] = [
    { value: "active", label: c.statusActive },
    { value: "suspended", label: c.statusInactive },
  ];
  const statusFilterOptions: AdmOption[] = [
    { value: "active", label: c.statusActive },
    { value: "inactive", label: c.statusInactive },
  ];
  const teamFilterOptions: AdmOption[] = [
    { value: "field", label: c.teamFieldOption },
    { value: "office", label: c.teamOfficeOption },
  ];
  const teamLabel = (kind: string | null) =>
    kind === "field" ? c.teamFieldOption : kind === "office" ? c.teamOfficeOption : "—";
  const normStatus = (status: string) => (status === "active" ? "active" : "suspended");

  const [query, setQuery] = useState("");
  const [fRole, setFRole] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fTeam, setFTeam] = useState("");
  // Local prototype state — committed values start from the server data; saving commits the draft
  // locally and toasts. Real persistence is wired after design confirmation.
  const [committed, setCommitted] = useState<Record<string, { role: string; status: string }>>(
    () => Object.fromEntries(members.map((m) => [m.membershipId, { role: m.role, status: normStatus(m.status) }])),
  );
  const [drafts, setDrafts] = useState<Record<string, { role: string; status: string }>>(
    () => Object.fromEntries(members.map((m) => [m.membershipId, { role: m.role, status: normStatus(m.status) }])),
  );
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null);
  const toastSeq = useRef(0);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);
  const showToast = (msg: string) => setToast({ id: (toastSeq.current += 1), msg });

  const formatJoined = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(
          new Date(value),
        )
      : "—";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((m) => {
      const matchesQuery =
        q.length === 0 || [m.name, m.email, m.phone].join(" ").toLowerCase().includes(q);
      const matchesRole = !fRole || m.role === fRole;
      const matchesStatus =
        !fStatus || (fStatus === "active" ? m.status === "active" : m.status !== "active");
      const matchesTeam = !fTeam || m.teamKind === fTeam;
      return matchesQuery && matchesRole && matchesStatus && matchesTeam;
    });
  }, [members, query, fRole, fStatus, fTeam]);

  const [, startTransition] = useTransition();

  const errMsg = (code?: string) => {
    switch (code) {
      case "forbidden":
        return c.errForbidden;
      case "self_update_blocked":
        return u.errors.self_update_blocked;
      default:
        return c.errSaveFailed;
    }
  };

  const setDraft = (id: string, patch: Partial<{ role: string; status: string }>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const save = (id: string, kind: "role" | "status") => {
    const value = drafts[id][kind];
    startTransition(async () => {
      const res = kind === "role" ? await setMemberRole(id, value) : await setMemberStatus(id, value);
      if (res.ok) {
        setCommitted((prev) => ({ ...prev, [id]: { ...prev[id], [kind]: value } }));
        showToast(kind === "role" ? c.toastRole : c.toastStatus);
      } else {
        showToast(errMsg(res.error));
      }
    });
  };

  return (
    <>
      <div className="pagehead">
        <div className="pagehead__l">
          <div className="pagehead__lede">{u.description}</div>
          <div className="pagehead__org">
            {u.currentOrganization}: <b>{orgName}</b>
          </div>
        </div>
        <div className="pagehead__count">
          <b>{members.length}</b>
          <span>{c.memberUnit}</span>
        </div>
      </div>

      <div className="filterbar">
        <div className="filterbar__search">
          <span className="ic">
            <Search />
          </span>
          <input
            type="search"
            placeholder={c.searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <AdmDropdown
          options={[{ value: "", label: c.filterAllRoles }, ...roleOptions]}
          value={fRole}
          onChange={setFRole}
          placeholder={u.role}
          ariaLabel={u.role}
        />
        <AdmDropdown
          options={[{ value: "", label: c.filterAllStatuses }, ...statusFilterOptions]}
          value={fStatus}
          onChange={setFStatus}
          placeholder={u.status}
          ariaLabel={u.status}
        />
        <AdmDropdown
          options={[{ value: "", label: c.filterAllTeams }, ...teamFilterOptions]}
          value={fTeam}
          onChange={setFTeam}
          placeholder={c.teamField}
          ariaLabel={c.teamField}
        />
        <button type="button" className="filterbar__go" aria-label={c.searchPlaceholder}>
          <span className="ic">
            <Search />
          </span>
        </button>
      </div>

      <div className="utable">
        <div className="utable__scroll">
          <table>
            <thead>
              <tr>
                <th>{u.name}</th>
                <th>{u.email}</th>
                <th>{u.phone}</th>
                <th>{u.role}</th>
                <th>{c.teamField}</th>
                <th>{u.status}</th>
                <th>{u.joinedAt}</th>
                <th>{u.actions}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const draft = drafts[m.membershipId];
                const base = committed[m.membershipId];
                const roleDirty = draft.role !== base.role;
                const statusDirty = draft.status !== base.status;
                const initial = m.name.replace(/\(.*\)/, "").trim().charAt(0) || "?";
                const open = () => router.push(`/admin/users/${m.membershipId}`);
                return (
                  <tr
                    key={m.membershipId}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest(".uacts")) return;
                      open();
                    }}
                  >
                    <td>
                      <div className="urow__name">
                        <span className="urow__av">{initial}</span>
                        <span style={{ minWidth: 0 }}>
                          <span className="urow__nm">{m.name}</span>
                          {m.isSelf ? <span className="urow__self">{c.selfChip}</span> : null}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="ucell">{m.email}</span>
                    </td>
                    <td>
                      <span className="ucell mono">{m.phone || "—"}</span>
                    </td>
                    <td>
                      <span className="ucell role">{m.isDeveloper ? c.devRole : roleLabel(m.role)}</span>
                    </td>
                    <td>
                      <span className="ucell">{teamLabel(m.teamKind)}</span>
                    </td>
                    <td>
                      <span className={`spill spill--${m.status === "active" ? "active" : "removed"}`}>
                        <span className="d" />
                        {statusLabel(m.status)}
                      </span>
                    </td>
                    <td>
                      <span className="ucell date">{formatJoined(m.joinedAt)}</span>
                    </td>
                    <td>
                      {m.isSelf ? (
                        <span className="ucell" style={{ color: "var(--faint)" }}>—</span>
                      ) : (
                      <div className="uacts">
                        <div className="uact">
                          <AdmDropdown
                            options={roleOptions}
                            value={draft.role}
                            onChange={(value) => setDraft(m.membershipId, { role: value })}
                            size="sm"
                            ariaLabel={u.role}
                          />
                          <button
                            type="button"
                            className={`uact__save${roleDirty ? " dirty" : ""}`}
                            onClick={() => save(m.membershipId, "role")}
                          >
                            {roleDirty ? (
                              <span className="ic">
                                <Check />
                              </span>
                            ) : null}
                            {u.saveRole}
                          </button>
                        </div>
                        <div className="uact">
                          <AdmDropdown
                            options={statusSetOptions}
                            value={draft.status}
                            onChange={(value) => setDraft(m.membershipId, { status: value })}
                            size="sm"
                            ariaLabel={u.status}
                          />
                          <button
                            type="button"
                            className={`uact__save${statusDirty ? " dirty" : ""}`}
                            onClick={() => save(m.membershipId, "status")}
                          >
                            {statusDirty ? (
                              <span className="ic">
                                <Check />
                              </span>
                            ) : null}
                            {u.saveStatus}
                          </button>
                        </div>
                      </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="toastlayer">
        {toast ? (
          <div className="toast toast--ok on" role="status">
            <span className="ic">
              <Check />
            </span>
            {toast.msg}
          </div>
        ) : null}
      </div>
    </>
  );
}
