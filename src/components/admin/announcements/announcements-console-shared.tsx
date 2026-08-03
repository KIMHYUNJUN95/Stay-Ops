"use client";

// Admin 공지 관리 콘솔 — shared atoms + formatters used across the list, detail
// panel, form / confirm / read modals. Ported from the Claude Design handoff
// (announce-views.js shared atoms). See docs/product/11-announcement-workflow.md.
import type { ReactNode } from "react";
import {
  Archive,
  Image as ImageIcon,
  Megaphone,
  Pin,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import type { AnnouncementConsoleDictionary } from "@/lib/announcement-i18n";
import type { Locale } from "@/lib/i18n";
import type { OrganizationRole } from "@/config/roles";
import type { AdminAnnouncementVM } from "@/lib/admin-announcements";

export type AnnCopy = AnnouncementConsoleDictionary;
export type RoleLabel = (role: OrganizationRole) => string;
export type AnnStatus = "draft" | "published" | "archived";

const AVATAR_PALETTE = [
  "var(--adm-primary)",
  "#3f7d5a",
  "#9c5a2c",
  "#6b5aa8",
  "#2f7d63",
  "#b5564d",
];

export function Ic({ children }: { children: ReactNode }) {
  return <span className="ic">{children}</span>;
}

export function tpl(text: string, value: number | string): string {
  return text.replace(/\{[a-z]\}/i, String(value));
}

export function tpl2(
  text: string,
  a: number | string,
  b: number | string,
): string {
  return text.replace("{d}", String(a)).replace("{r}", String(b));
}

export function avatarColor(name: string): string {
  let sum = 0;
  for (let i = 0; i < name.length; i += 1) sum += name.charCodeAt(i);
  return AVATAR_PALETTE[sum % AVATAR_PALETTE.length]!;
}

export function initial(name: string): string {
  return (name || "?").trim().charAt(0) || "?";
}

// ── Tokyo operating-time formatters ────────────────────────────────────────
// Every timestamp on an announcement row (`published_at` / `archived_at` /
// `popup_until` / `updated_at`) is stored as a UTC instant. The mobile surface
// renders and groups them in Asia/Tokyo (see docs/product/11-announcement-workflow.md
// → "공지는 Tokyo 시간 기준 published_at 날짜로 그룹핑된다"), so the admin console
// must do the same — slicing the raw ISO string would show the UTC wall clock and
// drift a full day for anything published before 09:00 JST.
// Same pattern as `tokyoDateKey` / `tokyoStamp` in `src/lib/admin-orders.ts`.
const TOKYO_TZ = "Asia/Tokyo";

type TokyoParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
};

function tokyoParts(iso: string): TokyoParts | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TOKYO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    // Some ICU builds emit "24" for midnight with hour12:false — normalize it.
    hour: get("hour") === "24" ? "00" : get("hour"),
    minute: get("minute"),
  };
}

/** "YYYY-MM-DD" in Tokyo. Used to seed date inputs from a stored UTC instant. */
export function tokyoDateKey(iso: string | null): string {
  const parts = iso ? tokyoParts(iso) : null;
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : "";
}

/** "HH:mm" (24h) in Tokyo. Used to seed time inputs from a stored UTC instant. */
export function tokyoTimeHm(iso: string | null): string {
  const parts = iso ? tokyoParts(iso) : null;
  return parts ? `${parts.hour}:${parts.minute}` : "";
}

/** "M.DD" in Tokyo — the dense list-column date. */
export function fmtDateShort(iso: string | null): string {
  const parts = iso ? tokyoParts(iso) : null;
  if (!parts) return "—";
  return `${Number(parts.month)}.${parts.day}`;
}

export function fmtDateLong(iso: string | null, locale: Locale): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    timeZone: TOKYO_TZ,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** "M.DD HH:mm" in Tokyo. */
export function fmtDateTime(iso: string | null): string {
  const parts = iso ? tokyoParts(iso) : null;
  if (!parts) return "—";
  return `${Number(parts.month)}.${parts.day} ${parts.hour}:${parts.minute}`;
}

/** "YYYY-MM-DD HH:mm" in Tokyo — the detail panel's monospace stamp. */
export function fmtStamp(iso: string | null): string {
  const parts = iso ? tokyoParts(iso) : null;
  if (!parts) return "—";
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export function targetLabel(
  a: Pick<AdminAnnouncementVM, "targetScope" | "targetRoles">,
  t: AnnCopy,
  roleLabel: RoleLabel,
): string {
  if (a.targetScope === "everyone") return t.everyone;
  const names = a.targetRoles.map(roleLabel);
  if (names.length <= 2) return names.join(" · ");
  return `${names[0]} ${tpl(t.targetMore, names.length - 1)}`;
}

const STATUS_META: Record<AnnStatus, { icon: ReactNode; cls: string }> = {
  draft: { icon: <Sparkles aria-hidden="true" />, cls: "draft" },
  published: { icon: <Megaphone aria-hidden="true" />, cls: "published" },
  archived: { icon: <Archive aria-hidden="true" />, cls: "archived" },
};

export function StatusPill({ status, t }: { status: AnnStatus; t: AnnCopy }) {
  const meta = STATUS_META[status];
  const label =
    status === "draft" ? t.stDraft : status === "published" ? t.stPublished : t.stArchived;
  return (
    <span className={`cstat cstat--${meta.cls}`}>
      <Ic>{meta.icon}</Ic>
      {label}
    </span>
  );
}

export function FlagChips({ a, t }: { a: AdminAnnouncementVM; t: AnnCopy }) {
  const chips: ReactNode[] = [];
  if (a.isImportant)
    chips.push(
      <span className="aflag aflag--imp" title={t.flImportant} key="imp">
        <Ic>
          <ShieldAlert aria-hidden="true" />
        </Ic>
      </span>,
    );
  if (a.isPinned)
    chips.push(
      <span className="aflag aflag--pin" title={t.flPinned} key="pin">
        <Ic>
          <Pin aria-hidden="true" />
        </Ic>
      </span>,
    );
  if (a.popup)
    chips.push(
      <span
        className={`aflag aflag--popup${a.isPopupActive ? "" : " is-off"}`}
        title={a.isPopupActive ? t.flPopup : t.flPopupOff}
        key="popup"
      >
        <Ic>
          <Megaphone aria-hidden="true" />
        </Ic>
      </span>,
    );
  if (a.images.length > 0)
    chips.push(
      <span className="aflag aflag--img" title={tpl(t.flImage, a.images.length)} key="img">
        <Ic>
          <ImageIcon aria-hidden="true" />
        </Ic>
      </span>,
    );
  if (chips.length === 0) return null;
  return <span className="aflags">{chips}</span>;
}

export function TargetChip({
  a,
  t,
  roleLabel,
}: {
  a: AdminAnnouncementVM;
  t: AnnCopy;
  roleLabel: RoleLabel;
}) {
  const everyone = a.targetScope === "everyone";
  return (
    <span className={`an-target${everyone ? " everyone" : ""}`}>
      <Ic>{everyone ? <Megaphone aria-hidden="true" /> : <Users aria-hidden="true" />}</Ic>
      {targetLabel(a, t, roleLabel)}
    </span>
  );
}

export function AuthorCell({ name }: { name: string }) {
  return (
    <span className="who">
      <span className="who__av" style={{ background: avatarColor(name) }}>
        {initial(name)}
      </span>
      <span className="who__nm">{name || "—"}</span>
    </span>
  );
}
