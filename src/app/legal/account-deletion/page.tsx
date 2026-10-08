import type { Metadata } from "next";
import {
  LegalDocumentView,
  LegalPageShell,
  resolvePublicLocale,
} from "@/components/legal/legal-page-shell";
import { getDictionary } from "@/lib/i18n";
import { accountDeletion } from "@/lib/legal-content";

type PageProps = { searchParams: Promise<{ lang?: string }> };

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const locale = await resolvePublicLocale((await searchParams).lang);
  return { title: `${accountDeletion[locale].title} · Foldy` };
}

/** 계정 삭제 안내 — Google Play 「계정 삭제 URL」. 앱을 지운 사람도 웹에서 삭제 · 요청할 수 있어야 한다. */
export default async function AccountDeletionPage({ searchParams }: PageProps) {
  const locale = await resolvePublicLocale((await searchParams).lang);
  const t = getDictionary(locale).legal;
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "";

  return (
    <LegalPageShell active="deletion" locale={locale}>
      <LegalDocumentView document={accountDeletion[locale]} locale={locale} />
      <div className="mt-8 rounded-xl border border-border bg-muted/20 px-4 py-4">
        {supportEmail ? (
          <a
            className="inline-flex flex-wrap items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-[13.5px] font-bold text-primary-foreground"
            href={`mailto:${supportEmail}?subject=${encodeURIComponent(t.deletionRequestSubject)}`}
          >
            {t.deletionRequestCta}
            <span className="font-semibold opacity-80">{supportEmail}</span>
          </a>
        ) : (
          <p className="text-[13px] font-semibold text-muted-foreground">{t.contactFallback}</p>
        )}
      </div>
    </LegalPageShell>
  );
}
