import type {
  Finding,
  FrameworkAnalysisMetadata,
  MigrationStatement,
} from "../../types";
import { buildRecipesForFinding } from "./sqlTemplates";
import type { FindingRecipeGroup } from "./types";

type BuildSafeRewriteRecipeGroupsInput = {
  findings: readonly Finding[];
  framework: FrameworkAnalysisMetadata;
  statements: readonly MigrationStatement[];
};

function compareRecipeGroups(left: FindingRecipeGroup, right: FindingRecipeGroup) {
  return (
    left.statementIndex - right.statementIndex ||
    (left.lineStart ?? 0) - (right.lineStart ?? 0) ||
    left.ruleId.localeCompare(right.ruleId) ||
    left.findingId.localeCompare(right.findingId)
  );
}

function getStatementForFinding(
  finding: Finding,
  statements: readonly MigrationStatement[],
) {
  return (
    statements.find((statement) => statement.index === finding.statementIndex) ?? null
  );
}

export function buildSafeRewriteRecipeGroups({
  findings,
  framework,
  statements,
}: BuildSafeRewriteRecipeGroupsInput) {
  const groups: FindingRecipeGroup[] = [];

  findings.forEach((finding) => {
    const recipes = buildRecipesForFinding({
      finding,
      framework,
      statement: getStatementForFinding(finding, statements),
    });

    if (recipes.length === 0) {
      return;
    }

    groups.push({
      findingId: finding.id,
      ruleId: finding.ruleId,
      title: finding.title,
      summary: finding.summary,
      severity: finding.severity,
      category: finding.category,
      statementIndex: finding.statementIndex,
      lineStart: finding.lineStart,
      lineEnd: finding.lineEnd,
      objectName: finding.objectName,
      recipes,
    });
  });

  return groups.sort(compareRecipeGroups);
}

export * from "./types";
