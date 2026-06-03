import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AdminShell } from "@/components/shell/admin-shell";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";
import { canAccessAdminWeb } from "@/config/roles";
import { updateAccountProfile } from "@/app/account/actions";
import { signOut } from "@/app/auth/actions";

type AccountPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const [state, session, params] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
    searchParams,
  ]);

  if (state.status === "unauthenticated") {
    redirect("/auth/login?next=/account");
  }

  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }

  const dictionary = getDictionary(session.user.preferredLanguage);
  const requestedMode = firstParam(params?.mode);
  const shellMode =
    requestedMode === "mobile" ||
    (requestedMode === "admin" && canAccessAdminWeb(session.user.role))
      ? requestedMode
      : session.user.preferredMode;
  const errorKey = firstParam(params?.error);
  const savedKey = firstParam(params?.saved);

  const content = (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-10">
      <Badge>{dictionary.common.account}</Badge>

      {savedKey && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700 dark:border-green-400/30 dark:bg-green-950/30 dark:text-green-300">
          {dictionary.onboarding.profileSaved}
        </div>
      )}

      {errorKey && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          {dictionary.onboarding.errors[errorKey] ??
            dictionary.onboarding.errors.profile_failed}
        </div>
      )}

      <Card className="p-5">
        <h2 className="text-2xl font-black">{dictionary.onboarding.profileTitle}</h2>
        <form action={updateAccountProfile} className="mt-5 grid gap-3">
          <input name="mode" type="hidden" value={shellMode} />
          <label className="grid gap-1.5 text-sm font-semibold">
            <span>{dictionary.onboarding.fullNamePlaceholder}</span>
            <Input
              defaultValue={session.user.name}
              name="name"
              placeholder={dictionary.onboarding.fullNamePlaceholder}
              required
              type="text"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            <span>{dictionary.onboarding.phonePlaceholder}</span>
            <Input
              defaultValue={session.user.phoneNumber}
              name="phoneNumber"
              placeholder={dictionary.onboarding.phonePlaceholder}
              required
              type="tel"
            />
            <span className="text-xs font-normal text-muted-foreground">
              {dictionary.onboarding.phoneHint}
            </span>
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            <span>{dictionary.common.language}</span>
            <select
              className="h-11 w-full rounded-xl border border-border bg-surface/80 px-3 text-sm font-semibold text-foreground shadow-sm outline-none"
              defaultValue={session.user.preferredLanguage}
              name="preferredLanguage"
            >
              <option value="ko">{dictionary.languages.ko}</option>
              <option value="ja">{dictionary.languages.ja}</option>
              <option value="en">{dictionary.languages.en}</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            <span>{dictionary.common.theme}</span>
            <select
              className="h-11 w-full rounded-xl border border-border bg-surface/80 px-3 text-sm font-semibold text-foreground shadow-sm outline-none"
              defaultValue={session.user.themePreference}
              name="themePreference"
            >
              <option value="system">{dictionary.themes.system}</option>
              <option value="light">{dictionary.themes.light}</option>
              <option value="dark">{dictionary.themes.dark}</option>
            </select>
          </label>
          <Button className="w-full" type="submit">
            {dictionary.onboarding.saveProfile}
          </Button>
        </form>
      </Card>

      <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-3">
        <div>
          <p className="text-sm font-bold">{dictionary.common.logout}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {session.user.email}
          </p>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="secondary">
            {dictionary.common.logout}
          </Button>
        </form>
      </div>
    </div>
  );

  if (shellMode === "mobile") {
    return <MobileShell title={dictionary.common.account}>{content}</MobileShell>;
  }

  return <AdminShell title={dictionary.common.account}>{content}</AdminShell>;
}
