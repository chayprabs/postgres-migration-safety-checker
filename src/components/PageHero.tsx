import * as React from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Container } from "@/components/Container";
import { SectionHeader } from "@/components/SectionHeader";

type PageHeroProps = {
  badge?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: { href?: string; label: string }[];
  aside?: React.ReactNode;
};

export function PageHero({
  badge,
  title,
  description,
  actions,
  breadcrumbs,
  aside,
}: PageHeroProps) {
  return (
    <section className="border-b border-border">
      <Container className="py-12 sm:py-16 lg:py-20">
        <div className="space-y-6">
          {breadcrumbs?.length ? <Breadcrumbs items={breadcrumbs} /> : null}
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] lg:items-start">
            <SectionHeader
              badge={badge}
              title={title}
              description={description}
              actions={actions}
              titleAs="h1"
            />
            {aside ? <div className="lg:pt-1">{aside}</div> : null}
          </div>
        </div>
      </Container>
    </section>
  );
}
