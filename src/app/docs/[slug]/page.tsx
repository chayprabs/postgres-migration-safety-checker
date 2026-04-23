import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/Badge";
import { buttonStyles } from "@/components/Button";
import { Card } from "@/components/Card";
import { Container } from "@/components/Container";
import { PageHero } from "@/components/PageHero";
import { ProseBlock } from "@/components/ProseBlock";
import { postgresMigrationSafetyCheckerTool } from "@/config/tools";
import {
  getPostgresDocsArticle,
  getPostgresDocsPath,
  postgresDocsArticles,
} from "@/features/postgres-migration-checker";
import { buildPageMetadata } from "@/lib/metadata";

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export function generateStaticParams() {
  return postgresDocsArticles.map((article) => ({
    slug: article.slug,
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = getPostgresDocsArticle(slug);

  if (!article) {
    return {};
  }

  return buildPageMetadata({
    title: article.title,
    description: article.description,
    path: getPostgresDocsPath(article.slug),
    type: "article",
    keywords: [
      "postgresql migration safety checker",
      "postgres migration docs",
      article.slug.replace(/-/g, " "),
    ],
  });
}

export default async function PostgresDocsArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const article = getPostgresDocsArticle(slug);

  if (!article) {
    notFound();
  }

  const relatedArticles = article.relatedSlugs
    .map((relatedSlug) => getPostgresDocsArticle(relatedSlug))
    .filter((relatedArticle): relatedArticle is NonNullable<typeof relatedArticle> => {
      return relatedArticle !== null;
    });

  return (
    <>
      <PageHero
        badge="Migration docs"
        title={article.title}
        description={
          <p>
            {article.description}
          </p>
        }
        actions={
          <>
            <Link
              href={postgresMigrationSafetyCheckerTool.href}
              className={buttonStyles({ size: "lg" })}
            >
              Try the checker
            </Link>
            <Link href="/docs" className={buttonStyles({ variant: "secondary", size: "lg" })}>
              Browse docs
            </Link>
          </>
        }
        breadcrumbs={[
          { href: "/", label: "Home" },
          { href: "/docs", label: "Docs" },
          { label: article.title },
        ]}
        aside={
          <Card className="p-6">
            <div className="space-y-4">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Use with the tool
              </p>
              <p className="text-sm leading-7 text-muted-foreground">
                This article explains the rollout pattern. The checker helps you
                preflight the SQL, but it cannot see live locks, long
                transactions, or your deployment window.
              </p>
              <Link
                href={postgresMigrationSafetyCheckerTool.href}
                className={buttonStyles({ variant: "secondary" })}
              >
                Open PostgreSQL checker
              </Link>
            </div>
          </Card>
        }
      />

      <section>
        <Container className="py-12 sm:py-14">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] lg:items-start">
            <div className="space-y-8">
              <Card className="p-6">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">SQL example</Badge>
                    <Badge variant="outline">Production rollout</Badge>
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-xl font-semibold">{article.sqlExample.title}</h2>
                    <p className="text-sm leading-7 text-muted-foreground">
                      Use this as a review template, then adjust it to your table
                      size, traffic pattern, and framework behavior.
                    </p>
                  </div>
                  <pre className="overflow-x-auto rounded-2xl border border-border bg-background px-4 py-4 text-sm leading-7 text-foreground">
                    <code>{article.sqlExample.code}</code>
                  </pre>
                </div>
              </Card>

              {article.sections.map((section) => (
                <Card key={section.title} className="p-6">
                  <div className="space-y-4">
                    <h2 className="text-2xl font-semibold">{section.title}</h2>
                    <ProseBlock className="max-w-none">
                      {section.paragraphs.map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                      ))}
                    </ProseBlock>
                    {section.bullets?.length ? (
                      <ul className="space-y-3 text-sm leading-7 text-muted-foreground">
                        {section.bullets.map((bullet) => (
                          <li
                            key={bullet}
                            className="rounded-2xl border border-border bg-background px-4 py-4"
                          >
                            {bullet}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </Card>
              ))}

              <Card className="p-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h2 className="text-xl font-semibold">
                      Run your own SQL through the checker
                    </h2>
                    <p className="text-sm leading-7 text-muted-foreground">
                      When the migration shape is ready, paste the real SQL into
                      the PostgreSQL Migration Safety Checker to look for lock
                      risks, ALTER TABLE rewrite issues, CREATE INDEX CONCURRENTLY
                      caveats, and framework-specific warnings.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Link
                      href={postgresMigrationSafetyCheckerTool.href}
                      className={buttonStyles({ size: "lg" })}
                    >
                      Open the tool
                    </Link>
                    <Link
                      href="/docs"
                      className={buttonStyles({ variant: "secondary", size: "lg" })}
                    >
                      More migration docs
                    </Link>
                  </div>
                </div>
              </Card>
            </div>

            <div className="space-y-6 lg:sticky lg:top-24">
              <Card className="p-6">
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold">Official references</h2>
                  <div className="space-y-3">
                    {article.officialLinks.map((link) => (
                      <a
                        key={link.href}
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-2xl border border-border bg-background px-4 py-4 transition hover:border-foreground/20"
                      >
                        <p className="text-sm font-medium text-foreground">{link.label}</p>
                        <p className="mt-1 text-sm leading-7 text-muted-foreground">
                          {link.description}
                        </p>
                      </a>
                    ))}
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold">Related docs</h2>
                  <div className="space-y-3">
                    {relatedArticles.map((relatedArticle) => (
                      <Link
                        key={relatedArticle.slug}
                        href={getPostgresDocsPath(relatedArticle.slug)}
                        className="block rounded-2xl border border-border bg-background px-4 py-4 transition hover:border-foreground/20"
                      >
                        <p className="text-sm font-medium text-foreground">
                          {relatedArticle.title}
                        </p>
                        <p className="mt-1 text-sm leading-7 text-muted-foreground">
                          {relatedArticle.cardSummary}
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
