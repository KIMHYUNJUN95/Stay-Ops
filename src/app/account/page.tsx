import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccountSettings } from "@/components/account/account-settings";
import { DeleteAccountSheet } from "@/components/account/delete-account-sheet";
import { GenderSegmented } from "@/components/account/gender-segmented";
import { LanguageSegmented } from "@/components/account/language-segmented";
import { DateFormField } from "@/components/admin/shared/date-form-field";
import { AdminShell } from "@/components/shell/admin-shell";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";
import { adminLocaleTag } from "@/lib/admin-export-meta";
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

  /**
   * 패널 껍데기를 공용 `Card` 로 쓰지 않는 이유: `Card` 는 `bg-surface/80` 인데
   * `admin-console.css` 가 `.adm` 안에서 `--surface` 를 중간 톤 토프로 재정의한다. 그래서 관리
   * 콘솔에서만 카드가 탁하게 보였다(2026-07-31). 두 셸에서 같게 보이도록 명시적으로 칠한다.
   */
  /**
   * 표면색을 `bg-surface` 토큰으로 못 쓰는 이유: `admin-console.css` 가 `.adm` 안에서 `--surface`
   * 를 중간 톤 토프로 재정의해 카드·입력·버튼이 전부 탁해진다(2026-07-31). 그래서 globals 의
   * `--surface` 실측값을 직접 쓴다 — **모바일 카드 계약(`bg-surface`)과 같은 색**이라 두 셸에서
   * 의도한 톤이 그대로 나온다.
   */
  const surface = "bg-[hsl(44_52%_98.5%)]";
  const panelCard = `overflow-hidden rounded-2xl border border-border ${surface} shadow-[0_1px_2px_rgba(20,32,43,0.04)]`;
  const inputCls = surface;
  const shared = dictionary.admin.shared;
  const ap = dictionary.accountProfile;
  const profileIncomplete = !session.user.birthDate || !session.user.gender;

  const banners = (
    <>
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
      {profileIncomplete && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-4 shadow-sm">
          <p className="text-sm font-bold text-amber-900">{ap.completionTitle}</p>
          <p className="mt-1 text-sm leading-6 text-amber-800">
            {!session.user.birthDate && !session.user.gender
              ? ap.missingBirthDateAndGenderBody
              : !session.user.birthDate
                ? ap.missingBirthDateBody
                : ap.genderMissingBody}
          </p>
        </div>
      )}
    </>
  );

  const profilePanel = (
    <div className={panelCard}>
      <div className="border-b border-border/70 px-5 py-3.5">
        <span className="text-[11px] font-black uppercase tracking-[0.05em] text-muted-foreground">
          {ap.tabProfile}
        </span>
      </div>
      <form action={updateAccountProfile} className="grid gap-3.5 p-5">
        <input name="mode" type="hidden" value={shellMode} />
        {/* 신원 행 — 폼 맨 위에서 "누구의 계정을 고치는 중인지"를 먼저 보여준다. */}
        <div className="flex items-center gap-3 border-b border-border/70 pb-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[15px] bg-primary text-[17px] font-extrabold text-primary-foreground">
            {session.user.name.slice(0, 1)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[14.5px] font-extrabold tracking-[-0.02em] text-foreground">
              {session.user.name}
            </p>
            <p className="mt-0.5 truncate text-[11.5px] font-semibold text-muted-foreground">
              {session.organization.name} ·{" "}
              {dictionary.roles[session.user.role] ?? session.user.role}
            </p>
          </div>
        </div>
        <label className="grid gap-1.5 text-sm font-semibold">
          <span>{dictionary.onboarding.fullNamePlaceholder}</span>
          <Input
            defaultValue={session.user.name}
            className={inputCls}
            name="name"
            placeholder={dictionary.onboarding.fullNamePlaceholder}
            required
            type="text"
          />
        </label>
        <div className="grid gap-3.5 @2xl:grid-cols-2">
        <div className="grid gap-1.5 text-sm font-semibold">
          <span>{dictionary.onboarding.birthDateLabel}</span>
          {/* 관리 콘솔에서는 네이티브 date input 이 금지다(CLAUDE.md §4a) — 공용 `AdminDatePicker`
              를 쓴다. 다만 이 화면은 **모바일 셸에서도 열리고**(`shellMode`) `.adp` 스타일은
              `admin-console.css` 안에서 `.adm` 스코프로만 정의되므로, 모바일에서는 앱 표준 date
              input 을 그대로 쓴다(§4a 는 관리 콘솔 한정 규칙이며 모바일 입력은 iOS 정렬까지
              이미 맞춰져 있다). */}
          {shellMode === "admin" ? (
            <DateFormField
              ariaLabel={dictionary.onboarding.birthDateLabel}
              defaultValue={session.user.birthDate ?? ""}
              labels={{
                prevMonth: shared.datePrevMonth,
                nextMonth: shared.dateNextMonth,
                today: shared.dateToday,
              }}
              localeTag={adminLocaleTag(session.user.preferredLanguage)}
              name="birthDate"
              placeholder={dictionary.onboarding.birthDatePlaceholder}
            />
          ) : (
            <Input
              className={inputCls}
              defaultValue={session.user.birthDate ?? ""}
              name="birthDate"
              placeholder={dictionary.onboarding.birthDatePlaceholder}
              type="date"
            />
          )}
          <span className="text-xs font-normal text-muted-foreground">
            {dictionary.onboarding.birthDateHint}
          </span>
        </div>
        <label className="grid gap-1.5 text-sm font-semibold">
          <span>{dictionary.onboarding.phonePlaceholder}</span>
          <Input
            defaultValue={session.user.phoneNumber}
            className={inputCls}
            name="phoneNumber"
            placeholder={dictionary.onboarding.phonePlaceholder}
            required
            type="tel"
          />
          <span className="text-xs font-normal text-muted-foreground">
            {dictionary.onboarding.phoneHint}
          </span>
        </label>
        </div>
        <div className="grid gap-1.5 text-sm font-semibold">
          <span>{dictionary.onboarding.genderLabel}</span>
          <GenderSegmented
            name="gender"
            defaultValue={session.user.gender ?? ""}
            ariaLabel={dictionary.onboarding.genderLabel}
            options={[
              { code: "female", label: dictionary.onboarding.genderOptions.female },
              { code: "male", label: dictionary.onboarding.genderOptions.male },
            ]}
          />
          <span className="text-xs font-normal leading-5 text-muted-foreground">
            {ap.genderHint}
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
        <div className="mt-1 flex gap-2.5">
          <Button className="flex-1" type="submit">
            {dictionary.common.save}
          </Button>
          <Button
            className={`w-[92px] border-border ${surface} text-foreground shadow-none backdrop-blur-none hover:bg-[hsl(40_22%_94%)]`}
            type="reset"
            variant="secondary"
          >
            {dictionary.common.cancel}
          </Button>
        </div>
      </form>
    </div>
  );

  const organizationPanel = (
    <div className={panelCard}>
      <div className="border-b border-border/70 px-5 py-3.5">
        <span className="text-[11px] font-black uppercase tracking-[0.05em] text-muted-foreground">
          {ap.tabOrganization}
        </span>
      </div>
      <div className="space-y-2.5 p-5">
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
    </div>
  );

  // 되돌릴 수 없는 동작(계정 삭제)은 이 탭에만 둔다 — 예전에는 프로필 폼 바로 아래에 붙어 있었다.
  const securityPanel = (
    <div className="space-y-4">
      <p className="px-0.5 text-[13px] leading-6 text-muted-foreground">{ap.securityIntro}</p>
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/20 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-bold">{dictionary.common.logout}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{session.user.email}</p>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="secondary">
            {dictionary.common.logout}
          </Button>
        </form>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-destructive">{dictionary.common.deleteAccount}</p>
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

  const content = (
    <div className="mx-auto w-full max-w-5xl pb-10">
      <Badge>{dictionary.common.account}</Badge>
      <div className="mt-5">
        <AccountSettings
          banners={banners}
          labels={{
            profile: ap.tabProfile,
            organization: ap.tabOrganization,
            security: ap.tabSecurity,
          }}
          panels={{
            profile: profilePanel,
            organization: organizationPanel,
            security: securityPanel,
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
