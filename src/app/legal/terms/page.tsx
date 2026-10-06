import type { Metadata } from "next";
import {
  LegalDocumentView,
  LegalPageShell,
  resolvePublicLocale,
} from "@/components/legal/legal-page-shell";
import { termsOfService } from "@/lib/legal-content";

type PageProps = { searchParams: Promise<{ lang?: string }> };

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const locale = await resolvePublicLocale((await searchParams).lang);
  return { title: `${termsOfService[locale].title} · StayOps` };
}

export default async function Page({ searchParams }: PageProps) {
  const locale = await resolvePublicLocale((await searchParams).lang);
  return (
    <LegalPageShell active="terms" locale={locale}>
      <LegalDocumentView document={termsOfService[locale]} locale={locale} />
    </LegalPageShell>
  );
}
