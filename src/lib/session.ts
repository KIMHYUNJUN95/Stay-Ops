import { cache } from "react";
import { defaultBottomNavTabIds } from "@/config/navigation";
import type { AppMode } from "@/config/routes";
import { defaultsToAdminSurface } from "@/config/roles";
import type { Role } from "@/config/roles";
import { getDictionary, type Locale } from "@/lib/i18n";
import type { ProfileGender } from "@/lib/onboarding";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type OrganizationSummary = {
  id: string;
  name: string;
};

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  birthDate: string | null;
  gender: ProfileGender | null;
  phoneNumber: string;
  preferredLanguage: Locale;
  role: Role;
  preferredMode: AppMode;
  bottomNavTabs: string[];
  // Per-user override for the daily-report generator. Combined with the role check in
  // `canGenerateDailyReport`; see profiles.can_generate_report.
  canGenerateReport: boolean;
};

export type AppSession = {
  organization: OrganizationSummary;
  user: SessionUser;
};

export function hasOrganizationContext(session: AppSession) {
  return session.organization.id !== "platform";
}

type ActiveMembership = {
  organization_id: string;
  role: Role;
};

type CurrentProfile = {
  birth_date: string | null;
  gender: ProfileGender | null;
  name: string;
  phone_number: string;
  preferred_language: Locale;
};

type CurrentOrganization = {
  id: string;
  name: string;
};

type ActivePlatformAdmin = {
  role: Role;
};

export const mockSession: AppSession = {
  organization: {
    id: "org_stayops_internal",
    name: "StayOps Internal",
  },
  user: {
    id: "user_sarah_jenkins",
    name: "Sarah Jenkins",
    email: "sarah.jenkins@example.com",
    birthDate: "1992-03-14",
    phoneNumber: "+81 90-0000-0000",
    gender: "female",
    preferredLanguage: "ko",
    role: "office_admin",
    preferredMode: "admin",
    bottomNavTabs: [...defaultBottomNavTabIds],
    canGenerateReport: true,
  },
};

function isMissingEnvError(error: unknown) {
  return error instanceof Error && error.message.startsWith("Missing required");
}

function isAuthError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "AuthApiError" ||
      error.name === "AuthSessionMissingError" ||
      error.name === "AuthRetryableFetchError" ||
      ("status" in error && typeof (error as { status: unknown }).status === "number"))
  );
}

// Request-scoped memoization: the session is read on the layout AND the page AND inside
// getMobileNavBadges on every mobile render, and it's a multi-query waterfall. `cache()` collapses
// all calls within one server render pass into a single execution (it does NOT cache across requests).
export const getCurrentAppSession = cache(
  async (): Promise<AppSession | null> => {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return null;
    }

    const { data: profileResult, error: profileError } = await supabase
      .from("profiles")
      .select("id, name, birth_date, gender, phone_number, preferred_language")
      .eq("id", user.id)
      .maybeSingle();
    let profile = profileResult as CurrentProfile | null;

    if (profileError) {
      const { data: fallbackProfile, error: fallbackProfileError } = await supabase
        .from("profiles")
        .select("id, name, birth_date, phone_number, preferred_language")
        .eq("id", user.id)
        .maybeSingle();
      if (fallbackProfileError || !fallbackProfile) {
        return null;
      }
      profile = {
        ...(fallbackProfile as Omit<CurrentProfile, "gender">),
        gender: null,
      };
    }

    if (!profile) {
      return null;
    }

    const { data: platformAdminResult } = await supabase
      .from("platform_admins")
      .select("role")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    const platformAdmin = platformAdminResult as ActivePlatformAdmin | null;

    const { data: membershipResult } = await supabase
      .from("memberships")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("joined_at", { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    const membership = membershipResult as ActiveMembership | null;

    if (!membership && !platformAdmin) {
      return null;
    }

    const organization =
      membership &&
      ((
        await supabase
          .from("organizations")
          .select("id, name")
          .eq("id", membership.organization_id)
          .maybeSingle()
      ).data as CurrentOrganization | null);

    const role = (platformAdmin?.role ?? membership?.role) as Role;
    const dictionary = getDictionary(profile.preferred_language);

    // Read per-user bottom-bar customization + report-access flag defensively: these columns
    // may not exist yet on projects where the migration has not been applied, so any error
    // falls back to the defaults rather than breaking the session.
    let bottomNavTabs: string[] = [...defaultBottomNavTabIds];
    let canGenerateReport = false;
    const { data: navResult, error: navError } = await supabase
      .from("profiles")
      .select("bottom_nav_tabs, can_generate_report")
      .eq("id", user.id)
      .maybeSingle();
    if (!navError && navResult) {
      const raw = (navResult as { bottom_nav_tabs?: string[] | null })
        .bottom_nav_tabs;
      if (Array.isArray(raw) && raw.length > 0) {
        bottomNavTabs = raw;
      }
      canGenerateReport = Boolean(
        (navResult as { can_generate_report?: boolean | null }).can_generate_report,
      );
    }

    return {
      organization: organization ?? {
        id: "platform",
        name: dictionary.session.platformOrganization,
      },
      user: {
        id: user.id,
        name: profile.name,
        email: user.email ?? "",
        birthDate: profile.birth_date,
        gender: profile.gender,
        phoneNumber: profile.phone_number,
        preferredLanguage: profile.preferred_language,
        role,
        // Default landing surface (field roles → mobile even though they can also access admin).
        preferredMode: defaultsToAdminSurface(role) ? "admin" : "mobile",
        bottomNavTabs,
        canGenerateReport,
      },
    };
  } catch (error) {
    if (isMissingEnvError(error) || isAuthError(error)) {
      return null;
    }

    throw error;
  }
  },
);
