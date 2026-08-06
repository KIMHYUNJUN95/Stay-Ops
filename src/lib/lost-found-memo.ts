const ADMIN_RESTORE_MARKER = "[stayops:admin_restore]";
const LEGACY_ADMIN_RESTORE_LABEL = "\uAD00\uB9AC\uC790 \uBCF5\uC6D0";

export function appendAdminRestoreMemo(previousMemo: string, reason: string): string {
  const trimmedReason = reason.trim();
  const entry = trimmedReason ? `${ADMIN_RESTORE_MARKER} ${trimmedReason}` : ADMIN_RESTORE_MARKER;
  return previousMemo ? `${previousMemo}\n${entry}` : entry;
}

export function localizeLostFoundMemo(memo: string | null, adminRestoreLabel: string): string | null {
  if (!memo) return null;

  return memo
    .split("\n")
    .map((line) => {
      if (line === ADMIN_RESTORE_MARKER) return adminRestoreLabel;
      if (line.startsWith(`${ADMIN_RESTORE_MARKER} `)) {
        return `${adminRestoreLabel}: ${line.slice(ADMIN_RESTORE_MARKER.length + 1)}`;
      }
      if (line === LEGACY_ADMIN_RESTORE_LABEL) return adminRestoreLabel;
      if (line.startsWith(`${LEGACY_ADMIN_RESTORE_LABEL}: `)) {
        return `${adminRestoreLabel}: ${line.slice(LEGACY_ADMIN_RESTORE_LABEL.length + 2)}`;
      }
      return line;
    })
    .join("\n");
}
