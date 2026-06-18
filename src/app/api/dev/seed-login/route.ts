import { NextResponse, type NextRequest } from "next/server";
import type { OrganizationRole } from "@/config/roles";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

type SeedActor = "admin" | "staff";

const DEV_ORG_SLUG = "stayops-internal";
const DEV_ORG_NAME = "StayOps Internal";
const ACTOR_CONFIG: Record<
  SeedActor,
  { email: string; name: string; role: "developer_super_admin" | "staff" }
> = {
  admin: {
    email: "stayops.e2e.admin+local@example.com",
    name: "Stay Ops E2E Admin",
    role: "developer_super_admin",
  },
  staff: {
    email: "stayops.e2e.staff+local@example.com",
    name: "Stay Ops E2E Staff",
    role: "staff",
  },
};

function isLocalDevHost(host: string) {
  if (host === "localhost" || host === "127.0.0.1") {
    return true;
  }

  // Private LAN ranges for same-network mobile QA in development.
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) {
    return true;
  }

  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
    return true;
  }

  return /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host);
}

function getRequestHost(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    return forwardedHost.split(",")[0]?.trim() ?? request.nextUrl.host;
  }

  const host = request.headers.get("host");
  if (host) {
    return host;
  }

  return request.nextUrl.host;
}

function getRequestHostname(request: NextRequest) {
  return getRequestHost(request).split(":")[0] ?? request.nextUrl.hostname;
}

function getRequestOrigin(request: NextRequest) {
  const protocol =
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.replace(":", "");

  return `${protocol}://${getRequestHost(request)}`;
}

function ensureDevOnly(request: NextRequest) {
  // Layer 1: block in any environment other than explicit local development.
  // !== "development" (not === "production") also blocks test/staging NODE_ENV values.
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Layer 2: explicit opt-in gate. Set ENABLE_DEV_SEED_LOGIN=true in .env.local to enable.
  // Defense-in-depth: prevents accidental activation even when NODE_ENV=development.
  if (process.env.ENABLE_DEV_SEED_LOGIN !== "true") {
    console.warn("[dev/seed-login] gate not enabled");
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Layer 3: allow localhost and private LAN IPs for mobile dev testing.
  const host = getRequestHostname(request);
  if (!isLocalDevHost(host)) {
    console.warn(`[dev/seed-login] blocked non-local host: ${host}`);
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return null;
}

const LIST_PAGE_SIZE = 1000;

async function findOrCreateUser(email: string) {
  const service = getSupabaseServiceClient();
  let page = 1;

  while (true) {
    const listed = await service.auth.admin.listUsers({ page, perPage: LIST_PAGE_SIZE });
    if (listed.error) {
      throw new Error(`listUsers failed: ${listed.error.message}`);
    }

    const match = listed.data.users.find((u) => u.email === email);
    if (match) return match.id;

    // Fewer results than the page size means this was the last page.
    if (listed.data.users.length < LIST_PAGE_SIZE) break;

    page++;
  }

  const created = await service.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw new Error(`createUser failed: ${created.error?.message ?? "unknown"}`);
  }
  return created.data.user.id;
}

async function ensurePassword(userId: string, password: string) {
  const service = getSupabaseServiceClient();
  const updated = await service.auth.admin.updateUserById(userId, {
    email_confirm: true,
    password,
  });
  if (updated.error) {
    throw new Error(`set dev password failed: ${updated.error.message}`);
  }
}

async function ensureOrganization() {
  const service = getSupabaseServiceClient();
  const existing = await service
    .from("organizations")
    .select("id")
    .eq("slug", DEV_ORG_SLUG)
    .maybeSingle();
  const existingOrg = existing.data as { id: string } | null;

  if (existing.error) {
    throw new Error(`find organization failed: ${existing.error.message}`);
  }
  if (existingOrg?.id) return existingOrg.id;

  const inserted = await service
    .from("organizations")
    .insert({ name: DEV_ORG_NAME, slug: DEV_ORG_SLUG, status: "active" } as never)
    .select("id")
    .single();
  const insertedOrg = inserted.data as { id: string } | null;
  if (inserted.error || !insertedOrg?.id) {
    throw new Error(
      `create organization failed: ${inserted.error?.message ?? "unknown"}`,
    );
  }
  return insertedOrg.id;
}

async function ensureProfile(userId: string, name: string) {
  const service = getSupabaseServiceClient();
  const { error } = await service.from("profiles").upsert({
    id: userId,
    name,
    phone_number: "000-0000-0000",
    preferred_language: "ko",
  } as never);
  if (error) {
    throw new Error(`upsert profile failed: ${error.message}`);
  }
}

async function ensurePlatformAdmin(userId: string, active: boolean) {
  const service = getSupabaseServiceClient();
  if (!active) {
    const { error } = await service
      .from("platform_admins")
      .update({ is_active: false } as never)
      .eq("user_id", userId);
    if (error) {
      throw new Error(`disable platform admin failed: ${error.message}`);
    }
    return;
  }

  const existing = await service
    .from("platform_admins")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  const existingPlatformAdmin = existing.data as { id: string } | null;
  if (existing.error) {
    throw new Error(`find platform admin failed: ${existing.error.message}`);
  }

  if (existingPlatformAdmin?.id) {
    const updated = await service
      .from("platform_admins")
      .update({
        is_active: true,
        role: "developer_super_admin",
      } as never)
      .eq("id", existingPlatformAdmin.id);
    if (updated.error) {
      throw new Error(`update platform admin failed: ${updated.error.message}`);
    }
    return;
  }

  const inserted = await service.from("platform_admins").insert({
    is_active: true,
    role: "developer_super_admin",
    user_id: userId,
  } as never);
  if (inserted.error) {
    throw new Error(`insert platform admin failed: ${inserted.error.message}`);
  }
}

async function ensureMembership(
  userId: string,
  organizationId: string,
  role: OrganizationRole,
) {
  const service = getSupabaseServiceClient();
  // Remove memberships in other orgs so session always resolves to the target org.
  await service
    .from("memberships")
    .delete()
    .eq("user_id", userId)
    .neq("organization_id", organizationId);
  const { error } = await service.from("memberships").upsert(
    {
      joined_at: new Date().toISOString(),
      organization_id: organizationId,
      role,
      status: "active",
      user_id: userId,
    } as never,
    { onConflict: "organization_id,user_id" },
  );
  if (error) {
    throw new Error(`upsert membership failed: ${error.message}`);
  }
}

export async function GET(request: NextRequest) {
  const blocked = ensureDevOnly(request);
  if (blocked) return blocked;

  // Layer 4: password must be configured in .env.local.
  const raw = process.env.DEV_SEED_LOGIN_PASSWORD;
  const devPassword = raw?.trim();
  if (!devPassword) {
    console.warn("[dev/seed-login] password not configured");
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const actorParam = request.nextUrl.searchParams.get("as");
  const actor: SeedActor = actorParam === "staff" ? "staff" : "admin";
  const config = ACTOR_CONFIG[actor];
  const rawNext = request.nextUrl.searchParams.get("next") ?? "";
  // Require a local path to prevent open-redirect via ?next=https://... .
  const nextPath =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/admin/announcements";

  try {
    const userId = await findOrCreateUser(config.email);
    const orgId = await ensureOrganization();
    await ensurePassword(userId, devPassword);
    await ensureProfile(userId, config.name);

    if (config.role === "developer_super_admin") {
      await ensurePlatformAdmin(userId, true);
      // Dev QA: platform admins also need org membership to use /mobile (field UI).
      await ensureMembership(userId, orgId, "office_admin");
    } else {
      await ensurePlatformAdmin(userId, false);
      await ensureMembership(userId, orgId, "staff");
    }

    const supabase = await getSupabaseServerClient();
    const signedIn = await supabase.auth.signInWithPassword({
      email: config.email,
      password: devPassword,
    });
    if (signedIn.error) {
      throw new Error(`signInWithPassword failed: ${signedIn.error.message}`);
    }

    return NextResponse.redirect(new URL(nextPath, getRequestOrigin(request)));
  } catch (error) {
    // Log the real error server-side only; do not expose internal details in the response.
    console.error("[dev/seed-login] seed failed:", error);
    return NextResponse.json({ error: "seed_login_failed" }, { status: 500 });
  }
}
