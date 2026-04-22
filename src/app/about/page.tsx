import type { Metadata } from "next";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import { Container } from "@/components/Container";

export const metadata: Metadata = {
  title: "About",
  description:
    "Authos builds browser-first developer tools with clear trust boundaries and sharp, focused workflows.",
};

const principles = [
  "Keep sensitive inputs local whenever a tool can run fully in the browser.",
  "Make risky technical work easier to reason about before it reaches production.",
  "Ship focused tools with clear trust boundaries instead of bloated suites.",
];

export default function AboutPage() {
  return (
    <Container className="py-16 sm:py-20">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-4">
          <Badge>About Authos</Badge>
          <h1 className="text-4xl font-semibold tracking-tight">What we are building</h1>
          <p className="max-w-3xl text-lg leading-8 text-muted-foreground">
            Authos is a browser-first developer tools website aimed at careful,
            high-signal workflows. The first release focuses on PostgreSQL
            migrations because schema changes are easy to underestimate and costly
            to unwind.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-6">
            <div className="space-y-3">
              <h2 className="text-xl font-semibold">Current scope</h2>
              <p className="leading-7 text-muted-foreground">
                The baseline app includes a polished marketing shell, shared UI
                primitives, and a dedicated workspace for the PostgreSQL Migration
                Safety Checker.
              </p>
            </div>
          </Card>

          <Card className="p-6">
            <div className="space-y-3">
              <h2 className="text-xl font-semibold">Why local-first</h2>
              <p className="leading-7 text-muted-foreground">
                Many developer workflows involve internal schema details and
                operational context. Running browser-local analysis keeps the trust
                boundary simple and obvious.
              </p>
            </div>
          </Card>
        </div>

        <Card className="p-6">
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Principles</h2>
            <ul className="space-y-3 text-sm leading-7 text-muted-foreground">
              {principles.map((principle) => (
                <li key={principle} className="rounded-xl border border-border bg-background px-4 py-3">
                  {principle}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>
    </Container>
  );
}
