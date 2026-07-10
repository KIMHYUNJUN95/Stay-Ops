import type { Dictionary } from "@/lib/i18n";
import type { TransportReportStatus } from "@/lib/transport-reimbursement";

type Att = Dictionary["admin"]["attendanceConsole"];

export function formatAdminYen(n: number, localeTag: string): string {
  return new Intl.NumberFormat(localeTag).format(n);
}

export function formatOptionalAdminYen(n: number | null, localeTag: string): string {
  return n == null ? "—" : formatAdminYen(n, localeTag);
}

export function downloadAdminBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}

export function downloadAdminWorkbook(base64: string, filename: string) {
  const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  downloadAdminBlob(
    new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename,
  );
}

export function adminTransportStatusPill(
  status: TransportReportStatus | "none",
  c: Att,
): { label: string; cls: string } {
  switch (status) {
    case "draft":
      return { label: c.trStatusDraft, cls: "pill--muted" };
    case "submitted":
      return { label: c.trStatusSubmitted, cls: "pill--info" };
    case "reviewing":
      return { label: c.trStatusReviewing, cls: "pill--warn" };
    case "approved":
      return { label: c.trStatusApproved, cls: "pill--done" };
    case "rejected":
      return { label: c.trStatusRejected, cls: "pill--muted" };
    case "changes_requested":
      return { label: c.trStatusChangesRequested, cls: "pill--warn" };
    default:
      return { label: c.trStatusNone, cls: "pill--muted" };
  }
}
