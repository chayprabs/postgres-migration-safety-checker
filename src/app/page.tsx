import Link from "next/link";
import { Lock, MonitorSmartphone, Wrench } from "lucide-react";
import { Badge } from "@/components/Badge";
import { buttonStyles } from "@/components/Button";
import { Card } from "@/components/Card";
import { Container } from "@/components/Container";
import { FeatureGrid } from "@/components/FeatureGrid";
import { PageHero } from "@/components/PageHero";
import { ProseBlock } from "@/components/ProseBlock";
import { SectionHeader } from "@/components/SectionHeader";
import { ToolCard } from "@/components/ToolCard";
import { ToolIcon } from "@/components/ToolIcon";
import {
  comingSoonTools,
  featuredTool,
} from "@/config/tools";
import {
  postgresMigrationCheckerBrowserPromises,
  postgresMigrationCheckerChecks,
} from "@/features/postgres-migration-checker";

const localFirstSignals = [
  {
    title: "No login required",
    description: "Open a tool and start inspecting production risk immediately.",
    icon: Lock,
  },
  {
    title: "Runs in the browser",
    description: "Sensitive inputs stay local whenever the workflow can be fully browser-based.",
    icon: MonitorSmartphone,
  },
  {
    title: "Built for real engineering work",
    description: "Start with migration safety today, then expand into the rest of the delivery stack.",
    icon: Wrench,
  },
];

function ComingSoonCard({
  name,
  shortDescription,
  category,
  status,
  iconName,
}: (typeof comingSoonTools)[number]) {
  return (
    <Card className="h-full p-6">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl border border-border bg-background">
            <ToolIcon name={iconName} className="size-5 text-muted-foreground" />
          </div>
          <Badge variant="outline">{status}</Badge>
        </div>
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {category}
          </p>
          <h3 className="text-xl font-semibold tracking-tight">{name}</h3>
          <p className="text-sm leading-7 text-muted-foreground">{shortDescription}</p>
        </div>
      </div>
    </Card>
  );
}

export default function HomePage() {
  return (
    <>
      <PageHero
        badge="Developer tools"
        title="Developer tools that catch real production risks."
        description={
          <ProseBlock>
            <p>
              Authos starts with migration safety and grows toward API contracts,
              Kubernetes rollouts, Terraform plans, CI/CD workflows, and log-heavy
              debugging without forcing you into a heavyweight platform first.
            </p>
          </ProseBlock>
        }
        actions={
          <>
            <Link href="/tools" className={buttonStyles({ size: "lg" })}>
              Browse tools
            </Link>
            <Link
              href={featuredTool.href}
              className={buttonStyles({ variant: "secondary", size: "lg" })}
            >
              Open PostgreSQL checker
            </Link>
          </>
        }
        aside={
          <Card className="p-6">
            <div className="space-y-4">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Current coverage
              </p>
              <ul className="space-y-3 text-sm leading-7 text-muted-foreground">
                <li>Migration safety for PostgreSQL schema changes.</li>
                <li>Planned support for API contracts and breaking-change review.</li>
                <li>Upcoming workflows for Kubernetes, Terraform, CI/CD, and logs.</li>
              </ul>
            </div>
          </Card>
        }
      />

      <section>
        <Container className="py-14 sm:py-16">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <div className="space-y-6">
              <SectionHeader
                badge="First tool"
                title="PostgreSQL Migration Safety Checker"
                description={
                  <p>
                    The first Authos tool reviews pasted SQL for the issues that
                    tend to hurt production deploys: table locks, rewrite-heavy
                    ALTER patterns, unsafe indexes, destructive changes, and
                    transaction surprises.
                  </p>
                }
              />
              <ToolCard tool={featuredTool} />
            </div>

            <Card className="p-6">
              <div className="space-y-4">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Review surface
                </p>
                <ul className="space-y-3 text-sm leading-7 text-muted-foreground">
                  {postgresMigrationCheckerChecks.map((check) => (
                    <li key={check}>{check}</li>
                  ))}
                </ul>
              </div>
            </Card>
          </div>
        </Container>
      </section>

      <section className="border-y border-border">
        <Container className="py-14 sm:py-16">
          <div className="space-y-8">
            <SectionHeader
              badge="Built for local-first workflows"
              title="Keep sensitive inputs close to the browser."
              description={
                <p>
                  Many developer tools ask for internal schema details, logs, or
                  credentials before they deliver value. Authos starts from the
                  opposite direction and keeps the first tool useful without an
                  account.
                </p>
              }
            />

            <FeatureGrid columns={3}>
              {localFirstSignals.map(({ title, description, icon: Icon }) => (
                <Card key={title} className="p-6">
                  <div className="space-y-4">
                    <div className="flex size-11 items-center justify-center rounded-2xl border border-border bg-background">
                      <Icon className="size-5 text-muted-foreground" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold">{title}</h3>
                      <p className="text-sm leading-7 text-muted-foreground">
                        {description}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </FeatureGrid>

            <Card className="p-6">
              <div className="space-y-3">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Privacy boundary
                </p>
                <ul className="space-y-3 text-sm leading-7 text-muted-foreground">
                  {postgresMigrationCheckerBrowserPromises.map((promise) => (
                    <li key={promise}>{promise}</li>
                  ))}
                </ul>
              </div>
            </Card>
          </div>
        </Container>
      </section>

      <section>
        <Container className="py-14 sm:py-16">
          <div className="space-y-8">
            <SectionHeader
              badge="Coming next"
              title="The next Authos tools stay focused on operational clarity."
              description={
                <p>
                  The shell is designed to grow into a credible developer-tool
                  catalog without committing the site to one rigid brand system
                  too early.
                </p>
              }
            />

            <FeatureGrid columns={4}>
              {comingSoonTools.map((tool) => (
                <ComingSoonCard key={tool.id} {...tool} />
              ))}
            </FeatureGrid>
          </div>
        </Container>
      </section>
    </>
  );
}
