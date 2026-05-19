"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import {
  compareMigrations,
  type AnalysisSettings,
  type MigrationComparisonResult,
} from "@authos/pg-migration-analyzer";

type CompareMigrationPanelProps = {
  settings: AnalysisSettings;
};

export function CompareMigrationPanel({ settings }: CompareMigrationPanelProps) {
  const [beforeSql, setBeforeSql] = useState("");
  const [afterSql, setAfterSql] = useState("");
  const [comparison, setComparison] = useState<MigrationComparisonResult | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCompare() {
    setIsComparing(true);
    setError(null);

    try {
      const result = await compareMigrations({
        beforeSql,
        afterSql,
        settings,
      });
      setComparison(result);
    } catch (compareError) {
      setError(
        compareError instanceof Error
          ? compareError.message
          : "Comparison failed.",
      );
      setComparison(null);
    } finally {
      setIsComparing(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Compare two migrations</h3>
          <p className="text-sm leading-7 text-muted-foreground">
            Paste a before and after revision to see statement and finding deltas. Analysis
            stays in this browser.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium">Before SQL</span>
            <textarea
              aria-label="Before SQL"
              value={beforeSql}
              onChange={(event) => setBeforeSql(event.target.value)}
              rows={8}
              className="w-full rounded-2xl border border-border bg-card px-4 py-3 font-mono text-sm"
              placeholder="Previous migration revision"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">After SQL</span>
            <textarea
              aria-label="After SQL"
              value={afterSql}
              onChange={(event) => setAfterSql(event.target.value)}
              rows={8}
              className="w-full rounded-2xl border border-border bg-card px-4 py-3 font-mono text-sm"
              placeholder="Updated migration revision"
            />
          </label>
        </div>

        <Button
          type="button"
          onClick={() => {
            void handleCompare();
          }}
          disabled={isComparing || !beforeSql.trim() || !afterSql.trim()}
        >
          {isComparing ? "Comparing..." : "Compare migrations"}
        </Button>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {comparison ? (
          <div className="space-y-3 rounded-2xl border border-border bg-background p-4 text-sm">
            <p>
              Risk score delta: {comparison.summary.riskScoreDelta >= 0 ? "+" : ""}
              {comparison.summary.riskScoreDelta} (
              {comparison.before.summary.risk.score} → {comparison.after.summary.risk.score})
            </p>
            <p>
              Statements: +{comparison.summary.statementsAdded} / -
              {comparison.summary.statementsRemoved}
            </p>
            <p>
              Findings: +{comparison.summary.findingsAdded} / -
              {comparison.summary.findingsRemoved}
            </p>
            <ul className="space-y-1 text-muted-foreground">
              {comparison.findingDeltas
                .filter((delta) => delta.type !== "unchanged")
                .slice(0, 12)
                .map((delta) => (
                  <li key={`${delta.type}-${delta.finding.id}`}>
                    [{delta.type}] {delta.finding.title}
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
