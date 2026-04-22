import type { Metadata } from "next";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import { Container } from "@/components/Container";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "Authos is designed around browser-local tooling. The PostgreSQL Migration Safety Checker does not upload pasted SQL.",
};

const privacyNotes = [
  {
    title: "Browser-local analysis",
    description:
      "The PostgreSQL Migration Safety Checker is intended to run analysis locally in the browser so pasted migration SQL stays on-device.",
  },
  {
    title: "No login for the first tool",
    description:
      "You can access the checker without creating an account or connecting it to your database.",
  },
  {
    title: "No SQL upload path",
    description:
      "Pasted SQL is not meant to be uploaded anywhere. The baseline product copy and workspace are built around that guarantee.",
  },
];

export default function PrivacyPage() {
  return (
    <Container className="py-16 sm:py-20">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-4">
          <Badge>Privacy</Badge>
          <h1 className="text-4xl font-semibold tracking-tight">
            Built around local-first trust boundaries
          </h1>
          <p className="max-w-3xl text-lg leading-8 text-muted-foreground">
            Authos starts with tools that can work in the browser when the input
            is sensitive. For the PostgreSQL Migration Safety Checker, that means
            pasted SQL should stay local and should not be uploaded to Authos.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {privacyNotes.map((note) => (
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
          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Plain-language summary</h2>
            <p className="leading-7 text-muted-foreground">
              The first Authos tool is a browser-first checker for PostgreSQL
              migration SQL. No login is required, no database connection is
              required, and the intended execution model keeps pasted SQL in the
              browser instead of sending it to a server.
            </p>
          </div>
        </Card>
      </div>
    </Container>
  );
}
