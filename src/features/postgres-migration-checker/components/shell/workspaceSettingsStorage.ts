import {
  DEFAULT_POSTGRES_VERSION,
  FRAMEWORK_PRESET_DEFINITIONS,
  SUPPORTED_POSTGRES_VERSIONS,
  type FrameworkPreset,
  type PostgresVersion,
  type TableSizeProfile,
} from "@/features/postgres-migration-checker";
import {
  FINDINGS_CATEGORY_FILTER_VALUES,
  FINDINGS_SEVERITY_FILTER_VALUES,
  FINDINGS_SORT_MODE_VALUES,
  RESULTS_TAB_VALUES,
  TABLE_SIZE_PROFILE_OPTIONS,
  WORKSPACE_SETTINGS_STORAGE_KEY,
} from "./shellConstants";
import type { FindingsCategoryFilter, FindingsSeverityFilter, FindingsSortMode } from "../results";

export type PersistedWorkspaceSettings = {
  autoAnalyze: boolean;
  frameworkPreset: FrameworkPreset;
  postgresVersion: PostgresVersion;
  redactionMode: boolean;
  showLowSeverity: boolean;
  tableSizeProfile: TableSizeProfile;
};

export type ResultsTab = (typeof RESULTS_TAB_VALUES)[number];

export type ShareableCheckerState = {
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

const workspaceSettingsListeners = new Set<() => void>();
let inMemoryWorkspaceSettings: PersistedWorkspaceSettings | null = null;

export function createDefaultWorkspaceSettings(): PersistedWorkspaceSettings {
  return {
    postgresVersion: DEFAULT_POSTGRES_VERSION,
    frameworkPreset: "raw-sql",
    tableSizeProfile: "large",
    autoAnalyze: true,
    showLowSeverity: true,
    redactionMode: false,
  };
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

export function mergePersistedWorkspaceSettings(
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

export function readPersistedWorkspaceSettings(): PersistedWorkspaceSettings {
  if (inMemoryWorkspaceSettings) {
    return inMemoryWorkspaceSettings;
  }

  const defaults = createDefaultWorkspaceSettings();

  if (typeof window === "undefined") {
    return defaults;
  }

  try {
    const storedValue = window.localStorage.getItem(WORKSPACE_SETTINGS_STORAGE_KEY);

    inMemoryWorkspaceSettings = storedValue
      ? mergePersistedWorkspaceSettings(JSON.parse(storedValue))
      : defaults;
  } catch {
    inMemoryWorkspaceSettings = defaults;
  }

  return inMemoryWorkspaceSettings;
}

export function subscribeWorkspaceSettings(listener: () => void) {
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

export function writePersistedWorkspaceSettings(settings: PersistedWorkspaceSettings) {
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

function parseShareableBoolean(value: string | null) {
  if (value === null) {
    return undefined;
  }

  return value === "1" || value === "true";
}

export function readShareableCheckerStateFromHash(): ShareableCheckerState | null {
  if (typeof window === "undefined" || !window.location.hash.startsWith("#share:")) {
    return null;
  }

  const params = new URLSearchParams(window.location.hash.slice("#share:".length));
  const postgresVersionRaw = params.get("pg");
  const parsedPostgresVersion = postgresVersionRaw ? Number(postgresVersionRaw) : null;
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
      frameworkPreset && isFrameworkPreset(frameworkPreset) ? frameworkPreset : undefined,
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
    sortMode: sortMode && isFindingsSortMode(sortMode) ? sortMode : undefined,
    resultsTab: resultsTab && isResultsTab(resultsTab) ? resultsTab : undefined,
    showLowSeverity: parseShareableBoolean(params.get("low")),
    showOnlyBlockingRisks: parseShareableBoolean(params.get("blocking")),
    showSafeRewritesOnly: parseShareableBoolean(params.get("rewrites")),
  };
}

export function buildShareableCheckerLink({
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
