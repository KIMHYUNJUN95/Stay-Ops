"use server";

import { redirect } from "next/navigation";
import {
  getCanonicalPropertyName,
  getCanonicalRoomLabel,
  getDisplayRoomLabel,
} from "@/lib/room-label-normalization";
import {
  isMaintenanceCategory,
  isMaintenancePriority,
  type MaintenanceCategory,
  type MaintenancePriority,
} from "@/lib/maintenance-constants";
import { getCurrentAppSession } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

const REQUEST_IMAGE_BUCKET = "request-images";

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function getRequestImagePathFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const markers = [
      `/storage/v1/object/public/${REQUEST_IMAGE_BUCKET}/`,
      `/storage/v1/object/${REQUEST_IMAGE_BUCKET}/`,
    ];
    for (const marker of markers) {
      const idx = parsed.pathname.indexOf(marker);
      if (idx !== -1) {
        return parsed.pathname.slice(idx + marker.length);
      }
    }
    return null;
  } catch {
    return null;
  }
}

function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function createMaintenanceReport(formData: FormData) {
  const rawCleaningSessionId = cleanText(formData.get("cleaningSessionId"));
  const rawReservationId = cleanText(formData.get("reservationId"));
  const requestedId = cleanText(formData.get("id"));

  const session = await getCurrentAppSession();
  if (!session) {
    const basePath = "/mobile/maintenance/new";
    const targetParams = new URLSearchParams();
    if (rawCleaningSessionId) {
      targetParams.set("sessionId", rawCleaningSessionId);
    }
    if (rawReservationId) {
      targetParams.set("reservationId", rawReservationId);
    }
    const targetPath =
      targetParams.size > 0 ? `${basePath}?${targetParams.toString()}` : basePath;
    redirect(`/auth/login?next=${encodeURIComponent(targetPath)}`);
  }

  const roomLabel = cleanText(formData.get("roomLabel"));
  const propertyName = cleanText(formData.get("propertyName")) || null;
  const issueTitle = cleanText(formData.get("issueTitle"));
  const description = cleanText(formData.get("description"));
  const imageUrls = formData
    .getAll("imageUrls")
    .map((v) => cleanText(v))
    .filter(Boolean);

  // Category and priority were rendered by the form but silently dropped here until 2026-07-14 —
  // there were no columns to store them. Both now persist; unknown values fall back to the defaults
  // rather than rejecting the submission (a stale client must never lose a field report).
  const rawCategory = cleanText(formData.get("category"));
  const category: MaintenanceCategory = isMaintenanceCategory(rawCategory) ? rawCategory : "other";
  const rawPriority = cleanText(formData.get("priority"));
  const priority: MaintenancePriority = isMaintenancePriority(rawPriority) ? rawPriority : "normal";

  // "건물 전체"(whole-building) reports used to be detected by string-matching the reporter's
  // localized label, so a Japanese reporter's report looked room-specific to a Korean reader. The
  // form now sends an explicit flag and the DB stores a boolean.
  const isBuildingOnly = cleanText(formData.get("isBuildingOnly")) === "1";

  const sessionParams = new URLSearchParams();
  if (rawCleaningSessionId) sessionParams.set("sessionId", rawCleaningSessionId);
  if (rawReservationId) sessionParams.set("reservationId", rawReservationId);
  const sessionParam = sessionParams.size > 0 ? `&${sessionParams.toString()}` : "";

  if (roomLabel.length === 0 || roomLabel.length > 100) {
    redirect(`/mobile/maintenance/new?error=invalid_room${sessionParam}`);
  }
  if (!issueTitle) {
    redirect(`/mobile/maintenance/new?error=missing_issue_title${sessionParam}`);
  }
  if (requestedId && !isValidUuid(requestedId)) {
    redirect(`/mobile/maintenance/new?error=save_failed${sessionParam}`);
  }
  if (imageUrls.length > 5) {
    redirect(`/mobile/maintenance/new?error=save_failed${sessionParam}`);
  }

  const requestId = requestedId || crypto.randomUUID();
  const imagePaths: string[] = [];
  for (const imageUrl of imageUrls) {
    const path = getRequestImagePathFromUrl(imageUrl);
    if (!path) {
      redirect(`/mobile/maintenance/new?error=save_failed${sessionParam}`);
    }
    const segments = path.split("/");
    if (
      segments.length !== 4 ||
      segments[0] !== session.organization.id ||
      segments[1] !== "maintenance-reports" ||
      segments[2] !== requestId
    ) {
      redirect(`/mobile/maintenance/new?error=save_failed${sessionParam}`);
    }
    imagePaths.push(path);
  }

  const supabase = await getSupabaseServerClient();

  // Validate the cleaning session link: must belong to this user/org (any status).
  let cleaningSessionId: string | null = null;
  if (rawCleaningSessionId) {
    const { data } = await supabase
      .from("cleaning_sessions")
      .select("id")
      .eq("id", rawCleaningSessionId)
      .eq("organization_id", session.organization.id)
      .eq("staff_user_id", session.user.id)
      .maybeSingle();
    cleaningSessionId = (data as { id: string } | null)?.id ?? null;
    if (!cleaningSessionId) {
      redirect(
        `/mobile/maintenance/new?error=invalid_session&sessionId=${encodeURIComponent(rawCleaningSessionId)}`,
      );
    }
  }

  let reservationId: string | null = null;
  let guestName: string | null = null;
  if (rawReservationId) {
    const { data } = await supabase
      .from("reservations")
      .select("id, guest_name, property_name, room_label")
      .eq("id", rawReservationId)
      .eq("organization_id", session.organization.id)
      .maybeSingle();

    const linkedReservation = data as {
      guest_name: string;
      id: string;
      property_name: string;
      room_label: string;
    } | null;

    if (!linkedReservation) {
      redirect(`/mobile/maintenance/new?error=save_failed${sessionParam}`);
    }

    const linkedPropertyName = getCanonicalPropertyName(linkedReservation.property_name);
    const linkedCanonical =
      getCanonicalRoomLabel(linkedPropertyName, linkedReservation.room_label) ??
      linkedReservation.room_label.trim();
    // Compare against the collapsed display label — the form sends "201", the reservation may be "201_2".
    const linkedRoomLabel = getDisplayRoomLabel(linkedPropertyName, linkedCanonical);

    if (linkedPropertyName !== propertyName || linkedRoomLabel !== roomLabel) {
      redirect(`/mobile/maintenance/new?error=save_failed${sessionParam}`);
    }

    reservationId = linkedReservation.id;
    guestName = linkedReservation.guest_name;
  }

  const insert: Database["public"]["Tables"]["maintenance_reports"]["Insert"] = {
    id: requestId,
    organization_id: session.organization.id,
    reported_by_user_id: session.user.id,
    guest_name: guestName,
    property_name: propertyName,
    reservation_id: reservationId,
    room_label: roomLabel,
    is_building_only: isBuildingOnly,
    issue_title: issueTitle,
    description: description || null,
    category,
    priority,
    image_urls: imageUrls,
    cleaning_session_id: cleaningSessionId,
  };

  const { data: created, error } = await supabase
    .from("maintenance_reports")
    .insert(insert as never)
    .select("id")
    .single();
  const createdId = (created as { id: string } | null)?.id ?? null;

  if (error || !createdId) {
    if (imagePaths.length > 0) {
      await supabase.storage.from(REQUEST_IMAGE_BUCKET).remove(imagePaths);
    }
    redirect(`/mobile/maintenance/new?error=save_failed${sessionParam}`);
  }
  redirect(`/mobile/requests/maintenance/${createdId}?created=1`);
}
