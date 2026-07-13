/**
 * Permission override whitelist — the closed set of `permission_key`s that owner/developer may grant
 * as a time-bound, per-user exception on top of a role (see
 * `docs/product/27-permission-override-workflow.md` and migration
 * `202607090002_membership_permission_overrides.sql`).
 *
 * This is the single source of truth for validation (server actions reject any key not in this list)
 * and for UI ordering. Human labels/descriptions live in i18n (`admin.users.console.keys`), keyed by
 * these same strings. Each key is adopted into a feature's RLS/server gate separately, by adding
 * `OR public.has_permission_override(org, user, '<key>')` next to that feature's existing role check.
 */
export const PERMISSION_OVERRIDE_KEYS = [
  "order_processor",
  "maintenance_status_change",
  "property_room_manage",
  "can_generate_report",
] as const;

export type PermissionOverrideKey = (typeof PERMISSION_OVERRIDE_KEYS)[number];

export function isPermissionOverrideKey(value: string): value is PermissionOverrideKey {
  return (PERMISSION_OVERRIDE_KEYS as readonly string[]).includes(value);
}
