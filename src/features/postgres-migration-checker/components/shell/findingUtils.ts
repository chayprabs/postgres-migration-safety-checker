import type {
  AnalysisResult,
  ConfidenceLevel,
  Finding,
  FindingCategory,
  FindingRecipeGroup,
  FrameworkAnalysisMetadata,
  TableSizeProfile,
} from "@/features/postgres-migration-checker";
import type { SavedLocalAnalysis } from "../../history/types";
import {
  LARGE_INPUT_WARNING_MESSAGE,
  formatSqlInputSize,
  type SqlInputExecutionSupport,
  type SqlInputProfile,
} from "../../inputProfile";
import type { FindingsSortMode } from "../results";
import { TABLE_SIZE_PROFILE_OPTIONS } from "./shellConstants";
import type { PersistedWorkspaceSettings } from "./workspaceSettingsStorage";

export function getBrowserExecutionSupport(): SqlInputExecutionSupport {
  if (typeof window === "undefined") {
    return { workerSupported: false };
  }

  const browserNavigator = window.navigator as Navigator & {
    deviceMemory?: number;
  };

  return {
    workerSupported: typeof Worker !== "undefined",
    deviceMemory: browserNavigator.deviceMemory,
    hardwareConcurrency: browserNavigator.hardwareConcurrency,
  };
}

export function getParserStatus(parser: AnalysisResult["metadata"]["parser"]) {
  if (parser.ok && parser.parser === "supabase-pg-parser") {
    return {
      description:
        "The PostgreSQL parser completed successfully for this run, so statement mapping and AST-backed checks are available.",
      label: "Parsed with PostgreSQL parser",
    };
  }

  if (parser.errors.length > 0) {
    return {
      description:
        "The parser reported a syntax error, so the checker continued with fallback pattern analysis where possible.",
      label: "Partial analysis due to parser error",
    };
  }

  if (parser.parser === "fallback") {
    return {
      description:
        "The checker used fallback pattern analysis for this run, so findings may be less precise than a full parser-backed review.",
      label: "Used fallback pattern analysis",
    };
  }

  return {
    description: "The parser did not run because the current editor input is empty.",
    label: "No parser run",
  };
}

export function getLargeInputNotice(
  profile: SqlInputProfile,
  options: { autoAnalyzeEnabled: boolean; canOverrideBlockedLimit: boolean },
) {
  if (profile.bucket === "normal") {
    return null;
  }

  const sizeLabel = formatSqlInputSize(profile.byteLength);

  if (profile.bucket === "warning") {
    return {
      body: `${LARGE_INPUT_WARNING_MESSAGE} Current size: ${sizeLabel}.`,
      title: "Performance warning",
      tone: "warning" as const,
    };
  }

  if (profile.bucket === "confirmation-required") {
    const autoAnalyzeCopy = options.autoAnalyzeEnabled
      ? "Auto analysis pauses at this size, and each run needs a manual confirmation first."
      : "Each run needs a manual confirmation first.";

    return {
      body: `${LARGE_INPUT_WARNING_MESSAGE} Current size: ${sizeLabel}. ${autoAnalyzeCopy}`,
      title: "Manual confirmation required",
      tone: "warning" as const,
    };
  }

  if (options.canOverrideBlockedLimit) {
    return {
      body: `${LARGE_INPUT_WARNING_MESSAGE} Current size: ${sizeLabel}. Analysis is blocked by default above 3 MB, but you can manually override with the worker path if this browser still feels stable.`,
      title: "Blocked by default",
      tone: "error" as const,
    };
  }

  return {
    body: `${LARGE_INPUT_WARNING_MESSAGE} Current size: ${sizeLabel}. Analysis is blocked by default above 3 MB in this browser. Use a CLI, CI job, or a local script instead.`,
    title: "Blocked by default",
    tone: "error" as const,
  };
}

export function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], .cm-editor, .cm-content',
    ),
  );
}

export function scrollElementIntoView(element: HTMLElement | null) {
  if (!element || typeof window === "undefined") {
    return;
  }

  window.requestAnimationFrame(() => {
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

export function formatSavedAnalysisTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function getSavedAnalysisModeLabel(saveMode: SavedLocalAnalysis["saveMode"]) {
  return saveMode === "with-sql" ? "Saved with SQL" : "Summary only";
}

export function getSuggestedSavedAnalysisTitle(
  result: AnalysisResult | null,
  sql: string,
  sourceFilename: string | null,
) {
  if (sourceFilename) {
    return sourceFilename.replace(/\.[^.]+$/, "");
  }

  const firstStatement = result?.statements[0];

  if (firstStatement?.targetObject) {
    return `${firstStatement.kind} ${firstStatement.targetObject}`;
  }

  const firstMeaningfulLine =
    sql
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith("--")) ?? "";

  return firstMeaningfulLine.length > 0
    ? firstMeaningfulLine.replace(/\s+/g, " ").slice(0, 72)
    : "Migration review";
}

export function getBaseVisibleFindings(
  findings: readonly Finding[],
  showLowSeverity: boolean,
) {
  return findings.filter((finding) => {
    if (!showLowSeverity && finding.severity === "low") {
      return false;
    }

    return true;
  });
}

export function toHeadingCase(value: string) {
  return value
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function getTableSizeProfileOption(tableSizeProfile: TableSizeProfile) {
  return TABLE_SIZE_PROFILE_OPTIONS.find((profile) => profile.value === tableSizeProfile);
}

export function getConfidenceDetails(confidence: ConfidenceLevel) {
  switch (confidence) {
    case "high":
      return {
        label: "High confidence",
        tooltip: "High confidence: directly detected from SQL.",
      };
    case "medium":
      return {
        label: "Medium confidence",
        tooltip:
          "Medium confidence: depends on PostgreSQL metadata or table size we cannot inspect.",
      };
    case "low":
      return {
        label: "Low confidence",
        tooltip: "Low confidence: heuristic advice.",
      };
  }
}

export function getAvailableFindingCategories(findings: readonly Finding[]) {
  return [...new Set(findings.map((finding) => finding.category))].sort(
    (left, right) => left.localeCompare(right),
  ) as FindingCategory[];
}

export function matchesFindingSearch(finding: Finding, searchTerm: string) {
  if (searchTerm.trim().length === 0) {
    return true;
  }

  const comparable = searchTerm.trim().toLowerCase();
  const haystack = [
    finding.title,
    finding.summary,
    finding.whyItMatters,
    finding.recommendedAction,
    finding.ruleId,
    finding.objectName,
    finding.lockLevel,
    ...finding.tags,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(comparable);
}

export function isBlockingRiskFinding(finding: Finding) {
  return Boolean(finding.lockInfo?.blocksReads || finding.lockInfo?.blocksWrites);
}

function getSeveritySortRank(severity: Finding["severity"]) {
  switch (severity) {
    case "critical":
      return 0;
    case "high":
      return 1;
    case "medium":
      return 2;
    case "low":
      return 3;
    case "info":
      return 4;
  }
}

export function sortFindings(findings: readonly Finding[], sortMode: FindingsSortMode) {
  return [...findings].sort((left, right) => {
    if (sortMode === "severity") {
      return (
        getSeveritySortRank(left.severity) - getSeveritySortRank(right.severity) ||
        left.statementIndex - right.statementIndex ||
        left.ruleId.localeCompare(right.ruleId)
      );
    }

    if (sortMode === "category") {
      return (
        left.category.localeCompare(right.category) ||
        getSeveritySortRank(left.severity) - getSeveritySortRank(right.severity) ||
        left.statementIndex - right.statementIndex
      );
    }

    return (
      left.statementIndex - right.statementIndex ||
      getSeveritySortRank(left.severity) - getSeveritySortRank(right.severity) ||
      left.ruleId.localeCompare(right.ruleId)
    );
  });
}

export function getFrameworkNoteForFinding(
  finding: Finding | null,
  frameworkMetadata: FrameworkAnalysisMetadata | null,
) {
  if (!finding || !frameworkMetadata || frameworkMetadata.preset === "raw-sql") {
    return null;
  }

  if (finding.category === "index") {
    return frameworkMetadata.safeIndexAdvice;
  }

  if (finding.category === "constraint") {
    return frameworkMetadata.safeConstraintAdvice;
  }

  if (finding.category === "transaction") {
    return (
      frameworkMetadata.transactionDisableHint ??
      frameworkMetadata.transactionAssumptionReason
    );
  }

  if (frameworkMetadata.detectedSignals.length > 0) {
    return frameworkMetadata.detectedSignals[0];
  }

  return null;
}

export function findingHasSuggestedSafeRewrite(
  finding: Finding,
  recipeGroup: FindingRecipeGroup | null,
) {
  return Boolean(recipeGroup || finding.safeRewrite);
}

export function findingHasCopyableSafeRewrite(
  finding: Finding,
  recipeGroup: FindingRecipeGroup | null,
) {
  return Boolean(
    recipeGroup?.recipes.some((recipe) => recipe.sqlSnippet) || finding.safeRewrite,
  );
}

export function getPrimarySafeRewriteSql(
  finding: Finding,
  recipeGroup: FindingRecipeGroup | null,
) {
  return (
    recipeGroup?.recipes.find((recipe) => recipe.sqlSnippet)?.sqlSnippet ??
    finding.safeRewrite?.sql ??
    null
  );
}

export type WorkspaceSettingsSignatureInput = {
  settings: PersistedWorkspaceSettings;
  transactionAssumptionMode: string;
  sourceFilename: string | null;
};
