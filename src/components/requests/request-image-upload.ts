"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { PreviewItem } from "@/components/announcements/announcement-image-uploader";

const BUCKET = "request-images";
const PUBLIC_MARKER = `/storage/v1/object/public/${BUCKET}/`;
const FALLBACK_MARKER = `/storage/v1/object/${BUCKET}/`;

export type RequestImageType =
  | "lost-items"
  // 분실물 현장 처리(반환·폐기 등) 증빙 사진. 등록 사진과 같은 버킷이지만 폴더를 분리한다 —
  // supabase/migrations/202607170001_lostfound_return.sql의 storage 정책 화이트리스트와 일치해야 한다.
  | "lost-found-handling"
  | "maintenance-reports"
  // 완료(수리 후) 사진. 신고 사진과 같은 버킷이지만 폴더를 분리한다 —
  // supabase/migrations/202607160001_maintenance_backend.sql의 storage 정책 화이트리스트와 일치해야 한다.
  | "maintenance-resolutions"
  | "order-images"
  | "linen-returns"
  | "task-images"
  | "task-update-images"
  | "suggestion-images"
  | "attendance-corrections"
  | "board-posts"
  | "board-comments";

function getFileExtension(file: File): string {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext && /^[a-z0-9]+$/.test(ext)) return ext;
  return file.type.split("/")[1] ?? "jpg";
}

export async function uploadRequestImages(params: {
  items: PreviewItem[];
  organizationId: string;
  requestId: string;
  requestType: RequestImageType;
}) {
  const { items, organizationId, requestId, requestType } = params;
  const supabase = getSupabaseBrowserClient();
  const uploadedPaths: string[] = [];
  const imageUrls: string[] = [];
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  for (const item of items) {
    const ext = getFileExtension(item.file);
    const path = `${organizationId}/${requestType}/${requestId}/${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, item.file, { contentType: item.file.type, upsert: false });

    if (error) {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from(BUCKET).remove(uploadedPaths);
      }
      throw new Error("upload_failed");
    }

    uploadedPaths.push(path);
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const rawUrl = data.publicUrl;

    if (rawUrl.includes(PUBLIC_MARKER)) {
      imageUrls.push(rawUrl);
      continue;
    }
    if (rawUrl.includes(FALLBACK_MARKER)) {
      imageUrls.push(rawUrl.replace(FALLBACK_MARKER, PUBLIC_MARKER));
      continue;
    }
    if (baseUrl) {
      imageUrls.push(
        `${baseUrl.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${path}`,
      );
      continue;
    }

    imageUrls.push(rawUrl);
  }

  return { imageUrls, uploadedPaths };
}
