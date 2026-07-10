import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DeleteAccountSheet } from "@/components/account/delete-account-sheet";
import { GenderSegmented } from "@/components/account/gender-segmented";
import { LanguageSegmented } from "@/components/account/language-segmented";
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
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
          {dictionary.onboarding.profileSaved}
        </div>
      )}

      {errorKey && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          {dictionary.onboarding.errors[errorKey] ??
            dictionary.onboarding.errors.profile_failed}
        </div>
      )}

      {(!session.user.birthDate || !session.user.gender) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-4 shadow-sm">
          <p className="text-sm font-bold text-amber-900">
            {dictionary.accountProfile.completionTitle}
          </p>
          <p className="mt-1 text-sm leading-6 text-amber-800">
            {!session.user.birthDate && !session.user.gender
              ? dictionary.accountProfile.missingBirthDateAndGenderBody
              : !session.user.birthDate
                ? dictionary.accountProfile.missingBirthDateBody
                : dictionary.accountProfile.genderMissingBody}
          </p>
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
            <span>{dictionary.onboarding.birthDateLabel}</span>
            <Input
              defaultValue={session.user.birthDate ?? ""}
              name="birthDate"
              placeholder={dictionary.onboarding.birthDatePlaceholder}
              type="date"
            />
            <span className="text-xs font-normal text-muted-foreground">
              {dictionary.onboarding.birthDateHint}
            </span>
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
          <div className="grid gap-1.5 text-sm font-semibold">
            <span>{dictionary.onboarding.genderLabel}</span>
            <GenderSegmented
              name="gender"
              defaultValue={session.user.gender ?? ""}
              ariaLabel={dictionary.onboarding.genderLabel}
              options={[
                {
                  code: "female",
                  label: dictionary.onboarding.genderOptions.female,
                },
                {
                  code: "male",
                  label: dictionary.onboarding.genderOptions.male,
                },
              ]}
            />
            <span className="text-xs font-normal leading-5 text-muted-foreground">
              {dictionary.accountProfile.genderHint}
            </span>
          </div>
          <div className="grid gap-1.5 text-sm font-semibold">
            <span>{dictionary.common.language}</span>
            <LanguageSegmented
              name="preferredLanguage"
              defaultValue={session.user.preferredLanguage}
              ariaLabel={dictionary.common.language}
              options={[
                { code: "ko", label: dictionary.languages.ko },
                { code: "ja", label: dictionary.languages.ja },
                { code: "en", label: dictionary.languages.en },
              ]}
            />
          </div>
          <Button className="w-full" type="submit">
            {dictionary.onboarding.saveProfile}
          </Button>
        </form>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-bold text-muted-foreground">
          {dictionary.admin.settings.organization}
        </h2>
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-semibold text-muted-foreground">
              {dictionary.admin.settings.organizationName}
            </span>
            <span className="text-sm font-bold">{session.organization.name}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-semibold text-muted-foreground">
              {dictionary.admin.users.role}
            </span>
            <span className="text-sm font-bold">
              {dictionary.roles[session.user.role] ?? session.user.role}
            </span>
          </div>
        </div>
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

      <div className="flex items-center justify-between rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3">
        <div>
          <p className="text-sm font-bold text-destructive">
            {dictionary.common.deleteAccount}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {dictionary.common.deleteAccountWarning}
          </p>
        </div>
        <DeleteAccountSheet
          copy={{
            cancel: dictionary.common.cancel,
            deleteAccount: dictionary.common.deleteAccount,
            deleteAccountTitle: dictionary.common.deleteAccountTitle,
            deleteAccountDesc: dictionary.common.deleteAccountDesc,
            deleteAccountWarning: dictionary.common.deleteAccountWarning,
            deleteAccountConfirm: dictionary.common.deleteAccountConfirm,
          }}
        />
      </div>
    </div>
  );

  if (shellMode === "mobile") {
    return <MobileShell title={dictionary.common.account}>{content}</MobileShell>;
  }

  return <AdminShell title={dictionary.common.account}>{content}</AdminShell>;
}
