import { describe, expect, it } from "vitest";
import { compareMigrations } from "../src/compare/compareMigrations";

const settings = {
  postgresVersion: 16 as const,
  frameworkPreset: "raw-sql" as const,
  tableSizeProfile: "large" as const,
  includeLowSeverityFindings: true,
  includeInfoFindings: true,
  includeSafeRewrites: true,
  assumeOnlineMigration: true,
  assumeRunsInTransaction: false,
  transactionAssumptionMode: "auto" as const,
  flagDestructiveChanges: true,
  redactionMode: false,
  autoAnalyze: false,
  reportFormat: "markdown" as const,
  stopAfterParseError: false,
};

describe("compareMigrations", () => {
  it("reports added statements and finding deltas", async () => {
    const beforeSql = "CREATE INDEX idx_users_email ON public.users (email);";
    const afterSql = `${beforeSql}\nDROP TABLE public.users;`;

    const result = await compareMigrations({
      beforeSql,
      afterSql,
      settings,
    });

    expect(result.summary.statementsAdded).toBeGreaterThan(0);
    expect(result.summary.riskScoreDelta).not.toBe(0);
    expect(result.findingDeltas.some((delta) => delta.type === "added")).toBe(true);
  });

  it("returns zero deltas for identical SQL", async () => {
    const sql = "SELECT 1;";

    const result = await compareMigrations({
      beforeSql: sql,
      afterSql: sql,
      settings,
    });

    expect(result.summary.statementsAdded).toBe(0);
    expect(result.summary.statementsRemoved).toBe(0);
    expect(result.summary.riskScoreDelta).toBe(0);
  });
});
