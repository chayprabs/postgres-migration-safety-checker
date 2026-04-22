import { describe, expect, it } from "vitest";
import type { AnalysisSettings, Finding } from "../../types";
import { getPostgresMigrationSample } from "../../samples";
import { runAnalysisPipeline } from "../analysisPipeline";

function createSettings(
  overrides: Partial<AnalysisSettings> = {},
): AnalysisSettings {
  return {
    postgresVersion: 16,
    frameworkPreset: "raw-sql",
    tableSizeProfile: "large",
    includeLowSeverityFindings: true,
    includeInfoFindings: true,
    includeSafeRewrites: true,
    assumeOnlineMigration: true,
    assumeRunsInTransaction: false,
    transactionAssumptionMode: "auto",
    flagDestructiveChanges: true,
    redactionMode: false,
    autoAnalyze: true,
    reportFormat: "markdown",
    stopAfterParseError: false,
    ...overrides,
  };
}

async function analyze(
  sql: string,
  overrides: Partial<AnalysisSettings> = {},
  sourceFilename?: string,
) {
  return runAnalysisPipeline({
    sql,
    sourceFilename,
    settings: createSettings(overrides),
    runtime: {
      mode: "main-thread",
    },
  });
}

function getFinding(result: { findings: Finding[] }, ruleId: string) {
  const finding = result.findings.find((candidate) => candidate.ruleId === ruleId);

  expect(finding, `${ruleId} should be present`).toBeDefined();
  return finding!;
}

describe("postgres migration rules", () => {
  it("unsafe sample triggers multiple real findings across categories", async () => {
    const sample = getPostgresMigrationSample("unsafe-add-default-and-index");

    expect(sample).not.toBeNull();

    const result = await analyze(sample!.sql);
    const ruleIds = result.findings.map((finding) => finding.ruleId);

    expect(ruleIds).toEqual(
      expect.arrayContaining([
        "PGM010_ALTER_TABLE_ACCESS_EXCLUSIVE_DEFAULT",
        "PGM015_ADD_COLUMN_NOT_NULL_IMMEDIATE",
        "PGM016_ADD_COLUMN_WITH_DEFAULT_VERSION_AWARE",
        "PGM020_CREATE_INDEX_WITHOUT_CONCURRENTLY",
        "PGM031_MISSING_LOCK_TIMEOUT",
        "PGM039_MULTIPLE_RISKY_DDL_IN_ONE_MIGRATION",
      ]),
    );
    expect(result.summary.totalFindings).toBeGreaterThanOrEqual(6);
    expect(result.summary.risk.highestLockLevel).toBe("ACCESS EXCLUSIVE");
  });

  it("changes default-related severity across PostgreSQL versions", async () => {
    const sql = "ALTER TABLE users ADD COLUMN status text DEFAULT 'active';";
    const legacyResult = await analyze(sql, { postgresVersion: 10 });
    const modernResult = await analyze(sql, { postgresVersion: 16 });

    expect(
      getFinding(legacyResult, "PGM016_ADD_COLUMN_WITH_DEFAULT_VERSION_AWARE")
        .severity,
    ).toBe("high");
    expect(
      getFinding(modernResult, "PGM016_ADD_COLUMN_WITH_DEFAULT_VERSION_AWARE")
        .severity,
    ).toBe("medium");
  });

  it("tunes ADD COLUMN default findings by table size and volatility", async () => {
    const nonVolatileSql =
      "ALTER TABLE users ADD COLUMN status text DEFAULT 'active';";
    const volatileSql =
      "ALTER TABLE users ADD COLUMN external_id uuid DEFAULT gen_random_uuid();";
    const smallResult = await analyze(nonVolatileSql, {
      postgresVersion: 16,
      tableSizeProfile: "small",
    });
    const veryLargeResult = await analyze(nonVolatileSql, {
      postgresVersion: 16,
      tableSizeProfile: "very-large",
    });
    const volatileResult = await analyze(volatileSql, {
      postgresVersion: 16,
      tableSizeProfile: "small",
    });

    expect(
      getFinding(smallResult, "PGM016_ADD_COLUMN_WITH_DEFAULT_VERSION_AWARE")
        .severity,
    ).toBe("low");
    expect(
      getFinding(veryLargeResult, "PGM016_ADD_COLUMN_WITH_DEFAULT_VERSION_AWARE")
        .severity,
    ).toBe("high");
    expect(
      getFinding(volatileResult, "PGM016_ADD_COLUMN_WITH_DEFAULT_VERSION_AWARE")
        .severity,
    ).toBe("high");
    expect(
      getFinding(smallResult, "PGM016_ADD_COLUMN_WITH_DEFAULT_VERSION_AWARE")
        .confidence,
    ).toBe("medium");
    expect(
      getFinding(volatileResult, "PGM016_ADD_COLUMN_WITH_DEFAULT_VERSION_AWARE")
        .confidence,
    ).toBe("high");
  });

  it("framework or explicit transactions affect concurrent index warnings", async () => {
    const explicitTransactionSql = `BEGIN;
CREATE INDEX CONCURRENTLY index_users_on_email ON users (email);
COMMIT;`;
    const explicitResult = await analyze(explicitTransactionSql);
    const frameworkResult = await analyze(
      "CREATE INDEX CONCURRENTLY index_users_on_email ON users (email);",
      {
        frameworkPreset: "rails",
        assumeRunsInTransaction: true,
      },
    );
    const rawSqlResult = await analyze(
      "CREATE INDEX CONCURRENTLY index_users_on_email ON users (email);",
    );

    expect(
      getFinding(explicitResult, "PGM021_CREATE_INDEX_CONCURRENTLY_IN_TRANSACTION")
        .severity,
    ).toBe("critical");
    expect(
      getFinding(frameworkResult, "PGM021_CREATE_INDEX_CONCURRENTLY_IN_TRANSACTION")
        .severity,
    ).toBe("high");
    expect(
      getFinding(frameworkResult, "PGM021_CREATE_INDEX_CONCURRENTLY_IN_TRANSACTION")
        .recommendedAction,
    ).toContain("disable_ddl_transaction!");
    expect(
      rawSqlResult.findings.some(
        (finding) =>
          finding.ruleId === "PGM021_CREATE_INDEX_CONCURRENTLY_IN_TRANSACTION",
      ),
    ).toBe(false);
  });

  it("flags index and constraint rollout patterns with copyable rewrites", async () => {
    const sql = `CREATE UNIQUE INDEX users_email_lower_idx
  ON users ((lower(email))) WHERE deleted_at IS NULL;
DROP INDEX users_email_lower_idx;
ALTER TABLE orders
  ADD CONSTRAINT orders_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id);
ALTER TABLE orders VALIDATE CONSTRAINT orders_account_id_fkey;
ALTER TABLE users
  ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'disabled'));
ALTER TABLE users
  ADD CONSTRAINT users_email_key UNIQUE (email);
ALTER TABLE users
  ADD CONSTRAINT users_pkey PRIMARY KEY (id);`;
    const result = await analyze(sql);

    expect(result.findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining([
        "PGM020_CREATE_INDEX_WITHOUT_CONCURRENTLY",
        "PGM022_DROP_INDEX_WITHOUT_CONCURRENTLY",
        "PGM023_ADD_FOREIGN_KEY_WITHOUT_NOT_VALID",
        "PGM024_VALIDATE_CONSTRAINT_LOCK_CONTEXT",
        "PGM025_ADD_CHECK_WITHOUT_NOT_VALID",
        "PGM026_ADD_UNIQUE_OR_PRIMARY_KEY_DIRECTLY",
      ]),
    );
    expect(
      getFinding(result, "PGM023_ADD_FOREIGN_KEY_WITHOUT_NOT_VALID").safeRewrite,
    ).toBeDefined();
    expect(
      getFinding(result, "PGM025_ADD_CHECK_WITHOUT_NOT_VALID").safeRewrite,
    ).toBeDefined();
    expect(
      getFinding(result, "PGM026_ADD_UNIQUE_OR_PRIMARY_KEY_DIRECTLY").safeRewrite,
    ).toBeDefined();
  });

  it("escalates scans and blocking index paths on larger tables", async () => {
    const setNotNullSql = "ALTER TABLE users ALTER COLUMN email SET NOT NULL;";
    const createIndexSql = "CREATE INDEX index_users_on_email ON users (email);";
    const addUniqueSql =
      "ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);";

    const smallSetNotNull = await analyze(setNotNullSql, {
      tableSizeProfile: "small",
    });
    const largeSetNotNull = await analyze(setNotNullSql, {
      tableSizeProfile: "large",
    });
    const smallCreateIndex = await analyze(createIndexSql, {
      tableSizeProfile: "small",
    });
    const largeCreateIndex = await analyze(createIndexSql, {
      tableSizeProfile: "large",
    });
    const smallAddUnique = await analyze(addUniqueSql, {
      tableSizeProfile: "small",
    });
    const largeAddUnique = await analyze(addUniqueSql, {
      tableSizeProfile: "large",
    });

    expect(getFinding(smallSetNotNull, "PGM014_SET_NOT_NULL_SCAN").severity).toBe(
      "medium",
    );
    expect(getFinding(largeSetNotNull, "PGM014_SET_NOT_NULL_SCAN").severity).toBe(
      "high",
    );
    expect(
      getFinding(largeSetNotNull, "PGM014_SET_NOT_NULL_SCAN").confidence,
    ).toBe("medium");
    expect(
      getFinding(smallCreateIndex, "PGM020_CREATE_INDEX_WITHOUT_CONCURRENTLY")
        .severity,
    ).toBe("medium");
    expect(
      getFinding(largeCreateIndex, "PGM020_CREATE_INDEX_WITHOUT_CONCURRENTLY")
        .severity,
    ).toBe("high");
    expect(
      getFinding(smallAddUnique, "PGM026_ADD_UNIQUE_OR_PRIMARY_KEY_DIRECTLY")
        .severity,
    ).toBe("medium");
    expect(
      getFinding(largeAddUnique, "PGM026_ADD_UNIQUE_OR_PRIMARY_KEY_DIRECTLY")
        .severity,
    ).toBe("high");
  });

  it("adds lock-timeout guidance only when risky locking work lacks it", async () => {
    const riskyWithoutTimeout = await analyze(
      "CREATE INDEX index_users_on_email ON users (email);",
    );
    const riskyWithTimeout = await analyze(`SET lock_timeout = '5s';
SET statement_timeout = '5min';
CREATE INDEX index_users_on_email ON users (email);`);
    const noRisk = await analyze("SELECT 1;");

    expect(
      riskyWithoutTimeout.findings.some(
        (finding) => finding.ruleId === "PGM031_MISSING_LOCK_TIMEOUT",
      ),
    ).toBe(true);
    expect(
      riskyWithTimeout.findings.some(
        (finding) => finding.ruleId === "PGM031_MISSING_LOCK_TIMEOUT",
      ),
    ).toBe(false);
    expect(
      noRisk.findings.some(
        (finding) => finding.ruleId === "PGM031_MISSING_LOCK_TIMEOUT",
      ),
    ).toBe(false);
  });

  it("detects enum, trigger, locking, bulk backfill, and destructive drop gotchas", async () => {
    const sql = `LOCK TABLE users;
ALTER TYPE order_state ADD VALUE 'archived';
ALTER TYPE order_state RENAME VALUE 'pending_review' TO 'awaiting_review';
CREATE TRIGGER users_audit_trigger
  AFTER UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION audit_users();
UPDATE users SET normalized_email = lower(email);
CREATE TABLE archived_users AS SELECT * FROM users;
VACUUM FULL users;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
DROP SCHEMA legacy_reporting CASCADE;`;
    const result = await analyze(sql);
    const ruleIds = result.findings.map((finding) => finding.ruleId);

    expect(ruleIds).toEqual(
      expect.arrayContaining([
        "PGM030_LONG_RUNNING_BACKFILL_IN_MIGRATION",
        "PGM032_LOCK_TABLE_EXPLICIT",
        "PGM033_ENUM_VALUE_CHANGE",
        "PGM034_CREATE_TRIGGER_OR_ENABLE_TRIGGER",
        "PGM035_VACUUM_FULL_OR_CLUSTER",
        "PGM036_CREATE_EXTENSION",
        "PGM037_DROP_TYPE_OR_DROP_SCHEMA",
        "PGM038_CREATE_TABLE_AS_SELECT",
      ]),
    );
    expect(
      getFinding(result, "PGM030_LONG_RUNNING_BACKFILL_IN_MIGRATION").safeRewrite,
    ).toBeDefined();
    expect(
      getFinding(result, "PGM033_ENUM_VALUE_CHANGE").safeRewrite,
    ).toBeDefined();
  });

  it("adds Django-specific non-atomic guidance for concurrent indexes", async () => {
    const result = await analyze(
      "CREATE INDEX CONCURRENTLY index_users_on_email ON users (email);",
      {
        frameworkPreset: "django",
        assumeRunsInTransaction: true,
      },
    );

    expect(
      getFinding(result, "PGM021_CREATE_INDEX_CONCURRENTLY_IN_TRANSACTION")
        .recommendedAction,
    ).toContain("atomic = False");
  });

  it("honors Goose NO TRANSACTION annotations in auto mode", async () => {
    const result = await analyze(
      `-- +goose NO TRANSACTION
CREATE INDEX CONCURRENTLY index_users_on_email ON users (email);`,
      {
        frameworkPreset: "goose",
        assumeRunsInTransaction: true,
      },
      "202604220915_add_users_email_index.sql",
    );

    expect(result.metadata.framework.effectiveAssumeTransaction).toBe(false);
    expect(result.metadata.framework.detectedSignals).toEqual(
      expect.arrayContaining(["Detected -- +goose NO TRANSACTION annotation."]),
    );
    expect(
      result.findings.some(
        (finding) =>
          finding.ruleId === "PGM021_CREATE_INDEX_CONCURRENTLY_IN_TRANSACTION",
      ),
    ).toBe(false);
  });

  it("includes result metadata, parser version, and limitations", async () => {
    const result = await analyze(
      "CREATE INDEX index_users_on_email ON users (email);",
      {
        postgresVersion: 11,
        frameworkPreset: "rails",
        tableSizeProfile: "unknown",
        assumeRunsInTransaction: true,
      },
    );

    expect(result.metadata.postgresVersionUsed).toBe(11);
    expect(result.metadata.parserVersionUsed).toBe(15);
    expect(result.metadata.tableSizeProfile).toBe("unknown");
    expect(result.metadata.frameworkPreset).toBe("rails");
    expect(result.metadata.rulesRun.length).toBeGreaterThan(0);
    expect(result.metadata.rulesSkipped).toEqual([]);
    expect(result.metadata.analysisDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.limitations).toEqual(
      expect.arrayContaining([
        "Actual row count",
        "Existing indexes or constraints",
        "Real lock wait conditions",
        "Replication lag",
        "Application deploy order",
        "Database extensions and exact function volatility",
      ]),
    );
  });

  it("marks heuristic advisory findings with lower confidence", async () => {
    const result = await analyze(
      "CREATE TABLE archived_users AS SELECT * FROM users;",
    );

    expect(
      getFinding(result, "PGM038_CREATE_TABLE_AS_SELECT").confidence,
    ).toBe("low");
  });
});
