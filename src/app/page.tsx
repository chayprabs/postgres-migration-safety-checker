import type { Metadata } from "next";
import { SeoIntroBar } from "@/components/SeoIntroBar";
import { PostgresMigrationCheckerShell, getPostgresMigrationCheckerStructuredData } from "@/features/postgres-migration-checker";
import { buildPageMetadata } from "@/lib/metadata";
import { siteConfig } from "@/lib/site";
export const metadata: Metadata = buildPageMetadata({ title: siteConfig.fullName, description: siteConfig.description, path: "/" });
export default function HomePage() {
  const sd = getPostgresMigrationCheckerStructuredData();
  return (<><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([sd.softwareApplication, sd.faqPage]) }} /><SeoIntroBar /><PostgresMigrationCheckerShell /></>);
}
