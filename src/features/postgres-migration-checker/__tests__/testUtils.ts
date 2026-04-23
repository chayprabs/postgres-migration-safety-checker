import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import { runAnalysisPipeline } from "../analyzer/analysisPipeline";
import type { AnalysisDiagnostic, AnalysisResult, AnalysisSettings, Finding } from "../types";
import type { ReportExportInput } from "../reports/types";

const FIXTURES_DIRECTORY = fileURLToPath(
  new URL("../__fixtures__", import.meta.url),
);

export function createAnalysisSettings(
  overrides: Partial<AnalysisSettings> = {},
): AnalysisSettings {
  return {
    postgresVersion: 16,
    frameworkPreset: "raw-sql",
    tableSizeProfile: "large",
    includeLowSeverityFindings: true,
    includeInfoFindings: true,
    includeSafeRewrites: true,
    assumeOnlineMigration: true,
    assumeRunsInTransaction: false,
    transactionAssumptionMode: "auto",
    flagDestructiveChanges: true,
    redactionMode: false,
    autoAnalyze: true,
    reportFormat: "markdown",
    stopAfterParseError: false,
    ...overrides,
  };
}

export async function analyzeSql(
  sql: string,
  overrides: Partial<AnalysisSettings> = {},
  sourceFilename?: string,
) {
  return runAnalysisPipeline({
    sql,
    sourceFilename,
    settings: createAnalysisSettings(overrides),
    runtime: {
      mode: "main-thread",
    },
  });
}

export function loadFixtureSql(filename: string) {
  return readFileSync(join(FIXTURES_DIRECTORY, filename), "utf8");
}

export function getFinding(result: AnalysisResult, ruleId: string) {
  const finding = result.findings.find((candidate) => candidate.ruleId === ruleId);

  expect(finding, `${ruleId} should be present`).toBeDefined();
  return finding!;
}

export function getParserDiagnostics(result: AnalysisResult): AnalysisDiagnostic[] {
  return [...result.metadata.parser.errors, ...result.metadata.parser.warnings];
}

export function createReportExportInput(
  result: AnalysisResult,
  overrides: Partial<ReportExportInput> = {},
): ReportExportInput {
  return {
    findings: result.findings,
    frameworkLabel: result.metadata.framework.label,
    frameworkPreset: result.settings.frameworkPreset,
    options: {
      generatedAt: "2026-04-23T12:00:00.000Z",
      includeSqlSnippets: false,
      redactionMode: result.settings.redactionMode,
      sourceFilename: null,
      ...overrides.options,
    },
    parserDiagnostics: getParserDiagnostics(result),
    postgresVersion: result.settings.postgresVersion,
    recipeGroups: result.safeRewriteRecipeGroups,
    result,
    tableSizeProfile: result.settings.tableSizeProfile,
    viewFilters: {
      categoryFilter: "all",
      resultsTab: "findings",
      severityFilter: "all",
      showLowSeverity: result.settings.includeLowSeverityFindings,
      showOnlyBlockingRisks: false,
      showSafeRewritesOnly: false,
      sortMode: "severity",
      ...overrides.viewFilters,
    },
    ...overrides,
  };
}

export function hasFinding(result: AnalysisResult, ruleId: string) {
  return result.findings.some((finding) => finding.ruleId === ruleId);
}

export function makeFinding(
  severity: Finding["severity"],
  overrides: Partial<Finding> = {},
): Finding {
  return {
    id: overrides.id ?? `finding-${severity}-${overrides.ruleId ?? "test"}`,
    ruleId: overrides.ruleId ?? `TEST_${severity.toUpperCase()}`,
    title: overrides.title ?? `${severity} finding`,
    summary: overrides.summary ?? "summary",
    severity,
    category: overrides.category ?? "locking",
    statementIndex: overrides.statementIndex ?? 0,
    lineStart: overrides.lineStart ?? 1,
    lineEnd: overrides.lineEnd ?? 1,
    columnStart: overrides.columnStart ?? 1,
    columnEnd: overrides.columnEnd ?? 1,
    objectName: overrides.objectName,
    redactedPreview: overrides.redactedPreview,
    lockLevel: overrides.lockLevel,
    lockInfo: overrides.lockInfo,
    whyItMatters: overrides.whyItMatters ?? "why it matters",
    recommendedAction: overrides.recommendedAction ?? "recommended action",
    safeRewrite: overrides.safeRewrite,
    docsLinks: overrides.docsLinks ?? [],
    confidence: overrides.confidence ?? "high",
    tags: overrides.tags ?? [],
  };
}
