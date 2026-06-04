/**
 * Error keys raised by the join_organization_with_invite_code RPC that map
 * directly to i18n error keys the onboarding page can display.
 * Any RPC error NOT in this set is mapped to `invite_join_failed`.
 */
export const INVITE_ERROR_KEYS = new Set([
  "missing_invite",
  "invalid_invite",
  "invite_inactive",
  "invite_expired",
  "invite_maxed",
  "membership_blocked",
]);

export function resolveInviteRpcError(message: string): string {
  return INVITE_ERROR_KEYS.has(message) ? message : "invite_join_failed";
}
