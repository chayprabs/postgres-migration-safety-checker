import { redactSecretsInText } from "../analyzer/security/secretDetection";
import type {
  AnalysisResult,
  AnalysisSettings,
  FrameworkPreset,
  PostgresVersion,
  TableSizeProfile,
} from "../types";
import type {
  SavedLocalAnalysis,
  SavedLocalAnalysisMode,
  SavedLocalAnalysisResult,
} from "./types";

type SaveLocalAnalysisInput = {
  analysisResult?: AnalysisResult | null;
  includeSql: boolean;
  redactionMode: boolean;
  sourceFilename?: string | null;
  sql: string;
  title?: string;
};

const LOCAL_HISTORY_STORAGE_KEY =
  "authos.postgres-migration-checker.local-history.v1";
const localHistoryListeners = new Set<() => void>();
let inMemorySavedAnalyses: SavedLocalAnalysis[] | null = null;

function getWindowLocalStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function createEmptyHistory() {
  return [] satisfies SavedLocalAnalysis[];
}

function isSeverityCounts(
  value: unknown,
): value is SavedLocalAnalysis["severityCounts"] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.critical === "number" &&
    typeof record.high === "number" &&
    typeof record.medium === "number" &&
    typeof record.low === "number" &&
    typeof record.info === "number"
  );
}

function isFrameworkPreset(value: unknown): value is FrameworkPreset {
  return [
    "raw-sql",
    "rails",
    "django",
    "prisma",
    "knex",
    "sequelize",
    "flyway",
    "liquibase",
    "goose",
    "node-pg-migrate",
  ].includes(String(value));
}

function isPostgresVersion(value: unknown): value is PostgresVersion {
  return [10, 11, 12, 13, 14, 15, 16, 17, 18].includes(Number(value));
}

function isTableSizeProfile(value: unknown): value is TableSizeProfile {
  return ["unknown", "small", "medium", "large", "very-large"].includes(
    String(value),
  );
}

function isSavedLocalAnalysisMode(
  value: unknown,
): value is SavedLocalAnalysisMode {
  return value === "summary-only" || value === "with-sql";
}

function sanitizeSavedLocalAnalysisResult(
  result: AnalysisResult,
  {
    includeSql,
    redactionMode,
  }: {
    includeSql: boolean;
    redactionMode: boolean;
  },
): SavedLocalAnalysisResult {
  return {
    ...result,
    statements: result.statements.map((statement) => ({
      index: statement.index,
      startOffset: statement.startOffset,
      endOffset: statement.endOffset,
      lineStart: statement.lineStart,
      lineEnd: statement.lineEnd,
      columnStart: statement.columnStart,
      columnEnd: statement.columnEnd,
      kind: statement.kind,
      targetObject: statement.targetObject,
      parserMetadata: statement.parserMetadata,
      transactionalBehavior: statement.transactionalBehavior,
      tags: statement.tags,
      raw: includeSql
        ? redactionMode
          ? redactSecretsInText(statement.raw)
          : statement.raw
        : "",
      normalized: includeSql
        ? redactionMode
          ? redactSecretsInText(statement.normalized)
          : statement.normalized
        : "",
    })),
  };
}

function mergeSavedLocalAnalysis(rawValue: unknown): SavedLocalAnalysis | null {
  if (!rawValue || typeof rawValue !== "object") {
    return null;
  }

  const candidate = rawValue as Partial<Record<keyof SavedLocalAnalysis, unknown>>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.title !== "string" ||
    typeof candidate.createdAt !== "string" ||
    typeof candidate.updatedAt !== "string" ||
    !isPostgresVersion(candidate.postgresVersion) ||
    !isFrameworkPreset(candidate.frameworkPreset) ||
    !isTableSizeProfile(candidate.tableSizeProfile) ||
    typeof candidate.riskScore !== "number" ||
    !isSeverityCounts(candidate.severityCounts) ||
    !isSavedLocalAnalysisMode(candidate.saveMode)
  ) {
    return null;
  }

  return {
    id: candidate.id,
    title: candidate.title,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    postgresVersion: candidate.postgresVersion,
    frameworkPreset: candidate.frameworkPreset,
    tableSizeProfile: candidate.tableSizeProfile,
    riskScore: candidate.riskScore,
    severityCounts: candidate.severityCounts,
    saveMode: candidate.saveMode,
    sourceFilename:
      typeof candidate.sourceFilename === "string" || candidate.sourceFilename === null
        ? candidate.sourceFilename
        : undefined,
    sqlInput: typeof candidate.sqlInput === "string" ? candidate.sqlInput : undefined,
    analysisResult:
      candidate.analysisResult && typeof candidate.analysisResult === "object"
        ? (candidate.analysisResult as SavedLocalAnalysisResult)
        : undefined,
  };
}

function sortSavedAnalyses(savedAnalyses: readonly SavedLocalAnalysis[]) {
  return [...savedAnalyses].sort((left, right) => {
    return (
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime() ||
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() ||
      left.title.localeCompare(right.title)
    );
  });
}

function notifyLocalHistoryListeners() {
  localHistoryListeners.forEach((listener) => {
    listener();
  });
}

function writeSavedAnalyses(savedAnalyses: SavedLocalAnalysis[]) {
  const nextSavedAnalyses = sortSavedAnalyses(savedAnalyses);
  inMemorySavedAnalyses = nextSavedAnalyses;

  try {
    getWindowLocalStorage()?.setItem(
      LOCAL_HISTORY_STORAGE_KEY,
      JSON.stringify(nextSavedAnalyses),
    );
  } catch {
    // Keep in-memory history usable even if localStorage writes fail.
  }

  notifyLocalHistoryListeners();
}

function getGeneratedFallbackTitle(createdAt: string) {
  return `Migration review ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(createdAt))}`;
}

function getSqlPreviewTitle(sql: string) {
  const firstMeaningfulLine =
    sql
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith("--")) ?? "";

  if (firstMeaningfulLine.length === 0) {
    return null;
  }

  return firstMeaningfulLine.replace(/\s+/g, " ").slice(0, 72);
}

function getGeneratedTitle({
  analysisResult,
  createdAt,
  sql,
}: {
  analysisResult?: AnalysisResult | null;
  createdAt: string;
  sql: string;
}) {
  const firstStatement = analysisResult?.statements[0];

  if (firstStatement?.targetObject) {
    return `${firstStatement.kind} ${firstStatement.targetObject}`;
  }

  if (firstStatement) {
    return `${firstStatement.kind} migration review`;
  }

  return getSqlPreviewTitle(sql) ?? getGeneratedFallbackTitle(createdAt);
}

function createSavedAnalysisId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `saved-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function buildSavedAnalysisSummaryFields(
  settings: AnalysisSettings | undefined,
  analysisResult: AnalysisResult | null | undefined,
) {
  return {
    postgresVersion: (settings?.postgresVersion ?? 16) as PostgresVersion,
    frameworkPreset: (settings?.frameworkPreset ?? "raw-sql") as FrameworkPreset,
    tableSizeProfile: (settings?.tableSizeProfile ?? "unknown") as TableSizeProfile,
    riskScore: analysisResult?.summary.risk.score ?? 0,
    severityCounts: analysisResult?.summary.bySeverity ?? {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    },
  };
}

export function readSavedLocalAnalyses() {
  if (inMemorySavedAnalyses) {
    return inMemorySavedAnalyses;
  }

  const storage = getWindowLocalStorage();

  if (!storage) {
    return createEmptyHistory();
  }

  try {
    const storedValue = storage.getItem(LOCAL_HISTORY_STORAGE_KEY);

    if (!storedValue) {
      inMemorySavedAnalyses = createEmptyHistory();
      return inMemorySavedAnalyses;
    }

    const parsed = JSON.parse(storedValue);
    const savedAnalyses = Array.isArray(parsed)
      ? parsed
          .map((entry) => mergeSavedLocalAnalysis(entry))
          .filter((entry): entry is SavedLocalAnalysis => entry !== null)
      : createEmptyHistory();

    inMemorySavedAnalyses = sortSavedAnalyses(savedAnalyses);
    return inMemorySavedAnalyses;
  } catch {
    inMemorySavedAnalyses = createEmptyHistory();
    return inMemorySavedAnalyses;
  }
}

export function subscribeSavedLocalAnalyses(listener: () => void) {
  localHistoryListeners.add(listener);

  if (typeof window === "undefined") {
    return () => {
      localHistoryListeners.delete(listener);
    };
  }

  function handleStorage(event: StorageEvent) {
    if (event.key && event.key !== LOCAL_HISTORY_STORAGE_KEY) {
      return;
    }

    inMemorySavedAnalyses = null;
    listener();
  }

  window.addEventListener("storage", handleStorage);

  return () => {
    localHistoryListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function saveLocalAnalysis({
  analysisResult,
  includeSql,
  redactionMode,
  sourceFilename,
  sql,
  title,
}: SaveLocalAnalysisInput) {
  const createdAt = new Date().toISOString();
  const resolvedTitle =
    title?.trim().length
      ? title.trim()
      : getGeneratedTitle({
          analysisResult,
          createdAt,
          sql,
        });
  const settings = analysisResult?.settings;
  const summaryFields = buildSavedAnalysisSummaryFields(settings, analysisResult);
  const savedAnalysis: SavedLocalAnalysis = {
    id: createSavedAnalysisId(),
    title: resolvedTitle,
    createdAt,
    updatedAt: createdAt,
    postgresVersion: summaryFields.postgresVersion,
    frameworkPreset: summaryFields.frameworkPreset,
    tableSizeProfile: summaryFields.tableSizeProfile,
    riskScore: summaryFields.riskScore,
    severityCounts: summaryFields.severityCounts,
    saveMode: includeSql ? "with-sql" : "summary-only",
    sourceFilename,
    ...(includeSql ? { sqlInput: sql } : {}),
    ...(analysisResult
      ? {
          analysisResult: sanitizeSavedLocalAnalysisResult(analysisResult, {
            includeSql,
            redactionMode,
          }),
        }
      : {}),
  };

  writeSavedAnalyses([savedAnalysis, ...readSavedLocalAnalyses()]);
  return savedAnalysis;
}

export function deleteSavedLocalAnalysis(savedAnalysisId: string) {
  writeSavedAnalyses(
    readSavedLocalAnalyses().filter((savedAnalysis) => savedAnalysis.id !== savedAnalysisId),
  );
}

export function clearSavedLocalHistory() {
  writeSavedAnalyses(createEmptyHistory());
}
