import type {
  Finding,
  FindingSeverity,
  LockLevel,
  MigrationStatement,
  TableSizeProfile,
} from "../../types";
import { POSTGRES_DOCS } from "../docsLinks";
import { appendFrameworkAdvice } from "../frameworkContext";
import {
  SAFE_REWRITE_ADD_CHECK_NOT_VALID,
  SAFE_REWRITE_ADD_COLUMN_NOT_NULL,
  SAFE_REWRITE_ADD_COLUMN_WITH_DEFAULT,
  SAFE_REWRITE_ADD_FOREIGN_KEY_NOT_VALID,
  SAFE_REWRITE_ADD_PRIMARY_KEY_USING_INDEX,
  SAFE_REWRITE_ADD_UNIQUE_USING_INDEX,
  SAFE_REWRITE_ALTER_COLUMN_TYPE,
  SAFE_REWRITE_BATCHED_BACKFILL,
  SAFE_REWRITE_CREATE_INDEX_CONCURRENTLY,
  SAFE_REWRITE_DROP_COLUMN,
  SAFE_REWRITE_DROP_CONSTRAINT,
  SAFE_REWRITE_DROP_INDEX_CONCURRENTLY,
  SAFE_REWRITE_LOCK_TIMEOUT_PREAMBLE,
  SAFE_REWRITE_REFRESH_MATERIALIZED_VIEW_CONCURRENTLY,
  SAFE_REWRITE_REINDEX_CONCURRENTLY,
  SAFE_REWRITE_RENAME_COLUMN,
  SAFE_REWRITE_RENAME_TABLE,
  SAFE_REWRITE_SAFE_ENUM_DEPLOYMENT,
  SAFE_REWRITE_SET_NOT_NULL,
  SAFE_REWRITE_SPLIT_RISKY_MIGRATION,
} from "../safeRewrites";
import type { AnalyzerRule, AnalyzerRuleContext } from "./types";

function isAlterTableStatement(normalizedSql: string) {
  return /^ALTER\s+TABLE\b/i.test(normalizedSql);
}

function matchesPattern(normalizedSql: string, pattern: RegExp) {
  return pattern.test(normalizedSql);
}

function getTableSizeRank(tableSizeProfile: TableSizeProfile) {
  switch (tableSizeProfile) {
    case "small":
      return 0;
    case "unknown":
    case "medium":
      return 1;
    case "large":
      return 2;
    case "very-large":
      return 3;
  }
}

function isLargeTableProfile(tableSizeProfile: TableSizeProfile) {
  return tableSizeProfile === "large" || tableSizeProfile === "very-large";
}

function isVeryLargeTableProfile(tableSizeProfile: TableSizeProfile) {
  return tableSizeProfile === "very-large";
}

function getMediumHighSeverity(tableSizeProfile: TableSizeProfile) {
  return isLargeTableProfile(tableSizeProfile) ? "high" : "medium";
}

function getInfoLowSeverity(tableSizeProfile: TableSizeProfile) {
  return isLargeTableProfile(tableSizeProfile) ? "low" : "info";
}

function getAlterTableContextSeverity(
  context: AnalyzerRuleContext,
  normalizedSql: string,
): FindingSeverity {
  const largeTable = isLargeTableProfile(context.settings.tableSizeProfile);
  const dangerousOperation =
    /\bDROP\s+COLUMN\b/i.test(normalizedSql) ||
    /\bDROP\s+CONSTRAINT\b/i.test(normalizedSql) ||
    /\bALTER\s+COLUMN\b[\s\S]*\b(?:SET\s+DATA\s+TYPE|TYPE)\b/i.test(normalizedSql) ||
    /\bALTER\s+COLUMN\b[\s\S]*\bSET\s+NOT\s+NULL\b/i.test(normalizedSql) ||
    /\bADD\s+COLUMN\b[\s\S]*\bNOT\s+NULL\b/i.test(normalizedSql) ||
    /\bADD\s+COLUMN\b[\s\S]*\bDEFAULT\b/i.test(normalizedSql) ||
    /\bADD\b[\s\S]*\bFOREIGN\s+KEY\b/i.test(normalizedSql) ||
    /\bADD\s+CONSTRAINT\b[\s\S]*\bCHECK\s*\(/i.test(normalizedSql) ||
    /\bADD\s+CONSTRAINT\b[\s\S]*\b(?:UNIQUE|PRIMARY\s+KEY|EXCLUDE\s+USING)\b/i.test(
      normalizedSql,
    );

  if (dangerousOperation && largeTable) {
    return "high";
  }

  if (dangerousOperation || largeTable) {
    return "medium";
  }

  return "info";
}

function isHeuristicallyVolatileDefault(normalizedSql: string) {
  return [
    /\bCLOCK_TIMESTAMP\s*\(/i,
    /\bRANDOM\s*\(/i,
    /\bGEN_RANDOM_UUID\s*\(/i,
    /\bUUID_GENERATE_V4\s*\(/i,
    /\bNEXTVAL\s*\(/i,
  ].some((pattern) => pattern.test(normalizedSql));
}

function hasStoredGeneratedColumn(normalizedSql: string) {
  return /\bADD\s+COLUMN\b[\s\S]*\bGENERATED\s+ALWAYS\s+AS\s*\([\s\S]*\)\s+STORED\b/i.test(
    normalizedSql,
  );
}

function hasIdentityColumn(normalizedSql: string) {
  return /\bADD\s+COLUMN\b[\s\S]*\bGENERATED\b[\s\S]*\bAS\s+IDENTITY\b/i.test(
    normalizedSql,
  );
}

function normalizeIdentifierForComparison(value: string) {
  return value.replace(/"/g, "").replace(/\s+/g, "").toLowerCase();
}

function extractCreateIndexRelation(normalizedSql: string) {
  const match = normalizedSql.match(
    /\bON\s+((?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)(?:\s*\.\s*(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*))?)/i,
  );

  return match?.[1]?.replace(/\s+/g, "");
}

function isClearlyTemporaryRelation(relationName?: string) {
  if (!relationName) {
    return false;
  }

  const normalized = normalizeIdentifierForComparison(relationName);

  return normalized.startsWith("pg_temp.") || /^pg_temp_\d+\./.test(normalized);
}

function getFrameworkIndexAdvice(
  context: AnalyzerRuleContext,
  includeTransactionHint = false,
) {
  if (includeTransactionHint) {
    return (
      context.framework.transactionDisableHint ??
      context.framework.safeIndexAdvice
    );
  }

  return context.framework.safeIndexAdvice;
}

function getFrameworkConstraintAdvice(context: AnalyzerRuleContext) {
  return context.framework.safeConstraintAdvice;
}

function hasTimeoutSetting(
  statements: readonly MigrationStatement[],
  settingName: "lock_timeout" | "statement_timeout",
) {
  return statements.some((statement) =>
    matchesPattern(
      statement.normalized,
      new RegExp(`\\bSET(?:\\s+LOCAL)?\\s+${settingName}\\b`, "i"),
    ),
  );
}

function parseLockMode(normalizedSql: string): LockLevel {
  const match = normalizedSql.match(
    /\bIN\s+(ACCESS\s+SHARE|ROW\s+SHARE|ROW\s+EXCLUSIVE|SHARE\s+UPDATE\s+EXCLUSIVE|SHARE\s+ROW\s+EXCLUSIVE|ACCESS\s+EXCLUSIVE|SHARE|EXCLUSIVE)\s+MODE\b/i,
  );

  return (match?.[1]?.replace(/\s+/g, " ").toUpperCase() as LockLevel) ??
    "ACCESS EXCLUSIVE";
}

function compareFindings(left: Finding, right: Finding) {
  return (
    left.statementIndex - right.statementIndex ||
    (left.lineStart ?? 0) - (right.lineStart ?? 0) ||
    left.ruleId.localeCompare(right.ruleId)
  );
}

function isHighOrCriticalFinding(finding: Finding) {
  return finding.severity === "high" || finding.severity === "critical";
}

export const PGM001_DROP_TABLE: AnalyzerRule = {
  id: "PGM001_DROP_TABLE",
  title: "DROP TABLE can cause irreversible data loss",
  category: "data-loss",
  defaultSeverity: "critical",
  docsLinks: [POSTGRES_DOCS.dropTable, POSTGRES_DOCS.explicitLocking],
  evaluate(context) {
    if (!context.settings.flagDestructiveChanges) {
      return [];
    }

    return context.statements
      .filter((statement) => statement.kind === "drop-table")
      .map((statement) =>
        context.helpers.createFinding(PGM001_DROP_TABLE, {
          statement,
          summary:
            "DROP TABLE removes the relation and its data immediately, making rollback and recovery operationally expensive.",
          whyItMatters:
            "Production review usually treats table drops as irreversible unless a restore plan, dual-write window, or archival strategy already exists.",
          recommendedAction:
            "Stage destructive cleanup behind an expand-contract rollout, confirm backups and restore drills, and separate the final DROP TABLE from lower-risk schema changes.",
          tags: ["destructive", "drop-table", "data-loss"],
        }),
      );
  },
};

export const PGM002_TRUNCATE_TABLE: AnalyzerRule = {
  id: "PGM002_TRUNCATE_TABLE",
  title: "TRUNCATE is destructive and takes ACCESS EXCLUSIVE",
  category: "data-loss",
  defaultSeverity: "critical",
  docsLinks: [POSTGRES_DOCS.truncate, POSTGRES_DOCS.explicitLocking],
  evaluate(context) {
    return context.statements
      .filter((statement) => statement.kind === "truncate")
      .map((statement) =>
        context.helpers.createFinding(PGM002_TRUNCATE_TABLE, {
          statement,
          severity: context.settings.flagDestructiveChanges ? "critical" : "high",
          lockLevel: "ACCESS EXCLUSIVE",
          summary:
            "TRUNCATE removes all rows without scanning them and takes an ACCESS EXCLUSIVE lock on the target relation.",
          whyItMatters:
            "That combination makes TRUNCATE both destructive and downtime-sensitive on busy systems because reads and writes wait behind the lock.",
          recommendedAction:
            "Use TRUNCATE only for intentional bulk data removal during controlled maintenance windows, or replace it with batched deletes when online availability matters more than speed.",
          tags: ["destructive", "truncate", "access-exclusive"],
        }),
      );
  },
};

export const PGM010_ALTER_TABLE_ACCESS_EXCLUSIVE_DEFAULT: AnalyzerRule = {
  id: "PGM010_ALTER_TABLE_ACCESS_EXCLUSIVE_DEFAULT",
  title: "ALTER TABLE often defaults to ACCESS EXCLUSIVE locking",
  category: "locking",
  defaultSeverity: "info",
  docsLinks: [POSTGRES_DOCS.alterTable, POSTGRES_DOCS.explicitLocking],
  evaluate(context) {
    return context.statements
      .filter((statement) => isAlterTableStatement(statement.normalized))
      .map((statement) =>
        context.helpers.createFinding(PGM010_ALTER_TABLE_ACCESS_EXCLUSIVE_DEFAULT, {
          statement,
          severity: getAlterTableContextSeverity(context, statement.normalized),
          confidence: "medium",
          summary:
            "Many ALTER TABLE forms take ACCESS EXCLUSIVE unless PostgreSQL documents a lighter lock for that exact subcommand.",
          whyItMatters:
            "ACCESS EXCLUSIVE blocks reads and writes, so even a short metadata change can become visible downtime if it waits behind production traffic.",
          recommendedAction:
            "Check the exact ALTER TABLE variant in the PostgreSQL docs, and prefer phased validation or expand-contract patterns when the relation is large or highly active.",
          tags: ["locking", "access-exclusive", "contextual"],
        }),
      );
  },
};

export const PGM011_DROP_COLUMN: AnalyzerRule = {
  id: "PGM011_DROP_COLUMN",
  title: "DROP COLUMN is fast metadata DDL but destructive to application compatibility",
  category: "data-loss",
  defaultSeverity: "critical",
  docsLinks: [POSTGRES_DOCS.alterTable, POSTGRES_DOCS.ddlAlter],
  evaluate(context) {
    return context.statements
      .filter(
        (statement) =>
          isAlterTableStatement(statement.normalized) &&
          matchesPattern(statement.normalized, /\bDROP\s+COLUMN\b/i),
      )
      .map((statement) =>
        context.helpers.createFinding(PGM011_DROP_COLUMN, {
          statement,
          severity: context.settings.flagDestructiveChanges ? "critical" : "high",
          lockLevel: "ACCESS EXCLUSIVE",
          safeRewrite: SAFE_REWRITE_DROP_COLUMN,
          summary:
            "ALTER TABLE ... DROP COLUMN removes the column definition quickly, but it is still an irreversible contract change from the application's perspective.",
          whyItMatters:
            "Older app nodes, jobs, and admin scripts can still read or write the dropped column during a rolling deploy, and recovering the data path later is expensive.",
          recommendedAction:
            "Ignore the column in application code first, wait until the old path is fully retired, verify backups, and drop the column only in a later cleanup migration.",
          tags: ["destructive", "drop-column", "access-exclusive"],
        }),
      );
  },
};

export const PGM012_RENAME_TABLE_OR_COLUMN: AnalyzerRule = {
  id: "PGM012_RENAME_TABLE_OR_COLUMN",
  title: "Renames break rolling deploy compatibility",
  category: "framework",
  defaultSeverity: "high",
  docsLinks: [POSTGRES_DOCS.alterTable, POSTGRES_DOCS.ddlAlter],
  evaluate(context) {
    return context.statements
      .filter(
        (statement) =>
          isAlterTableStatement(statement.normalized) &&
          (matchesPattern(statement.normalized, /\bRENAME\s+COLUMN\b/i) ||
            matchesPattern(statement.normalized, /\bRENAME\s+TO\b/i)),
      )
      .map((statement) => {
        const renameColumn = matchesPattern(
          statement.normalized,
          /\bRENAME\s+COLUMN\b/i,
        );

        return context.helpers.createFinding(PGM012_RENAME_TABLE_OR_COLUMN, {
          statement,
          severity: "high",
          lockLevel: "ACCESS EXCLUSIVE",
          safeRewrite: renameColumn
            ? SAFE_REWRITE_RENAME_COLUMN
            : SAFE_REWRITE_RENAME_TABLE,
          summary: renameColumn
            ? "Renaming a column breaks older application versions that still reference the old name during a rolling deploy."
            : "Renaming a table breaks older application versions, background jobs, and ad hoc queries that still expect the previous relation name.",
          whyItMatters:
            "The SQL itself may look small, but name changes are compatibility breaks that can surface immediately while mixed application versions are still live.",
          recommendedAction:
            "Prefer additive compatibility patterns such as dual-writing to a new column or providing a compatibility layer until every runtime component has moved to the new name.",
          tags: ["rename", "application-compatibility", "access-exclusive"],
        });
      });
  },
};

export const PGM013_ALTER_COLUMN_TYPE_REWRITE: AnalyzerRule = {
  id: "PGM013_ALTER_COLUMN_TYPE_REWRITE",
  title: "ALTER COLUMN TYPE often rewrites the table",
  category: "rewrite",
  defaultSeverity: "high",
  docsLinks: [POSTGRES_DOCS.alterTable, POSTGRES_DOCS.ddlAlter],
  evaluate(context) {
    return context.statements
      .filter(
        (statement) =>
          isAlterTableStatement(statement.normalized) &&
          matchesPattern(
            statement.normalized,
            /\bALTER\s+COLUMN\b[\s\S]*\b(?:SET\s+DATA\s+TYPE|TYPE)\b/i,
          ),
      )
      .map((statement) =>
        context.helpers.createFinding(PGM013_ALTER_COLUMN_TYPE_REWRITE, {
          statement,
          severity: isVeryLargeTableProfile(context.settings.tableSizeProfile)
            ? "critical"
            : "high",
          lockLevel: "ACCESS EXCLUSIVE",
          confidence: matchesPattern(statement.normalized, /\bUSING\b/i)
            ? "high"
            : "medium",
          safeRewrite: SAFE_REWRITE_ALTER_COLUMN_TYPE,
          summary:
            "ALTER TABLE ... ALTER COLUMN ... TYPE usually rewrites the table and its indexes, especially when rows need value conversion.",
          whyItMatters:
            "A full rewrite scales poorly on large relations, holds stronger locks, and can dramatically extend deployment time. Some binary-coercible type changes avoid rewrites, so this rule stays cautious when the exact cast behavior is unclear.",
          recommendedAction:
            "Prefer an expand-contract migration: add a new nullable column, backfill in batches, dual-write in the application, switch reads, and drop the old column later.",
          tags: ["rewrite-risk", "type-change", "access-exclusive"],
        }),
      );
  },
};

export const PGM014_SET_NOT_NULL_SCAN: AnalyzerRule = {
  id: "PGM014_SET_NOT_NULL_SCAN",
  title: "SET NOT NULL can require a verification scan",
  category: "constraint",
  defaultSeverity: "medium",
  docsLinks: [POSTGRES_DOCS.alterTable, POSTGRES_DOCS.constraints],
  evaluate(context) {
    return context.statements
      .filter(
        (statement) =>
          isAlterTableStatement(statement.normalized) &&
          matchesPattern(
            statement.normalized,
            /\bALTER\s+COLUMN\b[\s\S]*\bSET\s+NOT\s+NULL\b/i,
          ),
      )
      .map((statement) =>
        context.helpers.createFinding(PGM014_SET_NOT_NULL_SCAN, {
          statement,
          severity: isLargeTableProfile(context.settings.tableSizeProfile)
            ? "high"
            : "medium",
          lockLevel: "ACCESS EXCLUSIVE",
          safeRewrite: SAFE_REWRITE_SET_NOT_NULL,
          summary:
            "ALTER COLUMN ... SET NOT NULL can scan the table to verify that no existing rows violate the invariant.",
          whyItMatters:
            "Verification work grows with table size, and the surrounding ALTER TABLE lock can become disruptive on busy production tables.",
          recommendedAction:
            "Backfill NULL rows first, add a CHECK (col IS NOT NULL) NOT VALID constraint, validate it, and then set NOT NULL once the invariant is already proven.",
          tags: ["table-scan", "not-null", "access-exclusive"],
        }),
      );
  },
};

export const PGM015_ADD_COLUMN_NOT_NULL_IMMEDIATE: AnalyzerRule = {
  id: "PGM015_ADD_COLUMN_NOT_NULL_IMMEDIATE",
  title: "Adding a NOT NULL column immediately is rollout-hostile",
  category: "constraint",
  defaultSeverity: "high",
  docsLinks: [POSTGRES_DOCS.alterTable, POSTGRES_DOCS.constraints],
  evaluate(context) {
    return context.statements
      .filter(
        (statement) =>
          isAlterTableStatement(statement.normalized) &&
          matchesPattern(
            statement.normalized,
            /\bADD\s+COLUMN\b[\s\S]*\bNOT\s+NULL\b/i,
          ),
      )
      .map((statement) =>
        context.helpers.createFinding(PGM015_ADD_COLUMN_NOT_NULL_IMMEDIATE, {
          statement,
          severity: "high",
          lockLevel: "ACCESS EXCLUSIVE",
          safeRewrite: SAFE_REWRITE_ADD_COLUMN_NOT_NULL,
          summary:
            "Adding a NOT NULL column to an existing table immediately requires every existing row to satisfy the invariant, which the migration cannot safely assume.",
          whyItMatters:
            "Even when PostgreSQL can represent the new column efficiently, the rollout is fragile because existing rows and old application versions may not be ready for the required value yet.",
          recommendedAction:
            "Add the column as nullable first, backfill deliberately, validate the invariant, and set NOT NULL only after the data and application are ready.",
          tags: ["add-column", "not-null", "access-exclusive"],
        }),
      );
  },
};

export const PGM016_ADD_COLUMN_WITH_DEFAULT_VERSION_AWARE: AnalyzerRule = {
  id: "PGM016_ADD_COLUMN_WITH_DEFAULT_VERSION_AWARE",
  title: "ADD COLUMN with DEFAULT is version- and expression-sensitive",
  category: "rewrite",
  defaultSeverity: "medium",
  docsLinks: [
    POSTGRES_DOCS.alterTable,
    POSTGRES_DOCS.ddlAlter,
    POSTGRES_DOCS.generatedColumns,
  ],
  evaluate(context) {
    return context.statements
      .filter(
        (statement) =>
          isAlterTableStatement(statement.normalized) &&
          (matchesPattern(
            statement.normalized,
            /\bADD\s+COLUMN\b[\s\S]*\bDEFAULT\b/i,
          ) ||
            hasStoredGeneratedColumn(statement.normalized) ||
            hasIdentityColumn(statement.normalized)),
      )
      .map((statement) => {
        const heuristicallyVolatile = isHeuristicallyVolatileDefault(
          statement.normalized,
        );
        const storedGeneratedColumn = hasStoredGeneratedColumn(statement.normalized);
        const identityColumn = hasIdentityColumn(statement.normalized);
        const largeTable = getTableSizeRank(context.settings.tableSizeProfile) >= 2;
        const riskyDefaultPath =
          context.settings.postgresVersion <= 10 ||
          heuristicallyVolatile ||
          storedGeneratedColumn ||
          identityColumn;

        let severity: FindingSeverity;
        let summary: string;
        let whyItMatters: string;
        let confidence: "high" | "medium" = "medium";

        if (context.settings.postgresVersion <= 10) {
          severity = "high";
          summary =
            "On PostgreSQL 10 and earlier, adding a column with a default usually rewrites the table, which is risky on production-sized relations.";
          whyItMatters =
            "A rewrite-heavy ADD COLUMN can hold stronger locks longer than teams expect and turn a simple-looking schema change into a disruptive deploy.";
          confidence = "high";
        } else if (heuristicallyVolatile || storedGeneratedColumn || identityColumn) {
          severity = "high";
          summary = heuristicallyVolatile
            ? "This ADD COLUMN default looks volatile, so PostgreSQL may need to touch or rewrite existing rows even on modern versions."
            : storedGeneratedColumn
              ? "Stored generated columns materialize values for existing rows, so adding one can be rewrite-heavy."
              : "Identity-backed column additions can still require heavier table work than the usual PostgreSQL 11+ fast-default path.";
          whyItMatters =
            "Modern PostgreSQL avoids rewrites for many non-volatile defaults, but volatile expressions and stored/generated behaviors are important exceptions.";
        } else {
          severity = largeTable ? "medium" : "low";
          summary =
            "On PostgreSQL 11+, many non-volatile ADD COLUMN ... DEFAULT changes are metadata-only, but the operational profile still deserves review on large tables.";
          whyItMatters =
            "The fast-default optimization makes this safer than older PostgreSQL releases, yet the tool cannot prove every edge case such as constrained domains or deployment-specific compatibility assumptions.";
        }

        return context.helpers.createFinding(
          PGM016_ADD_COLUMN_WITH_DEFAULT_VERSION_AWARE,
          {
            statement,
            severity,
            lockLevel: largeTable ? "ACCESS EXCLUSIVE" : undefined,
            confidence,
            safeRewrite: SAFE_REWRITE_ADD_COLUMN_WITH_DEFAULT,
            summary,
            whyItMatters,
            recommendedAction:
              "For risky defaults, separate the add, backfill, and default steps so existing rows are updated deliberately and the deploy remains reversible.",
            tags: [
              "add-column",
              "default",
              ...(riskyDefaultPath ? ["rewrite-risk"] : ["default-fast-path"]),
              ...(heuristicallyVolatile ? ["volatile-default"] : []),
            ],
          },
        );
      });
  },
};

export const PGM017_DROP_CONSTRAINT: AnalyzerRule = {
  id: "PGM017_DROP_CONSTRAINT",
  title: "Dropping a constraint removes a data integrity guardrail",
  category: "constraint",
  defaultSeverity: "medium",
  docsLinks: [POSTGRES_DOCS.alterTable, POSTGRES_DOCS.constraints],
  evaluate(context) {
    return context.statements
      .filter(
        (statement) =>
          isAlterTableStatement(statement.normalized) &&
          matchesPattern(statement.normalized, /\bDROP\s+CONSTRAINT\b/i),
      )
      .map((statement) =>
        context.helpers.createFinding(PGM017_DROP_CONSTRAINT, {
          statement,
          severity: context.settings.flagDestructiveChanges ? "high" : "medium",
          lockLevel: "ACCESS EXCLUSIVE",
          safeRewrite: SAFE_REWRITE_DROP_CONSTRAINT,
          summary:
            "DROP CONSTRAINT removes a database-enforced integrity rule, which can allow invalid data to enter the system immediately.",
          whyItMatters:
            "Application code and background jobs often rely on the constraint as a last line of defense. Once it is gone, bad writes can succeed before the replacement validation path is ready.",
          recommendedAction:
            "If the rule is being changed rather than removed permanently, add and validate the replacement constraint first, then drop the old one after the new invariant is live.",
          tags: ["constraint", "integrity-risk", "access-exclusive"],
        }),
      );
  },
};

export const PGM020_CREATE_INDEX_WITHOUT_CONCURRENTLY: AnalyzerRule = {
  id: "PGM020_CREATE_INDEX_WITHOUT_CONCURRENTLY",
  title: "CREATE INDEX without CONCURRENTLY can block writes",
  category: "index",
  defaultSeverity: "medium",
  docsLinks: [POSTGRES_DOCS.createIndex, POSTGRES_DOCS.explicitLocking],
  evaluate(context) {
    return context.statements
      .filter((statement) => {
        if (
          statement.kind !== "create-index" ||
          context.helpers.normalizedIncludes(statement, "CONCURRENTLY")
        ) {
          return false;
        }

        return !isClearlyTemporaryRelation(
          extractCreateIndexRelation(statement.normalized),
        );
      })
      .map((statement) =>
        context.helpers.createFinding(PGM020_CREATE_INDEX_WITHOUT_CONCURRENTLY, {
          statement,
          severity: getMediumHighSeverity(context.settings.tableSizeProfile),
          lockLevel: "SHARE",
          safeRewrite: SAFE_REWRITE_CREATE_INDEX_CONCURRENTLY,
          objectName:
            extractCreateIndexRelation(statement.normalized) ?? statement.targetObject,
          summary:
            "CREATE INDEX without CONCURRENTLY uses the blocking build path, which prevents concurrent writes while the index is being built.",
          whyItMatters:
            "That applies to regular, unique, partial, expression, and access-method-specific indexes alike. On large tables the build can run long enough to stall application traffic.",
          recommendedAction: appendFrameworkAdvice(
            "Prefer CREATE INDEX CONCURRENTLY for online rollouts, and reserve the plain build path for maintenance windows or obviously low-traffic tables.",
            getFrameworkIndexAdvice(context),
          ),
          tags: ["create-index", "non-concurrent", "write-blocking"],
        }),
      );
  },
};

export const PGM021_CREATE_INDEX_CONCURRENTLY_IN_TRANSACTION: AnalyzerRule = {
  id: "PGM021_CREATE_INDEX_CONCURRENTLY_IN_TRANSACTION",
  title: "CREATE INDEX CONCURRENTLY cannot run inside a transaction block",
  category: "transaction",
  defaultSeverity: "critical",
  docsLinks: [POSTGRES_DOCS.createIndex, POSTGRES_DOCS.begin, POSTGRES_DOCS.commit],
  evaluate(context) {
    return context.statements
      .filter(
        (statement) =>
          statement.kind === "create-index" &&
          context.helpers.normalizedIncludes(statement, "CONCURRENTLY") &&
          context.helpers.isStatementEffectivelyInTransaction(statement),
      )
      .map((statement) => {
        const insideExplicitTransaction =
          context.helpers.isStatementInsideExplicitTransaction(statement);

        return context.helpers.createFinding(
          PGM021_CREATE_INDEX_CONCURRENTLY_IN_TRANSACTION,
          {
            statement,
            severity: insideExplicitTransaction ? "critical" : "high",
            safeRewrite: SAFE_REWRITE_CREATE_INDEX_CONCURRENTLY,
            summary: insideExplicitTransaction
              ? "CREATE INDEX CONCURRENTLY appears inside an explicit BEGIN ... COMMIT block, which PostgreSQL rejects."
              : "CREATE INDEX CONCURRENTLY is being analyzed under a framework preset that assumes migrations run inside a transaction by default.",
            whyItMatters:
              "Concurrent index builds must run outside a transaction block. Otherwise the migration either fails immediately or forces reviewers to discover the transaction wrapper too late in deployment.",
            recommendedAction: appendFrameworkAdvice(
              "Split the concurrent index into its own non-transactional migration step.",
              getFrameworkIndexAdvice(context, true),
            ),
            tags: ["create-index", "concurrently", "transaction-risk"],
          },
        );
      });
  },
};

export const PGM022_DROP_INDEX_WITHOUT_CONCURRENTLY: AnalyzerRule = {
  id: "PGM022_DROP_INDEX_WITHOUT_CONCURRENTLY",
  title: "DROP INDEX without CONCURRENTLY can take the blocking path",
  category: "index",
  defaultSeverity: "medium",
  docsLinks: [POSTGRES_DOCS.dropIndex, POSTGRES_DOCS.explicitLocking],
  evaluate(context) {
    return context.statements
      .filter(
        (statement) =>
          statement.kind === "drop-index" &&
          !context.helpers.normalizedIncludes(statement, "CONCURRENTLY"),
      )
      .map((statement) => {
        const frameworkAdvice = getFrameworkIndexAdvice(
          context,
          context.framework.effectiveAssumeTransaction,
        );

        return context.helpers.createFinding(PGM022_DROP_INDEX_WITHOUT_CONCURRENTLY, {
          statement,
          severity: getMediumHighSeverity(context.settings.tableSizeProfile),
          safeRewrite: SAFE_REWRITE_DROP_INDEX_CONCURRENTLY,
          summary:
            "DROP INDEX without CONCURRENTLY uses the blocking removal path, which can be disruptive when the index is still hot or the table is busy.",
          whyItMatters:
            "The concurrent drop path is usually safer for production traffic, but it has syntax limitations and cannot run inside a transaction block.",
          recommendedAction: appendFrameworkAdvice(
            "Prefer DROP INDEX CONCURRENTLY IF EXISTS for online cleanup when its limitations are acceptable.",
            frameworkAdvice,
          ),
          tags: ["drop-index", "non-concurrent", "write-blocking"],
        });
      });
  },
};

export const PGM023_ADD_FOREIGN_KEY_WITHOUT_NOT_VALID: AnalyzerRule = {
  id: "PGM023_ADD_FOREIGN_KEY_WITHOUT_NOT_VALID",
  title: "Adding a foreign key without NOT VALID forces immediate verification",
  category: "constraint",
  defaultSeverity: "medium",
  docsLinks: [POSTGRES_DOCS.alterTable, POSTGRES_DOCS.constraints],
  evaluate(context) {
    return context.statements
      .filter(
        (statement) =>
          isAlterTableStatement(statement.normalized) &&
          matchesPattern(statement.normalized, /\bADD\b[\s\S]*\bFOREIGN\s+KEY\b/i) &&
          !matchesPattern(statement.normalized, /\bNOT\s+VALID\b/i),
      )
      .map((statement) =>
        context.helpers.createFinding(PGM023_ADD_FOREIGN_KEY_WITHOUT_NOT_VALID, {
          statement,
          severity: getMediumHighSeverity(context.settings.tableSizeProfile),
          lockLevel: "SHARE ROW EXCLUSIVE",
          safeRewrite: SAFE_REWRITE_ADD_FOREIGN_KEY_NOT_VALID,
          summary:
            "Adding a foreign key without NOT VALID makes PostgreSQL verify existing rows immediately instead of deferring validation to a safer follow-up step.",
          whyItMatters:
            "That validation can scan large tables and hold stronger locking around the constraint addition, which is risky on hot write paths.",
          recommendedAction: appendFrameworkAdvice(
            "Add the foreign key as NOT VALID first, then run VALIDATE CONSTRAINT in a separate step once the data is already consistent.",
            getFrameworkConstraintAdvice(context),
          ),
          tags: ["foreign-key", "table-scan", "constraint-validation"],
        }),
      );
  },
};

export const PGM024_VALIDATE_CONSTRAINT_LOCK_CONTEXT: AnalyzerRule = {
  id: "PGM024_VALIDATE_CONSTRAINT_LOCK_CONTEXT",
  title: "VALIDATE CONSTRAINT uses a safer lock than immediate validation",
  category: "constraint",
  defaultSeverity: "info",
  docsLinks: [POSTGRES_DOCS.alterTable, POSTGRES_DOCS.explicitLocking],
  evaluate(context) {
    return context.statements
      .filter(
        (statement) =>
          isAlterTableStatement(statement.normalized) &&
          matchesPattern(statement.normalized, /\bVALIDATE\s+CONSTRAINT\b/i),
      )
      .map((statement) =>
        context.helpers.createFinding(PGM024_VALIDATE_CONSTRAINT_LOCK_CONTEXT, {
          statement,
          severity: getInfoLowSeverity(context.settings.tableSizeProfile),
          lockLevel: "SHARE UPDATE EXCLUSIVE",
          summary:
            "VALIDATE CONSTRAINT still scans existing rows, but it uses a weaker SHARE UPDATE EXCLUSIVE lock than immediate validation paths.",
          whyItMatters:
            "That makes it a safer second step for large migrations, even though the validation scan can still be expensive on very large tables.",
          recommendedAction:
            "Keep VALIDATE CONSTRAINT as its own rollout step so operators can schedule the scan separately from the initial schema change.",
          tags: ["constraint-validation", "table-scan"],
        }),
      );
  },
};

export const PGM025_ADD_CHECK_WITHOUT_NOT_VALID: AnalyzerRule = {
  id: "PGM025_ADD_CHECK_WITHOUT_NOT_VALID",
  title: "Adding a CHECK constraint without NOT VALID validates immediately",
  category: "constraint",
  defaultSeverity: "medium",
  docsLinks: [POSTGRES_DOCS.alterTable, POSTGRES_DOCS.constraints],
  evaluate(context) {
    return context.statements
      .filter(
        (statement) =>
          isAlterTableStatement(statement.normalized) &&
          matchesPattern(statement.normalized, /\bADD\s+CONSTRAINT\b[\s\S]*\bCHECK\s*\(/i) &&
          !matchesPattern(statement.normalized, /\bNOT\s+VALID\b/i),
      )
      .map((statement) =>
        context.helpers.createFinding(PGM025_ADD_CHECK_WITHOUT_NOT_VALID, {
          statement,
          severity: getMediumHighSeverity(context.settings.tableSizeProfile),
          safeRewrite: SAFE_REWRITE_ADD_CHECK_NOT_VALID,
          summary:
            "Adding a CHECK constraint without NOT VALID makes PostgreSQL verify existing rows in the initial DDL step instead of deferring validation.",
          whyItMatters:
            "That immediate validation path is often harder to schedule safely on large tables than a two-step add-and-validate sequence.",
          recommendedAction: appendFrameworkAdvice(
            "Add the CHECK constraint with NOT VALID first, then validate it later after backfills or cleanup are complete.",
            getFrameworkConstraintAdvice(context),
          ),
          tags: ["check-constraint", "table-scan", "constraint-validation"],
        }),
      );
  },
};

export const PGM026_ADD_UNIQUE_OR_PRIMARY_KEY_DIRECTLY: AnalyzerRule = {
  id: "PGM026_ADD_UNIQUE_OR_PRIMARY_KEY_DIRECTLY",
  title: "Adding UNIQUE or PRIMARY KEY directly can build and validate inline",
  category: "constraint",
  defaultSeverity: "medium",
  docsLinks: [POSTGRES_DOCS.alterTable, POSTGRES_DOCS.createIndex],
  evaluate(context) {
    return context.statements
      .filter(
        (statement) =>
          isAlterTableStatement(statement.normalized) &&
          matchesPattern(
            statement.normalized,
            /\bADD\s+CONSTRAINT\b[\s\S]*\b(?:UNIQUE|PRIMARY\s+KEY)\b/i,
          ) &&
          !matchesPattern(statement.normalized, /\bUSING\s+INDEX\b/i),
      )
      .map((statement) => {
        const primaryKey = matchesPattern(
          statement.normalized,
          /\bPRIMARY\s+KEY\b/i,
        );

        return context.helpers.createFinding(
          PGM026_ADD_UNIQUE_OR_PRIMARY_KEY_DIRECTLY,
          {
            statement,
            severity: getMediumHighSeverity(context.settings.tableSizeProfile),
            lockLevel: "SHARE",
            safeRewrite: primaryKey
              ? SAFE_REWRITE_ADD_PRIMARY_KEY_USING_INDEX
              : SAFE_REWRITE_ADD_UNIQUE_USING_INDEX,
            summary: primaryKey
              ? "Adding a PRIMARY KEY directly can build the backing unique index and validate it in the same disruptive migration step."
              : "Adding a UNIQUE constraint directly can build the backing index and validate duplicates inline instead of using a safer staged path.",
            whyItMatters:
              "Direct constraint creation can scan or sort large relations while writes are blocked, which is much harder to absorb on busy production tables.",
            recommendedAction: appendFrameworkAdvice(
              "Create the unique index concurrently first, then attach the constraint with ALTER TABLE ... ADD CONSTRAINT ... USING INDEX where that pattern is supported.",
              getFrameworkConstraintAdvice(context),
            ),
            tags: ["unique-constraint", "table-scan", "index-build"],
          },
        );
      });
  },
};

export const PGM027_ADD_EXCLUSION_CONSTRAINT: AnalyzerRule = {
  id: "PGM027_ADD_EXCLUSION_CONSTRAINT",
  title: "Exclusion constraints build index-backed enforcement inline",
  category: "constraint",
  defaultSeverity: "medium",
  docsLinks: [POSTGRES_DOCS.alterTable, POSTGRES_DOCS.createIndex],
  evaluate(context) {
    return context.statements
      .filter(
        (statement) =>
          isAlterTableStatement(statement.normalized) &&
          matchesPattern(
            statement.normalized,
            /\bADD\s+CONSTRAINT\b[\s\S]*\bEXCLUDE\s+USING\b/i,
          ),
      )
      .map((statement) =>
        context.helpers.createFinding(PGM027_ADD_EXCLUSION_CONSTRAINT, {
          statement,
          severity: getMediumHighSeverity(context.settings.tableSizeProfile),
          lockLevel: "SHARE",
          summary:
            "Exclusion constraints build index-backed enforcement as part of the constraint addition, so they carry the same operational risks as an inline index build plus constraint validation.",
          whyItMatters:
            "On large tables this can be an expensive, blocking schema step that is hard to roll back cleanly during deployment.",
          recommendedAction:
            "Review the expected lock and build cost carefully, and consider splitting related schema work so the exclusion constraint is the only heavy operation in the migration.",
          tags: ["exclusion-constraint", "table-scan", "index-build"],
        }),
      );
  },
};

export const PGM028_REINDEX_WITHOUT_CONCURRENTLY: AnalyzerRule = {
  id: "PGM028_REINDEX_WITHOUT_CONCURRENTLY",
  title: "REINDEX without CONCURRENTLY uses the blocking rebuild path",
  category: "index",
  defaultSeverity: "medium",
  docsLinks: [POSTGRES_DOCS.reindex, POSTGRES_DOCS.explicitLocking],
  evaluate(context) {
    return context.statements
      .filter(
        (statement) =>
          statement.kind === "reindex" &&
          !context.helpers.normalizedIncludes(statement, "CONCURRENTLY"),
      )
      .map((statement) =>
        context.helpers.createFinding(PGM028_REINDEX_WITHOUT_CONCURRENTLY, {
          statement,
          severity: getMediumHighSeverity(context.settings.tableSizeProfile),
          safeRewrite: SAFE_REWRITE_REINDEX_CONCURRENTLY,
          summary:
            "REINDEX without CONCURRENTLY rebuilds index structures on the blocking path instead of using the safer online variant.",
          whyItMatters:
            "That can interrupt application traffic on busy relations, especially when the rebuild is large or multiple indexes are involved.",
          recommendedAction:
            "Prefer REINDEX ... CONCURRENTLY where PostgreSQL supports it, and schedule any blocking rebuilds for explicit maintenance windows.",
          tags: ["reindex", "write-blocking", "index-build"],
        }),
      );
  },
};

export const PGM029_REFRESH_MATERIALIZED_VIEW_WITHOUT_CONCURRENTLY: AnalyzerRule = {
  id: "PGM029_REFRESH_MATERIALIZED_VIEW_WITHOUT_CONCURRENTLY",
  title: "Refreshing a materialized view without CONCURRENTLY blocks readers",
  category: "locking",
  defaultSeverity: "medium",
  docsLinks: [
    POSTGRES_DOCS.refreshMaterializedView,
    POSTGRES_DOCS.explicitLocking,
  ],
  evaluate(context) {
    return context.statements
      .filter(
        (statement) =>
          statement.kind === "refresh-materialized-view" &&
          !context.helpers.normalizedIncludes(statement, "CONCURRENTLY"),
      )
      .map((statement) =>
        context.helpers.createFinding(
          PGM029_REFRESH_MATERIALIZED_VIEW_WITHOUT_CONCURRENTLY,
          {
            statement,
            severity: getMediumHighSeverity(context.settings.tableSizeProfile),
            lockLevel: "ACCESS EXCLUSIVE",
            confidence: "medium",
            safeRewrite: SAFE_REWRITE_REFRESH_MATERIALIZED_VIEW_CONCURRENTLY,
            summary:
              "REFRESH MATERIALIZED VIEW without CONCURRENTLY takes the blocking refresh path, which prevents normal reads of the materialized view while the refresh runs.",
            whyItMatters:
              "On large materialized views the refresh can be long enough to create visible downtime for dashboards, jobs, or APIs that read from it.",
            recommendedAction:
              "Prefer REFRESH MATERIALIZED VIEW CONCURRENTLY when the view has the required unique index, and schedule the blocking path only when the read outage is acceptable.",
            tags: ["materialized-view", "write-blocking"],
          },
        ),
      );
  },
};

export const PGM030_LONG_RUNNING_BACKFILL_IN_MIGRATION: AnalyzerRule = {
  id: "PGM030_LONG_RUNNING_BACKFILL_IN_MIGRATION",
  title: "Large unbounded data changes are risky inside migrations",
  category: "transaction",
  defaultSeverity: "medium",
  docsLinks: [
    POSTGRES_DOCS.sqlUpdate,
    POSTGRES_DOCS.sqlDelete,
    POSTGRES_DOCS.sqlInsert,
  ],
  evaluate(context) {
    return context.statements
      .filter((statement) => {
        const normalizedSql = statement.normalized;

        if (
          statement.kind === "update" &&
          matchesPattern(normalizedSql, /^\s*UPDATE\b[\s\S]*\bSET\b/i) &&
          !matchesPattern(normalizedSql, /\bWHERE\b/i)
        ) {
          return true;
        }

        if (
          statement.kind === "delete" &&
          matchesPattern(normalizedSql, /^\s*DELETE\s+FROM\b/i) &&
          !matchesPattern(normalizedSql, /\bWHERE\b/i)
        ) {
          return true;
        }

        return matchesPattern(
          normalizedSql,
          /^\s*INSERT\s+INTO\b[\s\S]*\bSELECT\b/i,
        );
      })
      .map((statement) =>
        context.helpers.createFinding(PGM030_LONG_RUNNING_BACKFILL_IN_MIGRATION, {
          statement,
          severity: getMediumHighSeverity(context.settings.tableSizeProfile),
          safeRewrite: SAFE_REWRITE_BATCHED_BACKFILL,
          summary:
            "This statement looks like an unbounded bulk data change running inside the migration itself.",
          whyItMatters:
            "Large backfills or deletes keep transactions open longer, increase replication lag, create table bloat, and extend the lifetime of any locks already held by the migration.",
          recommendedAction:
            "Move the backfill into batched work outside the schema migration, using primary-key ranges or a job queue so the rollout can be observed and paused safely.",
          tags: ["backfill", "table-scan", "transaction-risk"],
        }),
      );
  },
};

export const PGM032_LOCK_TABLE_EXPLICIT: AnalyzerRule = {
  id: "PGM032_LOCK_TABLE_EXPLICIT",
  title: "Explicit LOCK TABLE requires careful production review",
  category: "locking",
  defaultSeverity: "high",
  docsLinks: [POSTGRES_DOCS.lock, POSTGRES_DOCS.explicitLocking],
  evaluate(context) {
    return context.statements
      .filter((statement) => matchesPattern(statement.normalized, /^\s*LOCK\s+TABLE\b/i))
      .map((statement) => {
        const lockLevel = parseLockMode(statement.normalized);
        const lowMode =
          lockLevel === "ACCESS SHARE" || lockLevel === "ROW SHARE";
        const nowait = matchesPattern(statement.normalized, /\bNOWAIT\b/i);

        return context.helpers.createFinding(PGM032_LOCK_TABLE_EXPLICIT, {
          statement,
          severity: lowMode && nowait ? "medium" : "high",
          lockLevel,
          confidence: lowMode && nowait ? "medium" : "high",
          summary:
            "LOCK TABLE takes an explicit table lock, and if no lock mode is specified PostgreSQL defaults to ACCESS EXCLUSIVE.",
          whyItMatters:
            "Explicit locks can block production traffic immediately, especially when they are stronger than the surrounding migration really needs.",
          recommendedAction:
            "Use explicit locking only when the operational need is clear, specify the weakest lock mode that works, and pair it with NOWAIT or clear timeout guardrails when possible.",
          tags: ["locking", "explicit-lock"],
        });
      });
  },
};

export const PGM033_ENUM_VALUE_CHANGE: AnalyzerRule = {
  id: "PGM033_ENUM_VALUE_CHANGE",
  title: "Enum changes need application-compatible rollout planning",
  category: "framework",
  defaultSeverity: "low",
  docsLinks: [POSTGRES_DOCS.alterType, POSTGRES_DOCS.ddlAlter],
  evaluate(context) {
    return context.statements
      .filter(
        (statement) =>
          statement.kind === "alter-type" &&
          (matchesPattern(statement.normalized, /\bADD\s+VALUE\b/i) ||
            matchesPattern(statement.normalized, /\bRENAME\s+VALUE\b/i) ||
            matchesPattern(statement.normalized, /\bRENAME\s+TO\b/i)),
      )
      .map((statement) => {
        const addValue = matchesPattern(statement.normalized, /\bADD\s+VALUE\b/i);
        const renameValue = matchesPattern(
          statement.normalized,
          /\bRENAME\s+VALUE\b/i,
        );

        if (addValue) {
          const insideTransaction =
            context.helpers.isStatementEffectivelyInTransaction(statement);
          const severity: FindingSeverity =
            insideTransaction || context.settings.postgresVersion <= 11
              ? "medium"
              : "low";
          const summary =
            context.settings.postgresVersion <= 11 && insideTransaction
              ? "ALTER TYPE ... ADD VALUE is especially awkward in transaction-wrapped migrations on PostgreSQL 10-11."
              : insideTransaction
                ? "ALTER TYPE ... ADD VALUE inside a transaction block is allowed on newer PostgreSQL versions, but the new enum value cannot be used until the transaction commits."
                : "Adding an enum value is usually the safest enum evolution path, but it still needs rollout coordination.";

          return context.helpers.createFinding(PGM033_ENUM_VALUE_CHANGE, {
            statement,
            severity,
            confidence: "medium",
            safeRewrite: SAFE_REWRITE_SAFE_ENUM_DEPLOYMENT,
            summary,
            whyItMatters:
              "Enum changes are hard to roll back, and mixed-version application fleets may not all understand the new label at the same time.",
            recommendedAction:
              "Roll enum additions out separately from application behavior changes, and be extra careful with transaction-wrapped migration frameworks on older PostgreSQL versions.",
            tags: ["enum", "application-compatibility"],
          });
        }

        return context.helpers.createFinding(PGM033_ENUM_VALUE_CHANGE, {
          statement,
          severity: "high",
          safeRewrite: SAFE_REWRITE_SAFE_ENUM_DEPLOYMENT,
          summary: renameValue
            ? "Renaming an enum value is a compatibility break for application nodes or jobs that still emit or expect the old literal."
            : "Renaming the enum type itself can break application code, schema references, and generated SQL during a rolling deploy.",
          whyItMatters:
            "Enum renames are difficult to reverse safely because stored data, validation code, and long-lived workers may still depend on the previous name or label.",
          recommendedAction:
            "Prefer additive enum rollout patterns and application compatibility windows instead of renaming enum labels or types in place.",
          tags: ["enum", "rename", "application-compatibility"],
        });
      });
  },
};

export const PGM034_CREATE_TRIGGER_OR_ENABLE_TRIGGER: AnalyzerRule = {
  id: "PGM034_CREATE_TRIGGER_OR_ENABLE_TRIGGER",
  title: "Trigger changes can affect both locking and write behavior",
  category: "locking",
  defaultSeverity: "medium",
  docsLinks: [POSTGRES_DOCS.createTrigger, POSTGRES_DOCS.alterTable],
  evaluate(context) {
    return context.statements
      .filter(
        (statement) =>
          statement.kind === "create-trigger" ||
          (isAlterTableStatement(statement.normalized) &&
            matchesPattern(
              statement.normalized,
              /\b(?:ENABLE|DISABLE)\s+TRIGGER\b/i,
            )),
      )
      .map((statement) =>
        context.helpers.createFinding(PGM034_CREATE_TRIGGER_OR_ENABLE_TRIGGER, {
          statement,
          severity: getMediumHighSeverity(context.settings.tableSizeProfile),
          lockLevel:
            statement.kind === "create-trigger"
              ? "SHARE ROW EXCLUSIVE"
              : undefined,
          summary:
            "Creating, enabling, or disabling triggers changes live write behavior and may require stronger locks while the change is applied.",
          whyItMatters:
            "Triggers can increase write latency, change data semantics, and surprise downstream systems if they are introduced or toggled without coordination.",
          recommendedAction:
            "Review trigger behavior like application code, isolate trigger changes from unrelated risky DDL, and confirm the write-path impact before deployment.",
          tags: ["trigger", "write-path"],
        }),
      );
  },
};

export const PGM035_VACUUM_FULL_OR_CLUSTER: AnalyzerRule = {
  id: "PGM035_VACUUM_FULL_OR_CLUSTER",
  title: "VACUUM FULL and CLUSTER are heavyweight rewrite operations",
  category: "rewrite",
  defaultSeverity: "high",
  docsLinks: [POSTGRES_DOCS.vacuum, POSTGRES_DOCS.cluster],
  evaluate(context) {
    return context.statements
      .filter(
        (statement) =>
          statement.kind === "vacuum-full" || statement.kind === "cluster",
      )
      .map((statement) =>
        context.helpers.createFinding(PGM035_VACUUM_FULL_OR_CLUSTER, {
          statement,
          severity:
            statement.kind === "vacuum-full" ||
            isLargeTableProfile(context.settings.tableSizeProfile)
              ? "critical"
              : "high",
          lockLevel: "ACCESS EXCLUSIVE",
          summary:
            "VACUUM FULL and CLUSTER rewrite storage on the blocking path and are usually maintenance-window operations, not deploy-time schema changes.",
          whyItMatters:
            "These commands can lock heavily and run long enough to create user-visible downtime on production relations.",
          recommendedAction:
            "Treat these as dedicated maintenance operations with explicit scheduling, not as ordinary application migrations.",
          tags: ["rewrite-risk", "maintenance-window", "access-exclusive"],
        }),
      );
  },
};

export const PGM036_CREATE_EXTENSION: AnalyzerRule = {
  id: "PGM036_CREATE_EXTENSION",
  title: "CREATE EXTENSION may depend on production environment privileges",
  category: "framework",
  defaultSeverity: "low",
  docsLinks: [POSTGRES_DOCS.createExtension],
  evaluate(context) {
    return context.statements
      .filter((statement) => statement.kind === "create-extension")
      .map((statement) =>
        context.helpers.createFinding(PGM036_CREATE_EXTENSION, {
          statement,
          severity:
            context.settings.frameworkPreset === "raw-sql" ? "low" : "medium",
          summary:
            "CREATE EXTENSION can fail in managed or least-privilege production environments even when it works in development.",
          whyItMatters:
            "Extension install rights are often restricted in hosted PostgreSQL environments, and some teams provision extensions outside the application migration path entirely.",
          recommendedAction:
            "Confirm that the deployment role is allowed to install the extension in the target environment, or provision it separately before the application migration runs.",
          tags: ["extension", "environment"],
        }),
      );
  },
};

export const PGM037_DROP_TYPE_OR_DROP_SCHEMA: AnalyzerRule = {
  id: "PGM037_DROP_TYPE_OR_DROP_SCHEMA",
  title: "DROP TYPE or DROP SCHEMA is highly destructive",
  category: "data-loss",
  defaultSeverity: "critical",
  docsLinks: [POSTGRES_DOCS.dropType, POSTGRES_DOCS.dropSchema],
  evaluate(context) {
    return context.statements
      .filter(
        (statement) =>
          matchesPattern(statement.normalized, /^\s*DROP\s+TYPE\b/i) ||
          matchesPattern(statement.normalized, /^\s*DROP\s+SCHEMA\b/i),
      )
      .map((statement) =>
        context.helpers.createFinding(PGM037_DROP_TYPE_OR_DROP_SCHEMA, {
          statement,
          severity: context.settings.flagDestructiveChanges ? "critical" : "high",
          summary:
            "Dropping a type or schema removes a shared dependency surface that application code, tables, functions, and jobs may still require.",
          whyItMatters:
            "Schema and type drops can cascade widely, and the blast radius is often larger than a single migration reviewer expects at first glance.",
          recommendedAction:
            "Treat type and schema drops as explicit cleanup milestones after every dependent object and application path has already moved away safely.",
          tags: ["destructive", "drop-schema", "drop-type"],
        }),
      );
  },
};

export const PGM038_CREATE_TABLE_AS_SELECT: AnalyzerRule = {
  id: "PGM038_CREATE_TABLE_AS_SELECT",
  title: "Bulk table copy patterns deserve production sizing review",
  category: "transaction",
  defaultSeverity: "medium",
  docsLinks: [POSTGRES_DOCS.createTableAs, POSTGRES_DOCS.sqlInsert],
  evaluate(context) {
    return context.statements
      .filter(
        (statement) =>
          matchesPattern(
            statement.normalized,
            /^\s*CREATE\s+TABLE\b[\s\S]*\bAS\s+SELECT\b/i,
          ) ||
          matchesPattern(statement.normalized, /^\s*SELECT\b[\s\S]*\bINTO\b/i),
      )
      .map((statement) =>
        context.helpers.createFinding(PGM038_CREATE_TABLE_AS_SELECT, {
          statement,
          severity: getMediumHighSeverity(context.settings.tableSizeProfile),
          safeRewrite: SAFE_REWRITE_BATCHED_BACKFILL,
          summary:
            "This looks like a bulk data copy into a new table, which can run much longer than ordinary DDL on production-sized datasets.",
          whyItMatters:
            "Large copy operations extend transaction time, compete for I/O, and are harder to pause or retry safely when bundled into an application migration.",
          recommendedAction:
            "Plan bulk copy operations like backfills: isolate them, observe them, and batch or stage them when the data volume is significant.",
          tags: ["bulk-copy", "transaction-risk"],
        }),
      );
  },
};

export const PGM031_MISSING_LOCK_TIMEOUT: AnalyzerRule = {
  id: "PGM031_MISSING_LOCK_TIMEOUT",
  title: "Risky locking migration has no explicit timeout guardrails",
  category: "locking",
  defaultSeverity: "medium",
  docsLinks: [POSTGRES_DOCS.runtimeClientDefaults, POSTGRES_DOCS.explicitLocking],
  evaluate(context) {
    const hasLockTimeout = hasTimeoutSetting(context.statements, "lock_timeout");
    const hasStatementTimeout = hasTimeoutSetting(
      context.statements,
      "statement_timeout",
    );
    const riskyLockFindings = context.priorFindings.filter(
      (finding) => isHighOrCriticalFinding(finding) && Boolean(finding.lockLevel),
    );

    if (hasLockTimeout || riskyLockFindings.length === 0) {
      return [];
    }

    const anchorStatement =
      context.statements[riskyLockFindings[0]?.statementIndex ?? 0] ??
      context.statements[0];

    if (!anchorStatement) {
      return [];
    }

    return [
      context.helpers.createFinding(PGM031_MISSING_LOCK_TIMEOUT, {
        statement: anchorStatement,
        severity: "medium",
        safeRewrite: SAFE_REWRITE_LOCK_TIMEOUT_PREAMBLE,
        summary: hasStatementTimeout
          ? "This migration already sets statement_timeout, but it does not set lock_timeout even though it includes high-risk locking operations."
          : "This migration has high-risk locking operations but sets neither lock_timeout nor statement_timeout explicitly.",
        whyItMatters:
          "Without timeout guardrails, a migration can wait unexpectedly long for locks or keep running far beyond the window operators intended.",
        recommendedAction:
          "Set explicit lock_timeout and statement_timeout values as deployment guardrails, then tune the exact numbers for your workload and operational policy.",
        tags: ["lock-timeout", "timeout-guardrail"],
      }),
    ];
  },
};

export const PGM039_MULTIPLE_RISKY_DDL_IN_ONE_MIGRATION: AnalyzerRule = {
  id: "PGM039_MULTIPLE_RISKY_DDL_IN_ONE_MIGRATION",
  title: "This migration bundles too many risky changes into one deploy step",
  category: "framework",
  defaultSeverity: "high",
  docsLinks: [POSTGRES_DOCS.ddlAlter, POSTGRES_DOCS.explicitLocking],
  evaluate(context) {
    const riskyFindings = context.priorFindings.filter(isHighOrCriticalFinding);
    const riskyStatementIndexes = [...new Set(riskyFindings.map((finding) => finding.statementIndex))];

    if (riskyFindings.length < 3 || riskyStatementIndexes.length < 2) {
      return [];
    }

    const anchorStatement =
      context.statements[riskyStatementIndexes[0] ?? 0] ?? context.statements[0];

    if (!anchorStatement) {
      return [];
    }

    return [
      context.helpers.createFinding(PGM039_MULTIPLE_RISKY_DDL_IN_ONE_MIGRATION, {
        statement: anchorStatement,
        severity: "high",
        safeRewrite: SAFE_REWRITE_SPLIT_RISKY_MIGRATION,
        summary:
          "This migration already contains several high- or critical-risk findings across multiple statements, which raises the overall deploy blast radius.",
        whyItMatters:
          "Bundling many risky schema steps together makes rollbacks harder, reduces observation points between phases, and increases the chance that one failure forces a much larger recovery.",
        recommendedAction:
          "Split additive schema work, online indexes or validations, backfills, and destructive cleanup into separate migrations or deploy phases using an expand-contract rollout.",
        tags: ["migration-splitting", "transaction-risk"],
      }),
    ];
  },
};

export const BASE_ANALYZER_RULES = [
  PGM001_DROP_TABLE,
  PGM002_TRUNCATE_TABLE,
  PGM010_ALTER_TABLE_ACCESS_EXCLUSIVE_DEFAULT,
  PGM011_DROP_COLUMN,
  PGM012_RENAME_TABLE_OR_COLUMN,
  PGM013_ALTER_COLUMN_TYPE_REWRITE,
  PGM014_SET_NOT_NULL_SCAN,
  PGM015_ADD_COLUMN_NOT_NULL_IMMEDIATE,
  PGM016_ADD_COLUMN_WITH_DEFAULT_VERSION_AWARE,
  PGM017_DROP_CONSTRAINT,
  PGM020_CREATE_INDEX_WITHOUT_CONCURRENTLY,
  PGM021_CREATE_INDEX_CONCURRENTLY_IN_TRANSACTION,
  PGM022_DROP_INDEX_WITHOUT_CONCURRENTLY,
  PGM023_ADD_FOREIGN_KEY_WITHOUT_NOT_VALID,
  PGM024_VALIDATE_CONSTRAINT_LOCK_CONTEXT,
  PGM025_ADD_CHECK_WITHOUT_NOT_VALID,
  PGM026_ADD_UNIQUE_OR_PRIMARY_KEY_DIRECTLY,
  PGM027_ADD_EXCLUSION_CONSTRAINT,
  PGM028_REINDEX_WITHOUT_CONCURRENTLY,
  PGM029_REFRESH_MATERIALIZED_VIEW_WITHOUT_CONCURRENTLY,
  PGM030_LONG_RUNNING_BACKFILL_IN_MIGRATION,
  PGM032_LOCK_TABLE_EXPLICIT,
  PGM033_ENUM_VALUE_CHANGE,
  PGM034_CREATE_TRIGGER_OR_ENABLE_TRIGGER,
  PGM035_VACUUM_FULL_OR_CLUSTER,
  PGM036_CREATE_EXTENSION,
  PGM037_DROP_TYPE_OR_DROP_SCHEMA,
  PGM038_CREATE_TABLE_AS_SELECT,
] as const satisfies readonly AnalyzerRule[];

export const DERIVED_ANALYZER_RULES = [
  PGM031_MISSING_LOCK_TIMEOUT,
  PGM039_MULTIPLE_RISKY_DDL_IN_ONE_MIGRATION,
] as const satisfies readonly AnalyzerRule[];

export const REGISTERED_ANALYZER_RULES = [
  ...BASE_ANALYZER_RULES,
  ...DERIVED_ANALYZER_RULES,
] as const satisfies readonly AnalyzerRule[];

export function runRegisteredAnalyzerRules(context: AnalyzerRuleContext) {
  const baseFindings = BASE_ANALYZER_RULES.flatMap((rule) =>
    rule.evaluate({
      ...context,
      priorFindings: [],
    }),
  );
  const derivedFindings = DERIVED_ANALYZER_RULES.flatMap((rule) =>
    rule.evaluate({
      ...context,
      priorFindings: baseFindings,
    }),
  );

  return [...baseFindings, ...derivedFindings].sort(compareFindings);
}
