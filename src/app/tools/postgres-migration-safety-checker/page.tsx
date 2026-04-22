import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import { Container } from "@/components/Container";
import { FeatureGrid } from "@/components/FeatureGrid";
import { PageHero } from "@/components/PageHero";
import { ProseBlock } from "@/components/ProseBlock";
import { SectionHeader } from "@/components/SectionHeader";
import { buttonStyles } from "@/components/Button";
import { postgresMigrationSafetyCheckerTool } from "@/config/tools";
import {
  PostgresMigrationCheckerShell,
  getPostgresMigrationCheckerStructuredData,
  postgresMigrationCheckerCatchCards,
  postgresMigrationCheckerFaqEntries,
  postgresMigrationCheckerHowItWorksSteps,
  postgresMigrationCheckerRelatedTools,
  postgresMigrationCheckerTrustBadges,
  postgresMigrationCheckerUseCases,
  postgresMigrationCheckerWhyLocalFirstPoints,
} from "@/features/postgres-migration-checker";
import { getCanonicalUrl } from "@/lib/metadata";

const title =
  "PostgreSQL Migration Safety Checker - Find Lock and Downtime Risks | Authos";
const description =
  "Paste a PostgreSQL migration and find risky ALTER TABLE, CREATE INDEX, constraint, rewrite, transaction, and data-loss operations before they lock production.";
const canonical = getCanonicalUrl(postgresMigrationSafetyCheckerTool.href);

export const metadata: Metadata = {
  title: {
    absolute: title,
  },
  description,
  alternates: {
    canonical,
  },
  openGraph: {
    title,
    description,
    url: canonical,
    type: "website",
  },
};

export default function PostgresMigrationSafetyCheckerPage() {
  const structuredData = getPostgresMigrationCheckerStructuredData();

  return (
    <>
      <PageHero
        badge="Database tool"
        title="PostgreSQL Migration Safety Checker"
        description={
          <div className="space-y-5">
            <ProseBlock>
              <p>
                Paste a migration SQL file and get a lock, downtime, rewrite, and
                data-loss risk report before it reaches production.
              </p>
            </ProseBlock>
            <div className="flex flex-wrap gap-2">
              {postgresMigrationCheckerTrustBadges.map((badge) => (
                <Badge key={badge}>{badge}</Badge>
              ))}
            </div>
          </div>
        }
        actions={
          <>
            <Link href="#checker-workspace" className={buttonStyles({ size: "lg" })}>
              Check a migration
            </Link>
            <Link
              href="#unsafe-example"
              className={buttonStyles({ variant: "secondary", size: "lg" })}
            >
              Load unsafe example
            </Link>
          </>
        }
        breadcrumbs={[
          { href: "/", label: "Home" },
          { href: "/tools", label: "Tools" },
          { label: postgresMigrationSafetyCheckerTool.name },
        ]}
        aside={
          <Card className="p-6">
            <div className="space-y-4">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Before you deploy
              </p>
              <div className="space-y-3">
                <h2 className="text-xl font-semibold">Get a review surface built for risky DDL.</h2>
                <p className="text-sm leading-7 text-muted-foreground">
                  This landing page sets up the browser-local workspace shell for
                  migration review, along with the copy, metadata, and structure
                  a real tool page needs before the analyzer arrives.
                </p>
              </div>
              <ul className="space-y-3 text-sm leading-7 text-muted-foreground">
                <li>Flag risky ALTER TABLE and lock-heavy schema changes.</li>
                <li>Review framework-specific migration behavior before rollout.</li>
                <li>Prepare review notes that fit naturally into a pull request.</li>
              </ul>
            </div>
          </Card>
        }
      />

      <section className="border-b border-border">
        <Container className="py-10 sm:py-12">
          <PostgresMigrationCheckerShell />
        </Container>
      </section>

      <section>
        <Container className="py-12 sm:py-14">
          <div className="space-y-6">
            <SectionHeader
              badge="What this checker catches"
              title="Find the migration patterns that are most likely to bite production."
              description={
                <p>
                  The goal is to turn raw migration SQL into a clearer review of
                  operational risk before the change reaches a live database.
                </p>
              }
            />

            <FeatureGrid columns={4}>
              {postgresMigrationCheckerCatchCards.map((item) => (
                <Card key={item.title} className="p-6">
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold">{item.title}</h3>
                    <p className="text-sm leading-7 text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </Card>
              ))}
            </FeatureGrid>
          </div>
        </Container>
      </section>

      <section className="border-y border-border">
        <Container className="py-12 sm:py-14">
          <div className="space-y-6">
            <SectionHeader
              badge="How it works"
              title="A fast browser workflow for migration review."
              description={
                <p>
                  The analyzer is not wired in yet, but the page structure is set
                  up around the exact review flow the finished tool should support.
                </p>
              }
            />

            <FeatureGrid columns={4}>
              {postgresMigrationCheckerHowItWorksSteps.map((step, index) => (
                <Card key={step.title} className="p-6">
                  <div className="space-y-4">
                    <Badge variant="outline">Step {index + 1}</Badge>
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold">{step.title}</h3>
                      <p className="text-sm leading-7 text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </FeatureGrid>
          </div>
        </Container>
      </section>

      <section>
        <Container className="py-12 sm:py-14">
          <div className="space-y-6">
            <SectionHeader
              badge="Common use cases"
              title="Use it anywhere migration safety needs to become more teachable."
              description={
                <p>
                  This page is aimed at both experienced reviewers and teams that
                  want safer migration habits to become part of normal engineering
                  workflow.
                </p>
              }
            />

            <FeatureGrid columns={3}>
              {postgresMigrationCheckerUseCases.map((useCase) => (
                <Card key={useCase.title} className="p-6">
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold">{useCase.title}</h3>
                    <p className="text-sm leading-7 text-muted-foreground">
                      {useCase.description}
                    </p>
                  </div>
                </Card>
              ))}
            </FeatureGrid>
          </div>
        </Container>
      </section>

      <section className="border-y border-border">
        <Container className="py-12 sm:py-14">
          <div className="grid gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-start">
            <SectionHeader
              badge="Why local-first matters"
              title="Migration review often contains more sensitive context than people realize."
              description={
                <ProseBlock>
                  <p>
                    PostgreSQL migrations can expose schema internals, customer
                    model names, retention rules, rollout sequencing, and business
                    assumptions. That is exactly why the default tool should not
                    upload raw SQL just to provide a safety check.
                  </p>
                </ProseBlock>
              }
            />

            <Card className="p-6">
              <div className="space-y-4">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Privacy boundary
                </p>
                <ul className="space-y-3 text-sm leading-7 text-muted-foreground">
                  {postgresMigrationCheckerWhyLocalFirstPoints.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
            </Card>
          </div>
        </Container>
      </section>

      <section>
        <Container className="py-12 sm:py-14">
          <div className="space-y-6">
            <SectionHeader
              badge="PostgreSQL migration safety FAQ"
              title="Questions teams usually ask before they trust a migration checker."
              description={
                <p>
                  The FAQ text is intentionally plain and crawlable so search
                  engines and future readers can understand the tool without
                  opening the workspace first.
                </p>
              }
            />

            <FeatureGrid columns={2}>
              {postgresMigrationCheckerFaqEntries.map((entry) => (
                <Card key={entry.question} className="p-6">
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold">{entry.question}</h3>
                    <p className="text-sm leading-7 text-muted-foreground">
                      {entry.answer}
                    </p>
                  </div>
                </Card>
              ))}
            </FeatureGrid>
          </div>
        </Container>
      </section>

      <section className="border-t border-border">
        <Container className="py-12 sm:py-14">
          <div className="space-y-6">
            <SectionHeader
              badge="Related tools"
              title="Adjacent workflows that fit naturally beside migration review."
              description={
                <p>
                  Authos is being shaped as a catalog of compact developer tools,
                  so this page also sets expectations for the kinds of follow-on
                  utilities that can share the same shell.
                </p>
              }
            />

            <FeatureGrid columns={4}>
              {postgresMigrationCheckerRelatedTools.map((tool) => (
                <Card key={tool.name} className="p-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-lg font-semibold">{tool.name}</h3>
                      <Badge variant="outline">Coming soon</Badge>
                    </div>
                    <p className="text-sm leading-7 text-muted-foreground">
                      {tool.description}
                    </p>
                  </div>
                </Card>
              ))}
            </FeatureGrid>
          </div>
        </Container>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData.softwareApplication),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData.faqPage),
        }}
      />
    </>
  );
}
