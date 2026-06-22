"use server";

import { redirect } from "next/navigation";
import {
  createAttendanceSite,
  getActiveQrToken,
  getAttendanceSite,
  issueAttendanceQr,
  updateAttendanceSite,
} from "@/lib/attendance-sites";
import { requireAdminSession } from "@/lib/admin-session";
import { hasOrganizationContext } from "@/lib/session";

function parseText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function parseNumberField(value: string) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

async function requireOwnerOrgSession() {
  const session = await requireAdminSession();
  if (session.user.role !== "owner" || !hasOrganizationContext(session)) {
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
