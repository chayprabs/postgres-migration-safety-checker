"use client";

import type {
  FindingRecipeGroup,
  SafeRewriteRecipe,
} from "../../analyzer/recipes/types";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";

type SafeRewritePanelProps = {
  recipeGroups: readonly FindingRecipeGroup[];
  totalGroups: number;
  onCopyAllMarkdown: () => void;
  onCopyRecipeMarkdown: (
    recipeGroup: FindingRecipeGroup,
    recipe: SafeRewriteRecipe,
  ) => void;
  onCopySqlSnippet: (recipe: SafeRewriteRecipe) => void;
};

function toHeadingCase(value: string) {
  return value
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function SafeRewritePanel({
  recipeGroups,
  totalGroups,
  onCopyAllMarkdown,
  onCopyRecipeMarkdown,
  onCopySqlSnippet,
}: SafeRewritePanelProps) {
  if (totalGroups === 0) {
    return (
      <Card className="border border-border bg-background px-5 py-5">
        <p className="text-lg font-semibold text-foreground">
          No staged recipes available yet.
        </p>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          The checker found risks, but none of the current rule mappings produced
          a structured safe-rewrite recipe for these findings.
        </p>
      </Card>
    );
  }

  if (recipeGroups.length === 0) {
    return (
      <Card className="border border-border bg-background px-5 py-5">
        <p className="text-lg font-semibold text-foreground">
          No safe rewrites match the current filters.
        </p>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Clear or relax one of the findings filters to bring staged recipes back
          into view.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border border-border bg-background px-5 py-5">
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Safe rewrites</p>
              <p className="text-sm leading-7 text-muted-foreground">
                Review and adapt these snippets to your schema, traffic, and
                deployment process.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                {recipeGroups.length} of {totalGroups} groups shown
              </span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={onCopyAllMarkdown}
              >
                Copy all as Markdown
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm leading-7 text-muted-foreground">
            These are staged rollout patterns, not guaranteed auto-fixes. Validate
            naming, predicates, batching strategy, transaction handling, and deploy
            order before running them.
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        {recipeGroups.map((group) => (
          <Card
            key={group.findingId}
            className="border border-border bg-background px-5 py-5"
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1">
                    {group.severity}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1">
                    {toHeadingCase(group.category)}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1">
                    Statement {group.statementIndex + 1}
                  </span>
                  {group.lineStart && group.lineEnd ? (
                    <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1">
                      Lines {group.lineStart}-{group.lineEnd}
                    </span>
                  ) : null}
                </div>

                <div>
                  <p className="text-base font-semibold text-foreground">
                    {group.title}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    {group.summary}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {group.recipes.map((recipe) => (
                  <div
                    key={`${group.findingId}-${recipe.id}`}
                    className="rounded-3xl border border-border bg-card px-4 py-4"
                  >
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {recipe.title}
                          </p>
                          <p className="mt-2 text-sm leading-7 text-muted-foreground">
                            {recipe.description}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              onCopyRecipeMarkdown(group, recipe);
                            }}
                          >
                            Copy Markdown
                          </Button>
                          {recipe.sqlSnippet ? (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => {
                                onCopySqlSnippet(recipe);
                              }}
                            >
                              Copy SQL
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">
                          Staged steps
                        </p>
                        <ol className="space-y-2 text-sm leading-7 text-muted-foreground">
                          {recipe.steps.map((step, index) => (
                            <li
                              key={`${recipe.id}-${index + 1}`}
                              className="flex gap-3"
                            >
                              <span className="font-medium text-foreground">
                                {index + 1}.
                              </span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      </div>

                      {recipe.sqlSnippet ? (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-foreground">
                            SQL template
                          </p>
                          <pre
                            aria-label={`${recipe.title} SQL template`}
                            className="overflow-x-auto rounded-2xl border border-border bg-background px-4 py-3 text-xs leading-6 text-foreground"
                          >
                            <code>{recipe.sqlSnippet}</code>
                          </pre>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-border bg-background px-4 py-3 text-sm leading-7 text-muted-foreground">
                          No automatic SQL snippet is suggested for this recipe.
                          Use the checklist above to stage the destructive change
                          safely.
                        </div>
                      )}

                      {recipe.frameworkSnippet ? (
                        <div className="rounded-2xl border border-border bg-background px-4 py-3">
                          <p className="text-sm font-medium text-foreground">
                            Framework guidance
                          </p>
                          <p className="mt-2 text-sm leading-7 text-muted-foreground">
                            {recipe.frameworkSnippet}
                          </p>
                        </div>
                      ) : null}

                      {recipe.warnings.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-foreground">
                            Cautions
                          </p>
                          <div className="space-y-2">
                            {recipe.warnings.map((warning) => (
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

                      {recipe.docsLinks.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {recipe.docsLinks.map((link) => (
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
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
