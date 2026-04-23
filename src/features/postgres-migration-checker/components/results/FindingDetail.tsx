"use client";

import type { FindingRecipeGroup } from "../../analyzer/recipes/types";
import type {
  Finding,
  FrameworkAnalysisMetadata,
  MigrationStatement,
} from "../../types";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { LockExplainer } from "./LockExplainer";
import { LockLevelBadge } from "./LockLevelBadge";
import { StatementPreview } from "./StatementPreview";

type FindingDetailProps = {
  finding: Finding | null;
  frameworkMetadata: FrameworkAnalysisMetadata | null;
  frameworkNote?: string | null;
  onCopyFindingMarkdown: (finding: Finding) => void;
  onCopySafeRewrite: (finding: Finding) => void;
  redactionMode: boolean;
  recipeGroup: FindingRecipeGroup | null;
  statement: MigrationStatement | null;
};

function toHeadingCase(value: string) {
  return value
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function getConfidenceLabel(confidence: Finding["confidence"]) {
  switch (confidence) {
    case "high":
      return "High confidence";
    case "medium":
      return "Medium confidence";
    case "low":
      return "Low confidence";
  }
}

function getSeverityLabel(severity: Finding["severity"]) {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

function getMergedDocsLinks(
  finding: Finding,
  recipeGroup: FindingRecipeGroup | null,
) {
  const uniqueLinks = new Map(finding.docsLinks.map((link) => [link.href, link]));

  recipeGroup?.recipes.forEach((recipe) => {
    recipe.docsLinks.forEach((link) => {
      if (!uniqueLinks.has(link.href)) {
        uniqueLinks.set(link.href, link);
      }
    });
  });

  return [...uniqueLinks.values()];
}

export function FindingDetail({
  finding,
  frameworkMetadata,
  frameworkNote,
  onCopyFindingMarkdown,
  onCopySafeRewrite,
  redactionMode,
  recipeGroup,
  statement,
}: FindingDetailProps) {
  if (!finding) {
    return (
      <Card className="border border-border bg-background px-5 py-5">
        <p className="text-lg font-semibold text-foreground">Select a finding</p>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Choose any finding to inspect the related statement, lock behavior,
          safer rewrite, and copy-ready review text.
        </p>
      </Card>
    );
  }

  const primaryRecipe = recipeGroup?.recipes[0] ?? null;
  const docsLinks = getMergedDocsLinks(finding, recipeGroup);
  const canCopySafeRewrite = Boolean(
    primaryRecipe?.sqlSnippet || finding.safeRewrite,
  );

  return (
    <div className="space-y-4 xl:sticky xl:top-6">
      <Card className="border border-border bg-background px-5 py-5">
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                  {getSeverityLabel(finding.severity)}
                </span>
                <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                  {getConfidenceLabel(finding.confidence)}
                </span>
                <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                  {toHeadingCase(finding.category)}
                </span>
                <LockLevelBadge lockLevel={finding.lockLevel} />
              </div>

              <div>
                <p className="text-lg font-semibold text-foreground">
                  {finding.title}
                </p>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  {finding.summary}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  onCopyFindingMarkdown(finding);
                }}
              >
                Copy finding as Markdown
              </Button>
              {canCopySafeRewrite ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    onCopySafeRewrite(finding);
                  }}
                >
                  Copy safe rewrite
                </Button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Statement
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {finding.statementIndex + 1}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Lines
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {finding.lineStart && finding.lineEnd
                  ? `${finding.lineStart}-${finding.lineEnd}`
                  : "Not mapped"}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Object
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {finding.objectName ?? "Not detected"}
              </p>
            </div>
          </div>

          {finding.redactedPreview ? (
            <div className="rounded-2xl border border-border bg-card px-4 py-3">
              <p className="text-sm font-medium text-foreground">
                Redacted preview
              </p>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-2xl border border-border bg-background px-4 py-3 text-xs leading-6 text-foreground">
                <code>{finding.redactedPreview}</code>
              </pre>
            </div>
          ) : null}

          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                Why it matters
              </p>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                {finding.whyItMatters}
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-foreground">
                Recommended action
              </p>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                {finding.recommendedAction}
              </p>
            </div>
          </div>

          {frameworkNote ? (
            <div className="rounded-2xl border border-border bg-card px-4 py-3">
              <p className="text-sm font-medium text-foreground">
                Framework note
              </p>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                {frameworkNote}
              </p>
              {frameworkMetadata?.detectedSignals.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {frameworkMetadata.detectedSignals.map((signal) => (
                    <span
                      key={signal}
                      className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground"
                    >
                      {signal}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {primaryRecipe ? (
            <div className="rounded-2xl border border-border bg-card px-4 py-4">
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {primaryRecipe.title}
                    </p>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">
                      {primaryRecipe.description}
                    </p>
                  </div>
                  {primaryRecipe.sqlSnippet ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        onCopySafeRewrite(finding);
                      }}
                    >
                      Copy safe rewrite
                    </Button>
                  ) : null}
                </div>

                <div className="space-y-2">
                  {primaryRecipe.steps.map((step, index) => (
                    <p
                      key={`${primaryRecipe.id}-${index + 1}`}
                      className="text-sm leading-7 text-muted-foreground"
                    >
                      <span className="font-medium text-foreground">
                        {index + 1}.
                      </span>{" "}
                      {step}
                    </p>
                  ))}
                </div>

                {primaryRecipe.sqlSnippet ? (
                  <pre className="overflow-x-auto rounded-2xl border border-border bg-background px-4 py-3 text-xs leading-6 text-foreground">
                    <code>{primaryRecipe.sqlSnippet}</code>
                  </pre>
                ) : (
                  <div className="rounded-2xl border border-border bg-background px-4 py-3 text-sm leading-7 text-muted-foreground">
                    No automatic SQL snippet is suggested for this destructive
                    change. Use the staged checklist above instead.
                  </div>
                )}

                {primaryRecipe.frameworkSnippet ? (
                  <div className="rounded-2xl border border-border bg-background px-4 py-3">
                    <p className="text-sm font-medium text-foreground">
                      Framework guidance
                    </p>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">
                      {primaryRecipe.frameworkSnippet}
                    </p>
                  </div>
                ) : null}

                {primaryRecipe.warnings.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      Cautions
                    </p>
                    <div className="space-y-2">
                      {primaryRecipe.warnings.map((warning) => (
                        <p
                          key={warning}
                          className="text-sm leading-7 text-muted-foreground"
                        >
                          {warning}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : finding.safeRewrite ? (
            <div className="rounded-2xl border border-border bg-card px-4 py-4">
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {finding.safeRewrite.title}
                    </p>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">
                      {finding.safeRewrite.summary}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      onCopySafeRewrite(finding);
                    }}
                  >
                    Copy safe rewrite
                  </Button>
                </div>

                <pre className="overflow-x-auto rounded-2xl border border-border bg-background px-4 py-3 text-xs leading-6 text-foreground">
                  <code>{finding.safeRewrite.sql}</code>
                </pre>

                {finding.safeRewrite.rolloutNotes?.length ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      Rollout notes
                    </p>
                    <div className="space-y-2">
                      {finding.safeRewrite.rolloutNotes.map((note) => (
                        <p
                          key={note}
                          className="text-sm leading-7 text-muted-foreground"
                        >
                          {note}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">
              PostgreSQL docs
            </p>
            <div className="flex flex-wrap gap-2">
              {docsLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition hover:border-foreground hover:text-foreground"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <StatementPreview
        redactionMode={redactionMode}
        statement={statement}
      />
      <LockExplainer lockInfo={finding.lockInfo} lockLevel={finding.lockLevel} />
    </div>
  );
}
