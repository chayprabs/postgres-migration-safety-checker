import Link from "next/link";
import { Badge } from "@/components/Badge";
import { buttonStyles } from "@/components/Button";
import { Card } from "@/components/Card";
import { Container } from "@/components/Container";
import { FeatureGrid } from "@/components/FeatureGrid";
import { PageHero } from "@/components/PageHero";
import { SectionHeader } from "@/components/SectionHeader";
import { postgresMigrationSafetyCheckerTool } from "@/config/tools";
import {
  getPostgresDocsPath,
  postgresDocsArticles,
} from "@/features/postgres-migration-checker";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata = buildPageMetadata({
  title: "PostgreSQL Migration Docs",
  description:
    "Read PostgreSQL migration guides for lock levels, CREATE INDEX CONCURRENTLY, safe NOT NULL rollouts, NOT VALID foreign keys, and Rails PostgreSQL migration safety.",
  path: "/docs",
  keywords: [
    "postgresql migration guides",
    "postgres migration docs",
    "create index concurrently guide",
    "postgres zero downtime migration",
  ],
});

export default function DocsIndexPage() {
  return (
    <>
      <PageHero
        badge="Docs"
        title="PostgreSQL migration guides for safer deploys"
        description={
          <p>
            These docs support the PostgreSQL Migration Safety Checker with
            practical rollout guides for migration locks, concurrent indexes,
            phased NOT NULL changes, NOT VALID constraints, and Rails-specific
            PostgreSQL migration safety.
          </p>
        }
        actions={
          <>
            <Link
              href={postgresMigrationSafetyCheckerTool.href}
              className={buttonStyles({ size: "lg" })}
            >
              Open the checker
            </Link>
            <Link href="/tools" className={buttonStyles({ variant: "secondary", size: "lg" })}>
              Browse tools
            </Link>
          </>
        }
        breadcrumbs={[
          { href: "/", label: "Home" },
          { label: "Docs" },
        ]}
        aside={
          <Card className="p-6">
            <div className="space-y-4">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                What these pages do
              </p>
              <ul className="space-y-3 text-sm leading-7 text-muted-foreground">
                <li>Explain why risky PostgreSQL migrations block production.</li>
                <li>Show phased SQL examples you can adapt before deploy.</li>
                <li>Link back to the browser-local checker for preflight review.</li>
              </ul>
            </div>
          </Card>
        }
      />

      <section>
        <Container className="py-12 sm:py-14">
          <div className="space-y-6">
            <SectionHeader
              badge="Migration playbooks"
              title="Start with the migration pattern you are reviewing"
              description={
                <p>
                  Each guide is written to be crawlable, practical, and honest
                  about where a browser-based checker helps and where production
                  rollout judgment still matters.
                </p>
              }
            />

            <FeatureGrid columns={2}>
              {postgresDocsArticles.map((article) => (
                <Card key={article.slug} className="p-6">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">Migration guide</Badge>
                      <Badge variant="outline">PostgreSQL</Badge>
                    </div>

                    <div className="space-y-2">
                      <h2 className="text-xl font-semibold">{article.title}</h2>
                      <p className="text-sm leading-7 text-muted-foreground">
                        {article.cardSummary}
                      </p>
                    </div>

                    <Link
                      href={getPostgresDocsPath(article.slug)}
                      className={buttonStyles({ variant: "secondary" })}
                    >
                      Read guide
                    </Link>
                  </div>
                </Card>
              ))}
            </FeatureGrid>
          </div>
        </Container>
      </section>
    </>
  );
}
