"use client";

import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ChangeEvent } from "react";
import { ShieldCheck, Upload } from "lucide-react";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { CodeEditor } from "@/components/code/CodeEditor";
import {
  trackAnalysisCompleted,
  trackReportCopied,
  trackToolOpened,
  type AnalyticsSettingsSummary,
} from "@/lib/analytics";
import {
  DEFAULT_POSTGRES_MIGRATION_SAMPLE_ID,
  DEFAULT_POSTGRES_VERSION,
  FRAMEWORK_PRESET_DEFINITIONS,
  POSTGRES_ANALYSIS_LIMITATIONS,
  getFrameworkPresetDefinition,
  getPostgresMigrationSample,
  getPostgresVersionProfile,
  POSTGRES_MIGRATION_SAMPLE_GROUPS,
  POSTGRES_MIGRATION_SAMPLES,
  SUPPORTED_POSTGRES_VERSIONS,
  type FrameworkAnalysisMetadata,
  type AnalysisResult,
  type AnalysisSettings,
  type ConfidenceLevel,
  type FindingCategory,
  type FindingRecipeGroup,
  type Finding,
  type FrameworkPreset,
  type PostgresMigrationSample,
  type PostgresVersionProfile,
  type PostgresVersion,
  type SafeRewriteRecipe,
  type TableSizeProfile,
  type TransactionAssumptionMode,
} from "@/features/postgres-migration-checker";
import { redactSecretsInText } from "../analyzer/security/secretDetection";
import { analyzeInWorkerOrMainThread } from "../analyzer/worker/client";
import {
  AnalysisMetadata as AnalysisMetadataPanel,
  FindingDetail,
  FindingsList,
  FindingsToolbar,
  LimitationsPanel,
  RiskScoreCard,
  RiskSummary,
  SafeRewritePanel,
  type FindingsCategoryFilter,
  type FindingsSeverityFilter,
  type FindingsSortMode,
} from "./results";
import { createHtmlReport } from "../reports/htmlReport";
import { createMarkdownReport } from "../reports/markdownReport";
import { stringifyJsonReport } from "../reports/jsonReport";
import {
  downloadTextFile,
  getReportFilenames,
  openPrintReport,
} from "../reports/download";
import type { ReportExportInput } from "../reports/types";

type PersistedWorkspaceSettings = {
  autoAnalyze: boolean;
  frameworkPreset: FrameworkPreset;
  postgresVersion: PostgresVersion;
  redactionMode: boolean;
  showLowSeverity: boolean;
  tableSizeProfile: TableSizeProfile;
};

type StatusTone = "default" | "error";

type StatusMessage = {
  id: number;
  message: string;
  tone: StatusTone;
};

type FrameworkNotesCardProps = {
  frameworkMetadata: FrameworkAnalysisMetadata | null;
  sourceFilename: string | null;
  transactionAssumptionMode: TransactionAssumptionMode;
  workspaceSettings: PersistedWorkspaceSettings;
};

type VersionNotesCardProps = {
  profile: PostgresVersionProfile | null;
  postgresVersion: PostgresVersion;
};

type ResultsTab = "findings" | "safe-rewrites";
type ShareableCheckerState = {
  categoryFilter?: FindingsCategoryFilter;
  frameworkPreset?: FrameworkPreset;
  postgresVersion?: PostgresVersion;
  resultsTab?: ResultsTab;
  severityFilter?: FindingsSeverityFilter;
  showLowSeverity?: boolean;
  showOnlyBlockingRisks?: boolean;
  showSafeRewritesOnly?: boolean;
  sortMode?: FindingsSortMode;
  tableSizeProfile?: TableSizeProfile;
};

const WORKSPACE_SETTINGS_STORAGE_KEY =
  "authos.postgres-migration-checker.workspace-settings.v1";
const TOOL_ID = "postgres-migration-safety-checker";
const STATUS_MESSAGE_TTL_MS = 3200;
const workspaceSettingsListeners = new Set<() => void>();
let inMemoryWorkspaceSettings: PersistedWorkspaceSettings | null = null;

const PRIVACY_PANEL_POINTS = [
  "SQL is processed client-side.",
  "File uploads are read by the browser only.",
  "Settings may be stored locally.",
  "Raw SQL is not included in analytics.",
  "Reports are generated locally.",
  "Settings links do not include SQL.",
] as const;

const FINDINGS_SEVERITY_FILTER_VALUES = [
  "all",
  "critical",
  "high",
  "medium",
  "low",
  "info",
] as const satisfies readonly FindingsSeverityFilter[];

const FINDINGS_CATEGORY_FILTER_VALUES = [
  "all",
  "locking",
  "rewrite",
  "index",
  "constraint",
  "data-loss",
  "transaction",
  "framework",
  "version",
  "reversibility",
  "performance",
  "security",
  "syntax",
] as const satisfies readonly FindingsCategoryFilter[];

const FINDINGS_SORT_MODE_VALUES = [
  "severity",
  "statement-order",
  "category",
] as const satisfies readonly FindingsSortMode[];

const RESULTS_TAB_VALUES = [
  "findings",
  "safe-rewrites",
] as const satisfies readonly ResultsTab[];

const TABLE_SIZE_PROFILE_OPTIONS: ReadonlyArray<{
  description: string;
  label: string;
  value: TableSizeProfile;
}> = [
  {
    value: "unknown",
    label: "Unknown",
    description:
      "Cautious default when row count is unclear and the checker should avoid assuming a small-table fast path.",
  },
  {
    value: "small",
    label: "Small",
    description:
      "Small tables where some blocking work is easier to absorb, while destructive and transaction-invalid steps still stay risky.",
  },
  {
    value: "medium",
    label: "Medium",
    description:
      "Normal production sizing where locking, scans, and validation still deserve ordinary review.",
  },
  {
    value: "large",
    label: "Large",
    description:
      "High-traffic tables where the checker escalates table scans, rewrites, and non-concurrent index work.",
  },
  {
    value: "very-large",
    label: "Very large",
    description:
      "Hot or massive tables where the checker escalates rewrite, scan, and lock-risk findings aggressively.",
  },
];

const TRANSACTION_ASSUMPTION_OPTIONS: ReadonlyArray<{
  description: string;
  label: string;
  value: TransactionAssumptionMode;
}> = [
  {
    value: "auto",
    label: "Auto",
    description:
      "Use the framework preset default and honor detected no-transaction annotations.",
  },
  {
    value: "force-transaction",
    label: "Assume transaction",
    description:
      "Force the review to treat the migration as wrapped in a transaction.",
  },
  {
    value: "force-no-transaction",
    label: "Assume no transaction",
    description:
      "Force the review to treat the migration as running outside a transaction.",
  },
];

function createDefaultWorkspaceSettings(): PersistedWorkspaceSettings {
  return {
    postgresVersion: DEFAULT_POSTGRES_VERSION,
    frameworkPreset: "raw-sql",
    tableSizeProfile: "large",
    autoAnalyze: true,
    showLowSeverity: true,
    redactionMode: false,
  };
}

function readPersistedWorkspaceSettings(): PersistedWorkspaceSettings {
  if (inMemoryWorkspaceSettings) {
    return inMemoryWorkspaceSettings;
  }

  const defaults = createDefaultWorkspaceSettings();

  if (typeof window === "undefined") {
    return defaults;
  }

  try {
    const storedValue = window.localStorage.getItem(
      WORKSPACE_SETTINGS_STORAGE_KEY,
    );

    inMemoryWorkspaceSettings = storedValue
      ? mergePersistedWorkspaceSettings(JSON.parse(storedValue))
      : defaults;
  } catch {
    inMemoryWorkspaceSettings = defaults;
  }

  return inMemoryWorkspaceSettings;
}

function subscribeWorkspaceSettings(listener: () => void) {
  workspaceSettingsListeners.add(listener);

  if (typeof window === "undefined") {
    return () => {
      workspaceSettingsListeners.delete(listener);
    };
  }

  function handleStorage(event: StorageEvent) {
    if (event.key && event.key !== WORKSPACE_SETTINGS_STORAGE_KEY) {
      return;
    }

    inMemoryWorkspaceSettings = null;
    listener();
  }

  window.addEventListener("storage", handleStorage);

  return () => {
    workspaceSettingsListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function writePersistedWorkspaceSettings(settings: PersistedWorkspaceSettings) {
  inMemoryWorkspaceSettings = settings;

  try {
    window.localStorage.setItem(
      WORKSPACE_SETTINGS_STORAGE_KEY,
      JSON.stringify(settings),
    );
  } catch {
    // Keep the in-memory workspace usable even if localStorage is unavailable.
  }

  workspaceSettingsListeners.forEach((listener) => {
    listener();
  });
}

function isPostgresVersion(value: unknown): value is PostgresVersion {
  return SUPPORTED_POSTGRES_VERSIONS.some((version) => version.version === value);
}

function isFrameworkPreset(value: unknown): value is FrameworkPreset {
  return FRAMEWORK_PRESET_DEFINITIONS.some((preset) => preset.id === value);
}

function isTableSizeProfile(value: unknown): value is TableSizeProfile {
  return TABLE_SIZE_PROFILE_OPTIONS.some((profile) => profile.value === value);
}

function isFindingsSeverityFilter(value: unknown): value is FindingsSeverityFilter {
  return FINDINGS_SEVERITY_FILTER_VALUES.some((filter) => filter === value);
}

function isFindingsCategoryFilter(value: unknown): value is FindingsCategoryFilter {
  return FINDINGS_CATEGORY_FILTER_VALUES.some((filter) => filter === value);
}

function isFindingsSortMode(value: unknown): value is FindingsSortMode {
  return FINDINGS_SORT_MODE_VALUES.some((filter) => filter === value);
}

function isResultsTab(value: unknown): value is ResultsTab {
  return RESULTS_TAB_VALUES.some((filter) => filter === value);
}

function parseShareableBoolean(value: string | null) {
  if (value === null) {
    return undefined;
  }

  return value === "1" || value === "true";
}

function readShareableCheckerStateFromHash() {
  if (typeof window === "undefined" || !window.location.hash.startsWith("#share:")) {
    return null;
  }

  const params = new URLSearchParams(window.location.hash.slice("#share:".length));
  const postgresVersionRaw = params.get("pg");
  const parsedPostgresVersion = postgresVersionRaw
    ? Number(postgresVersionRaw)
    : null;
  const frameworkPreset = params.get("fw");
  const tableSizeProfile = params.get("size");
  const severityFilter = params.get("sev");
  const categoryFilter = params.get("cat");
  const sortMode = params.get("sort");
  const resultsTab = params.get("tab");

  return {
    postgresVersion:
      parsedPostgresVersion !== null && isPostgresVersion(parsedPostgresVersion)
        ? parsedPostgresVersion
        : undefined,
    frameworkPreset:
      frameworkPreset && isFrameworkPreset(frameworkPreset)
        ? frameworkPreset
        : undefined,
    tableSizeProfile:
      tableSizeProfile && isTableSizeProfile(tableSizeProfile)
        ? tableSizeProfile
        : undefined,
    severityFilter:
      severityFilter && isFindingsSeverityFilter(severityFilter)
        ? severityFilter
        : undefined,
    categoryFilter:
      categoryFilter && isFindingsCategoryFilter(categoryFilter)
        ? categoryFilter
        : undefined,
    sortMode:
      sortMode && isFindingsSortMode(sortMode) ? sortMode : undefined,
    resultsTab:
      resultsTab && isResultsTab(resultsTab) ? resultsTab : undefined,
    showLowSeverity: parseShareableBoolean(params.get("low")),
    showOnlyBlockingRisks: parseShareableBoolean(params.get("blocking")),
    showSafeRewritesOnly: parseShareableBoolean(params.get("rewrites")),
  } satisfies ShareableCheckerState;
}

function buildShareableCheckerLink({
  categoryFilter,
  frameworkPreset,
  postgresVersion,
  resultsTab,
  severityFilter,
  showLowSeverity,
  showOnlyBlockingRisks,
  showSafeRewritesOnly,
  sortMode,
  tableSizeProfile,
}: {
  categoryFilter: FindingsCategoryFilter;
  frameworkPreset: FrameworkPreset;
  postgresVersion: PostgresVersion;
  resultsTab: ResultsTab;
  severityFilter: FindingsSeverityFilter;
  showLowSeverity: boolean;
  showOnlyBlockingRisks: boolean;
  showSafeRewritesOnly: boolean;
  sortMode: FindingsSortMode;
  tableSizeProfile: TableSizeProfile;
}) {
  const baseUrl = new URL(window.location.href);
  const shareUrl = new URL(baseUrl.origin + baseUrl.pathname);
  const params = new URLSearchParams();

  params.set("pg", String(postgresVersion));
  params.set("fw", frameworkPreset);
  params.set("size", tableSizeProfile);
  params.set("sev", severityFilter);
  params.set("cat", categoryFilter);
  params.set("blocking", showOnlyBlockingRisks ? "1" : "0");
  params.set("rewrites", showSafeRewritesOnly ? "1" : "0");
  params.set("sort", sortMode);
  params.set("low", showLowSeverity ? "1" : "0");
  params.set("tab", resultsTab);
  shareUrl.hash = `share:${params.toString()}`;

  return shareUrl.toString();
}

function mergePersistedWorkspaceSettings(
  rawValue: unknown,
): PersistedWorkspaceSettings {
  const defaults = createDefaultWorkspaceSettings();

  if (!rawValue || typeof rawValue !== "object") {
    return defaults;
  }

  const candidate = rawValue as Partial<Record<keyof PersistedWorkspaceSettings, unknown>>;

  return {
    postgresVersion: isPostgresVersion(candidate.postgresVersion)
      ? candidate.postgresVersion
      : defaults.postgresVersion,
    frameworkPreset: isFrameworkPreset(candidate.frameworkPreset)
      ? candidate.frameworkPreset
      : defaults.frameworkPreset,
    tableSizeProfile: isTableSizeProfile(candidate.tableSizeProfile)
      ? candidate.tableSizeProfile
      : defaults.tableSizeProfile,
    autoAnalyze:
      typeof candidate.autoAnalyze === "boolean"
        ? candidate.autoAnalyze
        : defaults.autoAnalyze,
    showLowSeverity:
      typeof candidate.showLowSeverity === "boolean"
        ? candidate.showLowSeverity
        : defaults.showLowSeverity,
    redactionMode:
      typeof candidate.redactionMode === "boolean"
        ? candidate.redactionMode
        : defaults.redactionMode,
  };
}

function buildAnalysisSettings(
  settings: PersistedWorkspaceSettings,
  transactionAssumptionMode: TransactionAssumptionMode,
): AnalysisSettings {
  const frameworkPreset = getFrameworkPresetDefinition(settings.frameworkPreset);
  const assumeRunsInTransaction =
    transactionAssumptionMode === "force-transaction"
      ? true
      : transactionAssumptionMode === "force-no-transaction"
        ? false
        : frameworkPreset.assumeTransactionDefault;

  return {
    postgresVersion: settings.postgresVersion,
    frameworkPreset: settings.frameworkPreset,
    tableSizeProfile: settings.tableSizeProfile,
    includeLowSeverityFindings: settings.showLowSeverity,
    includeInfoFindings: true,
    includeSafeRewrites: true,
    assumeOnlineMigration: settings.tableSizeProfile !== "small",
    assumeRunsInTransaction,
    transactionAssumptionMode,
    flagDestructiveChanges: true,
    redactionMode: settings.redactionMode,
    autoAnalyze: settings.autoAnalyze,
    reportFormat: "markdown",
    stopAfterParseError: false,
  };
}

function buildAnalyticsSettingsSummary(
  settings: PersistedWorkspaceSettings,
  transactionAssumptionMode: TransactionAssumptionMode,
): AnalyticsSettingsSummary {
  return {
    postgresVersion: settings.postgresVersion,
    frameworkPreset: settings.frameworkPreset,
    tableSizeProfile: settings.tableSizeProfile,
    redactionMode: settings.redactionMode,
    autoAnalyze: settings.autoAnalyze,
    transactionAssumptionMode,
  };
}

function getOutputSqlSnippet(sqlSnippet: string, redactionMode: boolean) {
  return redactionMode ? redactSecretsInText(sqlSnippet) : sqlSnippet;
}

function getBaseVisibleFindings(
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

function toHeadingCase(value: string) {
  return value
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function getWorkspaceSettingsSignature(
  settings: PersistedWorkspaceSettings,
  transactionAssumptionMode: TransactionAssumptionMode,
  sourceFilename: string | null,
) {
  return JSON.stringify({
    settings,
    sourceFilename,
    transactionAssumptionMode,
  });
}

function getTableSizeProfileOption(tableSizeProfile: TableSizeProfile) {
  return TABLE_SIZE_PROFILE_OPTIONS.find(
    (profile) => profile.value === tableSizeProfile,
  );
}

function getConfidenceDetails(confidence: ConfidenceLevel) {
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

function getAvailableFindingCategories(findings: readonly Finding[]) {
  return [...new Set(findings.map((finding) => finding.category))].sort(
    (left, right) => left.localeCompare(right),
  ) as FindingCategory[];
}

function matchesFindingSearch(finding: Finding, searchTerm: string) {
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

function isBlockingRiskFinding(finding: Finding) {
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

function sortFindings(findings: readonly Finding[], sortMode: FindingsSortMode) {
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

function getFrameworkNoteForFinding(
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

function findingHasSuggestedSafeRewrite(
  finding: Finding,
  recipeGroup: FindingRecipeGroup | null,
) {
  return Boolean(recipeGroup || finding.safeRewrite);
}

function findingHasCopyableSafeRewrite(
  finding: Finding,
  recipeGroup: FindingRecipeGroup | null,
) {
  return Boolean(
    recipeGroup?.recipes.some((recipe) => recipe.sqlSnippet) || finding.safeRewrite,
  );
}

function getPrimarySafeRewriteSql(
  finding: Finding,
  recipeGroup: FindingRecipeGroup | null,
) {
  return (
    recipeGroup?.recipes.find((recipe) => recipe.sqlSnippet)?.sqlSnippet ??
    finding.safeRewrite?.sql ??
    null
  );
}

function createRecipeMarkdown({
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
    lines.push(
      "",
      "**SQL template**",
      "",
      "No automatic SQL snippet is suggested for this recipe.",
    );
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

    lines.push(
      "",
      "**Statement preview**",
      "",
      "```sql",
      ...statementPreview.split("\n"),
      "```",
    );
  }

  if (recipe.docsLinks.length > 0) {
    lines.push("", "**Docs**", "");
    recipe.docsLinks.forEach((link) => {
      lines.push(`- [${link.label}](${link.href})`);
    });
  }

  return lines.join("\n");
}

function createAllRecipesMarkdown({
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
      result.statements.find(
        (candidate) => candidate.index === recipeGroup.statementIndex,
      ) ?? null;

    lines.push("", `## ${recipeGroup.title}`, "");
    recipeGroup.recipes.forEach((recipe) => {
      lines.push(
        createRecipeMarkdown({
          recipe,
          recipeGroup,
          redactionMode,
          statement,
        }),
        "",
      );
    });
  });

  return lines.join("\n");
}

function createFindingMarkdown({
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
      const sqlSnippet = getOutputSqlSnippet(
        primaryRecipe.sqlSnippet,
        redactionMode,
      );

      lines.push(
        "",
        "**SQL template**",
        "",
        "```sql",
        ...sqlSnippet.split("\n"),
        "```",
      );
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

    lines.push(
      "",
      "**Statement preview**",
      "",
      "```sql",
      ...statementPreview.split("\n"),
      "```",
    );
  }

  if (finding.docsLinks.length > 0) {
    lines.push("", "**Docs**", "");
    finding.docsLinks.forEach((link) => {
      lines.push(`- [${link.label}](${link.href})`);
    });
  }

  return lines.join("\n");
}

export function PostgresMigrationCheckerShell() {
  const workspaceSettings = useSyncExternalStore(
    subscribeWorkspaceSettings,
    readPersistedWorkspaceSettings,
    createDefaultWorkspaceSettings,
  );
  const [sql, setSql] = useState("");
  const [sourceFilename, setSourceFilename] = useState<string | null>(null);
  const [transactionAssumptionMode, setTransactionAssumptionMode] =
    useState<TransactionAssumptionMode>("auto");
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [statusMessages, setStatusMessages] = useState<StatusMessage[]>([]);
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [severityFilter, setSeverityFilter] =
    useState<FindingsSeverityFilter>("all");
  const [categoryFilter, setCategoryFilter] =
    useState<FindingsCategoryFilter>("all");
  const [showOnlyBlockingRisks, setShowOnlyBlockingRisks] = useState(false);
  const [showSafeRewritesOnly, setShowSafeRewritesOnly] = useState(false);
  const [sortMode, setSortMode] = useState<FindingsSortMode>("severity");
  const [resultsTab, setResultsTab] = useState<ResultsTab>("findings");
  const [includeSqlSnippetsInReport, setIncludeSqlSnippetsInReport] =
    useState(false);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [isExamplesOpen, setIsExamplesOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastAnalyzedSql, setLastAnalyzedSql] = useState("");
  const [lastAnalyzedSourceFilename, setLastAnalyzedSourceFilename] = useState<
    string | null
  >(null);
  const [lastAnalyzedSettingsSignature, setLastAnalyzedSettingsSignature] =
    useState("");
  const deferredSql = useDeferredValue(sql);
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const examplesMenuRef = useRef<HTMLDivElement | null>(null);
  const findingDetailRef = useRef<HTMLDivElement | null>(null);
  const shareStateAppliedRef = useRef(false);
  const messageTimeoutsRef = useRef<Map<number, number>>(new Map());
  const statusIdRef = useRef(0);
  const analysisRequestIdRef = useRef(0);
  const selectedSample =
    selectedSampleId === null ? null : getPostgresMigrationSample(selectedSampleId);
  const featuredSample =
    selectedSample ??
    getPostgresMigrationSample(DEFAULT_POSTGRES_MIGRATION_SAMPLE_ID);
  const selectedVersionProfile = getPostgresVersionProfile(
    workspaceSettings.postgresVersion,
  );
  const selectedTableSizeProfile = getTableSizeProfileOption(
    workspaceSettings.tableSizeProfile,
  );
  const currentSettingsSignature = getWorkspaceSettingsSignature(
    workspaceSettings,
    transactionAssumptionMode,
    sourceFilename,
  );
  const activeAnalysisResult = sql.trim().length === 0 ? null : analysisResult;
  const activeFrameworkMetadata = activeAnalysisResult?.metadata.framework ?? null;
  const activeResultLimitations =
    activeAnalysisResult?.metadata.limitations ?? [...POSTGRES_ANALYSIS_LIMITATIONS];
  const safeRewriteRecipeGroups = activeAnalysisResult?.safeRewriteRecipeGroups ?? [];
  const safeRewriteGroupsByFindingId = new Map(
    safeRewriteRecipeGroups.map((group) => [group.findingId, group]),
  );
  const baseVisibleFindings = activeAnalysisResult
    ? getBaseVisibleFindings(
        activeAnalysisResult.findings,
        workspaceSettings.showLowSeverity,
      )
    : [];
  const availableFindingCategories = getAvailableFindingCategories(baseVisibleFindings);
  const filteredFindings = baseVisibleFindings.filter((finding) => {
    if (severityFilter !== "all" && finding.severity !== severityFilter) {
      return false;
    }

    if (categoryFilter !== "all" && finding.category !== categoryFilter) {
      return false;
    }

    if (showOnlyBlockingRisks && !isBlockingRiskFinding(finding)) {
      return false;
    }

    if (
      showSafeRewritesOnly &&
      !findingHasSuggestedSafeRewrite(
        finding,
        safeRewriteGroupsByFindingId.get(finding.id) ?? null,
      )
    ) {
      return false;
    }

    return matchesFindingSearch(finding, searchTerm);
  });
  const visibleFindings = sortFindings(filteredFindings, sortMode);
  const visibleFindingIds = new Set(visibleFindings.map((finding) => finding.id));
  const visibleSafeRewriteRecipeGroups = safeRewriteRecipeGroups.filter((group) =>
    visibleFindingIds.has(group.findingId),
  );
  const parserDiagnostics = activeAnalysisResult
    ? [
        ...activeAnalysisResult.metadata.parser.errors,
        ...activeAnalysisResult.metadata.parser.warnings,
      ]
    : [];
  const selectedFinding =
    visibleFindings.find((finding) => finding.id === selectedFindingId) ??
    visibleFindings[0] ??
    null;
  const selectedFindingIdForDisplay = selectedFinding?.id ?? null;
  const selectedStatement =
    !activeAnalysisResult || !selectedFinding
      ? null
      : activeAnalysisResult.statements.find(
          (statement) => statement.index === selectedFinding.statementIndex,
        ) ?? null;
  const selectedRecipeGroup =
    selectedFinding === null
      ? null
      : safeRewriteGroupsByFindingId.get(selectedFinding.id) ?? null;
  const selectedFrameworkNote = getFrameworkNoteForFinding(
    selectedFinding,
    activeFrameworkMetadata,
  );
  const reportExportInput =
    activeAnalysisResult === null
      ? null
      : ({
          findings: visibleFindings,
          frameworkLabel: activeAnalysisResult.metadata.framework.label,
          frameworkPreset: workspaceSettings.frameworkPreset,
          options: {
            includeSqlSnippets: includeSqlSnippetsInReport,
            sourceFilename,
          },
          parserDiagnostics,
          postgresVersion: workspaceSettings.postgresVersion,
          recipeGroups: visibleSafeRewriteRecipeGroups,
          result: activeAnalysisResult,
          tableSizeProfile: workspaceSettings.tableSizeProfile,
          viewFilters: {
            categoryFilter,
            resultsTab,
            severityFilter,
            showLowSeverity: workspaceSettings.showLowSeverity,
            showOnlyBlockingRisks,
            showSafeRewritesOnly,
            sortMode,
          },
        } satisfies ReportExportInput);
  const markdownReportText =
    reportExportInput === null ? "" : createMarkdownReport(reportExportInput);
  const reportFilenames = getReportFilenames(sourceFilename);
  const isAnalysisStale =
    activeAnalysisResult !== null &&
    (lastAnalyzedSql.trim() !== sql.trim() ||
      lastAnalyzedSourceFilename !== sourceFilename ||
      lastAnalyzedSettingsSignature !== currentSettingsSignature);

  useEffect(() => {
    const activeTimeouts = messageTimeoutsRef.current;

    return () => {
      activeTimeouts.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      activeTimeouts.clear();
    };
  }, []);

  useEffect(() => {
    if (!isExamplesOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!examplesMenuRef.current?.contains(event.target as Node)) {
        setIsExamplesOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isExamplesOpen]);

  useEffect(() => {
    if (shareStateAppliedRef.current || typeof window === "undefined") {
      return;
    }

    shareStateAppliedRef.current = true;
    const sharedState = readShareableCheckerStateFromHash();

    if (!sharedState) {
      return;
    }

    writePersistedWorkspaceSettings({
      ...workspaceSettings,
      ...(sharedState.postgresVersion
        ? { postgresVersion: sharedState.postgresVersion }
        : {}),
      ...(sharedState.frameworkPreset
        ? { frameworkPreset: sharedState.frameworkPreset }
        : {}),
      ...(sharedState.tableSizeProfile
        ? { tableSizeProfile: sharedState.tableSizeProfile }
        : {}),
      ...(typeof sharedState.showLowSeverity === "boolean"
        ? { showLowSeverity: sharedState.showLowSeverity }
        : {}),
    });

    const frameId = window.requestAnimationFrame(() => {
      if (sharedState.severityFilter) {
        setSeverityFilter(sharedState.severityFilter);
      }

      if (sharedState.categoryFilter) {
        setCategoryFilter(sharedState.categoryFilter);
      }

      if (typeof sharedState.showOnlyBlockingRisks === "boolean") {
        setShowOnlyBlockingRisks(sharedState.showOnlyBlockingRisks);
      }

      if (typeof sharedState.showSafeRewritesOnly === "boolean") {
        setShowSafeRewritesOnly(sharedState.showSafeRewritesOnly);
      }

      if (sharedState.sortMode) {
        setSortMode(sharedState.sortMode);
      }

      if (sharedState.resultsTab) {
        setResultsTab(sharedState.resultsTab);
      }
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [workspaceSettings]);

  const runAnalysis = useCallback(
    async (
      sqlToAnalyze: string,
      settingsToUse: PersistedWorkspaceSettings,
      nextSourceFilename: string | null,
    ) => {
      const trimmedSql = sqlToAnalyze.trim();

      if (trimmedSql.length === 0) {
        setAnalysisResult(null);
        setLastAnalyzedSql("");
        setLastAnalyzedSourceFilename(null);
        setLastAnalyzedSettingsSignature("");
        return;
      }

      const requestId = analysisRequestIdRef.current + 1;
      analysisRequestIdRef.current = requestId;
      setIsAnalyzing(true);

      try {
        const result = await analyzeInWorkerOrMainThread({
          sql: sqlToAnalyze,
          sourceFilename: nextSourceFilename ?? undefined,
          settings: buildAnalysisSettings(
            settingsToUse,
            transactionAssumptionMode,
          ),
        });

        if (analysisRequestIdRef.current !== requestId) {
          return;
        }

        startTransition(() => {
          setAnalysisResult(result);
          setLastAnalyzedSql(sqlToAnalyze);
          setLastAnalyzedSourceFilename(nextSourceFilename);
          setLastAnalyzedSettingsSignature(
            getWorkspaceSettingsSignature(
              settingsToUse,
              transactionAssumptionMode,
              nextSourceFilename,
            ),
          );
        });
      } finally {
        if (analysisRequestIdRef.current === requestId) {
          setIsAnalyzing(false);
        }
      }
    },
    [transactionAssumptionMode],
  );

  useEffect(() => {
    if (!workspaceSettings.autoAnalyze || deferredSql.trim().length === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void runAnalysis(deferredSql, workspaceSettings, sourceFilename);
    }, 120);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [deferredSql, runAnalysis, sourceFilename, workspaceSettings]);

  function pushStatus(message: string, tone: StatusTone = "default") {
    const id = statusIdRef.current + 1;
    statusIdRef.current = id;
    const timeoutId = window.setTimeout(() => {
      dismissStatus(id);
    }, STATUS_MESSAGE_TTL_MS);

    messageTimeoutsRef.current.set(id, timeoutId);

    setStatusMessages((current) =>
      [{ id, message, tone }, ...current].slice(0, 3),
    );
  }

  function dismissStatus(id: number) {
    const timeoutId = messageTimeoutsRef.current.get(id);

    if (timeoutId) {
      window.clearTimeout(timeoutId);
      messageTimeoutsRef.current.delete(id);
    }

    setStatusMessages((current) => current.filter((message) => message.id !== id));
  }

  function updateSetting<K extends keyof PersistedWorkspaceSettings>(
    key: K,
    value: PersistedWorkspaceSettings[K],
  ) {
    writePersistedWorkspaceSettings({
      ...workspaceSettings,
      [key]: value,
    });
  }

  function handleLoadSample(sample: PostgresMigrationSample) {
    setSql(sample.sql);
    setSourceFilename(null);
    setSelectedSampleId(sample.id);
    setIsExamplesOpen(false);
    pushStatus(
      sample.id === DEFAULT_POSTGRES_MIGRATION_SAMPLE_ID
        ? "Loaded unsafe example"
        : `Loaded ${sample.name}`,
    );
  }

  async function handlePasteFromClipboard() {
    try {
      const clipboardText = await navigator.clipboard.readText();

      if (clipboardText.length === 0) {
        return;
      }

      setSql(clipboardText);
      setSourceFilename(null);
      setSelectedSampleId(null);
    } catch {
      pushStatus("Could not read clipboard. Paste manually instead.", "error");
    }
  }

  async function handleCopyMarkdownReport() {
    if (!markdownReportText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(markdownReportText);
      pushStatus("Copied Markdown report");
    } catch {
      pushStatus("Could not copy to clipboard. Copy manually instead.", "error");
    }
  }

  function handleDownloadMarkdownReport() {
    if (!reportExportInput) {
      return;
    }

    downloadTextFile({
      content: createMarkdownReport(reportExportInput),
      filename: reportFilenames.markdown,
      mimeType: "text/markdown;charset=utf-8",
    });
    pushStatus(`Downloaded ${reportFilenames.markdown}`);
  }

  function handleDownloadHtmlReport() {
    if (!reportExportInput) {
      return;
    }

    downloadTextFile({
      content: createHtmlReport(reportExportInput),
      filename: reportFilenames.html,
      mimeType: "text/html;charset=utf-8",
    });
    pushStatus(`Downloaded ${reportFilenames.html}`);
  }

  function handleDownloadJsonReport() {
    if (!reportExportInput) {
      return;
    }

    downloadTextFile({
      content: stringifyJsonReport(reportExportInput),
      filename: reportFilenames.json,
      mimeType: "application/json;charset=utf-8",
    });
    pushStatus(`Downloaded ${reportFilenames.json}`);
  }

  function handlePrintReport() {
    if (!reportExportInput) {
      return;
    }

    const opened = openPrintReport(createHtmlReport(reportExportInput));

    if (opened) {
      pushStatus("Opened printable report");
      return;
    }

    pushStatus("Could not open print window. Allow pop-ups and try again.", "error");
  }

  async function handleCopySettingsLink() {
    const shareLink = buildShareableCheckerLink({
      categoryFilter,
      frameworkPreset: workspaceSettings.frameworkPreset,
      postgresVersion: workspaceSettings.postgresVersion,
      resultsTab,
      severityFilter,
      showLowSeverity: workspaceSettings.showLowSeverity,
      showOnlyBlockingRisks,
      showSafeRewritesOnly,
      sortMode,
      tableSizeProfile: workspaceSettings.tableSizeProfile,
    });

    try {
      await navigator.clipboard.writeText(shareLink);
      pushStatus("Copied settings link");
    } catch {
      pushStatus("Could not copy to clipboard. Copy manually instead.", "error");
    }
  }

  async function handleCopyFindingMarkdown(finding: Finding) {
    const statement =
      !activeAnalysisResult
        ? null
        : activeAnalysisResult.statements.find(
            (candidate) => candidate.index === finding.statementIndex,
          ) ?? null;
    const frameworkNote = getFrameworkNoteForFinding(
      finding,
      activeFrameworkMetadata,
    );
    const recipeGroup = safeRewriteGroupsByFindingId.get(finding.id) ?? null;

    try {
      await navigator.clipboard.writeText(
        createFindingMarkdown({
          finding,
          frameworkNote,
          recipeGroup,
          redactionMode: workspaceSettings.redactionMode,
          statement,
        }),
      );
      pushStatus("Copied finding as Markdown");
    } catch {
      pushStatus("Could not copy to clipboard. Copy manually instead.", "error");
    }
  }

  async function handleCopyRecipeMarkdown(
    recipeGroup: FindingRecipeGroup,
    recipe: SafeRewriteRecipe,
  ) {
    if (!activeAnalysisResult) {
      return;
    }

    const statement =
      activeAnalysisResult.statements.find(
        (candidate) => candidate.index === recipeGroup.statementIndex,
      ) ?? null;

    try {
      await navigator.clipboard.writeText(
        createRecipeMarkdown({
          recipe,
          recipeGroup,
          redactionMode: workspaceSettings.redactionMode,
          statement,
        }),
      );
      pushStatus("Copied recipe as Markdown");
    } catch {
      pushStatus("Could not copy to clipboard. Copy manually instead.", "error");
    }
  }

  async function handleCopyAllRecipeMarkdown() {
    if (!activeAnalysisResult) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        createAllRecipesMarkdown({
          recipeGroups: visibleSafeRewriteRecipeGroups,
          redactionMode: workspaceSettings.redactionMode,
          result: activeAnalysisResult,
        }),
      );
      pushStatus("Copied all safe rewrites as Markdown");
    } catch {
      pushStatus("Could not copy to clipboard. Copy manually instead.", "error");
    }
  }

  async function handleCopySqlSnippet(sqlSnippet: string) {
    try {
      await navigator.clipboard.writeText(sqlSnippet);
      pushStatus("Copied to clipboard");
    } catch {
      pushStatus("Could not copy to clipboard. Copy manually instead.", "error");
    }
  }

  async function handleCopySafeRewriteForFinding(finding: Finding) {
    const recipeGroup = safeRewriteGroupsByFindingId.get(finding.id) ?? null;
    const sqlSnippet = getPrimarySafeRewriteSql(finding, recipeGroup);

    if (!sqlSnippet) {
      pushStatus("No copyable SQL snippet is available for this recipe.", "error");
      return;
    }

    await handleCopySqlSnippet(sqlSnippet);
  }

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const fileContents = await file.text();
      setSql(fileContents);
      setSourceFilename(file.name);
      setSelectedSampleId(null);
      pushStatus(`Uploaded ${file.name} locally`);
    } finally {
      event.target.value = "";
    }
  }

  function handleClearInput() {
    setSql("");
    setSourceFilename(null);
    setSelectedSampleId(null);
    setSelectedFindingId(null);
    setAnalysisResult(null);
    setLastAnalyzedSql("");
    setLastAnalyzedSourceFilename(null);
    setLastAnalyzedSettingsSignature("");
    pushStatus("Cleared input");
  }

  function handleSelectFinding(finding: Finding) {
    setSelectedFindingId(finding.id);

    if (typeof window !== "undefined" && window.innerWidth < 1280) {
      window.requestAnimationFrame(() => {
        findingDetailRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
  }

  return (
    <>
      <div id="checker-workspace" className="space-y-6 scroll-mt-24">
        <Card className="p-5 sm:p-6">
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <label
                  htmlFor="postgres-version"
                  className="text-sm font-medium text-foreground"
                >
                  PostgreSQL version
                </label>
                <select
                  id="postgres-version"
                  name="postgres-version"
                  value={String(workspaceSettings.postgresVersion)}
                  onChange={(event) => {
                    updateSetting(
                      "postgresVersion",
                      Number(event.target.value) as PostgresVersion,
                    );
                  }}
                  className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm text-foreground outline-none transition focus:border-ring focus:ring-4 focus:ring-ring/15"
                >
                  {SUPPORTED_POSTGRES_VERSIONS.map((version) => (
                    <option key={version.version} value={version.version}>
                      {version.label}
                    </option>
                  ))}
                </select>
                <p className="text-sm leading-6 text-muted-foreground">
                  {selectedVersionProfile?.supportStatus ??
                    `PostgreSQL ${workspaceSettings.postgresVersion} stays available for legacy analyzer logic, but version-specific profile notes are focused on PostgreSQL 11-18.`}
                </p>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="framework-preset"
                  className="text-sm font-medium text-foreground"
                >
                  Framework preset
                </label>
                <select
                  id="framework-preset"
                  name="framework-preset"
                  value={workspaceSettings.frameworkPreset}
                  onChange={(event) => {
                    updateSetting(
                      "frameworkPreset",
                      event.target.value as FrameworkPreset,
                    );
                  }}
                  className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm text-foreground outline-none transition focus:border-ring focus:ring-4 focus:ring-ring/15"
                >
                  {FRAMEWORK_PRESET_DEFINITIONS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="table-size-profile"
                  className="text-sm font-medium text-foreground"
                >
                  Table size profile
                </label>
                <select
                  id="table-size-profile"
                  name="table-size-profile"
                  value={workspaceSettings.tableSizeProfile}
                  onChange={(event) => {
                    updateSetting(
                      "tableSizeProfile",
                      event.target.value as TableSizeProfile,
                    );
                  }}
                  className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm text-foreground outline-none transition focus:border-ring focus:ring-4 focus:ring-ring/15"
                >
                  {TABLE_SIZE_PROFILE_OPTIONS.map((profile) => (
                    <option key={profile.value} value={profile.value}>
                      {profile.label}
                    </option>
                  ))}
                </select>
                <p className="text-sm leading-6 text-muted-foreground">
                  {selectedTableSizeProfile?.description} This is only an estimate for severity tuning. The checker does not connect to your database or inspect live row counts.
                </p>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="transaction-assumption"
                  className="text-sm font-medium text-foreground"
                >
                  Transaction assumption
                </label>
                <select
                  id="transaction-assumption"
                  name="transaction-assumption"
                  value={transactionAssumptionMode}
                  onChange={(event) => {
                    setTransactionAssumptionMode(
                      event.target.value as TransactionAssumptionMode,
                    );
                  }}
                  className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm text-foreground outline-none transition focus:border-ring focus:ring-4 focus:ring-ring/15"
                >
                  {TRANSACTION_ASSUMPTION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-sm leading-6 text-muted-foreground">
                  {
                    TRANSACTION_ASSUMPTION_OPTIONS.find(
                      (option) => option.value === transactionAssumptionMode,
                    )?.description
                  }
                </p>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <VersionNotesCard
                profile={selectedVersionProfile}
                postgresVersion={workspaceSettings.postgresVersion}
              />
              <FrameworkNotesCard
                frameworkMetadata={activeFrameworkMetadata}
                sourceFilename={sourceFilename}
                transactionAssumptionMode={transactionAssumptionMode}
                workspaceSettings={workspaceSettings}
              />
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <SettingToggle
                label="Auto analyze"
                description="Run the checker after edits settle so returning users get faster feedback."
                checked={workspaceSettings.autoAnalyze}
                onCheckedChange={(checked) => {
                  updateSetting("autoAnalyze", checked);
                }}
              />
              <SettingToggle
                label="Show low severity"
                description="Keep quieter warnings visible when you want the fuller review surface."
                checked={workspaceSettings.showLowSeverity}
                onCheckedChange={(checked) => {
                  updateSetting("showLowSeverity", checked);
                }}
              />
              <SettingToggle
                label="Redaction mode"
                description="Hide object names in copied findings when you need a safer review artifact."
                checked={workspaceSettings.redactionMode}
                onCheckedChange={(checked) => {
                  updateSetting("redactionMode", checked);
                }}
              />
            </div>

            <p className="text-sm leading-7 text-muted-foreground">
              Safe workspace settings persist in <code>localStorage</code> after
              reload. Raw SQL is not stored automatically, and local history stays
              off for now.
            </p>
          </div>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold">Migration input</h2>
                <p className="text-sm text-muted-foreground">
                  Use the SQL editor, local upload, clipboard paste, or curated
                  examples to drive the checker.
                </p>
              </div>
              <Badge variant="outline">Local workspace</Badge>
            </div>

            <div className="space-y-5 p-6">
              <div className="flex flex-wrap items-center gap-3">
                <div ref={examplesMenuRef} className="relative">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setIsExamplesOpen((current) => !current);
                    }}
                    aria-expanded={isExamplesOpen}
                    aria-controls="examples-menu"
                  >
                    Examples
                  </Button>

                  {isExamplesOpen ? (
                    <div
                      id="examples-menu"
                      className="absolute left-0 top-full z-20 mt-2 w-[min(26rem,calc(100vw-4rem))] space-y-4 rounded-3xl border border-border bg-card p-4 shadow-[0_20px_40px_rgba(15,23,42,0.12)]"
                    >
                      {POSTGRES_MIGRATION_SAMPLE_GROUPS.map((group) => (
                        <div key={group} className="space-y-2">
                          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                            {group}
                          </p>
                          <div className="space-y-1">
                            {POSTGRES_MIGRATION_SAMPLES.filter(
                              (sample) => sample.group === group,
                            ).map((sample) => (
                              <button
                                key={sample.id}
                                type="button"
                                onClick={() => {
                                  handleLoadSample(sample);
                                }}
                                className="w-full rounded-2xl border border-transparent px-3 py-3 text-left transition hover:border-border hover:bg-accent"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-sm font-medium text-foreground">
                                    {sample.name}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {sample.difficulty}
                                  </span>
                                </div>
                                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                                  {sample.description}
                                </p>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <input
                  id={fileInputId}
                  ref={fileInputRef}
                  type="file"
                  accept=".sql,text/sql,application/sql"
                  onChange={handleFileUpload}
                  className="hidden"
                />

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    fileInputRef.current?.click();
                  }}
                >
                  Upload SQL
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void handlePasteFromClipboard();
                  }}
                >
                  Paste from clipboard
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleClearInput}
                  disabled={sql.trim().length === 0}
                >
                  Clear input
                </Button>
              </div>

              <div className="rounded-2xl border border-dashed border-border bg-background/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-card">
                      <Upload className="size-4 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        Local-only input handling
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Uploads stay on this device, safe settings persist, and raw
                        SQL is not auto-saved for returning sessions.
                      </p>
                    </div>
                  </div>

                  <label
                    htmlFor={fileInputId}
                    className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-card-foreground transition hover:bg-accent hover:text-accent-foreground"
                  >
                    Choose .sql file
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Migration SQL
                </p>
                <CodeEditor
                  ariaLabel="Migration SQL editor"
                  value={sql}
                  onChange={setSql}
                  placeholder="ALTER TABLE users ADD COLUMN status text;
CREATE INDEX CONCURRENTLY idx_users_status ON users(status);"
                  className="shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                />
              </div>

              {featuredSample ? (
                <div id="unsafe-example" className="scroll-mt-24">
                  <Card className="border border-border bg-background p-5">
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">
                            {selectedSample ? "Loaded example" : "Featured example"}
                          </p>
                          <h3 className="text-lg font-semibold text-foreground">
                            {featuredSample.name}
                          </h3>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge>{featuredSample.group}</Badge>
                          <Badge variant="outline">{featuredSample.difficulty}</Badge>
                        </div>
                      </div>

                      <p className="text-sm leading-7 text-muted-foreground">
                        {featuredSample.description}
                      </p>

                      <div className="flex flex-wrap gap-2">
                        {featuredSample.tags.map((tag) => (
                          <Badge key={tag} variant="outline">
                            {tag}
                          </Badge>
                        ))}
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">
                          Expected review topics
                        </p>
                        <ul className="space-y-2 text-sm leading-7 text-muted-foreground">
                          {featuredSample.expectedTopics.map((topic) => (
                            <li key={topic}>{topic}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </Card>
                </div>
              ) : null}
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold">Results preview</h2>
                  <p className="text-sm text-muted-foreground">
                    Analysis runs in the browser-local workspace shell and keeps the
                    report copy-ready.
                  </p>
                </div>
                <Badge variant="outline">
                  {isAnalysisStale
                    ? "Needs re-run"
                    : activeAnalysisResult
                      ? "Local result"
                      : "Waiting for input"}
                </Badge>
              </div>

              <div className="space-y-5 p-6">
                {sql.trim().length === 0 ? (
                  <EmptyStateCard
                    title="Paste SQL, upload a .sql file, or load an example"
                    body="The editor is ready. Nothing has been analyzed yet, and no raw SQL is being stored for you automatically."
                  />
                ) : isAnalyzing ? (
                  <EmptyStateCard
                    title="Running local analysis"
                    body="The checker is reviewing the current SQL in your browser-local workspace."
                  />
                ) : activeAnalysisResult === null ? (
                  <EmptyStateCard
                    title="Analysis is ready when you are"
                    body="Auto analyze is off right now, so use the button below once your migration text is in place."
                  />
                ) : (
                  <>
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                      <RiskScoreCard result={activeAnalysisResult} />
                      <RiskSummary result={activeAnalysisResult} />
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                      <AnalysisMetadataPanel
                        parserDiagnostics={parserDiagnostics}
                        result={activeAnalysisResult}
                      />
                      <LimitationsPanel
                        limitations={activeResultLimitations}
                        tableSizeProfile={workspaceSettings.tableSizeProfile}
                      />
                    </div>

                    <FindingsToolbar
                      availableCategories={availableFindingCategories}
                      categoryFilter={categoryFilter}
                      filteredCount={visibleFindings.length}
                      searchTerm={searchTerm}
                      severityFilter={severityFilter}
                      showOnlyBlockingRisks={showOnlyBlockingRisks}
                      showSafeRewritesOnly={showSafeRewritesOnly}
                      sortMode={sortMode}
                      totalCount={baseVisibleFindings.length}
                      onCategoryFilterChange={setCategoryFilter}
                      onSearchTermChange={setSearchTerm}
                      onSeverityFilterChange={setSeverityFilter}
                      onShowOnlyBlockingRisksChange={setShowOnlyBlockingRisks}
                      onShowSafeRewritesOnlyChange={setShowSafeRewritesOnly}
                      onSortModeChange={setSortMode}
                    />

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setResultsTab("findings");
                        }}
                        className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium transition ${
                          resultsTab === "findings"
                            ? "border-foreground/20 bg-card text-foreground"
                            : "border-border bg-background text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Findings
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setResultsTab("safe-rewrites");
                        }}
                        className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium transition ${
                          resultsTab === "safe-rewrites"
                            ? "border-foreground/20 bg-card text-foreground"
                            : "border-border bg-background text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Safe rewrites
                      </button>
                    </div>

                    {resultsTab === "findings" ? (
                      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] xl:items-start">
                        <FindingsList
                          canCopySafeRewrite={(finding) =>
                            findingHasCopyableSafeRewrite(
                              finding,
                              safeRewriteGroupsByFindingId.get(finding.id) ?? null,
                            )
                          }
                          findings={visibleFindings}
                          totalFindings={baseVisibleFindings.length}
                          selectedFindingId={selectedFindingIdForDisplay}
                          onCopySafeRewrite={(finding) => {
                            void handleCopySafeRewriteForFinding(finding);
                          }}
                          onSelectFinding={handleSelectFinding}
                        />

                        <div ref={findingDetailRef}>
                          <FindingDetail
                            finding={selectedFinding}
                            frameworkMetadata={activeFrameworkMetadata}
                            frameworkNote={selectedFrameworkNote}
                            onCopyFindingMarkdown={(finding) => {
                              void handleCopyFindingMarkdown(finding);
                            }}
                            onCopySafeRewrite={(finding) => {
                              void handleCopySafeRewriteForFinding(finding);
                            }}
                            recipeGroup={selectedRecipeGroup}
                            statement={selectedStatement}
                          />
                        </div>
                      </div>
                    ) : (
                      <SafeRewritePanel
                        recipeGroups={visibleSafeRewriteRecipeGroups}
                        totalGroups={safeRewriteRecipeGroups.length}
                        onCopyAllMarkdown={() => {
                          void handleCopyAllRecipeMarkdown();
                        }}
                        onCopyRecipeMarkdown={(recipeGroup, recipe) => {
                          void handleCopyRecipeMarkdown(recipeGroup, recipe);
                        }}
                        onCopySqlSnippet={(recipe) => {
                          if (!recipe.sqlSnippet) {
                            return;
                          }

                          void handleCopySqlSnippet(recipe.sqlSnippet);
                        }}
                      />
                    )}
                  </>
                )}

                <div className="space-y-4 rounded-3xl border border-border bg-background px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        Report export
                      </p>
                      <p className="text-sm leading-7 text-muted-foreground">
                        Copy, download, print, or share review settings without
                        placing your migration SQL into the URL.
                      </p>
                    </div>

                    <label className="flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                      <input
                        type="checkbox"
                        checked={includeSqlSnippetsInReport}
                        onChange={(event) => {
                          setIncludeSqlSnippetsInReport(event.target.checked);
                        }}
                        className="mt-1 size-4 rounded border-border text-foreground"
                      />
                      <span className="space-y-1">
                        <span className="block text-sm font-medium text-foreground">
                          Include SQL snippets in report
                        </span>
                        <span className="block text-sm leading-6 text-muted-foreground">
                          Off by default so exports stay safer to share.
                        </span>
                      </span>
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      onClick={() => {
                        void runAnalysis(sql, workspaceSettings, sourceFilename);
                      }}
                      disabled={sql.trim().length === 0 || isAnalyzing}
                    >
                      {isAnalyzing ? "Analyzing..." : "Run local analysis"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        void handleCopyMarkdownReport();
                      }}
                      disabled={markdownReportText.length === 0}
                    >
                      Copy Markdown report
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleDownloadMarkdownReport}
                      disabled={reportExportInput === null}
                    >
                      Download Markdown
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleDownloadHtmlReport}
                      disabled={reportExportInput === null}
                    >
                      Download HTML
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleDownloadJsonReport}
                      disabled={reportExportInput === null}
                    >
                      Download JSON
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handlePrintReport}
                      disabled={reportExportInput === null}
                    >
                      Print report
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      title="For privacy, links never include your migration SQL."
                      onClick={() => {
                        void handleCopySettingsLink();
                      }}
                    >
                      Copy settings link
                    </Button>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex size-10 items-center justify-center rounded-xl border border-border bg-background">
                  <ShieldCheck className="size-4 text-muted-foreground" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">Local-only privacy notice</h3>
                  <p className="text-sm leading-7 text-muted-foreground">
                    This workspace keeps migration text on-device by default. The
                    persisted state is limited to safe review preferences like the
                    PostgreSQL version, preset, table profile, and display toggles.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      <StatusMessageStack
        messages={statusMessages}
        onDismiss={dismissStatus}
      />
    </>
  );
}

function getFrameworkPreviewReason(
  frameworkPreset: FrameworkPreset,
  transactionAssumptionMode: TransactionAssumptionMode,
) {
  const definition = getFrameworkPresetDefinition(frameworkPreset);

  if (transactionAssumptionMode === "force-transaction") {
    return "You manually forced the review into a transaction-wrapped assumption.";
  }

  if (transactionAssumptionMode === "force-no-transaction") {
    return "You manually forced the review into a non-transactional assumption.";
  }

  return definition.assumeTransactionDefault
    ? `${definition.label} defaults to transactional migrations unless the file or framework config explicitly disables that wrapper.`
    : `${definition.label} does not assume a transaction wrapper by default.`;
}

function VersionNotesCard({
  profile,
  postgresVersion,
}: VersionNotesCardProps) {
  if (!profile) {
    return (
      <Card className="border border-border bg-background px-4 py-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Version notes</p>
              <p className="text-sm leading-7 text-muted-foreground">
                PostgreSQL {postgresVersion} is supported by legacy analyzer logic, but the richer version-profile copy is focused on PostgreSQL 11 through 18.
              </p>
            </div>
            <Badge variant="outline">PostgreSQL {postgresVersion}</Badge>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border border-border bg-background px-4 py-4">
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Version notes</p>
            <p className="text-sm leading-7 text-muted-foreground">
              {profile.supportStatus}
            </p>
          </div>
          <Badge variant="outline">{profile.label}</Badge>
        </div>

        <div className="rounded-2xl border border-border bg-card px-4 py-3">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Parser support
          </p>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            {profile.parserSupportNotes}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              ADD COLUMN default
            </p>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              {profile.addColumnDefaultNotes}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Concurrent indexes
            </p>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              {profile.concurrentIndexNotes}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Enum changes
            </p>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              {profile.enumChangeNotes}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Generated columns
            </p>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              {profile.generatedColumnNotes}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {profile.docsLinks.map((link) => (
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
    </Card>
  );
}

function FrameworkNotesCard({
  frameworkMetadata,
  sourceFilename,
  transactionAssumptionMode,
  workspaceSettings,
}: FrameworkNotesCardProps) {
  const definition = getFrameworkPresetDefinition(workspaceSettings.frameworkPreset);
  const effectiveAssumeTransaction =
    frameworkMetadata?.effectiveAssumeTransaction ??
    (transactionAssumptionMode === "force-transaction"
      ? true
      : transactionAssumptionMode === "force-no-transaction"
        ? false
        : definition.assumeTransactionDefault);
  const transactionReason =
    frameworkMetadata?.transactionAssumptionReason ??
    getFrameworkPreviewReason(
      workspaceSettings.frameworkPreset,
      transactionAssumptionMode,
    );
  const detectedSignals = frameworkMetadata?.detectedSignals ?? [];
  const resolvedSourceFilename =
    frameworkMetadata?.sourceFilename ?? sourceFilename ?? null;

  return (
    <Card className="border border-border bg-background px-4 py-4">
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Framework notes</p>
            <p className="text-sm leading-7 text-muted-foreground">
              {definition.description}
            </p>
          </div>
          <Badge variant="outline">{definition.label}</Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Transaction assumption
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {effectiveAssumeTransaction
                ? "Assume wrapped in transaction"
                : "Assume no transaction"}
            </p>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              {transactionReason}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Safer rollout defaults
            </p>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              <span className="font-medium text-foreground">Indexes:</span>{" "}
              {definition.safeIndexAdvice}
            </p>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              <span className="font-medium text-foreground">Constraints:</span>{" "}
              {definition.safeConstraintAdvice}
            </p>
          </div>
        </div>

        {resolvedSourceFilename ? (
          <p className="text-sm leading-7 text-muted-foreground">
            <span className="font-medium text-foreground">Source filename:</span>{" "}
            {resolvedSourceFilename}
          </p>
        ) : null}

        {definition.transactionDisableHint ? (
          <p className="text-sm leading-7 text-muted-foreground">
            <span className="font-medium text-foreground">
              Transaction disable hint:
            </span>{" "}
            {definition.transactionDisableHint}
          </p>
        ) : null}

        {detectedSignals.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Detected signals</p>
            <div className="flex flex-wrap gap-2">
              {detectedSignals.map((signal) => (
                <Badge key={signal} variant="outline">
                  {signal}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-sm font-medium text-foreground">Common risks</p>
            <div className="mt-2 space-y-2">
              {definition.commonRisks.slice(0, 2).map((risk) => (
                <p
                  key={risk}
                  className="text-sm leading-7 text-muted-foreground"
                >
                  {risk}
                </p>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-sm font-medium text-foreground">Review checklist</p>
            <div className="mt-2 space-y-2">
              {definition.migrationReviewChecklist.slice(0, 3).map((item) => (
                <p
                  key={item}
                  className="text-sm leading-7 text-muted-foreground"
                >
                  {item}
                </p>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {definition.docsLinks.map((link) => (
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
    </Card>
  );
}

function SettingToggle({
  checked,
  description,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-2xl border border-border bg-background px-4 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          onCheckedChange(event.target.checked);
        }}
        className="mt-1 size-4 rounded border-border text-foreground"
      />
      <span className="space-y-1">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block text-sm leading-6 text-muted-foreground">
          {description}
        </span>
      </span>
    </label>
  );
}

function EmptyStateCard({
  body,
  title,
}: {
  body: string;
  title: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background px-4 py-4">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-2 text-sm leading-7 text-muted-foreground">{body}</p>
    </div>
  );
}

function StatusMessageStack({
  messages,
  onDismiss,
}: {
  messages: readonly StatusMessage[];
  onDismiss: (id: number) => void;
}) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2 px-4"
    >
      {messages.map((message) => (
        <div
          key={message.id}
          role="status"
          className={`pointer-events-auto rounded-2xl border px-4 py-3 text-sm shadow-[0_12px_24px_rgba(15,23,42,0.12)] ${
            message.tone === "error"
              ? "border-[color:oklch(0.76_0.12_27)] bg-[color:oklch(0.98_0.02_27)] text-[color:oklch(0.44_0.11_27)] dark:border-[color:oklch(0.52_0.13_27)] dark:bg-[color:oklch(0.24_0.03_27)] dark:text-[color:oklch(0.86_0.04_27)]"
              : "border-border bg-card text-card-foreground"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <p>{message.message}</p>
            <button
              type="button"
              onClick={() => {
                onDismiss(message.id);
              }}
              className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
