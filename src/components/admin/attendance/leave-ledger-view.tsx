"use client";

import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import type { LeaveStatus, LeaveType } from "@/lib/annual-leave-approvals-server";
import type { LeaveLedgerEntry } from "@/lib/annual-leave-admin-server";
import { getDictionary, type Dictionary, type Locale } from "@/lib/i18n";

type Lc = Dictionary["admin"]["leaveConsole"];

function roleLabel(role: string | null, dictionary: Dictionary): string {
  if (!role) return "—";
  const map = dictionary.roles as Record<string, string>;
  return map[role] ?? role;
}

function typeBadgeClass(type: LeaveType): string {
  switch (type) {
    case "paid":
      return "typebadge--paid";
    case "annual":
      return "typebadge--annual";
    case "special":
      return "typebadge--special";
    default:
      return "typebadge--other";
  }
}

function typeLabel(type: LeaveType, lc: Lc): string {
  switch (type) {
    case "paid":
      return lc.typePaid;
    case "annual":
      return lc.typeAnnual;
    case "special":
      return lc.typeSpecial;
    default:
      return lc.typeOther;
  }
}

function statusPill(status: LeaveStatus, lc: Lc): { label: string; cls: string } {
  switch (status) {
    case "requested":
      return { label: lc.statusRequested, cls: "pill--warn" };
    case "approved":
      return { label: lc.statusApproved, cls: "pill--done" };
    case "rejected":
      return { label: lc.statusRejected, cls: "pill--danger" };
    case "cancelled":
      return { label: lc.statusCancelled, cls: "pill--muted" };
  }
}

function fmtMd(iso: string): string {
  return iso.slice(5).replace("-", "/");
}

function fmtPeriod(e: LeaveLedgerEntry, lc: Lc): string {
  const s = fmtMd(e.startDate);
  const end = fmtMd(e.endDate);
  const base = s === end ? s : `${s} – ${end}`;
  if (e.durationUnit === "am") return `${base} · ${lc.durationAm}`;
  if (e.durationUnit === "pm") return `${base} · ${lc.durationPm}`;
  return base;
}

const STATUS_ORDER: LeaveStatus[] = ["approved", "requested", "rejected", "cancelled"];

/** RFC-4180-ish CSV cell (quote when needed, escape inner quotes). */
function csvCell(value: string | number): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function LeaveLedgerView({
  lc,
  locale,
  entries,
}: {
  lc: Lc;
  locale: Locale;
  entries: LeaveLedgerEntry[];
}) {
  const dictionary = getDictionary(locale);
  const [statusFilter, setStatusFilter] = useState<LeaveStatus | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (statusFilter && e.status !== statusFilter) return false;
      if (q) {
        const hay = `${e.applicantName} ${e.reason} ${e.documentNumber ?? ""} ${e.processorName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, statusFilter, query]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of entries) c[e.status] = (c[e.status] ?? 0) + 1;
    return c;
  }, [entries]);

  function exportCsv() {
    const headers = [
      lc.ledgerColProcessedAt,
      lc.ledgerColDocNo,
      lc.ledgerColApplicant,
      lc.approversColRole,
      lc.ledgerColType,
      lc.formStart,
      lc.formEnd,
      lc.ledgerColDays,
      lc.ledgerColStatus,
      lc.ledgerColProcessor,
      lc.formReason,
      lc.ledgerColDecisionReason,
    ];
    const lines = filtered.map((e) =>
      [
        e.processedAt,
        e.documentNumber ?? "",
        e.applicantName,
        roleLabel(e.applicantRole, dictionary),
        typeLabel(e.leaveType, lc),
        e.startDate,
        e.endDate,
        e.daysCount,
        statusPill(e.status, lc).label,
        e.processorName ?? "",
        e.reason,
        e.decisionReason ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
    const csv = `﻿${headers.map(csvCell).join(",")}\n${lines.join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = lc.ledgerExportFilename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="toolbar">
        <div className="fseg" role="tablist">
          <button
            type="button"
            className={statusFilter === null ? "on" : ""}
            onClick={() => setStatusFilter(null)}
          >
            {lc.ledgerFilterAll}
            <span className="cnt">{entries.length}</span>
          </button>
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              className={statusFilter === s ? "on" : ""}
              onClick={() => setStatusFilter(s)}
            >
              {statusPill(s, lc).label}
              <span className="cnt">{counts[s] ?? 0}</span>
            </button>
          ))}
        </div>
        <span className="toolbar__spacer" />
        <div className="qsearch">
          <span className="ic">
            <Search />
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={lc.ledgerSearchPlaceholder}
            aria-label={lc.ledgerSearchPlaceholder}
          />
        </div>
        <button type="button" className="chipbtn" onClick={exportCsv} disabled={filtered.length === 0}>
          <span className="ic">
            <Download />
          </span>
          {lc.ledgerExportBtn}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <div className="state">
            <span className="state__ic empty">
              <span className="ic">
                <Search />
              </span>
            </span>
            <div className="state__t">{lc.ledgerEmptyTitle}</div>
            <div className="state__s">{lc.ledgerEmptyBody}</div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="qtbl">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 16 }}>{lc.ledgerColApplicant}</th>
                  <th>{lc.ledgerColType}</th>
                  <th>{lc.ledgerColPeriod}</th>
                  <th style={{ textAlign: "right" }}>{lc.ledgerColDays}</th>
                  <th>{lc.ledgerColStatus}</th>
                  <th>{lc.ledgerColProcessor}</th>
                  <th>{lc.ledgerColProcessedAt}</th>
                  <th>{lc.ledgerColDocNo}</th>
                  <th>{lc.ledgerColReason}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const pill = statusPill(e.status, lc);
                  return (
                    <tr key={e.id}>
                      <td style={{ paddingLeft: 16 }}>
                        <div className="who">
                          <span className="avatar" style={{ background: e.applicantBg, color: "#fff" }}>
                            {e.applicantInitial}
                          </span>
                          <div>
                            <div className="who__nm">{e.applicantName}</div>
                            <div className="who__sub">{roleLabel(e.applicantRole, dictionary)}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`typebadge ${typeBadgeClass(e.leaveType)}`}>{typeLabel(e.leaveType, lc)}</span>
                      </td>
                      <td className="mono">{fmtPeriod(e, lc)}</td>
                      <td className="mono" style={{ textAlign: "right" }}>
                        {lc.daysUnit(e.daysCount)}
                      </td>
                      <td>
                        <span className={`pill ${pill.cls}`}>{pill.label}</span>
                      </td>
                      <td>{e.processorName ?? <span className="dim-cell">—</span>}</td>
                      <td className="dim-cell mono">{e.processedAt}</td>
                      <td className="dim-cell mono">{e.documentNumber ?? "—"}</td>
                      <td className="dim-cell" style={{ maxWidth: 220 }}>
                        <span
                          title={
                            e.decisionReason
                              ? `${lc.formReason}: ${e.reason} / ${lc.ledgerColDecisionReason}: ${e.decisionReason}`
                              : e.reason
                          }
                          style={{
                            display: "block",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {e.decisionReason
                            ? `${lc.ledgerColDecisionReason}: ${e.decisionReason}`
                            : e.reason}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
