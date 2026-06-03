"use server";

import { getPublicSupabaseEnv } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database";

type AnnouncementImageRow = Pick<
  Database["public"]["Tables"]["announcements"]["Row"],
  "image_urls"
>;

const BUCKET = "announcement-images";
// Objects uploaded less than GRACE_MS ago are skipped — the user may still be
// filling in the create form after uploading images.
const GRACE_MS = 60 * 60 * 1000; // 60 minutes
const DELETE_BATCH = 100;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*[A-Za-z0-9]$/;

export type OrphanCleanupResult = {
  ok: boolean;
  aborted: boolean;
  errorMessage?: string;
  listingFailures: number;
  deleted: number;
  skippedGrace: number;
  skippedReferenced: number;
  errors: number;
};

class ListingFailureError extends Error {
  failures: number;

  constructor(message: string) {
    super(message);
    this.name = "ListingFailureError";
    this.failures = 1;
  }
}

// Mirrors the same validation logic in actions.ts so that only structurally
// valid bucket paths are ever candidates for deletion.
function isValidStoragePath(name: string): boolean {
  const segs = name.split("/");
  if (segs.length !== 3) return false;
  const [orgId, announcementId, filename] = segs as [string, string, string];
  return (
    UUID_RE.test(orgId) &&
    UUID_RE.test(announcementId) &&
    filename.length >= 3 &&
    filename.length <= 160 &&
    SAFE_FILENAME_RE.test(filename)
  );
}

async function isPlatformAdmin(userId: string): Promise<boolean> {
  const { data } = await getSupabaseServiceClient()
    .from("platform_admins")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  return Boolean(data);
}

// Build the set of Storage object paths that are currently referenced by at
// least one announcement's image_urls column.
async function getReferencedPaths(): Promise<Set<string>> {
  const { url } = getPublicSupabaseEnv();
  const supabaseHostname = new URL(url).hostname;
  const prefix = `/storage/v1/object/public/${BUCKET}/`;
  const service = getSupabaseServiceClient();
  const paths = new Set<string>();

  let offset = 0;
  const PAGE = 500;
  while (true) {
    const { data, error: queryError } = await service
      .from("announcements")
      .select("image_urls")
      .range(offset, offset + PAGE - 1);

    if (queryError) {
      throw new Error(
        `getReferencedPaths: query failed at offset ${offset}: ${queryError.message}`,
      );
    }

    const rows = (data ?? []) as AnnouncementImageRow[];
    if (rows.length === 0) break;

    for (const row of rows) {
      for (const rawUrl of row.image_urls ?? []) {
        try {
          const u = new URL(rawUrl);
          if (
            u.protocol === "https:" &&
            u.hostname === supabaseHostname &&
            u.pathname.startsWith(prefix)
          ) {
            const path = decodeURIComponent(u.pathname.slice(prefix.length));
            if (path) paths.add(path);
          }
        } catch {
          // skip malformed entries
        }
      }
    }

    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  return paths;
}

// Traverse the three-level hierarchy: org → announcement → filename.
// Each level is limited to 500 entries. This is sufficient for MVP usage;
// add pagination per level if the bucket grows beyond that.
async function listBucketObjects(): Promise<
  Array<{ path: string; createdAt: Date | null }>
> {
  const service = getSupabaseServiceClient();
  const results: Array<{ path: string; createdAt: Date | null }> = [];

  const { data: orgEntries, error: orgListErr } = await service.storage
    .from(BUCKET)
    .list("", { limit: 500, sortBy: { column: "name", order: "asc" } });

  if (orgListErr) {
    throw new ListingFailureError(
      `Failed to list org folders in ${BUCKET}: ${orgListErr.message}`,
    );
  }

  for (const orgEntry of orgEntries ?? []) {
    if (!UUID_RE.test(orgEntry.name)) continue;

    const { data: annEntries, error: annListErr } = await service.storage
      .from(BUCKET)
      .list(orgEntry.name, {
        limit: 500,
        sortBy: { column: "name", order: "asc" },
      });

    if (annListErr) {
      throw new ListingFailureError(
        `Failed to list announcement folders under ${orgEntry.name}: ${annListErr.message}`,
      );
    }

    for (const annEntry of annEntries ?? []) {
      if (!UUID_RE.test(annEntry.name)) continue;

      const { data: fileEntries, error: fileListErr } = await service.storage
        .from(BUCKET)
        .list(`${orgEntry.name}/${annEntry.name}`, {
          limit: 500,
          sortBy: { column: "name", order: "asc" },
        });

      if (fileListErr) {
        throw new ListingFailureError(
          `Failed to list files under ${orgEntry.name}/${annEntry.name}: ${fileListErr.message}`,
        );
      }

      for (const f of fileEntries ?? []) {
        if (f.id == null) continue; // virtual folder placeholder, not a real object
        results.push({
          path: `${orgEntry.name}/${annEntry.name}/${f.name}`,
          createdAt: f.created_at ? new Date(f.created_at) : null,
        });
      }
    }
  }

  return results;
}

// Platform-admin-only server action that deletes Storage objects in the
// announcement-images bucket that are not referenced by any DB announcement.
//
// Safety conditions (all must hold to delete an object):
//   1. Caller is an active platform admin.
//   2. Path passes the full three-segment UUID/filename validation.
//   3. Object creation time is known and older than GRACE_MS.
//   4. Object's reconstructed public URL is absent from every announcement's image_urls.
export async function purgeOrphanAnnouncementImages(): Promise<OrphanCleanupResult> {
  const result: OrphanCleanupResult = {
    ok: true,
    aborted: false,
    listingFailures: 0,
    deleted: 0,
    skippedGrace: 0,
    skippedReferenced: 0,
    errors: 0,
  };

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !(await isPlatformAdmin(user.id))) {
    return {
      ...result,
      ok: false,
      aborted: true,
      errorMessage: "Cleanup is restricted to active platform admins.",
    };
  }

  const graceCutoff = new Date(Date.now() - GRACE_MS);

  let referenced: Set<string>;
  let objects: Array<{ path: string; createdAt: Date | null }>;
  try {
    [referenced, objects] = await Promise.all([
      getReferencedPaths(),
      listBucketObjects(),
    ]);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to build reference set or bucket listing.";
    console.error(
      "[purgeOrphanAnnouncementImages] Aborted — failed to build reference set or bucket listing:",
      message,
    );
    return {
      ...result,
      ok: false,
      aborted: true,
      errorMessage: message,
      listingFailures: err instanceof ListingFailureError ? err.failures : 0,
    };
  }

  const toDelete: string[] = [];

  for (const obj of objects) {
    if (!isValidStoragePath(obj.path)) continue;

    // Conservative: skip objects whose creation time is unknown.
    if (obj.createdAt === null || obj.createdAt > graceCutoff) {
      result.skippedGrace++;
      continue;
    }

    if (referenced.has(obj.path)) {
      result.skippedReferenced++;
      continue;
    }

    toDelete.push(obj.path);
  }

  const service = getSupabaseServiceClient();
  for (let i = 0; i < toDelete.length; i += DELETE_BATCH) {
    const batch = toDelete.slice(i, i + DELETE_BATCH);
    const { error } = await service.storage.from(BUCKET).remove(batch);
    if (error) {
      result.errors += batch.length;
      console.error(
        "[purgeOrphanAnnouncementImages] Storage delete error:",
        error.message,
      );
    } else {
      result.deleted += batch.length;
    }
  }

  if (result.errors > 0) {
    result.ok = false;
    result.errorMessage = `Cleanup completed with ${result.errors} Storage deletion error(s).`;
  }

  return result;
}
