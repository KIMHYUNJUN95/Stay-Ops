/** PostgREST / Supabase errors when notifications DDL is not applied yet. */
export function isNotificationsTableUnavailable(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("could not find the table") ||
    normalized.includes("schema cache") ||
    normalized.includes("does not exist") ||
    (normalized.includes("relation") && normalized.includes("notifications"))
  );
}
