"use client";

import type { AnalysisResult, FindingSeverity } from "../../types";
import { Card } from "@/components/Card";

const SEVERITY_ORDER: readonly FindingSeverity[] = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
];

function formatAnalysisDuration(durationMs: number) {
  return `${durationMs} ms`;
}

export function RiskScoreCard({ result }: { result: AnalysisResult }) {
  return (
    <Card className="border border-border bg-background px-5 py-5">
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Risk score</p>
            <div className="flex flex-wrap items-end gap-3">
              <p className="text-5xl font-semibold tracking-tight text-foreground">
                {result.summary.risk.score}
              </p>
              <p className="pb-1 text-sm text-muted-foreground">out of 100</p>
            </div>
            <p className="text-sm leading-7 text-muted-foreground">
              {result.summary.risk.label}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Highest lock
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {result.summary.risk.highestLockLevel ?? "None"}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Statements
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {result.summary.totalStatements}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Analysis duration
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {formatAnalysisDuration(result.metadata.analysisDurationMs)}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-5">
          {SEVERITY_ORDER.map((severity) => (
            <div
              key={severity}
              className="rounded-2xl border border-border bg-card px-4 py-3"
            >
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {severity}
              </p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {result.summary.bySeverity[severity]}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
