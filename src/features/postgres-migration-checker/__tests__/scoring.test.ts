import { describe, expect, it } from "vitest";
import { splitSqlStatements } from "../analyzer/splitSqlStatements";
import { buildAnalysisSummary } from "../analyzer/riskSummary";
import {
  FINDING_SEVERITY_DEDUCTIONS,
  calculateRiskDeductions,
  calculateRiskScore,
  getRiskLabel,
} from "../analyzer/scoring";
import { makeFinding } from "./testUtils";

describe("risk scoring", () => {
  it("maps score thresholds to stable product labels", () => {
    expect(getRiskLabel(95)).toBe("Looks safe");
    expect(getRiskLabel(72)).toBe("Review recommended");
    expect(getRiskLabel(55)).toBe("Risky migration");
    expect(getRiskLabel(12)).toBe("High downtime risk");
  });

  it("applies the configured severity deductions consistently", () => {
    const findings = [
      makeFinding("critical"),
      makeFinding("high"),
      makeFinding("medium"),
      makeFinding("low"),
      makeFinding("info"),
    ];

    expect(calculateRiskDeductions(findings)).toEqual({
      critical: FINDING_SEVERITY_DEDUCTIONS.critical,
      high: FINDING_SEVERITY_DEDUCTIONS.high,
      medium: FINDING_SEVERITY_DEDUCTIONS.medium,
      low: FINDING_SEVERITY_DEDUCTIONS.low,
      info: FINDING_SEVERITY_DEDUCTIONS.info,
    });
    expect(calculateRiskScore(findings)).toBe(40);
  });

  it("summarizes severity counts, highest severity, and lock impact", () => {
    const findings = [
      makeFinding("critical", {
        category: "data-loss",
        lockLevel: "ACCESS EXCLUSIVE",
        tags: ["destructive"],
      }),
      makeFinding("high", {
        category: "rewrite",
        lockLevel: "SHARE",
        tags: ["rewrite-risk", "table-scan"],
      }),
      makeFinding("low", {
        category: "transaction",
        tags: ["transaction-risk"],
      }),
    ];
    const statements = splitSqlStatements(
      "DROP TABLE public.legacy_users; CREATE INDEX users_email_idx ON public.users (email);",
    );
    const summary = buildAnalysisSummary(findings, statements);

    expect(summary.totalStatements).toBe(2);
    expect(summary.totalFindings).toBe(3);
    expect(summary.highestSeverity).toBe("critical");
    expect(summary.bySeverity).toEqual({
      critical: 1,
      high: 1,
      medium: 0,
      low: 1,
      info: 0,
    });
    expect(summary.byCategory).toEqual({
      "data-loss": 1,
      rewrite: 1,
      transaction: 1,
    });
    expect(summary.risk.score).toBe(calculateRiskScore(findings));
    expect(summary.risk.label).toBe("Risky migration");
    expect(summary.risk.highestLockLevel).toBe("ACCESS EXCLUSIVE");
    expect(summary.risk.destructiveChanges).toBe(1);
    expect(summary.risk.rewriteRisks).toBe(1);
    expect(summary.risk.tableScans).toBe(1);
    expect(summary.risk.transactionRisks).toBe(1);
  });
});
