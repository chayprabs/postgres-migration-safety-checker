import type { AnalysisSettings, TransactionAssumptionMode } from "@/features/postgres-migration-checker";
import { getFrameworkPresetDefinition } from "@/features/postgres-migration-checker";
import type { AnalyticsSettingsSummary } from "@/lib/analytics";
import type { PersistedWorkspaceSettings } from "./workspaceSettingsStorage";

export function buildAnalysisSettings(
  settings: PersistedWorkspaceSettings,
  transactionAssumptionMode: TransactionAssumptionMode,
  schemaSql = "",
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
    schemaSql: schemaSql.trim().length > 0 ? schemaSql : undefined,
  };
}

export function buildAnalyticsSettingsSummary(
  settings: PersistedWorkspaceSettings,
): AnalyticsSettingsSummary {
  return {
    postgresVersion: settings.postgresVersion,
    frameworkPreset: settings.frameworkPreset,
    tableSizeProfile: settings.tableSizeProfile,
    redactionMode: settings.redactionMode,
  };
}

export function getWorkspaceSettingsSignature(
  settings: PersistedWorkspaceSettings,
  transactionAssumptionMode: TransactionAssumptionMode,
  sourceFilename: string | null,
) {
  return JSON.stringify({
    settings,
    transactionAssumptionMode,
    sourceFilename,
  });
}
