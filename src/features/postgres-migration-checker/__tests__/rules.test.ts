import { describe, expect, it } from "vitest";
import { SECRET_DETECTION_RULE_ID } from "../analyzer/security/secretDetection";
import {
  analyzeSql,
  getFinding,
  hasFinding,
  loadFixtureSql,
} from "./testUtils";

describe("postgres migration analyzer rules", () => {
  it("covers an unsafe startup-style migration fixture with multiple risky findings", async () => {
    const result = await analyzeSql(
      loadFixtureSql("unsafe-startup-migration.sql"),
    );

    expect(result.statements).toHaveLength(3);
    expect(result.findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining([
        "PGM015_ADD_COLUMN_NOT_NULL_IMMEDIATE",
        "PGM016_ADD_COLUMN_WITH_DEFAULT_VERSION_AWARE",
        "PGM020_CREATE_INDEX_WITHOUT_CONCURRENTLY",
        "PGM023_ADD_FOREIGN_KEY_WITHOUT_NOT_VALID",
        "PGM031_MISSING_LOCK_TIMEOUT",
        "PGM039_MULTIPLE_RISKY_DDL_IN_ONE_MIGRATION",
      ]),
    );
  });

  it("covers a safer expand-contract fixture without immediate validation findings", async () => {
    const result = await analyzeSql(
      loadFixtureSql("safe-expand-contract-migration.sql"),
    );

    expect(hasFinding(result, "PGM024_VALIDATE_CONSTRAINT_LOCK_CONTEXT")).toBe(
      true,
    );
    expect(hasFinding(result, "PGM014_SET_NOT_NULL_SCAN")).toBe(true);
    expect(hasFinding(result, "PGM025_ADD_CHECK_WITHOUT_NOT_VALID")).toBe(
      false,
    );
    expect(hasFinding(result, "PGM031_MISSING_LOCK_TIMEOUT")).toBe(false);
  });

  it("covers a concurrent-index fixture that fails inside a transaction block", async () => {
    const result = await analyzeSql(
      loadFixtureSql("concurrent-index-transaction-failure.sql"),
    );

    expect(
      getFinding(result, "PGM021_CREATE_INDEX_CONCURRENTLY_IN_TRANSACTION")
        .severity,
    ).toBe("critical");
  });

  it("covers a large backfill fixture with multiple long-running DML warnings", async () => {
    const result = await analyzeSql(loadFixtureSql("large-backfill.sql"));
    const backfillFindings = result.findings.filter(
      (finding) => finding.ruleId === "PGM030_LONG_RUNNING_BACKFILL_IN_MIGRATION",
    );

    expect(backfillFindings).toHaveLength(3);
    expect(hasFinding(result, "PGM039_MULTIPLE_RISKY_DDL_IN_ONE_MIGRATION")).toBe(
      true,
    );
  });

  it("analyzes Rails-like SQL comments without breaking statement detection", async () => {
    const result = await analyzeSql(
      loadFixtureSql("rails-like-migration-comments.sql"),
    );

    expect(result.statements).toHaveLength(2);
    expect(hasFinding(result, "PGM015_ADD_COLUMN_NOT_NULL_IMMEDIATE")).toBe(
      true,
    );
    expect(hasFinding(result, "PGM016_ADD_COLUMN_WITH_DEFAULT_VERSION_AWARE")).toBe(
      true,
    );
    expect(hasFinding(result, "PGM021_CREATE_INDEX_CONCURRENTLY_IN_TRANSACTION")).toBe(
      false,
    );
  });

  it.each([
    {
      name: "DROP TABLE critical",
      sql: "DROP TABLE public.legacy_users;",
      ruleId: "PGM001_DROP_TABLE",
      severity: "critical",
    },
    {
      name: "DROP COLUMN critical",
      sql: "ALTER TABLE public.users DROP COLUMN nickname;",
      ruleId: "PGM011_DROP_COLUMN",
      severity: "critical",
    },
    {
      name: "rename table high",
      sql: "ALTER TABLE public.users RENAME TO app_users;",
      ruleId: "PGM012_RENAME_TABLE_OR_COLUMN",
      severity: "high",
    },
    {
      name: "rename column high",
      sql: "ALTER TABLE public.users RENAME COLUMN nickname TO display_name;",
      ruleId: "PGM012_RENAME_TABLE_OR_COLUMN",
      severity: "high",
    },
    {
      name: "alter column type rewrite high",
      sql: "ALTER TABLE public.users ALTER COLUMN id TYPE bigint USING id::bigint;",
      ruleId: "PGM013_ALTER_COLUMN_TYPE_REWRITE",
      severity: "high",
    },
    {
      name: "set not null scan warning",
      sql: "ALTER TABLE public.users ALTER COLUMN email SET NOT NULL;",
      ruleId: "PGM014_SET_NOT_NULL_SCAN",
      severity: "high",
    },
    {
      name: "create index without concurrently",
      sql: "CREATE INDEX users_email_idx ON public.users (email);",
      ruleId: "PGM020_CREATE_INDEX_WITHOUT_CONCURRENTLY",
      severity: "high",
    },
    {
      name: "drop index without concurrently",
      sql: "DROP INDEX public.users_email_idx;",
      ruleId: "PGM022_DROP_INDEX_WITHOUT_CONCURRENTLY",
      severity: "high",
    },
    {
      name: "add foreign key without not valid",
      sql: "ALTER TABLE public.orders ADD CONSTRAINT orders_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);",
      ruleId: "PGM023_ADD_FOREIGN_KEY_WITHOUT_NOT_VALID",
      severity: "high",
    },
    {
      name: "add check without not valid",
      sql: "ALTER TABLE public.users ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'disabled'));",
      ruleId: "PGM025_ADD_CHECK_WITHOUT_NOT_VALID",
      severity: "high",
    },
    {
      name: "unique or primary key direct constraint",
      sql: "ALTER TABLE public.users ADD CONSTRAINT users_email_key UNIQUE (email);",
      ruleId: "PGM026_ADD_UNIQUE_OR_PRIMARY_KEY_DIRECTLY",
      severity: "high",
    },
  ])("$name", async ({ sql, ruleId, severity }) => {
    const result = await analyzeSql(sql);

    expect(getFinding(result, ruleId).severity).toBe(severity);
  });

  it("flags TRUNCATE as destructive with ACCESS EXCLUSIVE and respects destructive mode", async () => {
    const defaultResult = await analyzeSql("TRUNCATE TABLE public.staging_webhooks;");
    const relaxedResult = await analyzeSql(
      "TRUNCATE TABLE public.staging_webhooks;",
      {
        flagDestructiveChanges: false,
      },
    );

    expect(getFinding(defaultResult, "PGM002_TRUNCATE_TABLE")).toMatchObject({
      severity: "critical",
      lockLevel: "ACCESS EXCLUSIVE",
    });
    expect(
      getFinding(relaxedResult, "PGM002_TRUNCATE_TABLE").severity,
    ).toBe("high");
  });

  it("changes ADD COLUMN DEFAULT severity between PostgreSQL 10 and 11+", async () => {
    const sql =
      "ALTER TABLE public.users ADD COLUMN status text DEFAULT 'active';";
    const legacyResult = await analyzeSql(sql, { postgresVersion: 10 });
    const modernResult = await analyzeSql(sql, { postgresVersion: 16 });

    expect(
      getFinding(legacyResult, "PGM016_ADD_COLUMN_WITH_DEFAULT_VERSION_AWARE")
        .severity,
    ).toBe("high");
    expect(
      getFinding(modernResult, "PGM016_ADD_COLUMN_WITH_DEFAULT_VERSION_AWARE")
        .severity,
    ).toBe("medium");
  });

  it("escalates volatile defaults to high severity", async () => {
    const result = await analyzeSql(
      "ALTER TABLE public.users ADD COLUMN external_id uuid DEFAULT gen_random_uuid();",
      {
        tableSizeProfile: "small",
      },
    );

    expect(
      getFinding(result, "PGM016_ADD_COLUMN_WITH_DEFAULT_VERSION_AWARE")
        .severity,
    ).toBe("high");
  });

  it("distinguishes explicit-transaction failures from framework-assumed ones for concurrent indexes", async () => {
    const explicitTransaction = await analyzeSql(`BEGIN;
CREATE INDEX CONCURRENTLY users_email_idx ON public.users (email);
COMMIT;`);
    const frameworkTransaction = await analyzeSql(
      "CREATE INDEX CONCURRENTLY users_email_idx ON public.users (email);",
      {
        frameworkPreset: "rails",
        assumeRunsInTransaction: true,
      },
    );

    expect(
      getFinding(
        explicitTransaction,
        "PGM021_CREATE_INDEX_CONCURRENTLY_IN_TRANSACTION",
      ).severity,
    ).toBe("critical");
    expect(
      getFinding(
        frameworkTransaction,
        "PGM021_CREATE_INDEX_CONCURRENTLY_IN_TRANSACTION",
      ).severity,
    ).toBe("high");
  });

  it("keeps VALIDATE CONSTRAINT informational on small tables and low on large ones", async () => {
    const sql =
      "ALTER TABLE public.orders VALIDATE CONSTRAINT orders_account_id_fkey;";
    const smallResult = await analyzeSql(sql, {
      tableSizeProfile: "small",
    });
    const largeResult = await analyzeSql(sql, {
      tableSizeProfile: "large",
    });

    expect(
      getFinding(smallResult, "PGM024_VALIDATE_CONSTRAINT_LOCK_CONTEXT")
        .severity,
    ).toBe("info");
    expect(
      getFinding(largeResult, "PGM024_VALIDATE_CONSTRAINT_LOCK_CONTEXT")
        .severity,
    ).toBe("low");
  });

  it("flags explicit primary keys added directly like direct unique constraints", async () => {
    const result = await analyzeSql(
      "ALTER TABLE public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);",
    );

    expect(
      getFinding(result, "PGM026_ADD_UNIQUE_OR_PRIMARY_KEY_DIRECTLY").severity,
    ).toBe("high");
  });

  it("finds risky unbounded updates and deletes only when locky work lacks timeout guardrails", async () => {
    const riskyWithoutTimeout = await analyzeSql(
      "CREATE INDEX users_email_idx ON public.users (email);",
    );
    const riskyWithTimeout = await analyzeSql(`SET lock_timeout = '5s';
SET statement_timeout = '15min';
CREATE INDEX users_email_idx ON public.users (email);`);
    const noRisk = await analyzeSql("SELECT 1;");

    expect(hasFinding(riskyWithoutTimeout, "PGM031_MISSING_LOCK_TIMEOUT")).toBe(
      true,
    );
    expect(hasFinding(riskyWithTimeout, "PGM031_MISSING_LOCK_TIMEOUT")).toBe(
      false,
    );
    expect(hasFinding(noRisk, "PGM031_MISSING_LOCK_TIMEOUT")).toBe(false);
  });

  it("flags enum changes that are unsafe in transaction-wrapped PostgreSQL 11 migrations", async () => {
    const result = await analyzeSql(`BEGIN;
ALTER TYPE order_state ADD VALUE 'archived';
COMMIT;`, {
      postgresVersion: 11,
    });

    expect(getFinding(result, "PGM033_ENUM_VALUE_CHANGE").severity).toBe("high");
  });

  it("flags VACUUM FULL and CLUSTER as heavyweight rewrite operations", async () => {
    const vacuumFull = await analyzeSql("VACUUM FULL public.users;");
    const cluster = await analyzeSql(
      "CLUSTER public.users USING users_email_idx;",
      {
        tableSizeProfile: "small",
      },
    );

    expect(
      getFinding(vacuumFull, "PGM035_VACUUM_FULL_OR_CLUSTER").severity,
    ).toBe("critical");
    expect(getFinding(cluster, "PGM035_VACUUM_FULL_OR_CLUSTER").severity).toBe(
      "high",
    );
  });

  it("creates secret-detection findings with redacted previews only", async () => {
    const sql = `-- github token: ghp_1234567890abcdefghijklmnopqrstuv
-- connection: postgres://deploy:super-secret-password@db.internal.example.com/app
ALTER TABLE public.users ADD COLUMN status text DEFAULT 'active';`;
    const result = await analyzeSql(sql);
    const secretFindings = result.findings.filter(
      (finding) => finding.ruleId === SECRET_DETECTION_RULE_ID,
    );

    expect(secretFindings.length).toBeGreaterThanOrEqual(2);
    expect(
      secretFindings.every((finding) =>
        finding.redactedPreview?.includes("[REDACTED_"),
      ),
    ).toBe(true);
    expect(JSON.stringify(secretFindings)).not.toContain(
      "super-secret-password",
    );
    expect(JSON.stringify(secretFindings)).not.toContain(
      "ghp_1234567890abcdefghijklmnopqrstuv",
    );
  });
});
