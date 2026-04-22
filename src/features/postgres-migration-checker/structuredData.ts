import { getCanonicalUrl } from "@/lib/metadata";
import { postgresMigrationSafetyCheckerTool } from "@/config/tools";
import { postgresMigrationCheckerFaqEntries } from "./content";

export function getPostgresMigrationCheckerStructuredData() {
  const url = getCanonicalUrl(postgresMigrationSafetyCheckerTool.href);

  return {
    softwareApplication: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: postgresMigrationSafetyCheckerTool.name,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      isAccessibleForFree: true,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      description:
        "Paste a PostgreSQL migration and find risky ALTER TABLE, CREATE INDEX, constraint, rewrite, transaction, and data-loss operations before they lock production.",
      url,
      featureList: [
        "Lock risk review",
        "Downtime risk review",
        "Rewrite and table scan warnings",
        "Framework preset support",
        "PR-ready report planning",
        "Local-first browser workflow",
      ],
      creator: {
        "@type": "Organization",
        name: "Authos",
      },
    },
    faqPage: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: postgresMigrationCheckerFaqEntries.map((entry) => ({
        "@type": "Question",
        name: entry.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: entry.answer,
        },
      })),
    },
  };
}
