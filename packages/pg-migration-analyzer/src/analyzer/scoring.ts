import type { Finding, FindingSeverity, RiskLabel } from "../types";

export const FINDING_SEVERITY_DEDUCTIONS: Record<FindingSeverity, number> = {
  critical: 30,
  high: 18,
  medium: 9,
  low: 3,
  info: 0,
};

export function calculateRiskDeductions(findings: readonly Finding[]) {
  return findings.reduce<Record<FindingSeverity, number>>(
    (totals, finding) => {
      totals[finding.severity] += FINDING_SEVERITY_DEDUCTIONS[finding.severity];
      return totals;
    },
    {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    },
  );
}

export function calculateRiskScore(findings: readonly Finding[]) {
  const totalDeduction = Object.values(calculateRiskDeductions(findings)).reduce(
    (total, deduction) => total + deduction,
    0,
  );

  return Math.max(0, Math.min(100, 100 - totalDeduction));
}

export function getRiskLabel(score: number): RiskLabel {
  if (score >= 90) {
    return "Looks safe";
  }

  if (score >= 70) {
    return "Review recommended";
  }

  if (score >= 40) {
    return "Risky migration";
  }

  return "High downtime risk";
}
