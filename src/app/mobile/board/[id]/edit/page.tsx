import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getOnboardingState } from "@/lib/onboarding";
import { getDictionary } from "@/lib/i18n";

type PageProps = {
  params: Promise<{ id: string }>;
};

// Page 4 placeholder. The 글 수정 action exists server-side (updateBoardPost), but the edit FORM is
// deferred to Page 4 — this route exists so the action-sheet "글 수정" entry never 404s.
export default async function BoardEditPlaceholderPage({ params }: PageProps) {
  const { id } = await params;
  const [state, session] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
  ]);

  if (state.status === "unauthenticated") {
    redirect(`/auth/login?next=/mobile/board/${id}/edit`);
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/mobile/unavailable");
  }

  const copy = getDictionary(session.user.preferredLanguage).board;

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-5 bg-background px-10 text-center">
      <p className="text-[14px] font-extrabold text-foreground">{copy.editTodo}</p>
      <Link
        href={`/mobile/board/${id}`}
        className="inline-flex h-10 items-center gap-[6px] rounded-full border border-border bg-surface px-[16px] text-[13px] font-extrabold text-[hsl(222_20%_28%)]"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {copy.close}
      </Link>
    </div>
  );
}
