"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import {
  createBugReport,
  deleteBugReport,
  updateBugReport,
  updateBugReportStatus,
  uploadBugReportImage,
  type BugStatus,
} from "@/lib/bug-reports";

type ActionError = { error: string };
type CreateResult = { id: string } | ActionError;
type OkResult = { ok: true } | ActionError;

function messageFor(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "save_failed";
}

function pickString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function collectImageUrls(formData: FormData): string[] {
  // Both individual `image_0..image_4` keys and a repeated `imageUrls` key are accepted to keep the
  // frontend flexible. Already-uploaded public URLs only — the actual upload uses
  // `uploadBugReportImageAction` first so the server controls the storage path.
  const urls: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    const v = pickString(formData.get(`image_${i}`));
    if (v) urls.push(v);
  }
  for (const entry of formData.getAll("imageUrls")) {
    const v = typeof entry === "string" ? entry : "";
    if (v) urls.push(v);
  }
  return Array.from(new Set(urls)).slice(0, 5);
}

function revalidateBugSurfaces(reportId?: string) {
  revalidatePath("/mobile/bugs");
  if (reportId) revalidatePath(`/mobile/bugs/${reportId}`);
}

/**
 * Upload a screenshot for a draft report. The frontend should generate a draft id, request
 * uploads against it, then call `createBugReportAction` with the resulting image URLs. The
 * helper rebuilds the storage path from session.organization.id + the supplied reportId so the
 * client cannot write outside its own org or under a different report id.
 */
export async function uploadBugReportImageAction(
  reportId: string,
  formData: FormData,
): Promise<{ url: string } | ActionError> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { error: "no_org" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "missing_file" };

  try {
    const url = await uploadBugReportImage({ session, reportId, file });
    return { url };
  } catch (err) {
    return { error: messageFor(err) };
  }
}

export async function createBugReportAction(formData: FormData): Promise<CreateResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { error: "no_org" };

  const title = pickString(formData.get("title"));
  const description = pickString(formData.get("description"));
  const imageUrls = collectImageUrls(formData);

  try {
    const { id } = await createBugReport({ session, title, description, imageUrls });
    revalidateBugSurfaces(id);
    return { id };
  } catch (err) {
    return { error: messageFor(err) };
  }
}

export async function updateBugReportAction(
  reportId: string,
  formData: FormData,
): Promise<OkResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { error: "no_org" };

  const title = pickString(formData.get("title"));
  const description = pickString(formData.get("description"));
  const imageUrls = collectImageUrls(formData);

  try {
    await updateBugReport({ session, id: reportId, title, description, imageUrls });
    revalidateBugSurfaces(reportId);
    return { ok: true };
  } catch (err) {
    return { error: messageFor(err) };
  }
}

export async function deleteBugReportAction(reportId: string): Promise<OkResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { error: "no_org" };

  try {
    await deleteBugReport({ session, id: reportId });
    revalidateBugSurfaces(reportId);
    return { ok: true };
  } catch (err) {
    return { error: messageFor(err) };
  }
}

export async function setBugReportStatus(
  reportId: string,
  status: BugStatus,
): Promise<OkResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { error: "no_org" };

  try {
    await updateBugReportStatus({ session, id: reportId, status });
    revalidateBugSurfaces(reportId);
    return { ok: true };
  } catch (err) {
    return { error: messageFor(err) };
  }
}
