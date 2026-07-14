// Shared display helpers for the admin cleaning console — status/type icon+label lookups and small
// reusable pieces (status pill, staff avatar, report badges) used by both the today board, history
// board, and detail panel so the three stay visually identical.
import type { ComponentType, SVGProps } from "react";
import {
  BedDouble,
  Check,
  Clock,
  LogOut,
  Moon,
  PackageSearch,
  SprayCan,
  Wrench,
  Zap,
} from "lucide-react";
import type { Dictionary, Locale } from "@/lib/i18n";
import type { AdminCleaningStatus } from "@/lib/admin-cleaning";
import type { CleaningStaffOption } from "@/lib/cleaning";
import type { CleaningTaskType } from "./cleaning-console-data";

export type ConsoleCopy = Dictionary["cleaning"]["console"];
type IconType = ComponentType<SVGProps<SVGSVGElement>>;

export const TYPE_ICON: Record<CleaningTaskType, IconType> = {
  checkout: LogOut,
  simple: Zap,
  longstay: Moon,
  setup: BedDouble,
};

export const STATUS_ICON: Record<AdminCleaningStatus, IconType> = {
  pending: Clock,
  progress: SprayCan,
  done: Check,
};

export function typeLabel(type: CleaningTaskType, t: ConsoleCopy): string {
  if (type === "checkout") return t.tyCheckout;
  if (type === "simple") return t.tySimple;
  if (type === "longstay") return t.tyLongstay;
  return t.tySetup;
}

export function statusLabel(status: AdminCleaningStatus, t: ConsoleCopy): string {
  if (status === "pending") return t.stPending;
  if (status === "progress") return t.stProgress;
  return t.stDone;
}

export function StatusPill({ status, t }: { status: AdminCleaningStatus; t: ConsoleCopy }) {
  const Icon = STATUS_ICON[status];
  const showIcon = status === "pending";
  return (
    <span className={`cstat cstat--${status}`}>
      {showIcon ? (
        <span className="ic">
          <Icon />
        </span>
      ) : (
        <span className="d" />
      )}
      {statusLabel(status, t)}
    </span>
  );
}

/* ---------------- staff directory ----------------
   Real staff have one plain name (no per-locale variants like the old mock) and no stored avatar
   color, so the avatar color is derived deterministically from the user id — same person always
   gets the same color across a session without needing a DB column for it. */

export type StaffDirectoryEntry = { id: string; name: string; bg: string };
export type StaffDirectory = Map<string, StaffDirectoryEntry>;

const AVATAR_PALETTE = [
  "#3f7d5a",
  "#4d6db5",
  "#557a8a",
  "#a86b3c",
  "#8a5cc7",
  "#c9587c",
  "#b08d2e",
  "#3f8f8f",
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function avatarColorFor(id: string): string {
  return AVATAR_PALETTE[hashString(id) % AVATAR_PALETTE.length];
}

export function buildStaffDirectory(staff: readonly CleaningStaffOption[]): StaffDirectory {
  return new Map(staff.map((s) => [s.id, { id: s.id, name: s.name, bg: avatarColorFor(s.id) }]));
}

export function staffLabelOf(id: string | null, directory: StaffDirectory): string {
  if (!id) return "";
  return directory.get(id)?.name ?? "";
}

export function StaffAvatar({
  staffId,
  directory,
  className = "rmc__av",
}: {
  staffId: string | null;
  directory: StaffDirectory;
  className?: string;
}) {
  const entry = staffId ? directory.get(staffId) : null;
  return (
    <span className={className} style={{ background: entry ? entry.bg : "var(--surface)" }}>
      {entry ? entry.name.slice(0, 1) : "?"}
    </span>
  );
}

export function ReportBadges({
  reports,
  t,
}: {
  reports: { lost?: number; issue?: number } | null;
  t: ConsoleCopy;
}) {
  if (!reports) return null;
  return (
    <>
      {reports.lost ? (
        <span className="rbadge rbadge--lost" title={t.lost}>
          <span className="ic">
            <PackageSearch />
          </span>
          {reports.lost}
        </span>
      ) : null}
      {reports.issue ? (
        <span className="rbadge rbadge--issue" title={t.issue}>
          <span className="ic">
            <Wrench />
          </span>
          {reports.issue}
        </span>
      ) : null}
    </>
  );
}

export function localeTagOf(locale: Locale): string {
  return locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US";
}

/** Localized building label with a raw-name fallback for rooms that didn't resolve to one of the
 * 7 canonical buildings (unmatched room labels — see admin-cleaning.ts). */
export function buildingLabelOf(
  item: { building: string | null; buildingRaw: string },
  buildingLabels: Record<string, string>,
): string {
  return (item.building ? buildingLabels[item.building] : null) ?? item.buildingRaw;
}
