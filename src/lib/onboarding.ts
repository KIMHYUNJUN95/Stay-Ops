import type { User } from "@supabase/supabase-js";
import type { Role } from "@/config/roles";
import { canAccessAdminWeb } from "@/config/roles";
import { isLocale, type Locale } from "@/lib/i18n";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export type ProfileSnapshot = {
  id: string;
  name: string;
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

type ProfileRow = {
  id: string;
  name: string;
  phone_number: string;
  preferred_language: Locale;
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

  const [{ data: profileResult }, { count: platformAdminCount }] =
    await Promise.all([
      service
        .from("profiles")
        .select("id, name, phone_number, preferred_language")
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
  // This enforces that Google login (auth only) cannot skip the manual onboarding step.
  const isProfileComplete =
    !!profile &&
    !!profile.name?.trim() &&
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
    phoneNumber: profile.phone_number,
    preferredLanguage: profile.preferred_language,
  };

  const [{ data: platformAdminResult }, { data: membershipResult }] =
    await Promise.all([
      service
        .from("platform_admins")
        .select("role")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle(),
      // Query ANY non-invited membership to detect suspended/removed states.
      service
        .from("memberships")
        .select("organization_id, role, status")
        .eq("user_id", user.id)
        .neq("status", "invited")
        .order("joined_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const platformAdmin = platformAdminResult as PlatformAdminRow | null;
  const membership = membershipResult as MembershipRow | null;

  // Platform admin bypasses org membership requirements.
  if (platformAdmin?.role) {
    return {
      status: "ready",
      redirectTo: getDefaultRouteForRole(platformAdmin.role),
      user,
    };
  }

  // Active membership — user is fully onboarded.
  if (membership?.status === "active") {
    return {
      status: "ready",
      redirectTo: getDefaultRouteForRole(membership.role),
      user,
    };
  }

  // Suspended membership — block with a clear message.
  if (membership?.status === "suspended") {
    return {
      status: "suspended",
      user,
      profile: profileSnapshot,
    };
  }

  // Removed membership — block with a clear message.
  if (membership?.status === "removed") {
    return {
      status: "removed",
      user,
      profile: profileSnapshot,
    };
  }

  // No qualifying membership — user needs to join via invite code.
  return {
    status: "needs_membership",
    canClaimPlatformAdmin,
    profile: profileSnapshot,
    user,
  };
}
