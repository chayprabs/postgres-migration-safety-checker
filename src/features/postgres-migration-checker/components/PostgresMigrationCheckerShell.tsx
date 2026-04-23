"use client";

import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from "react";
import { ShieldCheck, Upload } from "lucide-react";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { CodeEditor } from "@/components/code/CodeEditor";
import {
  readAnalyticsDebugEvents,
  subscribeAnalyticsDebugEvents,
  trackAnalysisCompleted,
  trackAnalysisFailed,
  trackLocalSaveOpened,
  trackLocalSaveSaved,
  trackRedactionModeEnabled,
  trackReportCopied,
  trackReportExported,
  trackSampleLoaded,
  trackSettingsLinkCopied,
  trackToolOpened,
  type AnalyticsDebugEvent,
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
import {
  clearSavedLocalHistory,
  deleteSavedLocalAnalysis,
  readSavedLocalAnalyses,
  saveLocalAnalysis,
  subscribeSavedLocalAnalyses,
} from "../history/localHistory";
import type { SavedLocalAnalysis } from "../history/types";
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
import {
  LOAD_POSTGRES_MIGRATION_SAMPLE_EVENT,
  type LoadPostgresMigrationSampleDetail,
} from "../workspaceEvents";
import { cn } from "@/lib/utils";

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

type SaveDialogState = {
  title: string;
};

type CommandMenuCommand = {
  description: string;
  disabled?: boolean;
  disabledReason?: string;
  id: string;
  keywords?: readonly string[];
  label: string;
  onSelect: () => void;
  shortcut?: string;
};

type ShortcutHelpItem = {
  action: string;
  keys: string;
  note: string;
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

const DEFAULT_SAFE_SAMPLE_ID = "foreign-key-not-valid";
const SHORTCUT_LABELS = {
  analyze: "Cmd/Ctrl + Enter",
  commandMenu: "Cmd/Ctrl + K",
  copyMarkdownReport: "Cmd/Ctrl + Shift + C",
  escape: "Esc",
  findingsSearch: "/",
  loadUnsafeExample: "Cmd/Ctrl + Shift + L",
} as const;

const SHORTCUT_HELP_ITEMS: readonly ShortcutHelpItem[] = [
  {
    keys: SHORTCUT_LABELS.analyze,
    action: "Analyze now",
    note: "Run the checker immediately from anywhere on this tool page.",
  },
  {
    keys: SHORTCUT_LABELS.commandMenu,
    action: "Open command menu",
    note: "Jump straight to common actions without leaving the keyboard.",
  },
  {
    keys: SHORTCUT_LABELS.copyMarkdownReport,
    action: "Copy Markdown report",
    note: "Copies the report when an analysis result is available.",
  },
  {
    keys: SHORTCUT_LABELS.loadUnsafeExample,
    action: "Load unsafe example",
    note: "Loads the default risky migration example into the editor.",
  },
  {
    keys: SHORTCUT_LABELS.escape,
    action: "Close dialogs and menus",
    note: "Dismisses open overlays, drawers, and popovers.",
  },
  {
    keys: SHORTCUT_LABELS.findingsSearch,
    action: "Focus findings search",
    note: "Moves focus to findings search when you are not typing in the editor.",
  },
] as const;

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
): AnalyticsSettingsSummary {
  return {
    postgresVersion: settings.postgresVersion,
    frameworkPreset: settings.frameworkPreset,
    tableSizeProfile: settings.tableSizeProfile,
    redactionMode: settings.redactionMode,
  };
}

function getOutputSqlSnippet(sqlSnippet: string, redactionMode: boolean) {
  return redactionMode ? redactSecretsInText(sqlSnippet) : sqlSnippet;
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], .cm-editor, .cm-content',
    ),
  );
}

function scrollElementIntoView(element: HTMLElement | null) {
  if (!element || typeof window === "undefined") {
    return;
  }

  window.requestAnimationFrame(() => {
    element.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  });
}

function formatSavedAnalysisTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getSavedAnalysisModeLabel(saveMode: SavedLocalAnalysis["saveMode"]) {
  return saveMode === "with-sql" ? "Saved with SQL" : "Summary only";
}

function getSuggestedSavedAnalysisTitle(
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
  const isDevelopment = process.env.NODE_ENV === "development";
  const workspaceSettings = useSyncExternalStore(
    subscribeWorkspaceSettings,
    readPersistedWorkspaceSettings,
    createDefaultWorkspaceSettings,
  );
  const savedLocalAnalyses = useSyncExternalStore(
    subscribeSavedLocalAnalyses,
    readSavedLocalAnalyses,
    readSavedLocalAnalyses,
  );
  const analyticsDebugEvents = useSyncExternalStore(
    subscribeAnalyticsDebugEvents,
    readAnalyticsDebugEvents,
    readAnalyticsDebugEvents,
  );
  const [sql, setSql] = useState("");
  const [sourceFilename, setSourceFilename] = useState<string | null>(null);
  const [transactionAssumptionMode, setTransactionAssumptionMode] =
    useState<TransactionAssumptionMode>("auto");
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [openedSavedAnalysisId, setOpenedSavedAnalysisId] = useState<string | null>(
    null,
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPrivacyExplanationOpen, setIsPrivacyExplanationOpen] = useState(false);
  const [saveDialogState, setSaveDialogState] = useState<SaveDialogState | null>(
    null,
  );
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);
  const [commandMenuQuery, setCommandMenuQuery] = useState("");
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isSavedHistoryOpen, setIsSavedHistoryOpen] = useState(false);
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
  const findingsSearchInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const settingsSectionRef = useRef<HTMLDivElement | null>(null);
  const migrationInputSectionRef = useRef<HTMLDivElement | null>(null);
  const privacyBannerRef = useRef<HTMLDivElement | null>(null);
  const examplesMenuRef = useRef<HTMLDivElement | null>(null);
  const findingsSearchInputRef = useRef<HTMLInputElement | null>(null);
  const findingDetailRef = useRef<HTMLDivElement | null>(null);
  const shareStateAppliedRef = useRef(false);
  const messageTimeoutsRef = useRef<Map<number, number>>(new Map());
  const statusIdRef = useRef(0);
  const analysisRequestIdRef = useRef(0);
  const toolOpenTrackedRef = useRef(false);
  const onExternalSampleLoad = useEffectEvent(
    (detail: LoadPostgresMigrationSampleDetail) => {
      const sample = getPostgresMigrationSample(detail.sampleId);

      if (!sample) {
        return;
      }

      loadSampleIntoWorkspace(sample);
    },
  );
  const openedSavedAnalysis =
    openedSavedAnalysisId === null
      ? null
      : savedLocalAnalyses.find(
          (savedAnalysis) => savedAnalysis.id === openedSavedAnalysisId,
        ) ?? null;
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
  const redactedSql = getOutputSqlSnippet(sql, true);
  const hasRedactedCopy = redactedSql !== sql;
  const isViewingSavedAnalysis = openedSavedAnalysis !== null;
  const activeAnalysisResult =
    sql.trim().length === 0 && !isViewingSavedAnalysis ? null : analysisResult;
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
            redactionMode: workspaceSettings.redactionMode,
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
    !isViewingSavedAnalysis &&
    activeAnalysisResult !== null &&
    (lastAnalyzedSql.trim() !== sql.trim() ||
      lastAnalyzedSourceFilename !== sourceFilename ||
      lastAnalyzedSettingsSignature !== currentSettingsSignature);
  const sampleUsed = selectedSampleId !== null;
  const canSaveLocally = activeAnalysisResult !== null;
  const parserUsedFallback =
    activeAnalysisResult?.metadata.parser.parser === "fallback";
  const hasTransientUiOpen =
    isCommandMenuOpen ||
    isExamplesOpen ||
    isPrivacyExplanationOpen ||
    isSavedHistoryOpen ||
    isSettingsOpen ||
    isShortcutsOpen ||
    saveDialogState !== null;
  const saveDialogSuggestedTitle = getSuggestedSavedAnalysisTitle(
    activeAnalysisResult,
    sql,
    sourceFilename,
  );

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
    if (toolOpenTrackedRef.current) {
      return;
    }

    toolOpenTrackedRef.current = true;
    trackToolOpened(TOOL_ID);
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

  const dismissStatus = useCallback((id: number) => {
    const timeoutId = messageTimeoutsRef.current.get(id);

    if (timeoutId) {
      window.clearTimeout(timeoutId);
      messageTimeoutsRef.current.delete(id);
    }

    setStatusMessages((current) => current.filter((message) => message.id !== id));
  }, []);

  const pushStatus = useCallback((message: string, tone: StatusTone = "default") => {
    const id = statusIdRef.current + 1;
    statusIdRef.current = id;
    const timeoutId = window.setTimeout(() => {
      dismissStatus(id);
    }, STATUS_MESSAGE_TTL_MS);

    messageTimeoutsRef.current.set(id, timeoutId);

    setStatusMessages((current) =>
      [{ id, message, tone }, ...current].slice(0, 3),
    );
  }, [dismissStatus]);

  const runAnalysis = useCallback(
    async (
      sqlToAnalyze: string,
      settingsToUse: PersistedWorkspaceSettings,
      nextSourceFilename: string | null,
      usedSample: boolean,
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

        trackAnalysisCompleted({
          toolId: TOOL_ID,
          inputLength: sqlToAnalyze.length,
          statementCount: result.statements.length,
          findingCount: result.findings.length,
          severityCounts: result.summary.bySeverity,
          categoriesPresent: [
            ...new Set(result.findings.map((finding) => finding.category)),
          ],
          durationMs: result.metadata.analysisDurationMs,
          parserUsed: result.metadata.parser.parser,
          sampleUsed: usedSample,
          settingsSummary: buildAnalyticsSettingsSummary(settingsToUse),
        });

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
      } catch {
        trackAnalysisFailed({
          toolId: TOOL_ID,
          inputLength: sqlToAnalyze.length,
          sampleUsed: usedSample,
          settingsSummary: buildAnalyticsSettingsSummary(settingsToUse),
        });
        setAnalysisResult(null);
        pushStatus(
          "Analysis failed before a safe result could be generated. Try adjusting the SQL or settings.",
          "error",
        );
        setLastAnalyzedSql("");
        setLastAnalyzedSourceFilename(null);
        setLastAnalyzedSettingsSignature("");
      } finally {
        if (analysisRequestIdRef.current === requestId) {
          setIsAnalyzing(false);
        }
      }
    },
    [pushStatus, transactionAssumptionMode],
  );

  useEffect(() => {
    if (!workspaceSettings.autoAnalyze || deferredSql.trim().length === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void runAnalysis(
        deferredSql,
        workspaceSettings,
        sourceFilename,
        sampleUsed,
      );
    }, 120);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [deferredSql, runAnalysis, sampleUsed, sourceFilename, workspaceSettings]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function handleLoadSampleEvent(event: Event) {
      onExternalSampleLoad(
        (event as CustomEvent<LoadPostgresMigrationSampleDetail>).detail,
      );
    }

    window.addEventListener(
      LOAD_POSTGRES_MIGRATION_SAMPLE_EVENT,
      handleLoadSampleEvent,
    );

    return () => {
      window.removeEventListener(
        LOAD_POSTGRES_MIGRATION_SAMPLE_EVENT,
        handleLoadSampleEvent,
      );
    };
  }, []);

  const onGlobalShortcutKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === "Escape") {
      if (closeTransientUi()) {
        event.preventDefault();
      }

      return;
    }

    if (saveDialogState || isCommandMenuOpen || isShortcutsOpen) {
      return;
    }

    const hasModifier = event.metaKey || event.ctrlKey;
    const unsafeExample = getPostgresMigrationSample(
      DEFAULT_POSTGRES_MIGRATION_SAMPLE_ID,
    );

    if (hasModifier && event.key === "Enter") {
      event.preventDefault();
      handleRunAnalysisNow();
      return;
    }

    if (hasModifier && !event.shiftKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openCommandMenu();
      return;
    }

    if (
      hasModifier &&
      event.shiftKey &&
      event.key.toLowerCase() === "c" &&
      markdownReportText.length > 0
    ) {
      event.preventDefault();
      void handleCopyMarkdownReport();
      return;
    }

    if (
      hasModifier &&
      event.shiftKey &&
      event.key.toLowerCase() === "l" &&
      unsafeExample
    ) {
      event.preventDefault();
      handleLoadSample(unsafeExample);
      return;
    }

    if (
      event.key === "/" &&
      !hasModifier &&
      !event.altKey &&
      !event.shiftKey &&
      !isEditableShortcutTarget(event.target)
    ) {
      if (!findingsSearchInputRef.current) {
        return;
      }

      event.preventDefault();
      focusFindingsSearch();
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      onGlobalShortcutKeyDown(event);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function updateSetting<K extends keyof PersistedWorkspaceSettings>(
    key: K,
    value: PersistedWorkspaceSettings[K],
  ) {
    writePersistedWorkspaceSettings({
      ...workspaceSettings,
      [key]: value,
    });
  }

  function handleRedactionModeChange(nextRedactionMode: boolean) {
    updateSetting("redactionMode", nextRedactionMode);

    if (nextRedactionMode && !workspaceSettings.redactionMode) {
      trackRedactionModeEnabled(TOOL_ID);
    }
  }

  function handleEditorChange(nextSql: string) {
    setSql(nextSql);
    setOpenedSavedAnalysisId(null);
  }

  function handleResetSettings() {
    writePersistedWorkspaceSettings(createDefaultWorkspaceSettings());
    setTransactionAssumptionMode("auto");
    pushStatus("Reset local settings");
  }

  function loadSampleIntoWorkspace(sample: PostgresMigrationSample) {
    setSql(sample.sql);
    setSourceFilename(null);
    setSelectedSampleId(sample.id);
    setOpenedSavedAnalysisId(null);
    setSelectedFindingId(null);
    setIsExamplesOpen(false);
    trackSampleLoaded(TOOL_ID);
    pushStatus(
      sample.id === DEFAULT_POSTGRES_MIGRATION_SAMPLE_ID
        ? "Loaded unsafe example"
        : `Loaded ${sample.name}`,
    );
  }

  function handleLoadSample(sample: PostgresMigrationSample) {
    loadSampleIntoWorkspace(sample);
  }

  function openCommandMenu() {
    setIsExamplesOpen(false);
    setIsSavedHistoryOpen(false);
    setCommandMenuQuery("");
    setIsCommandMenuOpen(true);
  }

  function openShortcutsHelp() {
    setIsExamplesOpen(false);
    setIsSavedHistoryOpen(false);
    setIsShortcutsOpen(true);
  }

  function openSettingsSection() {
    setIsSettingsOpen(true);
    scrollElementIntoView(settingsSectionRef.current);
  }

  function openPrivacyExplanation() {
    setIsPrivacyExplanationOpen(true);
    scrollElementIntoView(privacyBannerRef.current);
  }

  function focusFindingsSearch() {
    setResultsTab("findings");
    window.requestAnimationFrame(() => {
      findingsSearchInputRef.current?.focus();
      findingsSearchInputRef.current?.select();
    });
  }

  function handleToggleExamplesMenu() {
    setIsExamplesOpen((current) => !current);
  }

  function handleOpenExamplesFromMobileBar() {
    scrollElementIntoView(migrationInputSectionRef.current);
    setIsExamplesOpen(true);
  }

  function handleRunAnalysisNow() {
    if (sql.trim().length === 0 || isAnalyzing) {
      return;
    }

    void runAnalysis(sql, workspaceSettings, sourceFilename, sampleUsed);
  }

  function closeTransientUi() {
    let didCloseAnything = false;

    if (saveDialogState) {
      setSaveDialogState(null);
      didCloseAnything = true;
    }

    if (isCommandMenuOpen) {
      setIsCommandMenuOpen(false);
      setCommandMenuQuery("");
      didCloseAnything = true;
    }

    if (isShortcutsOpen) {
      setIsShortcutsOpen(false);
      didCloseAnything = true;
    }

    if (isExamplesOpen) {
      setIsExamplesOpen(false);
      didCloseAnything = true;
    }

    if (isSavedHistoryOpen) {
      setIsSavedHistoryOpen(false);
      didCloseAnything = true;
    }

    if (isPrivacyExplanationOpen) {
      setIsPrivacyExplanationOpen(false);
      didCloseAnything = true;
    }

    if (isSettingsOpen) {
      setIsSettingsOpen(false);
      didCloseAnything = true;
    }

    return didCloseAnything;
  }

  function handleOpenSaveDialog() {
    if (!canSaveLocally) {
      return;
    }

    setSaveDialogState({
      title: saveDialogSuggestedTitle,
    });
  }

  function handleCloseSaveDialog() {
    setSaveDialogState(null);
  }

  function persistCurrentAnalysisLocally(includeSql: boolean) {
    if (!activeAnalysisResult) {
      return;
    }

    const savedAnalysis = saveLocalAnalysis({
      analysisResult: activeAnalysisResult,
      includeSql,
      redactionMode: workspaceSettings.redactionMode,
      sourceFilename,
      sql,
      title: saveDialogState?.title,
    });

    setOpenedSavedAnalysisId(savedAnalysis.id);
    setIsSavedHistoryOpen(true);
    setSaveDialogState(null);
    trackLocalSaveSaved({
      toolId: TOOL_ID,
      redactionModeEnabled: workspaceSettings.redactionMode,
      sampleUsed,
    });
    pushStatus(
      includeSql
        ? `Saved ${savedAnalysis.title} locally with SQL`
        : `Saved ${savedAnalysis.title} locally as a summary`,
    );
  }

  function handleOpenSavedAnalysis(savedAnalysis: SavedLocalAnalysis) {
    const nextTransactionAssumptionMode =
      savedAnalysis.analysisResult?.settings.transactionAssumptionMode ?? "auto";
    const nextWorkspaceSettings: PersistedWorkspaceSettings = {
      ...workspaceSettings,
      postgresVersion: savedAnalysis.postgresVersion,
      frameworkPreset: savedAnalysis.frameworkPreset,
      tableSizeProfile: savedAnalysis.tableSizeProfile,
      redactionMode:
        savedAnalysis.analysisResult?.settings.redactionMode ??
        workspaceSettings.redactionMode,
    };

    writePersistedWorkspaceSettings(nextWorkspaceSettings);
    setTransactionAssumptionMode(nextTransactionAssumptionMode);
    setSql(savedAnalysis.sqlInput ?? "");
    setSourceFilename(savedAnalysis.sourceFilename ?? null);
    setSelectedSampleId(null);
    setSelectedFindingId(null);
    setAnalysisResult(
      (savedAnalysis.analysisResult as AnalysisResult | undefined) ?? null,
    );
    setOpenedSavedAnalysisId(savedAnalysis.id);
    setIsSavedHistoryOpen(false);
    setLastAnalyzedSql(savedAnalysis.sqlInput ?? "");
    setLastAnalyzedSourceFilename(savedAnalysis.sourceFilename ?? null);
    setLastAnalyzedSettingsSignature(
      getWorkspaceSettingsSignature(
        nextWorkspaceSettings,
        nextTransactionAssumptionMode,
        savedAnalysis.sourceFilename ?? null,
      ),
    );
    trackLocalSaveOpened({
      toolId: TOOL_ID,
      redactionModeEnabled:
        savedAnalysis.analysisResult?.settings.redactionMode ??
        nextWorkspaceSettings.redactionMode,
      sampleUsed: false,
    });
    pushStatus(`Opened ${savedAnalysis.title}`);
  }

  function handleDeleteSavedAnalysis(savedAnalysis: SavedLocalAnalysis) {
    const confirmed = window.confirm(
      `Delete "${savedAnalysis.title}" from this browser's local history?`,
    );

    if (!confirmed) {
      return;
    }

    deleteSavedLocalAnalysis(savedAnalysis.id);

    if (openedSavedAnalysisId === savedAnalysis.id) {
      setOpenedSavedAnalysisId(null);

      if (!savedAnalysis.sqlInput) {
        setAnalysisResult(null);
        setSourceFilename(null);
        setLastAnalyzedSql("");
        setLastAnalyzedSourceFilename(null);
        setLastAnalyzedSettingsSignature("");
      }
    }

    pushStatus(`Deleted ${savedAnalysis.title}`);
  }

  function handleClearAllLocalHistory() {
    const confirmed = window.confirm(
      "Clear all saved PostgreSQL migration analyses from this browser?",
    );

    if (!confirmed) {
      return;
    }

    clearSavedLocalHistory();
    setOpenedSavedAnalysisId(null);

    if (sql.trim().length === 0) {
      setAnalysisResult(null);
      setSourceFilename(null);
      setLastAnalyzedSql("");
      setLastAnalyzedSourceFilename(null);
      setLastAnalyzedSettingsSignature("");
    }

    pushStatus("Cleared all local history");
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
      setOpenedSavedAnalysisId(null);
    } catch {
      pushStatus("Could not read clipboard. Paste manually instead.", "error");
    }
  }

  async function handleCopyRedactedSql() {
    if (sql.trim().length === 0) {
      return;
    }

    try {
      await navigator.clipboard.writeText(redactedSql);
      pushStatus(
        hasRedactedCopy
          ? "Copied redacted SQL"
          : "Copied SQL. No likely secrets were detected to redact.",
      );
    } catch {
      pushStatus("Could not copy to clipboard. Copy manually instead.", "error");
    }
  }

  function handleReplaceEditorWithRedactedCopy() {
    if (sql.trim().length === 0) {
      return;
    }

    setSql(redactedSql);
    setOpenedSavedAnalysisId(null);
    setSelectedSampleId(null);
    pushStatus(
      hasRedactedCopy
        ? "Replaced editor contents with the redacted copy"
        : "Editor already matches the redacted copy",
    );
  }

  async function handleCopyMarkdownReport() {
    if (!markdownReportText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(markdownReportText);
      trackReportCopied({
        toolId: TOOL_ID,
        format: "markdown",
        redactionModeEnabled: workspaceSettings.redactionMode,
        sampleUsed,
      });
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
    trackReportExported({
      toolId: TOOL_ID,
      exportActionType: "download-markdown",
      redactionModeEnabled: workspaceSettings.redactionMode,
      sampleUsed,
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
    trackReportExported({
      toolId: TOOL_ID,
      exportActionType: "download-html",
      redactionModeEnabled: workspaceSettings.redactionMode,
      sampleUsed,
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
    trackReportExported({
      toolId: TOOL_ID,
      exportActionType: "download-json",
      redactionModeEnabled: workspaceSettings.redactionMode,
      sampleUsed,
    });
    pushStatus(`Downloaded ${reportFilenames.json}`);
  }

  function handlePrintReport() {
    if (!reportExportInput) {
      return;
    }

    const opened = openPrintReport(createHtmlReport(reportExportInput));

    if (opened) {
      trackReportExported({
        toolId: TOOL_ID,
        exportActionType: "print",
        redactionModeEnabled: workspaceSettings.redactionMode,
        sampleUsed,
      });
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
      trackSettingsLinkCopied({
        toolId: TOOL_ID,
        redactionModeEnabled: workspaceSettings.redactionMode,
        sampleUsed,
      });
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
      await navigator.clipboard.writeText(
        getOutputSqlSnippet(sqlSnippet, workspaceSettings.redactionMode),
      );
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
      setOpenedSavedAnalysisId(null);
      pushStatus(`Uploaded ${file.name} locally`);
    } finally {
      event.target.value = "";
    }
  }

  function handleClearInput() {
    setSql("");
    setSourceFilename(null);
    setSelectedSampleId(null);
    setOpenedSavedAnalysisId(null);
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

  const safeExample = getPostgresMigrationSample(DEFAULT_SAFE_SAMPLE_ID);
  const unsafeExample = getPostgresMigrationSample(
    DEFAULT_POSTGRES_MIGRATION_SAMPLE_ID,
  );
  const commandMenuCommands = [
    {
      id: "analyze",
      label: "Analyze migration",
      description: "Run the checker immediately on the current SQL.",
      shortcut: SHORTCUT_LABELS.analyze,
      keywords: ["run", "analyze", "check"],
      disabled: sql.trim().length === 0 || isAnalyzing,
      disabledReason:
        sql.trim().length === 0
          ? "Paste or load SQL before running analysis."
          : "Analysis is already running.",
      onSelect: handleRunAnalysisNow,
    },
    {
      id: "load-unsafe-example",
      label: "Load unsafe example",
      description: "Load the risky migration example into the editor.",
      shortcut: SHORTCUT_LABELS.loadUnsafeExample,
      keywords: ["example", "unsafe", "risky"],
      disabled: !unsafeExample,
      disabledReason: "The unsafe example is unavailable right now.",
      onSelect: () => {
        if (unsafeExample) {
          handleLoadSample(unsafeExample);
        }
      },
    },
    {
      id: "load-safe-example",
      label: "Load safe example",
      description: "Load the safer foreign-key validation example.",
      keywords: ["example", "safe", "foreign key"],
      disabled: !safeExample,
      disabledReason: "The safe example is unavailable right now.",
      onSelect: () => {
        if (safeExample) {
          handleLoadSample(safeExample);
        }
      },
    },
    {
      id: "open-settings",
      label: "Open settings",
      description: "Jump to PostgreSQL, framework, and redaction settings.",
      keywords: ["settings", "preferences", "options"],
      onSelect: openSettingsSection,
    },
    {
      id: "copy-markdown-report",
      label: "Copy Markdown report",
      description: "Copy the current report in Markdown format.",
      shortcut: SHORTCUT_LABELS.copyMarkdownReport,
      keywords: ["copy", "markdown", "report"],
      disabled: markdownReportText.length === 0,
      disabledReason: "Run analysis before copying a report.",
      onSelect: () => {
        void handleCopyMarkdownReport();
      },
    },
    {
      id: "download-html-report",
      label: "Download HTML report",
      description: "Download a browser-friendly HTML report.",
      keywords: ["download", "html", "report"],
      disabled: reportExportInput === null,
      disabledReason: "Run analysis before downloading an HTML report.",
      onSelect: handleDownloadHtmlReport,
    },
    {
      id: "toggle-redaction-mode",
      label: "Toggle redaction mode",
      description: workspaceSettings.redactionMode
        ? "Turn redaction mode off for previews and exports."
        : "Turn redaction mode on for previews and exports.",
      keywords: ["redaction", "privacy", "secret"],
      onSelect: () => {
        handleRedactionModeChange(!workspaceSettings.redactionMode);
        pushStatus(
          workspaceSettings.redactionMode
            ? "Turned redaction mode off"
            : "Turned redaction mode on",
        );
      },
    },
    {
      id: "toggle-low-severity",
      label: "Toggle low severity findings",
      description: workspaceSettings.showLowSeverity
        ? "Hide lower-severity findings from the default review surface."
        : "Show lower-severity findings in the review surface.",
      keywords: ["low severity", "filters", "findings"],
      onSelect: () => {
        updateSetting("showLowSeverity", !workspaceSettings.showLowSeverity);
        pushStatus(
          workspaceSettings.showLowSeverity
            ? "Hid low severity findings"
            : "Showing low severity findings",
        );
      },
    },
    {
      id: "save-locally",
      label: "Save locally",
      description: "Open the local-only save flow for this analysis.",
      keywords: ["save", "history", "local"],
      disabled: !canSaveLocally,
      disabledReason: "Run analysis before saving locally.",
      onSelect: handleOpenSaveDialog,
    },
    {
      id: "open-privacy-explanation",
      label: "Open privacy explanation",
      description: "Expand the local-first privacy explanation.",
      keywords: ["privacy", "local", "analytics"],
      onSelect: openPrivacyExplanation,
    },
    {
      id: "clear-input",
      label: "Clear input",
      description: "Reset the editor and the current local result.",
      keywords: ["clear", "reset", "editor"],
      disabled: sql.trim().length === 0,
      disabledReason: "The editor is already empty.",
      onSelect: handleClearInput,
    },
    {
      id: "show-shortcuts",
      label: "Show keyboard shortcuts",
      description: "Open the help modal with keyboard shortcuts.",
      keywords: ["shortcuts", "keyboard", "help"],
      onSelect: openShortcutsHelp,
    },
  ] satisfies CommandMenuCommand[];
  const normalizedCommandMenuQuery = commandMenuQuery.trim().toLowerCase();
  const filteredCommandMenuCommands = commandMenuCommands.filter((command) => {
    if (normalizedCommandMenuQuery.length === 0) {
      return true;
    }

    const haystack = [
      command.label,
      command.description,
      ...(command.keywords ?? []),
      command.shortcut,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedCommandMenuQuery);
  });

  function handleCommandSelect(command: CommandMenuCommand) {
    if (command.disabled) {
      return;
    }

    setIsCommandMenuOpen(false);
    setCommandMenuQuery("");
    command.onSelect();
  }

  return (
    <>
      <div
        id="checker-workspace"
        className="space-y-6 scroll-mt-24 pb-24 xl:pb-0"
      >
        <div
          ref={privacyBannerRef}
          className="sticky top-20 z-20 rounded-3xl border border-border bg-background/95 px-4 py-4 shadow-[0_12px_24px_rgba(15,23,42,0.05)] backdrop-blur"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex size-10 items-center justify-center rounded-xl border border-border bg-card">
                <ShieldCheck className="size-4 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Local-first: your SQL is analyzed in this browser. Authos does not upload or store migration contents.
                </p>
                <details
                  open={isPrivacyExplanationOpen}
                  className="group rounded-2xl border border-border bg-card px-4 py-3"
                >
                  <summary
                    onClick={(event) => {
                      event.preventDefault();
                      setIsPrivacyExplanationOpen((current) => !current);
                    }}
                    className="cursor-pointer text-sm font-medium text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                  >
                    How privacy works
                  </summary>
                  <ul className="mt-3 space-y-2 text-sm leading-7 text-muted-foreground">
                    {PRIVACY_PANEL_POINTS.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </details>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Browser local</Badge>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                title={`Open command menu (${SHORTCUT_LABELS.commandMenu})`}
                onClick={openCommandMenu}
              >
                Command menu
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                title="View keyboard shortcuts for this tool page"
                onClick={openShortcutsHelp}
              >
                Shortcuts
              </Button>
            </div>
          </div>
        </div>

        <div ref={settingsSectionRef}>
          <Card className="p-5 sm:p-6">
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold text-foreground">
                    Review settings
                  </h2>
                  <p className="text-sm leading-7 text-muted-foreground">
                    Tune version, framework, transaction assumptions, and privacy
                    defaults without leaving the page.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  aria-expanded={isSettingsOpen}
                  aria-controls="checker-settings-panel"
                  className="xl:hidden"
                  onClick={() => {
                    setIsSettingsOpen((current) => !current);
                  }}
                >
                  {isSettingsOpen ? "Hide settings" : "Show settings"}
                </Button>
              </div>

              <div
                id="checker-settings-panel"
                className={cn("space-y-5", !isSettingsOpen && "hidden xl:block")}
              >
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
                    description="Mask likely secrets in statement previews, copied snippets, and report exports without changing the editor itself."
                    checked={workspaceSettings.redactionMode}
                    onCheckedChange={(checked) => {
                      handleRedactionModeChange(checked);
                    }}
                  />
                </div>

                <p className="text-sm leading-7 text-muted-foreground">
                  Safe workspace settings persist in <code>localStorage</code> after
                  reload. Raw SQL is not stored automatically, local history stays
                  off for now, and analytics never receive pasted SQL or finding
                  snippets.
                </p>

                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleResetSettings}
                  >
                    Reset settings
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <Card className="p-5 sm:p-6">
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Local saved analyses
                </p>
                <p className="text-sm leading-7 text-muted-foreground">
                  Saved analyses stay in this browser only. They are not uploaded
                  to Authos.
                </p>
                <p className="text-sm leading-7 text-muted-foreground">
                  Raw SQL history is off by default. Nothing is saved unless you
                  explicitly choose Save locally and confirm whether to include
                  SQL.
                </p>
              </div>
              <Badge variant="outline">
                {savedLocalAnalyses.length} saved
              </Badge>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                title="Save the current analysis locally in this browser"
                onClick={handleOpenSaveDialog}
                disabled={!canSaveLocally}
              >
                Save locally
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setIsSavedHistoryOpen((current) => !current);
                }}
              >
                Open saved
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (openedSavedAnalysis) {
                    handleDeleteSavedAnalysis(openedSavedAnalysis);
                  }
                }}
                disabled={!openedSavedAnalysis}
              >
                Delete saved
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handleClearAllLocalHistory}
                disabled={savedLocalAnalyses.length === 0}
              >
                Clear all local history
              </Button>
              <Button type="button" variant="secondary" disabled>
                Compare saved analyses
              </Button>
            </div>

            {!canSaveLocally ? (
              <p className="text-sm leading-7 text-muted-foreground">
                Run analysis before saving locally.
              </p>
            ) : null}

            <p className="text-sm leading-7 text-muted-foreground">
              Compare saved analyses is coming later. For now, you can reopen
              one local save at a time.
            </p>

            {openedSavedAnalysis ? (
              <div className="rounded-2xl border border-border bg-background px-4 py-4">
                <p className="text-sm font-medium text-foreground">
                  Open now: {openedSavedAnalysis.title}
                </p>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  {openedSavedAnalysis.saveMode === "with-sql"
                    ? "This saved analysis restored the SQL into the editor from local storage only."
                    : "This saved analysis was stored as a summary only, so the SQL editor stays blank until you paste or load a new migration."}
                </p>
              </div>
            ) : null}

            {isSavedHistoryOpen ? (
              <SavedAnalysesPanel
                openedSavedAnalysisId={openedSavedAnalysisId}
                savedAnalyses={savedLocalAnalyses}
                onDeleteSavedAnalysis={handleDeleteSavedAnalysis}
                onOpenSavedAnalysis={handleOpenSavedAnalysis}
              />
            ) : null}
          </div>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="overflow-hidden">
            <div
              ref={migrationInputSectionRef}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4"
            >
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
              <div className="grid gap-3 sm:grid-cols-2 xl:flex xl:flex-wrap">
                <div ref={examplesMenuRef} className="relative">
                  <Button
                    type="button"
                    variant="secondary"
                    title={`Open examples. ${SHORTCUT_LABELS.loadUnsafeExample} loads the default unsafe example.`}
                    onClick={handleToggleExamplesMenu}
                    aria-expanded={isExamplesOpen}
                    aria-controls="examples-menu"
                  >
                    Examples
                  </Button>

                  {isExamplesOpen ? (
                    <div
                      id="examples-menu"
                      className="fixed inset-x-4 bottom-24 z-30 max-h-[70vh] overflow-y-auto rounded-3xl border border-border bg-card p-4 shadow-[0_20px_40px_rgba(15,23,42,0.12)] sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-2 sm:max-h-[32rem] sm:w-[min(26rem,calc(100vw-4rem))]"
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
                                className="w-full rounded-2xl border border-transparent px-3 py-3 text-left transition hover:border-border hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
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
                  title="Upload a local .sql file"
                  onClick={() => {
                    fileInputRef.current?.click();
                  }}
                >
                  Upload SQL
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  title="Paste SQL from your clipboard"
                  onClick={() => {
                    void handlePasteFromClipboard();
                  }}
                >
                  Paste from clipboard
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  title="Copy a masked version of the current SQL"
                  onClick={() => {
                    void handleCopyRedactedSql();
                  }}
                  disabled={sql.trim().length === 0}
                >
                  Copy redacted SQL
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  title="Replace the editor with the redacted copy"
                  onClick={handleReplaceEditorWithRedactedCopy}
                  disabled={sql.trim().length === 0}
                >
                  Replace editor with redacted copy
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  title="Clear the editor and current result"
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
                        Uploads are read by this browser only, safe settings may
                        persist locally, and raw SQL is not auto-saved for
                        returning sessions.
                      </p>
                      <p className="text-sm text-muted-foreground">
                        .sql files are read locally in your browser.
                      </p>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
                    title="Choose a local .sql file"
                    onClick={() => {
                      fileInputRef.current?.click();
                    }}
                  >
                    Choose .sql file
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Migration SQL
                </p>
                <CodeEditor
                  ariaLabel="Migration SQL editor"
                  value={sql}
                  onChange={handleEditorChange}
                  placeholder="ALTER TABLE users ADD COLUMN status text;
CREATE INDEX CONCURRENTLY idx_users_status ON users(status);"
                  className="shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                />
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                  <p>
                    The editor stays unchanged until you explicitly replace it
                    with a redacted copy.
                  </p>
                  <Badge variant="outline">
                    {hasRedactedCopy
                      ? "Likely secrets can be redacted"
                      : "No likely secrets detected yet"}
                  </Badge>
                </div>
                {openedSavedAnalysis?.saveMode === "summary-only" &&
                sql.trim().length === 0 ? (
                  <div className="rounded-2xl border border-border bg-background px-4 py-3 text-sm leading-7 text-muted-foreground">
                    You opened a summary-only local save. SQL was not stored, so
                    this editor remains blank until you paste or load a
                    migration.
                  </div>
                ) : null}
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
                {activeAnalysisResult ? (
                  <>
                    {openedSavedAnalysis ? (
                      <div className="rounded-2xl border border-border bg-background px-4 py-4">
                        <p className="text-sm font-medium text-foreground">
                          Viewing a local saved analysis
                        </p>
                        <p className="mt-2 text-sm leading-7 text-muted-foreground">
                          {openedSavedAnalysis.saveMode === "with-sql"
                            ? "This saved analysis restored SQL from this browser's local storage only."
                            : "This saved analysis was reopened from a summary-only local save, so statement previews may be limited until you load SQL again."}
                        </p>
                      </div>
                    ) : null}

                    {parserUsedFallback ? (
                      <div
                        role="status"
                        className="rounded-2xl border border-border bg-background px-4 py-4"
                      >
                        <p className="text-sm font-medium text-foreground">
                          Parser fallback notice
                        </p>
                        <p className="mt-2 text-sm leading-7 text-muted-foreground">
                          We could not fully parse this SQL, so the checker used fallback pattern analysis. Findings may be less precise.
                        </p>
                      </div>
                    ) : null}

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
                      searchInputId={findingsSearchInputId}
                      searchInputRef={findingsSearchInputRef}
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

                    <div
                      role="tablist"
                      aria-label="Results view"
                      className="flex flex-wrap gap-2"
                    >
                      <button
                        type="button"
                        role="tab"
                        id="findings-tab"
                        aria-controls="findings-panel"
                        aria-selected={resultsTab === "findings"}
                        onClick={() => {
                          setResultsTab("findings");
                        }}
                        className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                          resultsTab === "findings"
                            ? "border-foreground/20 bg-card text-foreground"
                            : "border-border bg-background text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Findings
                      </button>
                      <button
                        type="button"
                        role="tab"
                        id="safe-rewrites-tab"
                        aria-controls="safe-rewrites-panel"
                        aria-selected={resultsTab === "safe-rewrites"}
                        onClick={() => {
                          setResultsTab("safe-rewrites");
                        }}
                        className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                          resultsTab === "safe-rewrites"
                            ? "border-foreground/20 bg-card text-foreground"
                            : "border-border bg-background text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Safe rewrites
                      </button>
                    </div>

                    {resultsTab === "findings" ? (
                      <div
                        id="findings-panel"
                        role="tabpanel"
                        aria-labelledby="findings-tab"
                        className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] xl:items-start"
                      >
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
                            redactionMode={workspaceSettings.redactionMode}
                            recipeGroup={selectedRecipeGroup}
                            statement={selectedStatement}
                          />
                        </div>
                      </div>
                    ) : (
                      <div
                        id="safe-rewrites-panel"
                        role="tabpanel"
                        aria-labelledby="safe-rewrites-tab"
                      >
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
                      </div>
                    )}
                  </>
                ) : sql.trim().length === 0 ? (
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
                ) : null}

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
                          Off by default so exports stay safer to share. When
                          redaction mode is on, included snippets are masked for
                          likely secrets.
                        </span>
                      </span>
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:flex xl:flex-wrap">
                    <Button
                      type="button"
                      title={`Analyze now (${SHORTCUT_LABELS.analyze})`}
                      onClick={handleRunAnalysisNow}
                      disabled={sql.trim().length === 0 || isAnalyzing}
                    >
                      {isAnalyzing ? "Analyzing..." : "Run local analysis"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      title={`Copy Markdown report (${SHORTCUT_LABELS.copyMarkdownReport})`}
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
                      title="Download the current report as HTML"
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

                  {markdownReportText.length === 0 ? (
                    <p className="text-sm leading-7 text-muted-foreground">
                      Run analysis before copying a report.
                    </p>
                  ) : null}
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
                    This workspace keeps migration text on-device by default.
                    Reports are generated locally, persisted state is limited to
                    safe review preferences, and the analytics adapter never
                    receives raw SQL, filenames, object names, or finding
                    snippets.
                  </p>
                </div>
              </div>
            </Card>

            {isDevelopment ? (
              <AnalyticsDebugPanel events={analyticsDebugEvents} />
            ) : null}
          </div>
        </div>
      </div>

      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/96 px-4 py-3 shadow-[0_-12px_24px_rgba(15,23,42,0.08)] backdrop-blur xl:hidden",
          hasTransientUiOpen && "pointer-events-none opacity-0",
        )}
      >
        <div className="mx-auto flex max-w-5xl gap-3">
          <Button
            type="button"
            className="flex-1"
            title={`Analyze now (${SHORTCUT_LABELS.analyze})`}
            onClick={handleRunAnalysisNow}
            disabled={sql.trim().length === 0 || isAnalyzing}
          >
            {isAnalyzing ? "Analyzing..." : "Analyze"}
          </Button>
          <Button
            type="button"
            className="flex-1"
            variant="secondary"
            title={`Open examples. ${SHORTCUT_LABELS.loadUnsafeExample} loads the unsafe example.`}
            onClick={handleOpenExamplesFromMobileBar}
          >
            Examples
          </Button>
        </div>
      </div>

      <CommandMenuDialog
        commands={filteredCommandMenuCommands}
        isOpen={isCommandMenuOpen}
        query={commandMenuQuery}
        onClose={() => {
          setIsCommandMenuOpen(false);
          setCommandMenuQuery("");
        }}
        onQueryChange={setCommandMenuQuery}
        onSelectCommand={handleCommandSelect}
      />

      <KeyboardShortcutsDialog
        isOpen={isShortcutsOpen}
        onClose={() => {
          setIsShortcutsOpen(false);
        }}
      />

      <SaveLocalAnalysisDialog
        state={saveDialogState}
        onClose={handleCloseSaveDialog}
        onSaveSummaryOnly={() => {
          persistCurrentAnalysisLocally(false);
        }}
        onSaveWithSql={() => {
          persistCurrentAnalysisLocally(true);
        }}
        onTitleChange={(title) => {
          setSaveDialogState((current) =>
            current
              ? {
                  ...current,
                  title,
                }
              : current,
          );
        }}
      />

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

function getFocusableElements(container: HTMLElement | null) {
  if (!container) {
    return [];
  }

  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("hidden"));
}

function ShortcutKeys({ keys }: { keys: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-xs font-medium text-muted-foreground">
      {keys.split(" + ").map((part) => (
        <kbd
          key={part}
          className="rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground"
        >
          {part}
        </kbd>
      ))}
    </span>
  );
}

function ModalShell({
  children,
  descriptionId,
  initialFocusRef,
  onClose,
  titleId,
  widthClassName = "max-w-xl",
}: {
  children: ReactNode;
  descriptionId?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  titleId: string;
  widthClassName?: string;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousActiveElementRef.current = document.activeElement as HTMLElement | null;

    const frameId = window.requestAnimationFrame(() => {
      const nextFocusTarget =
        initialFocusRef?.current ??
        getFocusableElements(dialogRef.current)[0] ??
        dialogRef.current;

      nextFocusTarget?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      previousActiveElementRef.current?.focus();
    };
  }, [initialFocusRef]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = getFocusableElements(dialogRef.current);

    if (focusableElements.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement as HTMLElement | null;

    if (event.shiftKey && activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
      return;
    }

    if (!event.shiftKey && activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={cn(
          "w-full rounded-3xl border border-border bg-background p-6 shadow-[0_24px_48px_rgba(15,23,42,0.18)]",
          widthClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}

function CommandMenuDialog({
  commands,
  isOpen,
  query,
  onClose,
  onQueryChange,
  onSelectCommand,
}: {
  commands: readonly CommandMenuCommand[];
  isOpen: boolean;
  query: string;
  onClose: () => void;
  onQueryChange: (query: string) => void;
  onSelectCommand: (command: CommandMenuCommand) => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) {
    return null;
  }

  return (
    <ModalShell
      titleId={titleId}
      descriptionId={descriptionId}
      initialFocusRef={searchInputRef}
      onClose={onClose}
      widthClassName="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id={titleId} className="text-xl font-semibold text-foreground">
              Command menu
            </h3>
            <ShortcutKeys keys={SHORTCUT_LABELS.commandMenu} />
          </div>
          <p id={descriptionId} className="text-sm leading-7 text-muted-foreground">
            Jump to common PostgreSQL migration checker actions without leaving
            the keyboard.
          </p>
        </div>

        <label className="space-y-2">
          <span className="text-sm font-medium text-foreground">
            Search commands
          </span>
          <input
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={(event) => {
              onQueryChange(event.target.value);
            }}
            placeholder="Analyze, examples, redaction, reports..."
            className="h-11 w-full rounded-2xl border border-border bg-card px-4 text-sm text-foreground outline-none transition focus:border-ring focus:ring-4 focus:ring-ring/15"
          />
        </label>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {commands.length > 0 ? (
            commands.map((command) => (
              <button
                key={command.id}
                type="button"
                disabled={command.disabled}
                onClick={() => {
                  onSelectCommand(command);
                }}
                className="w-full rounded-2xl border border-border bg-card px-4 py-4 text-left transition hover:border-foreground/20 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {command.label}
                    </p>
                    <p className="text-sm leading-7 text-muted-foreground">
                      {command.description}
                    </p>
                    {command.disabledReason ? (
                      <p className="text-sm leading-6 text-muted-foreground">
                        {command.disabledReason}
                      </p>
                    ) : null}
                  </div>
                  {command.shortcut ? (
                    <ShortcutKeys keys={command.shortcut} />
                  ) : null}
                </div>
              </button>
            ))
          ) : (
            <div className="rounded-2xl border border-border bg-card px-4 py-4 text-sm leading-7 text-muted-foreground">
              No commands match that search yet.
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

function KeyboardShortcutsDialog({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  if (!isOpen) {
    return null;
  }

  return (
    <ModalShell
      titleId={titleId}
      descriptionId={descriptionId}
      initialFocusRef={closeButtonRef}
      onClose={onClose}
      widthClassName="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <h3 id={titleId} className="text-xl font-semibold text-foreground">
            Keyboard shortcuts
          </h3>
          <p id={descriptionId} className="text-sm leading-7 text-muted-foreground">
            These shortcuts are scoped to the PostgreSQL Migration Safety Checker.
            Slash focus is ignored while you are typing in the SQL editor.
          </p>
        </div>

        <div className="space-y-3">
          {SHORTCUT_HELP_ITEMS.map((item) => (
            <div
              key={item.keys}
              className="rounded-2xl border border-border bg-card px-4 py-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    {item.action}
                  </p>
                  <p className="text-sm leading-7 text-muted-foreground">
                    {item.note}
                  </p>
                </div>
                <ShortcutKeys keys={item.keys} />
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <Button
            ref={closeButtonRef}
            type="button"
            variant="secondary"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

function AnalyticsDebugPanel({
  events,
}: {
  events: readonly AnalyticsDebugEvent[];
}) {
  return (
    <Card className="border border-border bg-background px-5 py-5">
      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
          Analytics debug
        </summary>
        <div className="mt-4 space-y-3">
          <p className="text-sm leading-7 text-muted-foreground">
            Development-only view of the last sanitized telemetry events. This
            panel reads the same payloads that would be logged or sent through a
            configured vendor hook.
          </p>
          {events.length > 0 ? (
            events.map((event, index) => (
              <div
                key={`${event.name}-${event.payload.timestamp}-${index}`}
                className="rounded-2xl border border-border bg-card px-4 py-4"
              >
                <p className="text-sm font-medium text-foreground">
                  {event.name}
                </p>
                <pre className="mt-3 overflow-x-auto rounded-2xl border border-border bg-background px-4 py-3 text-xs leading-6 text-foreground">
                  <code>{JSON.stringify(event.payload, null, 2)}</code>
                </pre>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-border bg-card px-4 py-4 text-sm leading-7 text-muted-foreground">
              No analytics events have been recorded in this session yet.
            </div>
          )}
        </div>
      </details>
    </Card>
  );
}

function SaveLocalAnalysisDialog({
  state,
  onClose,
  onSaveSummaryOnly,
  onSaveWithSql,
  onTitleChange,
}: {
  state: SaveDialogState | null;
  onClose: () => void;
  onSaveSummaryOnly: () => void;
  onSaveWithSql: () => void;
  onTitleChange: (title: string) => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  if (!state) {
    return null;
  }

  return (
    <ModalShell
      titleId={titleId}
      descriptionId={descriptionId}
      initialFocusRef={titleInputRef}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <h3 id={titleId} className="text-xl font-semibold text-foreground">
            Save this migration in this browser?
          </h3>
          <p
            id={descriptionId}
            className="text-sm leading-7 text-muted-foreground"
          >
            This stores the SQL in your browser&apos;s local storage. It is not
            uploaded, but anyone with access to this browser profile may be able
            to see it.
          </p>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="save-analysis-title"
            className="text-sm font-medium text-foreground"
          >
            Title
          </label>
          <input
            ref={titleInputRef}
            id="save-analysis-title"
            type="text"
            value={state.title}
            onChange={(event) => {
              onTitleChange(event.target.value);
            }}
            placeholder="Migration review"
            className="h-11 w-full rounded-2xl border border-border bg-card px-4 text-sm text-foreground outline-none transition focus:border-ring focus:ring-4 focus:ring-ring/15"
          />
          <p className="text-sm leading-6 text-muted-foreground">
            Leave the generated title if it already describes this migration well.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={onSaveWithSql}>
            Save with SQL
          </Button>
          <Button type="button" variant="secondary" onClick={onSaveSummaryOnly}>
            Save summary only
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

function SavedAnalysesPanel({
  openedSavedAnalysisId,
  savedAnalyses,
  onDeleteSavedAnalysis,
  onOpenSavedAnalysis,
}: {
  openedSavedAnalysisId: string | null;
  savedAnalyses: readonly SavedLocalAnalysis[];
  onDeleteSavedAnalysis: (savedAnalysis: SavedLocalAnalysis) => void;
  onOpenSavedAnalysis: (savedAnalysis: SavedLocalAnalysis) => void;
}) {
  if (savedAnalyses.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-background px-4 py-4">
        <p className="text-sm font-medium text-foreground">
          No local saves yet
        </p>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          Save locally when you want to revisit a migration later without using
          an account or server storage.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {savedAnalyses.map((savedAnalysis) => (
        <div
          key={savedAnalysis.id}
          className="rounded-2xl border border-border bg-background px-4 py-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-foreground">
                  {savedAnalysis.title}
                </p>
                {openedSavedAnalysisId === savedAnalysis.id ? (
                  <Badge variant="outline">Open now</Badge>
                ) : null}
                <Badge variant="outline">
                  {getSavedAnalysisModeLabel(savedAnalysis.saveMode)}
                </Badge>
              </div>
              <p className="text-sm leading-7 text-muted-foreground">
                Updated {formatSavedAnalysisTimestamp(savedAnalysis.updatedAt)} -
                Risk score {savedAnalysis.riskScore}/100
              </p>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1">
                  PG {savedAnalysis.postgresVersion}
                </span>
                <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1">
                  {savedAnalysis.frameworkPreset}
                </span>
                <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1">
                  {toHeadingCase(savedAnalysis.tableSizeProfile)}
                </span>
              </div>
              <p className="text-sm leading-7 text-muted-foreground">
                {savedAnalysis.saveMode === "with-sql"
                  ? "SQL is available when you reopen this local save."
                  : "Summary-only save. The analysis can reopen without storing SQL."}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  onOpenSavedAnalysis(savedAnalysis);
                }}
              >
                Open saved
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  onDeleteSavedAnalysis(savedAnalysis);
                }}
              >
                Delete saved
              </Button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1">
              Critical {savedAnalysis.severityCounts.critical}
            </span>
            <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1">
              High {savedAnalysis.severityCounts.high}
            </span>
            <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1">
              Medium {savedAnalysis.severityCounts.medium}
            </span>
            <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1">
              Low {savedAnalysis.severityCounts.low}
            </span>
            <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1">
              Info {savedAnalysis.severityCounts.info}
            </span>
          </div>
        </div>
      ))}
    </div>
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
