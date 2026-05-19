import type { FindingRecipeGroup } from "../analyzer/recipes/types";
import { redactSecretsInText } from "../analyzer/security/secretDetection";
import type { AnalysisResult, Finding } from "../types";
import type { ReportExportInput } from "./types";

function toHeadingCase(value: string) {
  return value
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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

function escapeMarkdownCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function findStatement(
  result: AnalysisResult,
  statementIndex: number,
) {
  return result.statements.find((statement) => statement.index === statementIndex) ?? null;
}

function findRecipeGroup(
  recipeGroups: readonly FindingRecipeGroup[],
  findingId: string,
) {
  return recipeGroups.find((group) => group.findingId === findingId) ?? null;
}

function getDisplaySqlSnippet(
  sqlSnippet: string,
  redactionMode: boolean,
) {
  return redactionMode ? redactSecretsInText(sqlSnippet) : sqlSnippet;
}

function buildSummaryBullets(input: ReportExportInput) {
  const blockingVisibleFindings = input.findings.filter(
    (finding) => finding.lockInfo?.blocksReads || finding.lockInfo?.blocksWrites,
  ).length;

  return [
    `Risk score is **${input.result.summary.risk.score}/100** with label **${input.result.summary.risk.label}** across ${input.result.summary.totalStatements} statement(s).`,
    `This report includes **${input.findings.length}** finding(s) from the current review view out of **${input.result.findings.length}** total finding(s).`,
    `Highest detected lock level is **${input.result.summary.risk.highestLockLevel ?? "None detected"}**, and **${blockingVisibleFindings}** visible finding(s) appear to block reads or writes.`,
    `The checker generated **${input.recipeGroups.length}** safe rewrite recipe group(s) and **${input.parserDiagnostics.length}** parser diagnostic(s).`,
  ];
}

function buildFindingsTable(input: ReportExportInput) {
  if (input.findings.length === 0) {
    return ["No findings are included in the current report view."];
  }

  const lines = [
    "| # | Severity | Category | Statement | Lock | Confidence | Title |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];

  input.findings.forEach((finding, index) => {
    lines.push(
      `| ${index + 1} | ${finding.severity.toUpperCase()} | ${escapeMarkdownCell(
        toHeadingCase(finding.category),
      )} | ${finding.statementIndex + 1} | ${escapeMarkdownCell(
        finding.lockLevel ?? "None",
      )} | ${escapeMarkdownCell(
        getConfidenceLabel(finding.confidence),
      )} | ${escapeMarkdownCell(finding.title)} |`,
    );
  });

  return lines;
}

function buildDetailedFindings(input: ReportExportInput) {
  if (input.findings.length === 0) {
    return ["No findings are included in the current report view."];
  }

  const lines: string[] = [];

  input.findings.forEach((finding, index) => {
    const statement = findStatement(input.result, finding.statementIndex);
    const recipeGroup = findRecipeGroup(input.recipeGroups, finding.id);

    lines.push(`### ${index + 1}. [${finding.severity.toUpperCase()}] ${finding.title}`, "");
    lines.push(`- Category: ${toHeadingCase(finding.category)}`);
    lines.push(`- Confidence: ${getConfidenceLabel(finding.confidence)}`);
    lines.push(`- Statement: ${finding.statementIndex + 1}`);

    if (finding.lineStart && finding.lineEnd) {
      lines.push(`- Lines: ${finding.lineStart}-${finding.lineEnd}`);
    }

    if (finding.redactedPreview) {
      lines.push(`- Redacted preview: \`${finding.redactedPreview}\``);
    }

    if (finding.objectName) {
      lines.push(`- Object: ${finding.objectName}`);
    }

    if (finding.lockLevel) {
      lines.push(`- Lock level: ${finding.lockLevel}`);
    }

    lines.push("", finding.summary, "", "**Why it matters**", "", finding.whyItMatters);
    lines.push("", "**Recommended action**", "", finding.recommendedAction);

    if (input.options.includeSqlSnippets && statement) {
      const snippet = getDisplaySqlSnippet(
        statement.raw,
        input.options.redactionMode,
      );

      lines.push(
        "",
        "**Statement snippet**",
        "",
        "```sql",
        ...snippet.split("\n"),
        "```",
      );
    }

    if (recipeGroup?.recipes.length) {
      lines.push("", "**Safe rewrite recipes**", "");
      recipeGroup.recipes.forEach((recipe) => {
        lines.push(`#### ${recipe.title}`, "", recipe.description, "");
        recipe.steps.forEach((step, stepIndex) => {
          lines.push(`${stepIndex + 1}. ${step}`);
        });

        if (recipe.sqlSnippet) {
          const sqlSnippet = getDisplaySqlSnippet(
            recipe.sqlSnippet,
            input.options.redactionMode,
          );

          lines.push(
            "",
            "```sql",
            ...sqlSnippet.split("\n"),
            "```",
          );
        }

        if (recipe.frameworkSnippet) {
          lines.push("", `Framework guidance: ${recipe.frameworkSnippet}`);
        }

        if (recipe.warnings.length > 0) {
          lines.push("", "Warnings:");
          recipe.warnings.forEach((warning) => {
            lines.push(`- ${warning}`);
          });
        }
      });
    } else if (finding.safeRewrite) {
      const sqlSnippet = getDisplaySqlSnippet(
        finding.safeRewrite.sql,
        input.options.redactionMode,
      );

      lines.push(
        "",
        "**Safe rewrite**",
        "",
        finding.safeRewrite.summary,
        "",
        "```sql",
        ...sqlSnippet.split("\n"),
        "```",
      );
    }

    if (finding.docsLinks.length > 0) {
      lines.push("", "**Docs**", "");
      finding.docsLinks.forEach((link) => {
        lines.push(`- [${link.label}](${link.href})`);
      });
    }

    lines.push("");
  });

  return lines;
}

function buildSafeRewriteSection(input: ReportExportInput) {
  if (input.recipeGroups.length === 0) {
    return ["No safe rewrite recipes are included in the current report view."];
  }

  const lines: string[] = [];

  input.recipeGroups.forEach((group) => {
    lines.push(`### ${group.title}`, "");
    group.recipes.forEach((recipe) => {
      lines.push(`#### ${recipe.title}`, "", recipe.description, "");
      recipe.steps.forEach((step, index) => {
        lines.push(`${index + 1}. ${step}`);
      });

      if (recipe.sqlSnippet) {
        const sqlSnippet = getDisplaySqlSnippet(
          recipe.sqlSnippet,
          input.options.redactionMode,
        );

        lines.push("", "```sql", ...sqlSnippet.split("\n"), "```");
      } else {
        lines.push("", "No automatic SQL snippet is suggested for this recipe.");
      }

      if (recipe.frameworkSnippet) {
        lines.push("", `Framework guidance: ${recipe.frameworkSnippet}`);
      }

      if (recipe.warnings.length > 0) {
        lines.push("", "Warnings:");
        recipe.warnings.forEach((warning) => {
          lines.push(`- ${warning}`);
        });
      }

      lines.push("");
    });
  });

  return lines;
}

export function createMarkdownReport(input: ReportExportInput) {
  const generatedAt = input.options.generatedAt ?? new Date().toISOString();
  const lines = [
    "# PostgreSQL Migration Safety Report",
    "",
    `Generated: ${formatTimestamp(generatedAt)}`,
    `PostgreSQL version: ${input.postgresVersion}`,
    `Framework preset: ${input.frameworkLabel} (${input.frameworkPreset})`,
    `Table size profile: ${toHeadingCase(input.tableSizeProfile)}`,
    `Risk score: ${input.result.summary.risk.score}/100 (${input.result.summary.risk.label})`,
    `Highest lock level: ${input.result.summary.risk.highestLockLevel ?? "None detected"}`,
    `Include SQL snippets: ${input.options.includeSqlSnippets ? "Yes" : "No"}`,
    `Redaction mode: ${input.options.redactionMode ? "On" : "Off"}`,
    "",
    "## Severity counts",
    "",
    `- Critical: ${input.result.summary.bySeverity.critical}`,
    `- High: ${input.result.summary.bySeverity.high}`,
    `- Medium: ${input.result.summary.bySeverity.medium}`,
    `- Low: ${input.result.summary.bySeverity.low}`,
    `- Info: ${input.result.summary.bySeverity.info}`,
    "",
    "## Summary",
    "",
    ...buildSummaryBullets(input).map((bullet) => `- ${bullet}`),
    "",
    "## Review filters",
    "",
    `- Severity filter: ${toHeadingCase(input.viewFilters.severityFilter)}`,
    `- Category filter: ${toHeadingCase(input.viewFilters.categoryFilter)}`,
    `- Show only blocking risks: ${input.viewFilters.showOnlyBlockingRisks ? "Yes" : "No"}`,
    `- Show safe rewrites only: ${input.viewFilters.showSafeRewritesOnly ? "Yes" : "No"}`,
    `- Show low severity: ${input.viewFilters.showLowSeverity ? "Yes" : "No"}`,
    `- Sort mode: ${toHeadingCase(input.viewFilters.sortMode)}`,
    "",
    "## Findings Table",
    "",
    ...buildFindingsTable(input),
    "",
    "## Detailed Findings",
    "",
    ...buildDetailedFindings(input),
    "## Safe Rewrite Recipes",
    "",
    ...buildSafeRewriteSection(input),
    "## Limitations",
    "",
    ...input.result.metadata.limitations.map((limitation) => `- ${limitation}`),
    "",
    "## Privacy",
    "",
    "- Generated locally in the browser.",
    `- Settings links never include your migration SQL.${input.options.includeSqlSnippets ? input.options.redactionMode ? " SQL snippets were included in this export with secret redaction enabled." : " SQL snippets were explicitly included in this export." : " SQL snippets were omitted from this export by default."}`,
  ];

  return lines.join("\n");
}
