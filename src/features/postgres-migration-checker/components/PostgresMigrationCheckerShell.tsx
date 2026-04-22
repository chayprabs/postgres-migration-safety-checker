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
import type { ChangeEvent, ReactNode } from "react";
import { ShieldCheck, Upload } from "lucide-react";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { CodeEditor } from "@/components/code/CodeEditor";
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
  type AnalysisDiagnostic,
  type FrameworkAnalysisMetadata,
  type AnalysisResult,
  type AnalysisSettings,
  type ConfidenceLevel,
  type Finding,
  type FrameworkPreset,
  type PostgresMigrationSample,
  type PostgresVersionProfile,
  type PostgresVersion,
  type TableSizeProfile,
  type TransactionAssumptionMode,
} from "@/features/postgres-migration-checker";
import { analyzeInWorkerOrMainThread } from "../analyzer/worker/client";

type PersistedWorkspaceSettings = {
  autoAnalyze: boolean;
  frameworkPreset: FrameworkPreset;
  postgresVersion: PostgresVersion;
  redactionMode: boolean;
  showLowSeverity: boolean;
  tableSizeProfile: TableSizeProfile;
};

type ResultsCategoryFilter =
  | "all"
  | "locking"
  | "rewrite"
  | "index"
  | "constraint"
  | "data-loss"
  | "transaction"
  | "framework";

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

const WORKSPACE_SETTINGS_STORAGE_KEY =
  "authos.postgres-migration-checker.workspace-settings.v1";
const STATUS_MESSAGE_TTL_MS = 3200;
const workspaceSettingsListeners = new Set<() => void>();
let inMemoryWorkspaceSettings: PersistedWorkspaceSettings | null = null;

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

const RESULTS_CATEGORY_FILTER_OPTIONS: ReadonlyArray<{
  label: string;
  value: ResultsCategoryFilter;
}> = [
  { value: "all", label: "All" },
  { value: "locking", label: "Locking" },
  { value: "rewrite", label: "Rewrite" },
  { value: "index", label: "Indexes" },
  { value: "constraint", label: "Constraints" },
  { value: "data-loss", label: "Data loss" },
  { value: "transaction", label: "Transactions" },
  { value: "framework", label: "Framework" },
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

function getVisibleFindings(
  findings: readonly Finding[],
  showLowSeverity: boolean,
  categoryFilter: ResultsCategoryFilter,
) {
  return findings.filter((finding) => {
    if (!showLowSeverity && finding.severity === "low") {
      return false;
    }

    if (categoryFilter === "all") {
      return true;
    }

    return finding.category === categoryFilter;
  });
}

function countFindingsBySeverity(findings: readonly Finding[]) {
  return findings.reduce(
    (counts, finding) => {
      counts[finding.severity] += 1;
      return counts;
    },
    {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    },
  );
}

function toHeadingCase(value: string) {
  return value
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatParserLabel(parser: AnalysisResult["metadata"]["parser"]["parser"]) {
  switch (parser) {
    case "supabase-pg-parser":
      return "Supabase PG parser";
    case "fallback":
      return "Fallback classifier";
    default:
      return "No parser";
  }
}

function formatRuntimeLabel(mode: AnalysisResult["metadata"]["runtime"]["mode"]) {
  return mode === "worker" ? "Web Worker" : "Main thread";
}

function formatDiagnosticLocation(diagnostic: AnalysisDiagnostic) {
  if (diagnostic.line && diagnostic.column) {
    return `Line ${diagnostic.line}, column ${diagnostic.column}`;
  }

  return "Global";
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

function getCategoryFilterLabel(categoryFilter: ResultsCategoryFilter) {
  return (
    RESULTS_CATEGORY_FILTER_OPTIONS.find((option) => option.value === categoryFilter)
      ?.label ?? "All"
  );
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

function formatAnalysisDuration(durationMs: number) {
  return `${durationMs} ms`;
}

function createReportText({
  result,
  selectedSample,
  settings,
  selectedCategoryFilter,
  visibleFindings,
}: {
  result: AnalysisResult;
  selectedSample: PostgresMigrationSample | null;
  settings: PersistedWorkspaceSettings;
  selectedCategoryFilter: ResultsCategoryFilter;
  visibleFindings: readonly Finding[];
}) {
  const lines = [
    "# PostgreSQL migration safety review",
    "",
    `- PostgreSQL version: ${settings.postgresVersion}`,
    `- Framework preset: ${result.metadata.framework.label}`,
    `- Transaction assumption: ${result.metadata.framework.transactionAssumptionReason}`,
    `- Table size profile: ${toHeadingCase(settings.tableSizeProfile)}`,
    `- Statements analyzed: ${result.summary.totalStatements}`,
    `- Findings shown: ${visibleFindings.length}`,
    `- Category filter: ${getCategoryFilterLabel(selectedCategoryFilter)}`,
    `- Risk score: ${result.summary.risk.score}/100 (${result.summary.risk.label})`,
    `- Highest lock level: ${result.summary.risk.highestLockLevel ?? "None detected"}`,
    `- Destructive changes: ${result.summary.risk.destructiveChanges}`,
    `- Rewrite risks: ${result.summary.risk.rewriteRisks}`,
    `- Table scans: ${result.summary.risk.tableScans}`,
    `- Transaction risks: ${result.summary.risk.transactionRisks}`,
    `- Parser used: ${formatParserLabel(result.metadata.parser.parser)}`,
    `- postgresVersionUsed: ${result.metadata.postgresVersionUsed}`,
    `- parserVersionUsed: ${result.metadata.parserVersionUsed ?? "None"}`,
    `- tableSizeProfile: ${result.metadata.tableSizeProfile}`,
    `- frameworkPreset: ${result.metadata.frameworkPreset}`,
    `- rulesRun: ${result.metadata.rulesRun.length}`,
    `- rulesSkipped: ${result.metadata.rulesSkipped.length}`,
    `- analysisDurationMs: ${result.metadata.analysisDurationMs}`,
    `- Runtime: ${formatRuntimeLabel(result.metadata.runtime.mode)}`,
  ];

  if (result.metadata.parser.effectiveVersion) {
    lines.push(
      `- Parser grammar version: ${result.metadata.parser.effectiveVersion}`,
    );
  }

  if (selectedSample) {
    lines.push(`- Example loaded: ${selectedSample.name}`);
  }

  if (result.metadata.framework.sourceFilename) {
    lines.push(`- Source filename: ${result.metadata.framework.sourceFilename}`);
  }

  if (result.metadata.runtime.fallbackReason) {
    lines.push(`- Runtime note: ${result.metadata.runtime.fallbackReason}`);
  }

  if (result.metadata.framework.detectedSignals.length > 0) {
    lines.push(
      `- Framework signals: ${result.metadata.framework.detectedSignals.join("; ")}`,
    );
  }

  const statementKindEntries = Object.entries(result.metadata.statementKinds).sort(
    ([leftKind], [rightKind]) => leftKind.localeCompare(rightKind),
  );

  if (statementKindEntries.length > 0) {
    lines.push("", "## Statement types", "");

    statementKindEntries.forEach(([kind, count]) => {
      lines.push(`- ${toHeadingCase(kind)}: ${count}`);
    });
  }

  lines.push("", "## Findings", "");

  if (visibleFindings.length === 0) {
    lines.push("- No findings are visible with the current filters.");
  } else {
    visibleFindings.forEach((finding, index) => {
      const objectName =
        finding.objectName && !settings.redactionMode
          ? ` (${finding.objectName})`
          : "";

      lines.push(
        `${index + 1}. [${finding.severity.toUpperCase()}] ${finding.title}${objectName}`,
        `   ${finding.summary}`,
        `   Confidence: ${getConfidenceDetails(finding.confidence).label}`,
        `   Why it matters: ${finding.whyItMatters}`,
        `   Recommended action: ${finding.recommendedAction}`,
      );

      if (finding.safeRewrite) {
        lines.push(
          `   Safe rewrite: ${finding.safeRewrite.summary}`,
          "",
          "   ```sql",
          ...finding.safeRewrite.sql.split("\n").map((line) => `   ${line}`),
          "   ```",
        );
      }

      lines.push("");
    });
  }

  if (selectedSample?.expectedTopics.length) {
    lines.push("## Expected review topics", "");
    selectedSample.expectedTopics.forEach((topic) => {
      lines.push(`- ${topic}`);
    });
  }

  const parserDiagnostics = [
    ...result.metadata.parser.errors,
    ...result.metadata.parser.warnings,
  ];

  if (parserDiagnostics.length > 0) {
    lines.push("", "## Parser diagnostics", "");
    parserDiagnostics.forEach((diagnostic) => {
      lines.push(
        `- [${diagnostic.severity.toUpperCase()}] ${diagnostic.message} (${formatDiagnosticLocation(
          diagnostic,
        )})`,
      );
    });
  }

  if (result.metadata.limitations.length > 0) {
    lines.push("", "## What this checker cannot know", "");
    result.metadata.limitations.forEach((limitation) => {
      lines.push(`- ${limitation}`);
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
  const [selectedCategoryFilter, setSelectedCategoryFilter] =
    useState<ResultsCategoryFilter>("all");
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
  const visibleFindings = activeAnalysisResult
    ? getVisibleFindings(
        activeAnalysisResult.findings,
        workspaceSettings.showLowSeverity,
        selectedCategoryFilter,
      )
    : [];
  const statementKindEntries = activeAnalysisResult
    ? Object.entries(activeAnalysisResult.metadata.statementKinds).sort(
        ([leftKind], [rightKind]) => leftKind.localeCompare(rightKind),
      )
    : [];
  const parserDiagnostics = activeAnalysisResult
    ? [
        ...activeAnalysisResult.metadata.parser.errors,
        ...activeAnalysisResult.metadata.parser.warnings,
      ]
    : [];
  const severityCounts = countFindingsBySeverity(visibleFindings);
  const reportText =
    activeAnalysisResult === null
      ? ""
      : createReportText({
          result: activeAnalysisResult,
          selectedSample,
          settings: workspaceSettings,
          selectedCategoryFilter,
          visibleFindings,
        });
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

  async function handleCopyReport() {
    if (!reportText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(reportText);
      pushStatus("Copied to clipboard");
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
    setAnalysisResult(null);
    setLastAnalyzedSql("");
    setLastAnalyzedSourceFilename(null);
    setLastAnalyzedSettingsSignature("");
    pushStatus("Cleared input");
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
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <SummaryMetric
                    label="Risk score"
                    value={
                      activeAnalysisResult
                        ? `${activeAnalysisResult.summary.risk.score}/100`
                        : "100/100"
                    }
                    detail={
                      activeAnalysisResult
                        ? activeAnalysisResult.summary.risk.label
                        : "Waiting for analysis"
                    }
                  />
                  <SummaryMetric
                    label="Critical"
                    value={severityCounts.critical}
                  />
                  <SummaryMetric label="High" value={severityCounts.high} />
                  <SummaryMetric
                    label="Statements"
                    value={activeAnalysisResult?.summary.totalStatements ?? 0}
                  />
                  <SummaryMetric
                    label="Parser"
                    value={
                      activeAnalysisResult
                        ? formatParserLabel(activeAnalysisResult.metadata.parser.parser)
                        : "Waiting"
                    }
                    detail={
                      activeAnalysisResult?.metadata.parser.effectiveVersion
                        ? `PG ${activeAnalysisResult.metadata.parser.effectiveVersion} grammar`
                        : undefined
                    }
                  />
                </div>

                {activeAnalysisResult ? (
                  <div className="grid gap-3">
                    <Card className="border border-border bg-background px-4 py-4">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-sm font-medium text-foreground">
                            Analysis metadata
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline">
                              {formatParserLabel(activeAnalysisResult.metadata.parser.parser)}
                            </Badge>
                            <Badge variant="outline">
                              {formatRuntimeLabel(activeAnalysisResult.metadata.runtime.mode)}
                            </Badge>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-2xl border border-border bg-card px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                              postgresVersionUsed
                            </p>
                            <p className="mt-2 text-sm font-medium text-foreground">
                              PostgreSQL {activeAnalysisResult.metadata.postgresVersionUsed}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-border bg-card px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                              parserVersionUsed
                            </p>
                            <p className="mt-2 text-sm font-medium text-foreground">
                              {activeAnalysisResult.metadata.parserVersionUsed
                                ? `PostgreSQL ${activeAnalysisResult.metadata.parserVersionUsed}`
                                : "Not used"}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-border bg-card px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                              tableSizeProfile
                            </p>
                            <p className="mt-2 text-sm font-medium text-foreground">
                              {toHeadingCase(activeAnalysisResult.metadata.tableSizeProfile)}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-border bg-card px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                              frameworkPreset
                            </p>
                            <p className="mt-2 text-sm font-medium text-foreground">
                              {activeAnalysisResult.metadata.frameworkPreset}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-border bg-card px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                              rulesRun
                            </p>
                            <p className="mt-2 text-sm font-medium text-foreground">
                              {activeAnalysisResult.metadata.rulesRun.length}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-border bg-card px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                              rulesSkipped
                            </p>
                            <p className="mt-2 text-sm font-medium text-foreground">
                              {activeAnalysisResult.metadata.rulesSkipped.length}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-border bg-card px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                              analysisDurationMs
                            </p>
                            <p className="mt-2 text-sm font-medium text-foreground">
                              {formatAnalysisDuration(
                                activeAnalysisResult.metadata.analysisDurationMs,
                              )}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-border bg-card px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                              limitations
                            </p>
                            <p className="mt-2 text-sm font-medium text-foreground">
                              {activeAnalysisResult.metadata.limitations.length} known blind spots
                            </p>
                          </div>
                        </div>

                        {activeAnalysisResult.metadata.runtime.fallbackReason ? (
                          <p className="text-sm leading-7 text-muted-foreground">
                            {activeAnalysisResult.metadata.runtime.fallbackReason}
                          </p>
                        ) : null}

                        {activeAnalysisResult.metadata.rulesSkipped.length > 0 ? (
                          <p className="text-sm leading-7 text-muted-foreground">
                            Rules skipped:{" "}
                            {activeAnalysisResult.metadata.rulesSkipped.join(", ")}
                          </p>
                        ) : null}
                      </div>
                    </Card>

                    <Card className="border border-border bg-background px-4 py-4">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-sm font-medium text-foreground">
                            Risk summary
                          </p>
                          <Badge variant="outline">
                            {activeAnalysisResult.summary.risk.label}
                          </Badge>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="rounded-2xl border border-border bg-card px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                              Score
                            </p>
                            <p className="mt-2 text-sm font-medium text-foreground">
                              {activeAnalysisResult.summary.risk.score}/100
                            </p>
                          </div>
                          <div className="rounded-2xl border border-border bg-card px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                              Rules run
                            </p>
                            <p className="mt-2 text-sm font-medium text-foreground">
                              {activeAnalysisResult.metadata.rulesRun.length}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-border bg-card px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                              Tx assumption
                            </p>
                            <p className="mt-2 text-sm font-medium text-foreground">
                              {activeAnalysisResult.metadata.transactionContext
                                .assumeTransaction
                                ? "Framework wrapped"
                                : "No wrapper assumed"}
                            </p>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                          <div className="rounded-2xl border border-border bg-card px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                              Highest lock
                            </p>
                            <p className="mt-2 text-sm font-medium text-foreground">
                              {activeAnalysisResult.summary.risk.highestLockLevel ??
                                "None"}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-border bg-card px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                              Destructive
                            </p>
                            <p className="mt-2 text-sm font-medium text-foreground">
                              {activeAnalysisResult.summary.risk.destructiveChanges}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-border bg-card px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                              Rewrites
                            </p>
                            <p className="mt-2 text-sm font-medium text-foreground">
                              {activeAnalysisResult.summary.risk.rewriteRisks}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-border bg-card px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                              Table scans
                            </p>
                            <p className="mt-2 text-sm font-medium text-foreground">
                              {activeAnalysisResult.summary.risk.tableScans}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-border bg-card px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                              Tx risks
                            </p>
                            <p className="mt-2 text-sm font-medium text-foreground">
                              {activeAnalysisResult.summary.risk.transactionRisks}
                            </p>
                          </div>
                        </div>
                      </div>
                    </Card>

                    <Card className="border border-border bg-background px-4 py-4">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-sm font-medium text-foreground">
                            Statement types detected
                          </p>
                          <Badge variant="outline">
                            {activeAnalysisResult.statements.length} statement
                            {activeAnalysisResult.statements.length === 1 ? "" : "s"}
                          </Badge>
                        </div>

                        {statementKindEntries.length === 0 ? (
                          <p className="text-sm leading-7 text-muted-foreground">
                            No statements were classified yet.
                          </p>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                              {statementKindEntries.map(([kind, count]) => (
                                <Badge key={kind} variant="outline">
                                  {toHeadingCase(kind)} x{count}
                                </Badge>
                              ))}
                            </div>

                            <div className="space-y-2">
                              {activeAnalysisResult.statements.map((statement) => (
                                <div
                                  key={`${statement.index}-${statement.startOffset}`}
                                  className="rounded-2xl border border-border bg-card px-4 py-3"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <p className="text-sm font-medium text-foreground">
                                      {statement.index + 1}. {toHeadingCase(statement.kind)}
                                    </p>
                                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                      Lines {statement.lineStart}-{statement.lineEnd}
                                    </p>
                                  </div>
                                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                                    {workspaceSettings.redactionMode
                                      ? "Target hidden in redaction mode."
                                      : statement.targetObject
                                        ? `Target: ${statement.targetObject}`
                                        : "Target not detected."}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>

                    <Card className="border border-border bg-background px-4 py-4">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-sm font-medium text-foreground">
                            What this checker cannot know
                          </p>
                          <Badge variant="outline">
                            {activeResultLimitations.length} limits
                          </Badge>
                        </div>

                        <p className="text-sm leading-7 text-muted-foreground">
                          This checker does not connect to your database. It uses SQL text, the selected PostgreSQL version, the framework preset, and an estimated table-size profile only.
                        </p>

                        <div className="grid gap-2 sm:grid-cols-2">
                          {activeResultLimitations.map((limitation) => (
                            <div
                              key={limitation}
                              className="rounded-2xl border border-border bg-card px-4 py-3 text-sm leading-7 text-muted-foreground"
                            >
                              {limitation}
                            </div>
                          ))}
                        </div>
                      </div>
                    </Card>

                    <Card className="border border-border bg-background px-4 py-4">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-sm font-medium text-foreground">
                            Parser diagnostics
                          </p>
                          <Badge variant="outline">
                            {parserDiagnostics.length} diagnostic
                            {parserDiagnostics.length === 1 ? "" : "s"}
                          </Badge>
                        </div>

                        {parserDiagnostics.length === 0 ? (
                          <p className="text-sm leading-7 text-muted-foreground">
                            No parser warnings or errors were reported.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {parserDiagnostics.map((diagnostic) => (
                              <div
                                key={`${diagnostic.code}-${diagnostic.message}-${diagnostic.startOffset ?? "global"}`}
                                className="rounded-2xl border border-border bg-card px-4 py-3"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <p className="text-sm font-medium text-foreground">
                                    {diagnostic.message}
                                  </p>
                                  <Badge variant="outline">
                                    {diagnostic.severity}
                                  </Badge>
                                </div>
                                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                                  {formatDiagnosticLocation(diagnostic)} / {diagnostic.source}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </Card>
                  </div>
                ) : null}

                <div className="space-y-3">
                  {activeAnalysisResult ? (
                    <div className="flex flex-wrap gap-2">
                      {RESULTS_CATEGORY_FILTER_OPTIONS.map((option) => (
                        <Button
                          key={option.value}
                          type="button"
                          size="sm"
                          variant={
                            selectedCategoryFilter === option.value
                              ? "primary"
                              : "secondary"
                          }
                          onClick={() => {
                            setSelectedCategoryFilter(option.value);
                          }}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  ) : null}

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
                      {visibleFindings.length === 0 ? (
                        <EmptyStateCard
                          title="No visible findings with the current filters"
                          body="Statement mapping and parser diagnostics are still available above even when there are no rule findings."
                        />
                      ) : (
                        visibleFindings.map((finding) => {
                          const confidenceDetails = getConfidenceDetails(
                            finding.confidence,
                          );

                          return (
                            <Card
                              key={finding.id}
                              className="border border-border bg-background px-4 py-4"
                            >
                              <div className="space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div className="space-y-1">
                                    <p className="text-sm font-medium text-foreground">
                                      {finding.title}
                                    </p>
                                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                      {finding.category} / {finding.severity}
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <Badge
                                      variant="outline"
                                      title={confidenceDetails.tooltip}
                                    >
                                      {confidenceDetails.label}
                                    </Badge>
                                    {finding.lockLevel ? (
                                      <Badge variant="outline">{finding.lockLevel}</Badge>
                                    ) : null}
                                  </div>
                                </div>

                                <p className="text-sm leading-7 text-muted-foreground">
                                  {finding.summary}
                                </p>

                                <div className="space-y-2 text-sm leading-7 text-muted-foreground">
                                  <p>
                                    <span className="font-medium text-foreground">
                                      Why it matters:
                                    </span>{" "}
                                    {finding.whyItMatters}
                                  </p>
                                  <p>
                                    <span className="font-medium text-foreground">
                                      Recommended action:
                                    </span>{" "}
                                    {finding.recommendedAction}
                                  </p>
                                </div>

                                {finding.lockInfo ? (
                                  <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm leading-7 text-muted-foreground">
                                    <p>
                                      <span className="font-medium text-foreground">
                                        Lock behavior:
                                      </span>{" "}
                                      {finding.lockInfo.description}
                                    </p>
                                    <p>
                                      <span className="font-medium text-foreground">
                                        Read/write impact:
                                      </span>{" "}
                                      {finding.lockInfo.blocksReads
                                        ? "Blocks reads"
                                        : "Allows reads"}{" "}
                                      and{" "}
                                      {finding.lockInfo.blocksWrites
                                        ? "blocks writes"
                                        : "allows writes"}.
                                    </p>
                                  </div>
                                ) : null}

                                {finding.safeRewrite ? (
                                  <div className="rounded-2xl border border-border bg-card px-4 py-3">
                                    <div className="space-y-3">
                                      <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                          <p className="text-sm font-medium text-foreground">
                                            {finding.safeRewrite.title}
                                          </p>
                                          <p className="mt-1 text-sm leading-7 text-muted-foreground">
                                            {finding.safeRewrite.summary}
                                          </p>
                                        </div>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="secondary"
                                          onClick={() => {
                                            void handleCopySqlSnippet(
                                              finding.safeRewrite!.sql,
                                            );
                                          }}
                                        >
                                          Copy SQL
                                        </Button>
                                      </div>
                                      <pre className="overflow-x-auto rounded-2xl border border-border bg-background px-4 py-3 text-xs leading-6 text-foreground">
                                        <code>{finding.safeRewrite.sql}</code>
                                      </pre>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            </Card>
                          );
                        })
                      )}
                    </>
                  )}
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
                      void handleCopyReport();
                    }}
                    disabled={reportText.length === 0}
                  >
                    Copy PR report
                  </Button>
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

function SummaryMetric({
  detail,
  label,
  value,
}: {
  detail?: string;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background px-4 py-4">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      {detail ? (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
      ) : null}
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
