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
