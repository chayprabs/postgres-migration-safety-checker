import { runAnalysisPipeline } from "../analyzer/analysisPipeline";
import type { AnalysisResult, AnalysisSettings, Finding, MigrationStatement } from "../types";

export type StatementChangeType = "added" | "removed" | "unchanged";

export type StatementChange = {
  type: StatementChangeType;
  before?: MigrationStatement;
  after?: MigrationStatement;
  beforeIndex?: number;
  afterIndex?: number;
};

export type FindingDelta = {
  type: "added" | "removed" | "unchanged";
  finding: Finding;
};

export type MigrationComparisonResult = {
  before: AnalysisResult;
  after: AnalysisResult;
  statementChanges: StatementChange[];
  findingDeltas: FindingDelta[];
  summary: {
    statementsAdded: number;
    statementsRemoved: number;
    findingsAdded: number;
    findingsRemoved: number;
    riskScoreDelta: number;
  };
};

function normalizeForCompare(sql: string) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

function buildStatementChanges(
  before: readonly MigrationStatement[],
  after: readonly MigrationStatement[],
): StatementChange[] {
  const beforeMap = new Map(
    before.map((statement) => [normalizeForCompare(statement.normalized), statement]),
  );
  const afterMap = new Map(
    after.map((statement) => [normalizeForCompare(statement.normalized), statement]),
  );
  const changes: StatementChange[] = [];

  for (const statement of before) {
    const key = normalizeForCompare(statement.normalized);

    if (!afterMap.has(key)) {
      changes.push({
        type: "removed",
        before: statement,
        beforeIndex: statement.index,
      });
    }
  }

  for (const statement of after) {
    const key = normalizeForCompare(statement.normalized);
    const previous = beforeMap.get(key);

    if (!previous) {
      changes.push({
        type: "added",
        after: statement,
        afterIndex: statement.index,
      });
    }
  }

  return changes;
}

function buildFindingDeltas(before: AnalysisResult, after: AnalysisResult): FindingDelta[] {
  const beforeRules = new Set(before.findings.map((finding) => finding.ruleId));
  const afterRules = new Set(after.findings.map((finding) => finding.ruleId));
  const deltas: FindingDelta[] = [];

  for (const finding of after.findings) {
    deltas.push({
      type: beforeRules.has(finding.ruleId) ? "unchanged" : "added",
      finding,
    });
  }

  for (const finding of before.findings) {
    if (!afterRules.has(finding.ruleId)) {
      deltas.push({
        type: "removed",
        finding,
      });
    }
  }

  return deltas;
}

export async function compareMigrations({
  beforeSql,
  afterSql,
  settings,
  sourceFilename,
}: {
  beforeSql: string;
  afterSql: string;
  settings: AnalysisSettings;
  sourceFilename?: string;
}): Promise<MigrationComparisonResult> {
  const [before, after] = await Promise.all([
    runAnalysisPipeline({
      sql: beforeSql,
      settings,
      sourceFilename,
      runtime: { mode: "main-thread" },
    }),
    runAnalysisPipeline({
      sql: afterSql,
      settings,
      sourceFilename,
      runtime: { mode: "main-thread" },
    }),
  ]);

  const statementChanges = buildStatementChanges(before.statements, after.statements);
  const findingDeltas = buildFindingDeltas(before, after);

  return {
    before,
    after,
    statementChanges,
    findingDeltas,
    summary: {
      statementsAdded: statementChanges.filter((change) => change.type === "added").length,
      statementsRemoved: statementChanges.filter((change) => change.type === "removed").length,
      findingsAdded: findingDeltas.filter((delta) => delta.type === "added").length,
      findingsRemoved: findingDeltas.filter((delta) => delta.type === "removed").length,
      riskScoreDelta: after.summary.risk.score - before.summary.risk.score,
    },
  };
}
