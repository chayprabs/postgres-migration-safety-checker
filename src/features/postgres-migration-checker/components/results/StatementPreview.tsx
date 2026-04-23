"use client";

import { redactSecretsInText } from "../../analyzer/security/secretDetection";
import type { MigrationStatement } from "../../types";
import { Card } from "@/components/Card";

type StatementPreviewProps = {
  redactionMode: boolean;
  statement: MigrationStatement | null;
};

function toHeadingCase(value: string) {
  return value
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function StatementPreview({
  redactionMode,
  statement,
}: StatementPreviewProps) {
  if (!statement) {
    return (
      <Card className="border border-border bg-background px-4 py-4">
        <p className="text-sm font-medium text-foreground">Statement preview</p>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          No related statement was mapped for this finding.
        </p>
      </Card>
    );
  }

  const displaySql = redactionMode
    ? redactSecretsInText(statement.raw)
    : statement.raw;
  const lines = displaySql.split("\n");
  const hasRedactions = displaySql !== statement.raw;

  return (
    <Card className="border border-border bg-background px-4 py-4">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Statement preview</p>
            <p className="text-sm leading-7 text-muted-foreground">
              Statement {statement.index + 1} · lines {statement.lineStart}-
              {statement.lineEnd} · {toHeadingCase(statement.kind)}
            </p>
            {hasRedactions ? (
              <p className="text-sm leading-7 text-muted-foreground">
                Likely secrets are masked in this preview because redaction mode is on.
              </p>
            ) : null}
          </div>
          <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            {statement.targetObject ?? "Target not detected"}
          </span>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <div className="min-w-full font-mono text-xs leading-6 text-foreground">
            {lines.map((line, index) => (
              <div
                key={`${statement.startOffset}-${statement.lineStart + index}`}
                className="grid grid-cols-[auto_1fr] gap-4 border-b border-border/60 px-4 py-1.5 last:border-b-0"
              >
                <span className="select-none text-right text-muted-foreground">
                  {statement.lineStart + index}
                </span>
                <span className="whitespace-pre-wrap break-words">
                  {line.length > 0 ? line : " "}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
