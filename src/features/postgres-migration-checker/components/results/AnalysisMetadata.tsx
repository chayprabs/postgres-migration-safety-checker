"use client";

import type {
  AnalysisDiagnostic,
  AnalysisResult,
} from "../../types";
import { Card } from "@/components/Card";

type AnalysisMetadataProps = {
  parserDiagnostics: readonly AnalysisDiagnostic[];
  result: AnalysisResult;
};

function formatRuntimeLabel(mode: AnalysisResult["metadata"]["runtime"]["mode"]) {
  return mode === "worker" ? "Web Worker" : "Main thread";
}

function getParserStatusLabel(parser: AnalysisResult["metadata"]["parser"]) {
  if (parser.ok && parser.parser === "supabase-pg-parser") {
    return "Parsed with PostgreSQL parser";
  }

  if (parser.errors.length > 0) {
    return "Partial analysis due to parser error";
  }

  if (parser.parser === "fallback") {
    return "Used fallback pattern analysis";
  }

  return "No parser run";
}

function formatParserEngineLabel(parser: AnalysisResult["metadata"]["parser"]["parser"]) {
  switch (parser) {
    case "supabase-pg-parser":
      return "Supabase PG parser";
    case "fallback":
      return "Fallback pattern matcher";
    default:
      return "Not used";
  }
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function toHeadingCase(value: string) {
  return value
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatAnalysisDuration(durationMs: number) {
  if (durationMs >= 1000) {
    return `${(durationMs / 1000).toFixed(durationMs >= 10_000 ? 0 : 1)} s`;
  }

  return `${durationMs} ms`;
}

export function AnalysisMetadata({
  parserDiagnostics,
  result,
}: AnalysisMetadataProps) {
  const statementKinds = Object.entries(result.metadata.statementKinds).sort(
    ([leftKind], [rightKind]) => leftKind.localeCompare(rightKind),
  );

  return (
    <Card className="border border-border bg-background px-5 py-5">
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Analysis metadata</p>
          <p className="text-sm leading-7 text-muted-foreground">
            Exact run context for this report so reviewers can judge how much to
            trust each conclusion.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              PostgreSQL version used
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              PostgreSQL {result.metadata.postgresVersionUsed}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Parser version used
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {result.metadata.parserVersionUsed
                ? `PostgreSQL ${result.metadata.parserVersionUsed}`
                : "Not used"}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Framework preset
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {result.metadata.frameworkPreset}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Table size profile
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {toHeadingCase(result.metadata.tableSizeProfile)}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Rules executed
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {result.metadata.rulesRun.length}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Rules skipped
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {result.metadata.rulesSkipped.length}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Parser status
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {getParserStatusLabel(result.metadata.parser)}
            </p>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">
              {formatParserEngineLabel(result.metadata.parser.parser)}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Runtime
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {formatRuntimeLabel(result.metadata.runtime.mode)}
            </p>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-sm font-medium text-foreground">Run details</p>
            <div className="mt-3 space-y-2 text-sm leading-7 text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">analysis duration:</span>{" "}
                {formatAnalysisDuration(result.metadata.analysisDurationMs)}
              </p>
              <p>
                <span className="font-medium text-foreground">analyzed at:</span>{" "}
                {formatTimestamp(result.analyzedAt)}
              </p>
              <p>
                <span className="font-medium text-foreground">analyzer version:</span>{" "}
                {result.analyzerVersion}
              </p>
              <p>
                <span className="font-medium text-foreground">transaction assumption:</span>{" "}
                {result.metadata.framework.transactionAssumptionReason}
              </p>
              {result.metadata.runtime.fallbackReason ? (
                <p>
                  <span className="font-medium text-foreground">runtime note:</span>{" "}
                  {result.metadata.runtime.fallbackReason}
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-sm font-medium text-foreground">
              Statement kinds and diagnostics
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {statementKinds.map(([kind, count]) => (
                <span
                  key={kind}
                  className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground"
                >
                  {toHeadingCase(kind)} x{count}
                </span>
              ))}
              <span className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
                Diagnostics {parserDiagnostics.length}
              </span>
            </div>

            {parserDiagnostics.length > 0 ? (
              <div className="mt-3 space-y-2">
                {parserDiagnostics.slice(0, 3).map((diagnostic) => (
                  <p
                    key={`${diagnostic.code}-${diagnostic.message}-${diagnostic.startOffset ?? "global"}`}
                    className="text-sm leading-7 text-muted-foreground"
                  >
                    {diagnostic.severity.toUpperCase()}: {diagnostic.message}
                  </p>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                No parser diagnostics were reported.
              </p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
