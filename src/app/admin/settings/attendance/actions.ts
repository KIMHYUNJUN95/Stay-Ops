"use server";

import { redirect } from "next/navigation";
import {
  createAttendanceSite,
  getActiveQrToken,
  getAttendanceSite,
  issueAttendanceQr,
  updateAttendanceSite,
} from "@/lib/attendance-sites";
import { revokeTrustedDevice } from "@/lib/attendance-trusted-device";
import { requireAdminSession } from "@/lib/admin-session";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { hasOrganizationContext } from "@/lib/session";
import { isOrgTopAdminOrPlatform } from "@/config/roles";

function parseText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function parseNumberField(value: string) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

async function requireOwnerOrgSession() {
  const session = await requireAdminSession();
  if (!isOrgTopAdminOrPlatform(session.user.role) || !hasOrganizationContext(session)) {
    redirect("/admin/settings?error=forbidden");
  }
  return session;
}

export async function saveAttendanceSiteSettings(formData: FormData) {
  const session = await requireOwnerOrgSession();
  const organizationId = session.organization.id;
  const siteId = parseText(formData, "siteId");
  const name = parseText(formData, "name");
  const latitude = parseNumberField(parseText(formData, "latitude"));
  const longitude = parseNumberField(parseText(formData, "longitude"));
  const radius = parseNumberField(parseText(formData, "radius"));

  if (!name || latitude == null || longitude == null) {
    redirect(`/admin/settings/attendance?site=${encodeURIComponent(siteId)}&error=invalid_coordinates`);
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    redirect(`/admin/settings/attendance?site=${encodeURIComponent(siteId)}&error=invalid_coordinates`);
  }
  if (radius == null || !Number.isInteger(radius) || radius <= 0) {
    redirect(`/admin/settings/attendance?site=${encodeURIComponent(siteId)}&error=invalid_radius`);
  }

  try {
    const site = siteId
      ? await updateAttendanceSite(organizationId, siteId, {
          name,
          latitude,
          longitude,
          allowedRadiusMeters: radius,
        })
      : await createAttendanceSite({
          organizationId,
          name,
          latitude,
          longitude,
          allowedRadiusMeters: radius,
          isActive: true,
        });
    redirect(`/admin/settings/attendance?site=${site.id}&saved=1`);
  } catch {
    redirect(`/admin/settings/attendance?site=${encodeURIComponent(siteId)}&error=site_save_failed`);
  }
}

export async function issueAttendanceSiteQr(formData: FormData) {
  const session = await requireOwnerOrgSession();
  const organizationId = session.organization.id;
  const siteId = parseText(formData, "siteId");

  if (!siteId) {
    redirect("/admin/settings/attendance?error=invalid_site");
  }

  try {
    const site = await getAttendanceSite(organizationId, siteId);
    if (!site) {
      redirect("/admin/settings/attendance?error=invalid_site");
    }
    const hadActive = Boolean(await getActiveQrToken(organizationId, siteId));
    await issueAttendanceQr({
      organizationId,
      siteId,
      createdByUserId: session.user.id,
    });
    redirect(`/admin/settings/attendance?site=${siteId}&${hadActive ? "reissued" : "issued"}=1`);
  } catch {
    redirect(`/admin/settings/attendance?site=${encodeURIComponent(siteId)}&error=qr_issue_failed`);
  }
}

/**
 * 기억된 근태 기기 해지 (2026-07-31).
 *
 * 휴대폰 분실·퇴사처럼 그 기기에서 더 이상 打刻하면 안 되는 상황에서 쓴다. 해지하면 그 기기는
 * 즉시 정상 로그인을 다시 요구한다. 조직 스코프로 제한해 다른 조직 기기는 건드릴 수 없다.
 * See docs/product/24-attendance-workflow.md → "Trusted Device".
 */
export async function revokeAttendanceTrustedDevice(formData: FormData) {
  const session = await requireOwnerOrgSession();
  const organizationId = session.organization.id;
  const deviceId = parseText(formData, "deviceId");
  const siteId = parseText(formData, "siteId");
  const back = siteId
    ? `/admin/settings/attendance?site=${encodeURIComponent(siteId)}`
    : "/admin/settings/attendance";

  if (!deviceId) {
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=invalid_device`);
  }

  const ok = await revokeTrustedDevice(organizationId, deviceId);
  if (!ok) {
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=device_revoke_failed`);
  }

  await writeTrustedDeviceAudit(organizationId, session.user.id, deviceId);
  redirect(`${back}${back.includes("?") ? "&" : "?"}device_revoked=1`);
}

async function writeTrustedDeviceAudit(
  organizationId: string,
  actorUserId: string,
  deviceId: string,
) {
  try {
    await getSupabaseServiceClient()
      .from("audit_logs")
      .insert({
        organization_id: organizationId,
        actor_user_id: actorUserId,
        action: "attendance_trusted_device_revoke",
        target_type: "attendance_trusted_device",
        target_id: deviceId,
        metadata: {},
      } as never);
  } catch {
    console.error("[attendance] trusted-device revoke audit failed", deviceId);
  }
}
