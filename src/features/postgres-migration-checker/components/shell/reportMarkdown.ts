import type {
  AnalysisResult,
  Finding,
  FindingRecipeGroup,
  SafeRewriteRecipe,
} from "@/features/postgres-migration-checker";
import { redactSecretsInText } from "@pg-migration-checker/analyzer";
import { getConfidenceDetails, toHeadingCase } from "./findingUtils";

export function getOutputSqlSnippet(sqlSnippet: string, redactionMode: boolean) {
  return redactionMode ? redactSecretsInText(sqlSnippet) : sqlSnippet;
}

export function createRecipeMarkdown({
  recipe,
  recipeGroup,
  redactionMode,
  statement,
}: {
  recipe: SafeRewriteRecipe;
  recipeGroup: FindingRecipeGroup;
  redactionMode: boolean;
  statement: AnalysisResult["statements"][number] | null;
}) {
  const lines = [
    `### ${recipe.title}`,
    "",
    recipe.description,
    "",
    `- Related finding: ${recipeGroup.title}`,
    `- Severity: ${toHeadingCase(recipeGroup.severity)}`,
    `- Category: ${toHeadingCase(recipeGroup.category)}`,
    `- Statement: ${recipeGroup.statementIndex + 1}`,
  ];

  if (recipeGroup.lineStart && recipeGroup.lineEnd) {
    lines.push(`- Lines: ${recipeGroup.lineStart}-${recipeGroup.lineEnd}`);
  }

  if (!redactionMode && recipeGroup.objectName) {
    lines.push(`- Object: ${recipeGroup.objectName}`);
  }

  lines.push("", "**Staged steps**", "");
  recipe.steps.forEach((step, index) => {
    lines.push(`${index + 1}. ${step}`);
  });

  if (recipe.sqlSnippet) {
    const sqlSnippet = getOutputSqlSnippet(recipe.sqlSnippet, redactionMode);
    lines.push("", "**SQL template**", "", "```sql", ...sqlSnippet.split("\n"), "```");
  } else {
    lines.push("", "**SQL template**", "", "No automatic SQL snippet is suggested for this recipe.");
  }

  if (recipe.frameworkSnippet) {
    lines.push("", "**Framework guidance**", "", recipe.frameworkSnippet);
  }

  if (recipe.warnings.length > 0) {
    lines.push("", "**Cautions**", "");
    recipe.warnings.forEach((warning) => {
      lines.push(`- ${warning}`);
    });
  }

  if (statement) {
    const statementPreview = getOutputSqlSnippet(statement.raw, redactionMode);
    lines.push("", "**Statement preview**", "", "```sql", ...statementPreview.split("\n"), "```");
  }

  if (recipe.docsLinks.length > 0) {
    lines.push("", "**Docs**", "");
    recipe.docsLinks.forEach((link) => {
      lines.push(`- [${link.label}](${link.href})`);
    });
  }

  return lines.join("\n");
}

export function createAllRecipesMarkdown({
  recipeGroups,
  redactionMode,
  result,
}: {
  recipeGroups: readonly FindingRecipeGroup[];
  redactionMode: boolean;
  result: AnalysisResult;
}) {
  const lines = [
    "# PostgreSQL migration safe rewrites",
    "",
    "Review and adapt these snippets to your schema, traffic, and deployment process.",
  ];

  if (recipeGroups.length === 0) {
    lines.push("", "No safe rewrite recipes matched the current view.");
    return lines.join("\n");
  }

  recipeGroups.forEach((recipeGroup) => {
    const statement =
      result.statements.find((candidate) => candidate.index === recipeGroup.statementIndex) ??
      null;

    lines.push("", `## ${recipeGroup.title}`, "");
    recipeGroup.recipes.forEach((recipe) => {
      lines.push(
        createRecipeMarkdown({ recipe, recipeGroup, redactionMode, statement }),
        "",
      );
    });
  });

  return lines.join("\n");
}

export function createFindingMarkdown({
  finding,
  frameworkNote,
  recipeGroup,
  redactionMode,
  statement,
}: {
  finding: Finding;
  frameworkNote?: string | null;
  recipeGroup?: FindingRecipeGroup | null;
  redactionMode: boolean;
  statement: AnalysisResult["statements"][number] | null;
}) {
  const primaryRecipe = recipeGroup?.recipes[0] ?? null;
  const lines = [
    `### [${finding.severity.toUpperCase()}] ${finding.title}`,
    "",
    finding.summary,
    "",
    `- Category: ${toHeadingCase(finding.category)}`,
    `- Confidence: ${getConfidenceDetails(finding.confidence).label}`,
    `- Statement: ${finding.statementIndex + 1}`,
  ];

  if (finding.lineStart && finding.lineEnd) {
    lines.push(`- Lines: ${finding.lineStart}-${finding.lineEnd}`);
  }

  if (finding.redactedPreview) {
    lines.push(`- Redacted preview: \`${finding.redactedPreview}\``);
  }

  if (!redactionMode && finding.objectName) {
    lines.push(`- Object: ${finding.objectName}`);
  }

  if (finding.lockLevel) {
    lines.push(`- Lock level: ${finding.lockLevel}`);
  }

  lines.push("", "**Why it matters**", "", finding.whyItMatters);
  lines.push("", "**Recommended action**", "", finding.recommendedAction);

  if (frameworkNote) {
    lines.push("", "**Framework note**", "", frameworkNote);
  }

  if (primaryRecipe) {
    lines.push("", "**Safe rewrite recipe**", "", primaryRecipe.description, "");
    primaryRecipe.steps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`);
    });

    if (primaryRecipe.sqlSnippet) {
      const sqlSnippet = getOutputSqlSnippet(primaryRecipe.sqlSnippet, redactionMode);
      lines.push("", "**SQL template**", "", "```sql", ...sqlSnippet.split("\n"), "```");
    }
  } else if (finding.safeRewrite) {
    const sqlSnippet = getOutputSqlSnippet(finding.safeRewrite.sql, redactionMode);
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

  if (statement) {
    const statementPreview = getOutputSqlSnippet(statement.raw, redactionMode);
    lines.push("", "**Statement preview**", "", "```sql", ...statementPreview.split("\n"), "```");
  }

  if (finding.docsLinks.length > 0) {
    lines.push("", "**Docs**", "");
    finding.docsLinks.forEach((link) => {
      lines.push(`- [${link.label}](${link.href})`);
    });
  }

  return lines.join("\n");
}
