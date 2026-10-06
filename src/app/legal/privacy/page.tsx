import type { Metadata } from "next";
import {
  LegalDocumentView,
  LegalPageShell,
  resolvePublicLocale,
} from "@/components/legal/legal-page-shell";
import { privacyPolicy } from "@/lib/legal-content";

type PageProps = { searchParams: Promise<{ lang?: string }> };

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const locale = await resolvePublicLocale((await searchParams).lang);
  return { title: `${privacyPolicy[locale].title} · StayOps` };
}

export default async function Page({ searchParams }: PageProps) {
  const locale = await resolvePublicLocale((await searchParams).lang);
  return (
    <LegalPageShell active="privacy" locale={locale}>
      <LegalDocumentView document={privacyPolicy[locale]} locale={locale} />
    </LegalPageShell>
  );
}
