import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { getDictionary } from "@/lib/i18n";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";

export default async function MobileUnavailablePage() {
  const [state, session] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
  ]);

  if (state.status === "unauthenticated") {
    redirect("/auth/login?next=/mobile");
  }

  if (state.status !== "ready" || !session) {
    redirect("/onboarding?next=/mobile");
  }

  if (hasOrganizationContext(session)) {
    redirect("/mobile");
  }

  const dictionary = getDictionary(session.user.preferredLanguage);
  const copy = dictionary.mobile;

  return (
    <main className="min-h-[100svh] bg-surface px-6 py-[max(28px,env(safe-area-inset-top))] text-foreground">
      <section className="mx-auto flex min-h-[calc(100svh-56px)] w-full max-w-[420px] flex-col justify-center">
        <p className="font-serif text-[28px] font-bold italic tracking-[-0.04em] text-foreground">
          Stay Ops
        </p>
        <div className="mt-9 rounded-[32px] border border-border bg-card px-6 py-7 shadow-[0_24px_70px_-42px_rgba(16,24,40,0.5)]">
          <p className="text-[12px] font-black uppercase tracking-[0.16em] text-primary">
            {copy.unavailableEyebrow}
          </p>
          <h1 className="mt-3 text-[24px] font-black leading-tight tracking-[-0.04em] text-foreground">
            {copy.unavailableTitle}
          </h1>
          <p className="mt-4 text-[14px] font-semibold leading-6 text-muted-foreground">
            {copy.unavailableBody}
          </p>
          <p className="mt-4 rounded-2xl bg-muted px-4 py-3 text-[13px] font-bold leading-5 text-muted-foreground">
            {copy.unavailableHelp}
          </p>
          <form action={signOut} className="mt-6">
            <input name="next" type="hidden" value="/auth/login?next=/mobile" />
            <button
              className="h-13 w-full rounded-2xl bg-primary text-[15px] font-black text-primary-foreground shadow-[0_14px_34px_-18px_hsl(var(--primary-hsl)/0.75)] active:scale-[0.99]"
              type="submit"
            >
              {dictionary.common.logout}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
