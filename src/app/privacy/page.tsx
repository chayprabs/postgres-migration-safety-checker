import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import { Container } from "@/components/Container";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata = buildPageMetadata({
  title: "Privacy",
  description:
    "Authos is designed around browser-local tooling. The PostgreSQL Migration Safety Checker analyzes SQL locally, keeps reports local, and excludes raw SQL from analytics.",
  path: "/privacy",
  keywords: [
    "Authos privacy",
    "local-first developer tools",
    "postgres migration checker privacy",
  ],
});

const generalPrivacyNotes = [
  {
    title: "Local-first by default",
    description:
      "Authos starts with tools that can do useful work in the browser without asking you to send sensitive input to a backend first.",
  },
  {
    title: "No SQL in URLs",
    description:
      "Shareable settings links are built from review preferences only. They do not include pasted migration SQL.",
  },
  {
    title: "Privacy-safe telemetry only",
    description:
      "If product analytics are enabled later, they should stay limited to aggregate counts and settings summaries instead of raw user content.",
  },
];

const checkerPrivacyPoints = [
  "SQL is processed client-side in the browser workspace.",
  "File uploads are read by the browser only.",
  "Workspace preferences such as PostgreSQL version, framework preset, and redaction mode may be stored locally.",
  "Raw SQL, statement text, filenames, object names, and finding snippets are not sent through the analytics adapter.",
  "Reports are generated locally in the browser.",
  "Settings links do not include SQL.",
];

export default function PrivacyPage() {
  return (
    <Container className="py-16 sm:py-20">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="space-y-4">
          <Badge>Privacy</Badge>
          <h1 className="text-4xl font-semibold tracking-tight">
            Built around local-first trust boundaries
          </h1>
          <p className="max-w-3xl text-lg leading-8 text-muted-foreground">
            Authos is being designed for workflows where developer input can be
            sensitive. That means the default posture for the PostgreSQL
            Migration Safety Checker is local-first analysis, local report
            generation, and privacy-safe product instrumentation.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {generalPrivacyNotes.map((note) => (
            <Card key={note.title} className="p-6">
              <div className="space-y-3">
                <h2 className="text-lg font-semibold">{note.title}</h2>
                <p className="text-sm leading-7 text-muted-foreground">
                  {note.description}
                </p>
              </div>
            </Card>
          ))}
        </div>

        <Card className="p-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold">
                PostgreSQL Migration Safety Checker
              </h2>
              <p className="max-w-3xl leading-7 text-muted-foreground">
                This tool exists specifically for reviewing pasted migration SQL
                with stronger trust signals. The goal is to make the privacy
                boundary obvious and accurate for developers working with
                potentially sensitive schema changes, credentials, or rollout
                notes.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {checkerPrivacyPoints.map((point) => (
                <div
                  key={point}
                  className="rounded-2xl border border-border bg-background px-4 py-4"
                >
                  <p className="text-sm leading-7 text-muted-foreground">
                    {point}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Plain-language summary</h2>
            <p className="leading-7 text-muted-foreground">
              The PostgreSQL Migration Safety Checker is intended to analyze SQL
              in your browser, not upload it to Authos. If you enable redaction
              mode, output views and exported snippets mask likely secrets
              without changing the editor until you explicitly replace the text.
              Reports are generated locally, and shareable settings links do not
              carry your migration contents.
            </p>
          </div>
        </Card>
      </div>
    </Container>
  );
}
