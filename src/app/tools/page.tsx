import type { Metadata } from "next";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import { Container } from "@/components/Container";
import { FeatureGrid } from "@/components/FeatureGrid";
import { PageHero } from "@/components/PageHero";
import { SectionHeader } from "@/components/SectionHeader";
import { ToolCard } from "@/components/ToolCard";
import { ToolIcon } from "@/components/ToolIcon";
import { comingSoonTools, toolCategories, tools } from "@/config/tools";

export const metadata: Metadata = {
  title: "Tools",
  description:
    "Browse Authos developer tools, starting with the PostgreSQL Migration Safety Checker.",
};

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

export default function ToolsPage() {
  return (
    <>
      <PageHero
        badge="Tools directory"
        title="Focused tools for high-risk engineering work."
        description={
          <p>
            Start with PostgreSQL migration review today and use the same shell
            for future tools around API contracts, infrastructure changes, CI/CD,
            and operational diagnostics.
          </p>
        }
        breadcrumbs={[
          { href: "/", label: "Home" },
          { label: "Tools" },
        ]}
      />

      <section>
        <Container className="py-10 sm:py-12">
          <Card className="p-5 sm:p-6">
            <div className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="tool-search" className="text-sm font-medium text-foreground">
                  Search tools
                </label>
                <input
                  id="tool-search"
                  name="tool-search"
                  type="search"
                  placeholder="Search tools, checks, or workflows"
                  className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm text-foreground outline-none transition focus:border-ring focus:ring-4 focus:ring-ring/15"
                />
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">Categories</p>
                <div className="flex flex-wrap gap-2">
                  {toolCategories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      aria-pressed={category === "All"}
                      className={`rounded-full border px-3 py-2 text-sm transition ${
                        category === "All"
                          ? "border-border bg-accent text-accent-foreground"
                          : "border-border bg-background text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </Container>
      </section>

      <section>
        <Container className="pb-12 sm:pb-14">
          <div className="space-y-10">
            <div className="space-y-6">
              <SectionHeader
                badge="Available now"
                title="Current tool"
                description={
                  <p>
                    The PostgreSQL Migration Safety Checker is the first production
                    workflow in Authos and sets the privacy and UX expectations for
                    the rest of the catalog.
                  </p>
                }
              />
              <FeatureGrid columns={2}>
                {tools.map((tool) => (
                  <ToolCard key={tool.id} tool={tool} />
                ))}
              </FeatureGrid>
            </div>

            <div className="space-y-6">
              <SectionHeader
                badge="Coming soon"
                title="Next tools in the shell"
                description={
                  <p>
                    These placeholders show how the directory can expand without
                    redesigning the entire product every time a new tool ships.
                  </p>
                }
              />
              <FeatureGrid columns={4}>
                {comingSoonTools.map((tool) => (
                  <ComingSoonCard key={tool.id} {...tool} />
                ))}
              </FeatureGrid>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
