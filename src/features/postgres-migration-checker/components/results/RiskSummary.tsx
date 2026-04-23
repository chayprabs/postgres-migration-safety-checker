"use client";

import type { AnalysisResult } from "../../types";
import { Card } from "@/components/Card";

function pluralize(value: number, singular: string, plural = `${singular}s`) {
  return value === 1 ? singular : plural;
}

export function RiskSummary({ result }: { result: AnalysisResult }) {
  const blockingFindings = result.findings.filter(
    (finding) => finding.lockInfo?.blocksReads || finding.lockInfo?.blocksWrites,
  ).length;
  const parserDiagnosticsCount =
    result.metadata.parser.errors.length + result.metadata.parser.warnings.length;

  return (
    <Card className="border border-border bg-background px-5 py-5">
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Reviewer summary</p>
          <p className="text-sm leading-7 text-muted-foreground">
            {result.summary.totalFindings === 0
              ? `No findings were detected across ${result.summary.totalStatements} ${pluralize(result.summary.totalStatements, "statement")}, but this is still only a static review using the ${result.metadata.framework.label} preset, a ${result.metadata.tableSizeProfile} table-size estimate, and PostgreSQL ${result.metadata.postgresVersionUsed} rules.`
              : `${result.summary.risk.label} based on ${result.summary.totalFindings} ${pluralize(result.summary.totalFindings, "finding")} across ${result.summary.totalStatements} ${pluralize(result.summary.totalStatements, "statement")}. The checker is using the ${result.metadata.framework.label} preset with a ${result.metadata.tableSizeProfile} table-size estimate and PostgreSQL ${result.metadata.postgresVersionUsed} rules.`}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-sm font-medium text-foreground">Blocking pressure</p>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              {blockingFindings > 0
                ? `${blockingFindings} finding${blockingFindings === 1 ? "" : "s"} appear to block reads or writes through the estimated lock path.`
                : "No findings currently map to a lock path that clearly blocks reads or writes."}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-sm font-medium text-foreground">Top themes</p>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              {result.summary.risk.destructiveChanges} destructive,{" "}
              {result.summary.risk.rewriteRisks} rewrite,{" "}
              {result.summary.risk.tableScans} table-scan, and{" "}
              {result.summary.risk.transactionRisks} transaction-risk findings.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-sm font-medium text-foreground">Parser status</p>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              {parserDiagnosticsCount > 0
                ? `${parserDiagnosticsCount} parser diagnostic${parserDiagnosticsCount === 1 ? "" : "s"} mean some conclusions should be reviewed with extra care.`
                : "No parser diagnostics were reported, so the statement mapping should be more trustworthy."}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
