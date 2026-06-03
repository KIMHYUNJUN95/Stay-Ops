import type { AppMode } from "@/config/routes";
import { canAccessAdminWeb } from "@/config/roles";
import type { Role } from "@/config/roles";
import { getDictionary, type Locale } from "@/lib/i18n";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type OrganizationSummary = {
  id: string;
  name: string;
};

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  phoneNumber: string;
  preferredLanguage: Locale;
  themePreference: "system" | "light" | "dark";
  role: Role;
  preferredMode: AppMode;
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
  name: string;
  phone_number: string;
  preferred_language: Locale;
  theme_preference: "system" | "light" | "dark";
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
    phoneNumber: "+81 90-0000-0000",
    preferredLanguage: "ko",
    themePreference: "system",
    role: "office_admin",
    preferredMode: "admin",
  },
};

function isMissingEnvError(error: unknown) {
  return error instanceof Error && error.message.startsWith("Missing required");
}

export async function getCurrentAppSession(): Promise<AppSession | null> {
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
      .select("id, name, phone_number, preferred_language, theme_preference")
      .eq("id", user.id)
      .maybeSingle();
    const profile = profileResult as CurrentProfile | null;

    if (profileError || !profile) {
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

    return {
      organization: organization ?? {
        id: "platform",
        name: dictionary.session.platformOrganization,
      },
      user: {
        id: user.id,
        name: profile.name,
        email: user.email ?? "",
        phoneNumber: profile.phone_number,
        preferredLanguage: profile.preferred_language,
        themePreference: profile.theme_preference,
        role,
        preferredMode: canAccessAdminWeb(role) ? "admin" : "mobile",
      },
    };
  } catch (error) {
    if (isMissingEnvError(error)) {
      return null;
    }

    throw error;
  }
}
