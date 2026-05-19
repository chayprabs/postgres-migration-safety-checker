import type {
  AnalysisSummary,
  Finding,
  FindingSeverity,
  LockLevel,
  MigrationStatement,
} from "../types";
import {
  calculateRiskDeductions,
  calculateRiskScore,
  getRiskLabel,
} from "./scoring";

const FINDING_SEVERITY_ORDER: readonly FindingSeverity[] = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
];
const LOCK_LEVEL_ORDER: readonly LockLevel[] = [
  "ACCESS SHARE",
  "ROW SHARE",
  "ROW EXCLUSIVE",
  "SHARE UPDATE EXCLUSIVE",
  "SHARE",
  "SHARE ROW EXCLUSIVE",
  "EXCLUSIVE",
  "ACCESS EXCLUSIVE",
];

function countFindingsByTag(findings: readonly Finding[], tag: string) {
  return findings.filter((finding) => finding.tags.includes(tag)).length;
}

function getHighestLockLevel(findings: readonly Finding[]) {
  let highestIndex = -1;
  let highestLockLevel: LockLevel | null = null;

  findings.forEach((finding) => {
    if (!finding.lockLevel) {
      return;
    }

    const lockIndex = LOCK_LEVEL_ORDER.indexOf(finding.lockLevel);

    if (lockIndex > highestIndex) {
      highestIndex = lockIndex;
      highestLockLevel = finding.lockLevel;
    }
  });

  return highestLockLevel;
}

export function buildAnalysisSummary(
  findings: readonly Finding[],
  statements: readonly MigrationStatement[],
): AnalysisSummary {
  const bySeverity: Record<FindingSeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  const byCategory: AnalysisSummary["byCategory"] = {};

  findings.forEach((finding) => {
    bySeverity[finding.severity] += 1;
    byCategory[finding.category] = (byCategory[finding.category] || 0) + 1;
  });

  const riskScore = calculateRiskScore(findings);

  return {
    totalStatements: statements.length,
    totalFindings: findings.length,
    highestSeverity:
      FINDING_SEVERITY_ORDER.find((severity) => bySeverity[severity] > 0) ?? null,
    bySeverity,
    byCategory,
    risk: {
      score: riskScore,
      label: getRiskLabel(riskScore),
      deductions: calculateRiskDeductions(findings),
      highestLockLevel: getHighestLockLevel(findings),
      destructiveChanges: countFindingsByTag(findings, "destructive"),
      rewriteRisks: countFindingsByTag(findings, "rewrite-risk"),
      tableScans: countFindingsByTag(findings, "table-scan"),
      transactionRisks: countFindingsByTag(findings, "transaction-risk"),
    },
  };
}
