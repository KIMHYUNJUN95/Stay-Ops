export const platformRoles = ["developer_super_admin"] as const;

export const organizationRoles = [
  "owner",
  "office_admin",
  "cs_staff",
  "field_manager",
  "staff",
  "part_time_staff",
] as const;

export const roles = [...platformRoles, ...organizationRoles] as const;

export type PlatformRole = (typeof platformRoles)[number];
export type OrganizationRole = (typeof organizationRoles)[number];
export type Role = (typeof roles)[number];

export const adminWebRoles = [
  "developer_super_admin",
  "owner",
  "office_admin",
  "cs_staff",
] as const satisfies readonly Role[];

export const fieldModeRoles = [
  "field_manager",
  "staff",
  "part_time_staff",
] as const satisfies readonly Role[];

export const fieldOperationRoles = [
  "owner",
  ...fieldModeRoles,
] as const satisfies readonly Role[];

export function canAccessAdminWeb(role: Role) {
  return (adminWebRoles as readonly Role[]).includes(role);
}

export function canSwitchToFieldMode(role: Role) {
  return role !== "staff" && role !== "part_time_staff";
}

export function canAccessFieldOperations(role: Role) {
  return (fieldOperationRoles as readonly Role[]).includes(role);
}

/**
 * Manager/office roles that may view OTHER people's cleaning records in the app (and the admin web).
 * Mirrors the `cleaning_sessions` RLS read policy (own OR these roles). Regular `staff` and
 * `part_time_staff` see only their own records.
 */
export const cleaningRecordViewerRoles = [
  "developer_super_admin",
  "owner",
  "office_admin",
  "cs_staff",
  "field_manager",
] as const satisfies readonly Role[];

export function canViewOthersCleaning(role: Role) {
  return (cleaningRecordViewerRoles as readonly Role[]).includes(role);
}

/**
 * All org members may view the attendance roster (who is at work today).
 * Separate from cleaningRecordViewerRoles — roster is not a privileged view.
 */
export const rosterViewerRoles = roles as readonly Role[];

export function canViewRoster(): boolean {
  return true;
}

/**
 * Whether a user may generate the daily work-report (Todo 완료/기록 tab).
 *
 * Staff-only feature: every regular staff member qualifies (any role except `part_time_staff`),
 * and individual part-timers can be granted access via the per-user `can_generate_report` flag
 * (toggled by owner/office_admin in admin user management). This keeps the few part-timers who work
 * in a management capacity covered without promoting their role.
 */
export function canGenerateDailyReport(role: Role, reportFlag: boolean): boolean {
  return role !== "part_time_staff" || reportFlag;
}

/**
 * The 5 user-facing invite categories shown during onboarding.
 * Each maps to a single DB organization_role slug.
 * cs_staff is not exposed as a direct invite category (admin-assigned only).
 */
export const INVITE_CATEGORIES = [
  "part_time_staff",
  "office_staff",
  "field_staff",
  "part_time_manager",
  "owner",
] as const;

export type InviteCategory = (typeof INVITE_CATEGORIES)[number];

export const inviteCategoryToRole: Record<InviteCategory, OrganizationRole> = {
  part_time_staff: "part_time_staff",
  office_staff: "office_admin",
  field_staff: "staff",
  part_time_manager: "field_manager",
  owner: "owner",
};

export const roleToInviteCategory: Partial<Record<OrganizationRole, InviteCategory>> = {
  part_time_staff: "part_time_staff",
  office_admin: "office_staff",
  staff: "field_staff",
  field_manager: "part_time_manager",
  owner: "owner",
};
