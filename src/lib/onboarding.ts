import type { User } from "@supabase/supabase-js";
import type { Role } from "@/config/roles";
import { canAccessAdminWeb } from "@/config/roles";
import { isLocale, type Locale } from "@/lib/i18n";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export type ProfileSnapshot = {
  id: string;
  name: string;
  birthDate: string | null;
  phoneNumber: string;
  preferredLanguage: Locale;
};

export type MembershipSnapshot = {
  organizationId: string;
  role: Role;
};

export type OnboardingState =
  | {
      status: "unauthenticated";
      user: null;
    }
  | {
      status: "needs_profile";
      canClaimPlatformAdmin: boolean;
      user: User;
    }
  | {
      status: "needs_membership";
      canClaimPlatformAdmin: boolean;
      profile: ProfileSnapshot;
      user: User;
    }
  | {
      status: "suspended";
      user: User;
      profile: ProfileSnapshot;
    }
  | {
      status: "removed";
      user: User;
      profile: ProfileSnapshot;
    }
  | {
      status: "disabled";
      user: User;
      email: string;
    }
  | {
      status: "ready";
      redirectTo: string;
      user: User;
    };

/**
 * Validates a phone number at a basic operational level.
 * Allows digits, +, spaces, hyphens, and parentheses.
 * Requires 7-15 digits total (stripped of non-digit chars).
 */
export function isValidPhone(phone: string): boolean {
  const trimmed = phone.trim();
  if (!trimmed) return false;
  if (!/^[\d\s\+\-\(\)]+$/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

/**
 * Validates a birth date in YYYY-MM-DD form and requires it to be in the past.
 * Shared by onboarding, account editing, and onboarding-state gating.
 */
export function isValidBirthDate(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  const birthDate = new Date(trimmed);
  return !Number.isNaN(birthDate.getTime()) && birthDate < new Date();
}

type ProfileRow = {
  id: string;
  name: string;
  birth_date: string | null;
  phone_number: string;
  preferred_language: Locale;
  last_used_organization_id: string | null;
};

type MembershipRow = {
  organization_id: string;
  role: Role;
  status: string;
};

type PlatformAdminRow = {
  role: Role;
};

export function getDefaultRouteForRole(role: Role) {
  return canAccessAdminWeb(role) ? "/admin" : "/mobile";
}

export async function getOnboardingState(): Promise<OnboardingState> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      status: "unauthenticated",
      user: null,
    };
  }

  const service = getSupabaseServiceClient();
  const disabledUntil = (user as User & { banned_until?: string | null })
    .banned_until;
  if (disabledUntil) {
    const bannedUntilDate = new Date(disabledUntil);
    if (!Number.isNaN(bannedUntilDate.getTime()) && bannedUntilDate > new Date()) {
      return {
        status: "disabled",
        user,
        email: user.email ?? "",
      };
    }
  }

  const [{ data: profileResult }, { count: platformAdminCount }] =
    await Promise.all([
      service
        .from("profiles")
        .select("id, name, birth_date, phone_number, preferred_language, last_used_organization_id")
        .eq("id", user.id)
        .maybeSingle(),
      service
        .from("platform_admins")
        .select("id", { count: "exact", head: true }),
    ]);

  const profile = profileResult as ProfileRow | null;
  const canClaimPlatformAdmin = (platformAdminCount ?? 0) === 0;

  // Profile row missing → needs profile.
  // Profile row exists but required fields are incomplete/invalid → also needs profile.
  // birth_date is required for identity verification; Google login cannot skip this.
  const isProfileComplete =
    !!profile &&
    !!profile.name?.trim() &&
    !!profile.birth_date &&
    isValidBirthDate(profile.birth_date) &&
    !!profile.phone_number?.trim() &&
    isValidPhone(profile.phone_number) &&
    isLocale(profile.preferred_language);

  if (!isProfileComplete) {
    return {
      status: "needs_profile",
      canClaimPlatformAdmin,
      user,
    };
  }

  const profileSnapshot: ProfileSnapshot = {
    id: profile.id,
    name: profile.name,
    birthDate: profile.birth_date,
    phoneNumber: profile.phone_number,
    preferredLanguage: profile.preferred_language,
  };

  const [{ data: platformAdminResult }, { data: membershipResults }] =
    await Promise.all([
      service
        .from("platform_admins")
        .select("role")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle(),
      // Query ALL non-invited memberships to support multi-org.
      service
        .from("memberships")
        .select("organization_id, role, status")
        .eq("user_id", user.id)
        .neq("status", "invited")
        .order("joined_at", { ascending: false, nullsFirst: false }),
    ]);

  const platformAdmin = platformAdminResult as PlatformAdminRow | null;
  const memberships = (membershipResults ?? []) as MembershipRow[];

  // Platform admin bypasses org membership requirements.
  if (platformAdmin?.role) {
    return {
      status: "ready",
      redirectTo: getDefaultRouteForRole(platformAdmin.role),
      user,
    };
  }

  // Among all memberships, prefer the one matching last_used_organization_id,
  // then fall back to the most recent active one.
  const activeMemberships = memberships.filter((m) => m.status === "active");

  if (activeMemberships.length > 0) {
    const lastUsedOrgId = profile.last_used_organization_id;
    const preferred =
      (lastUsedOrgId
        ? activeMemberships.find((m) => m.organization_id === lastUsedOrgId)
        : null) ?? activeMemberships[0];

    return {
      status: "ready",
      redirectTo: getDefaultRouteForRole(preferred.role),
      user,
    };
  }

  // Check for suspended/removed states across any membership.
  const suspended = memberships.find((m) => m.status === "suspended");
  if (suspended) {
    return { status: "suspended", user, profile: profileSnapshot };
  }

  const removed = memberships.find((m) => m.status === "removed");
  if (removed) {
    return { status: "removed", user, profile: profileSnapshot };
  }

  // No qualifying membership — user needs to join via invite code.
  return {
    status: "needs_membership",
    canClaimPlatformAdmin,
    profile: profileSnapshot,
    user,
  };
}

/**
 * Persists the last-used organization for multi-org routing.
 * Called after a successful sign-in when the user has multiple active memberships.
 */
export async function setLastUsedOrganization(
  userId: string,
  organizationId: string,
): Promise<void> {
  const service = getSupabaseServiceClient();
  await service
    .from("profiles")
    .update({ last_used_organization_id: organizationId } as never)
    .eq("id", userId);
}
