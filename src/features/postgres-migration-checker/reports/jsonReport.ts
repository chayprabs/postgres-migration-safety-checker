import { redactSecretsInText } from "../analyzer/security/secretDetection";
import type { ExportedAnalysisResult, JsonReportDocument, ReportExportInput } from "./types";

function sanitizeAnalysisResult(input: ReportExportInput): ExportedAnalysisResult {
  return {
    ...input.result,
    statements: input.result.statements.map((statement) => ({
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
      ...(input.options.includeSqlSnippets
        ? {
            raw: input.options.redactionMode
              ? redactSecretsInText(statement.raw)
              : statement.raw,
            normalized: input.options.redactionMode
              ? redactSecretsInText(statement.normalized)
              : statement.normalized,
          }
        : {}),
    })),
  };
}

export function createJsonReport(input: ReportExportInput): JsonReportDocument {
  const generatedAt = input.options.generatedAt ?? new Date().toISOString();

  return {
    title: "PostgreSQL Migration Safety Report",
    generatedAt,
    privacy: {
      generatedLocally: true,
      includeSqlSnippets: input.options.includeSqlSnippets,
      redactionMode: input.options.redactionMode,
      note: input.options.includeSqlSnippets
        ? input.options.redactionMode
          ? "Generated locally. SQL snippets were included in this export with likely secrets redacted."
          : "Generated locally. SQL snippets were explicitly included in this export."
        : "Generated locally. Raw SQL and statement snippets were omitted from this export by default.",
    },
    reportContext: {
      findingsIncluded: input.findings.length,
      frameworkLabel: input.frameworkLabel,
      frameworkPreset: input.frameworkPreset,
      parserDiagnosticsCount: input.parserDiagnostics.length,
      postgresVersion: input.postgresVersion,
      riskLabel: input.result.summary.risk.label,
      riskScore: input.result.summary.risk.score,
      tableSizeProfile: input.tableSizeProfile,
      totalFindings: input.result.findings.length,
    },
    viewFilters: input.viewFilters,
    analysisResult: sanitizeAnalysisResult(input),
  };
}

export function stringifyJsonReport(input: ReportExportInput) {
  return JSON.stringify(createJsonReport(input), null, 2);
}
