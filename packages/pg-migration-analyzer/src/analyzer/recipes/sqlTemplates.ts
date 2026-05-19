import type {
  Finding,
  FrameworkAnalysisMetadata,
  MigrationStatement,
} from "../../types";
import { POSTGRES_DOCS, mergeDocumentationLinks } from "../docsLinks";
import type { SafeRewriteRecipe } from "./types";

const IDENTIFIER_PATTERN = String.raw`(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)`;
const QUALIFIED_IDENTIFIER_PATTERN = `${IDENTIFIER_PATTERN}(?:\\s*\\.\\s*${IDENTIFIER_PATTERN})?`;

export type RecipeBuildContext = {
  finding: Finding;
  framework: FrameworkAnalysisMetadata;
  statement: MigrationStatement | null;
};

type ResolvedTemplateValue = {
  value: string;
  usedPlaceholder: boolean;
};

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isUsableSqlToken(value?: string | null) {
  if (!value) {
    return false;
  }

  const trimmed = value.trim();

  return (
    trimmed.length > 0 &&
    trimmed.length <= 160 &&
    !/[;\n\r]/.test(trimmed)
  );
}

function sanitizeCapturedToken(value?: string | null) {
  if (!value) {
    return undefined;
  }

  return compactWhitespace(value.replace(/\s*\.\s*/g, "."));
}

function resolveTemplateValue({
  candidate,
  kind,
  placeholder,
  warnings,
}: {
  candidate?: string | null;
  kind: string;
  placeholder: string;
  warnings: string[];
}) {
  const sanitizedCandidate = sanitizeCapturedToken(candidate);

  if (isUsableSqlToken(sanitizedCandidate)) {
    return {
      value: sanitizedCandidate!,
      usedPlaceholder: false,
    } satisfies ResolvedTemplateValue;
  }

  warnings.push(
    `The checker could not confidently extract the ${kind}, so this template uses the placeholder \`${placeholder}\`.`,
  );

  return {
    value: placeholder,
    usedPlaceholder: true,
  } satisfies ResolvedTemplateValue;
}

function extractMatch(sql: string, pattern: RegExp) {
  const match = sql.match(pattern);
  return sanitizeCapturedToken(match?.[1]);
}

function extractAlterTableName(statement: MigrationStatement | null) {
  if (statement?.targetObject) {
    return sanitizeCapturedToken(statement.targetObject);
  }

  return extractMatch(
    statement?.raw ?? "",
    new RegExp(
      String.raw`\bALTER\s+TABLE\s+(?:ONLY\s+)?(${QUALIFIED_IDENTIFIER_PATTERN})`,
      "i",
    ),
  );
}

function extractCreateIndexName(statement: MigrationStatement | null) {
  return extractMatch(
    statement?.raw ?? "",
    new RegExp(
      String.raw`\bCREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+CONCURRENTLY)?(?:\s+IF\s+NOT\s+EXISTS)?\s+(${QUALIFIED_IDENTIFIER_PATTERN})`,
      "i",
    ),
  );
}

function extractCreateIndexRelation(statement: MigrationStatement | null) {
  return extractMatch(
    statement?.raw ?? "",
    new RegExp(String.raw`\bON\s+(${QUALIFIED_IDENTIFIER_PATTERN})`, "i"),
  );
}

function extractAddColumnName(statement: MigrationStatement | null) {
  return extractMatch(
    statement?.raw ?? "",
    new RegExp(
      String.raw`\bADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+(${IDENTIFIER_PATTERN})`,
      "i",
    ),
  );
}

function extractAlterColumnName(statement: MigrationStatement | null) {
  return extractMatch(
    statement?.raw ?? "",
    new RegExp(
      String.raw`\bALTER\s+COLUMN\s+(${IDENTIFIER_PATTERN})`,
      "i",
    ),
  );
}

function extractRenameOldName(statement: MigrationStatement | null) {
  return extractMatch(
    statement?.raw ?? "",
    new RegExp(
      String.raw`\bRENAME\s+COLUMN\s+(${IDENTIFIER_PATTERN})\s+TO\b`,
      "i",
    ),
  );
}

function extractRenameNewName(statement: MigrationStatement | null) {
  return extractMatch(
    statement?.raw ?? "",
    new RegExp(
      String.raw`\bRENAME\s+COLUMN\s+${IDENTIFIER_PATTERN}\s+TO\s+(${IDENTIFIER_PATTERN})`,
      "i",
    ),
  );
}

function extractRenamedTableName(statement: MigrationStatement | null) {
  return extractMatch(
    statement?.raw ?? "",
    new RegExp(String.raw`\bRENAME\s+TO\s+(${IDENTIFIER_PATTERN})`, "i"),
  );
}

function extractConstraintName(statement: MigrationStatement | null) {
  return extractMatch(
    statement?.raw ?? "",
    new RegExp(
      String.raw`\bADD\s+CONSTRAINT\s+(${IDENTIFIER_PATTERN})`,
      "i",
    ),
  );
}

function extractForeignKeyColumnList(statement: MigrationStatement | null) {
  return extractMatch(statement?.raw ?? "", /\bFOREIGN\s+KEY\s*\(([^)]+)\)/i);
}

function extractReferencedTable(statement: MigrationStatement | null) {
  return extractMatch(
    statement?.raw ?? "",
    new RegExp(
      String.raw`\bREFERENCES\s+(${QUALIFIED_IDENTIFIER_PATTERN})`,
      "i",
    ),
  );
}

function extractReferencedColumnList(statement: MigrationStatement | null) {
  return extractMatch(statement?.raw ?? "", /\bREFERENCES\s+[^\s(]+\s*\(([^)]+)\)/i);
}

function extractCheckExpression(statement: MigrationStatement | null) {
  return extractMatch(statement?.raw ?? "", /\bCHECK\s*\(([\s\S]+)\)\s*(?:NOT\s+VALID|,|;|$)/i);
}

function extractUniqueOrPrimaryKeyColumns(statement: MigrationStatement | null) {
  return (
    extractMatch(statement?.raw ?? "", /\bUNIQUE\s*\(([^)]+)\)/i) ??
    extractMatch(statement?.raw ?? "", /\bPRIMARY\s+KEY\s*\(([^)]+)\)/i)
  );
}

function extractDropTargetName(statement: MigrationStatement | null) {
  return (
    extractMatch(
      statement?.raw ?? "",
      new RegExp(
        String.raw`\bDROP\s+(?:TABLE|TYPE|SCHEMA)\s+(?:IF\s+EXISTS\s+)?(${QUALIFIED_IDENTIFIER_PATTERN})`,
        "i",
      ),
    ) ??
    extractMatch(
      statement?.raw ?? "",
      new RegExp(
        String.raw`\bDROP\s+COLUMN\s+(${IDENTIFIER_PATTERN})`,
        "i",
      ),
    )
  );
}

function stripQuotes(value: string) {
  return value.replace(/"/g, "");
}

function suggestConstraintName(tableName: string, columnName: string, suffix: string) {
  const rawBase = `${stripQuotes(tableName).split(".").pop() ?? "table"}_${stripQuotes(columnName)}_${suffix}`;
  const sanitized = rawBase.toLowerCase().replace(/[^a-z0-9_]+/g, "_");

  if (!/^[a-z_][a-z0-9_]*$/.test(sanitized)) {
    return "constraint_name";
  }

  return sanitized;
}

function buildFrameworkSnippet(
  framework: FrameworkAnalysisMetadata,
  guidance: "constraint" | "index" | "rename",
) {
  if (framework.preset === "raw-sql") {
    return undefined;
  }

  if (guidance === "index") {
    return `${framework.label}: ${framework.transactionDisableHint ?? framework.safeIndexAdvice}`;
  }

  if (guidance === "constraint") {
    return `${framework.label}: ${framework.safeConstraintAdvice}`;
  }

  return framework.detectedSignals[0]
    ? `${framework.label}: ${framework.detectedSignals[0]}`
    : `${framework.label}: stage compatibility changes in the application before removing the old schema surface.`;
}

function buildLegacyRecipe(context: RecipeBuildContext): SafeRewriteRecipe | null {
  if (!context.finding.safeRewrite) {
    return null;
  }

  return {
    id: `legacy-${context.finding.ruleId.toLowerCase()}`,
    title: context.finding.safeRewrite.title,
    appliesToRuleIds: [context.finding.ruleId],
    description: context.finding.safeRewrite.summary,
    steps:
      context.finding.safeRewrite.rolloutNotes?.length
        ? context.finding.safeRewrite.rolloutNotes
        : [
            "Review the staged pattern below and adapt it to your schema, traffic, and deployment workflow before running it.",
          ],
    sqlSnippet: context.finding.safeRewrite.sql,
    warnings: [
      "This is a suggested starting point, not an auto-fix. Re-check names, predicates, transaction handling, and rollout order before running it.",
    ],
    docsLinks: context.finding.docsLinks,
  };
}

export function buildAddRequiredColumnRecipe(
  context: RecipeBuildContext,
): SafeRewriteRecipe {
  const warnings: string[] = [
    "Do not assume a single backfill UPDATE shape is universally safe. Choose batching keys and write limits that fit your workload.",
    "If the original default expression is volatile or application-generated, validate that the batched backfill produces the same semantics you need in production.",
  ];
  const table = resolveTemplateValue({
    candidate: extractAlterTableName(context.statement),
    kind: "table name",
    placeholder: "table_name",
    warnings,
  });
  const column = resolveTemplateValue({
    candidate: extractAddColumnName(context.statement),
    kind: "column name",
    placeholder: "new_column",
    warnings,
  });
  const constraintName = suggestConstraintName(
    table.value,
    column.value,
    "not_null_check",
  );

  return {
    id: "add-required-column-safely",
    title: "Add required column safely",
    appliesToRuleIds: [
      "PGM015_ADD_COLUMN_NOT_NULL_IMMEDIATE",
      "PGM016_ADD_COLUMN_WITH_DEFAULT_VERSION_AWARE",
    ],
    description:
      "Expand the column first, then backfill and enforce the invariant after the application is compatible with the new field.",
    steps: [
      "Add the new column as nullable instead of combining NOT NULL and a rollout-sensitive default in one step.",
      "Deploy application code that tolerates NULL during rollout and, if needed, writes both the old and new shape.",
      "Backfill existing rows in batches outside the critical DDL path.",
      "Add a CHECK constraint with NOT VALID to prove the invariant without assuming PostgreSQL can infer it for you.",
      "Validate the CHECK constraint after the backfill is complete.",
      "Set NOT NULL only when the data and application rollout are already ready for it.",
    ],
    sqlSnippet: `-- Step 1: add the column without NOT NULL or an immediate backfill rewrite.
ALTER TABLE ${table.value}
  ADD COLUMN ${column.value} column_type;

-- Optional: once new inserts should receive a server-side default, set it separately.
-- ALTER TABLE ${table.value}
--   ALTER COLUMN ${column.value} SET DEFAULT default_expression;

-- Step 2: deploy application code that can read NULL safely and,
-- if needed, dual-write the old and new fields during rollout.

-- Step 3: backfill outside the schema migration in batches.
-- Example only: adapt the batching key, predicate, and write rate for your table.
-- UPDATE ${table.value}
-- SET ${column.value} = default_expression
-- WHERE ${column.value} IS NULL
--   AND id >= :start_id
--   AND id < :end_id;

-- Step 4: prove the invariant first.
ALTER TABLE ${table.value}
  ADD CONSTRAINT ${constraintName}
  CHECK (${column.value} IS NOT NULL) NOT VALID;

-- Step 5: validate after the backfill is complete.
ALTER TABLE ${table.value}
  VALIDATE CONSTRAINT ${constraintName};

-- Step 6: tighten to NOT NULL only after validation succeeds.
ALTER TABLE ${table.value}
  ALTER COLUMN ${column.value} SET NOT NULL;`,
    frameworkSnippet: buildFrameworkSnippet(context.framework, "constraint"),
    warnings,
    docsLinks: mergeDocumentationLinks(
      [POSTGRES_DOCS.alterTable, POSTGRES_DOCS.constraints, POSTGRES_DOCS.sqlUpdate],
      context.finding.docsLinks,
    ),
  };
}

export function buildCreateIndexSafelyRecipe(
  context: RecipeBuildContext,
): SafeRewriteRecipe {
  const warnings: string[] = [
    "CREATE INDEX CONCURRENTLY cannot run inside a transaction block.",
    "This template does not try to preserve partial predicates, INCLUDE columns, operator classes, or expression details automatically. Re-apply them manually if the original index used them.",
  ];
  const table = resolveTemplateValue({
    candidate: extractCreateIndexRelation(context.statement),
    kind: "table name",
    placeholder: "table_name",
    warnings,
  });
  const indexName = resolveTemplateValue({
    candidate: extractCreateIndexName(context.statement),
    kind: "index name",
    placeholder: "index_name",
    warnings,
  });

  return {
    id: "create-index-safely",
    title: "Create index safely",
    appliesToRuleIds: ["PGM020_CREATE_INDEX_WITHOUT_CONCURRENTLY"],
    description:
      "Use the concurrent build path when production writes must stay online for the duration of the index build.",
    steps: [
      "Run the index build in its own migration step instead of bundling it into a larger transactional change set.",
      "Use CREATE INDEX CONCURRENTLY so PostgreSQL does not block writes for the full build path.",
      "Monitor build duration, replication, and invalid index cleanup just like any other long-running online operation.",
    ],
    sqlSnippet: `-- Run in a standalone, non-transactional migration step.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ${indexName.value}
  ON ${table.value} (column_name);`,
    frameworkSnippet: buildFrameworkSnippet(context.framework, "index"),
    warnings,
    docsLinks: mergeDocumentationLinks(
      [POSTGRES_DOCS.createIndex, POSTGRES_DOCS.explicitLocking],
      context.finding.docsLinks,
    ),
  };
}

export function buildAddForeignKeySafelyRecipe(
  context: RecipeBuildContext,
): SafeRewriteRecipe {
  const warnings: string[] = [
    "Clean up orphaned rows before validation, or the VALIDATE CONSTRAINT step will fail.",
    "If writes can still introduce invalid rows during rollout, coordinate application changes first.",
  ];
  const childTable = resolveTemplateValue({
    candidate: extractAlterTableName(context.statement),
    kind: "child table name",
    placeholder: "child_table",
    warnings,
  });
  const constraintName = resolveTemplateValue({
    candidate: extractConstraintName(context.statement),
    kind: "constraint name",
    placeholder: "constraint_name",
    warnings,
  });
  const foreignKeyColumns = resolveTemplateValue({
    candidate: extractForeignKeyColumnList(context.statement),
    kind: "foreign key column list",
    placeholder: "parent_id",
    warnings,
  });
  const parentTable = resolveTemplateValue({
    candidate: extractReferencedTable(context.statement),
    kind: "referenced table name",
    placeholder: "parent_table",
    warnings,
  });
  const parentColumns = resolveTemplateValue({
    candidate: extractReferencedColumnList(context.statement),
    kind: "referenced column list",
    placeholder: "id",
    warnings,
  });

  return {
    id: "add-foreign-key-safely",
    title: "Add foreign key safely",
    appliesToRuleIds: ["PGM023_ADD_FOREIGN_KEY_WITHOUT_NOT_VALID"],
    description:
      "Split foreign key creation from validation so the integrity check can run after cleanup and rollout coordination.",
    steps: [
      "Add the foreign key with NOT VALID first so the relationship exists without forcing full immediate validation.",
      "Deploy or confirm application behavior that no longer creates invalid rows.",
      "Repair orphaned or inconsistent rows before the validation step.",
      "Validate the constraint in a follow-up step once the data is ready.",
    ],
    sqlSnippet: `ALTER TABLE ${childTable.value}
  ADD CONSTRAINT ${constraintName.value}
  FOREIGN KEY (${foreignKeyColumns.value})
  REFERENCES ${parentTable.value}(${parentColumns.value})
  NOT VALID;

ALTER TABLE ${childTable.value}
  VALIDATE CONSTRAINT ${constraintName.value};`,
    frameworkSnippet: buildFrameworkSnippet(context.framework, "constraint"),
    warnings,
    docsLinks: mergeDocumentationLinks(
      [POSTGRES_DOCS.alterTable, POSTGRES_DOCS.constraints],
      context.finding.docsLinks,
    ),
  };
}

export function buildAddCheckConstraintSafelyRecipe(
  context: RecipeBuildContext,
): SafeRewriteRecipe {
  const warnings: string[] = [
    "If the CHECK expression references functions, verify their volatility and operational cost before validating on a large table.",
  ];
  const table = resolveTemplateValue({
    candidate: extractAlterTableName(context.statement),
    kind: "table name",
    placeholder: "table_name",
    warnings,
  });
  const constraintName = resolveTemplateValue({
    candidate: extractConstraintName(context.statement),
    kind: "constraint name",
    placeholder: "constraint_name",
    warnings,
  });
  const checkExpression = resolveTemplateValue({
    candidate: extractCheckExpression(context.statement),
    kind: "CHECK expression",
    placeholder: "check_expression",
    warnings,
  });

  return {
    id: "add-check-constraint-safely",
    title: "Add check constraint safely",
    appliesToRuleIds: [
      "PGM014_SET_NOT_NULL_SCAN",
      "PGM025_ADD_CHECK_WITHOUT_NOT_VALID",
    ],
    description:
      "Use NOT VALID first, then validate once the data cleanup or backfill is complete.",
    steps: [
      "Add the CHECK constraint with NOT VALID so PostgreSQL does not assume the whole table is ready immediately.",
      "Fix or backfill rows that would violate the invariant.",
      "Validate the constraint in a later step after the data is ready.",
      "If this CHECK is being used to prove NOT NULL, tighten the column metadata only after validation succeeds.",
    ],
    sqlSnippet: `ALTER TABLE ${table.value}
  ADD CONSTRAINT ${constraintName.value}
  CHECK (${checkExpression.value}) NOT VALID;

ALTER TABLE ${table.value}
  VALIDATE CONSTRAINT ${constraintName.value};

-- Optional follow-up for NOT NULL rollouts:
-- ALTER TABLE ${table.value}
--   ALTER COLUMN column_name SET NOT NULL;`,
    frameworkSnippet: buildFrameworkSnippet(context.framework, "constraint"),
    warnings,
    docsLinks: mergeDocumentationLinks(
      [POSTGRES_DOCS.alterTable, POSTGRES_DOCS.constraints],
      context.finding.docsLinks,
    ),
  };
}

export function buildUniqueOrPrimaryKeySafelyRecipe(
  context: RecipeBuildContext,
): SafeRewriteRecipe {
  const warnings: string[] = [
    "Clean up duplicate or invalid key rows before the concurrent index build.",
    "Attaching a PRIMARY KEY or UNIQUE constraint still takes locks, so test the exact sequence against your workload and replication setup.",
  ];
  const table = resolveTemplateValue({
    candidate: extractAlterTableName(context.statement),
    kind: "table name",
    placeholder: "table_name",
    warnings,
  });
  const constraintName = resolveTemplateValue({
    candidate: extractConstraintName(context.statement),
    kind: "constraint name",
    placeholder: "constraint_name",
    warnings,
  });
  const columns = resolveTemplateValue({
    candidate: extractUniqueOrPrimaryKeyColumns(context.statement),
    kind: "key column list",
    placeholder: "column_name",
    warnings,
  });
  const primaryKey =
    /\bPRIMARY\s+KEY\b/i.test(context.statement?.raw ?? "") ||
    /\bPRIMARY\s+KEY\b/i.test(context.finding.summary);
  const generatedIndexName = primaryKey
    ? "table_name_pkey_idx"
    : "table_name_unique_idx";
  const indexName = resolveTemplateValue({
    candidate: primaryKey ? undefined : extractCreateIndexName(context.statement),
    kind: "index name",
    placeholder: generatedIndexName,
    warnings,
  });

  return {
    id: primaryKey
      ? "add-primary-key-safely"
      : "add-unique-constraint-safely",
    title: primaryKey
      ? "Add primary key safely"
      : "Add unique constraint safely",
    appliesToRuleIds: ["PGM026_ADD_UNIQUE_OR_PRIMARY_KEY_DIRECTLY"],
    description: primaryKey
      ? "Build the unique index with the safer concurrent path first, then attach it as the PRIMARY KEY in a follow-up step."
      : "Build the unique index concurrently first, then attach it as a UNIQUE constraint using the existing index.",
    steps: [
      "Clean up duplicate rows before attempting the unique index build.",
      "Build the unique index concurrently in a standalone, non-transactional step.",
      primaryKey
        ? "Attach the finished index as the PRIMARY KEY once the index is valid."
        : "Attach the finished index as the UNIQUE constraint once the index is valid.",
    ],
    sqlSnippet: `-- Step 1: build the backing index in a non-transactional migration step.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ${indexName.value}
  ON ${table.value} (${columns.value});

-- Step 2: attach the existing index in a follow-up migration.
ALTER TABLE ${table.value}
  ADD CONSTRAINT ${constraintName.value}
  ${primaryKey ? "PRIMARY KEY" : "UNIQUE"} USING INDEX ${indexName.value};`,
    frameworkSnippet: buildFrameworkSnippet(context.framework, "index"),
    warnings,
    docsLinks: mergeDocumentationLinks(
      [POSTGRES_DOCS.createIndex, POSTGRES_DOCS.alterTable, POSTGRES_DOCS.constraints],
      context.finding.docsLinks,
    ),
  };
}

export function buildAlterColumnTypeSafelyRecipe(
  context: RecipeBuildContext,
): SafeRewriteRecipe {
  const warnings: string[] = [
    "Casting logic, generated values, and trigger behavior may need custom handling for your schema.",
    "Swapping columns safely usually requires at least one application deploy where both shapes are supported.",
  ];
  const table = resolveTemplateValue({
    candidate: extractAlterTableName(context.statement),
    kind: "table name",
    placeholder: "table_name",
    warnings,
  });
  const oldColumn = resolveTemplateValue({
    candidate: extractAlterColumnName(context.statement),
    kind: "existing column name",
    placeholder: "old_column",
    warnings,
  });
  const newColumn = resolveTemplateValue({
    candidate: oldColumn.usedPlaceholder
      ? undefined
      : `${stripQuotes(oldColumn.value)}_v2`,
    kind: "replacement column name",
    placeholder: "new_column",
    warnings,
  });

  return {
    id: "alter-column-type-safely",
    title: "Alter column type safely",
    appliesToRuleIds: ["PGM013_ALTER_COLUMN_TYPE_REWRITE"],
    description:
      "Avoid the in-place rewrite path by migrating through a new column, a batched backfill, and an application compatibility window.",
    steps: [
      "Add a new nullable column with the target type instead of changing the existing type in place.",
      "Backfill the new column in batches with explicit casting logic.",
      "Deploy application code that dual-writes and can read from both old and new shapes during rollout.",
      "Switch reads to the new column once the backfill and validation are complete.",
      "Drop or rename the old column only in a later cleanup migration.",
    ],
    sqlSnippet: `-- Step 1: add the replacement column.
ALTER TABLE ${table.value}
  ADD COLUMN ${newColumn.value} target_type;

-- Step 2: backfill in batches outside the schema migration.
-- Example only: adapt the cast expression, batching key, and write rate.
-- UPDATE ${table.value}
-- SET ${newColumn.value} = ${oldColumn.value}::target_type
-- WHERE ${newColumn.value} IS NULL
--   AND id >= :start_id
--   AND id < :end_id;

-- Step 3: deploy application code that dual-writes ${oldColumn.value} and ${newColumn.value}.
-- Step 4: switch reads to ${newColumn.value} after validation.
-- Step 5: rename or drop ${oldColumn.value} later once every runtime component is updated.`,
    frameworkSnippet: buildFrameworkSnippet(context.framework, "rename"),
    warnings,
    docsLinks: mergeDocumentationLinks(
      [POSTGRES_DOCS.alterTable, POSTGRES_DOCS.sqlUpdate],
      context.finding.docsLinks,
    ),
  };
}

export function buildRenameSafelyRecipe(
  context: RecipeBuildContext,
): SafeRewriteRecipe {
  const warnings: string[] = [
    "Dual-read or compatibility-layer details depend heavily on your framework and write path.",
    "For write-heavy paths, a compatibility view alone is often not enough. Confirm how your ORM and application code handle writes before relying on it.",
  ];
  const table = resolveTemplateValue({
    candidate: extractAlterTableName(context.statement),
    kind: "table name",
    placeholder: "table_name",
    warnings,
  });
  const oldColumn = extractRenameOldName(context.statement);
  const newColumn = extractRenameNewName(context.statement);
  const renameColumn = Boolean(oldColumn || newColumn);
  const oldName = resolveTemplateValue({
    candidate: renameColumn ? oldColumn : table.value,
    kind: "rename source name",
    placeholder: renameColumn ? "old_column_name" : "old_object_name",
    warnings,
  });
  const newName = resolveTemplateValue({
    candidate: renameColumn
      ? newColumn
      : extractRenamedTableName(context.statement),
    kind: "rename target name",
    placeholder: renameColumn ? "new_column_name" : "new_object_name",
    warnings,
  });

  return {
    id: "rename-safely-in-rolling-deploy",
    title: "Rename safely in a rolling deploy",
    appliesToRuleIds: ["PGM012_RENAME_TABLE_OR_COLUMN"],
    description:
      "Prefer additive compatibility patterns over an in-place rename while mixed application versions are still live.",
    steps: [
      renameColumn
        ? "Add the new column instead of renaming the old one in place."
        : "Create the new object or compatibility layer instead of renaming the existing object in place.",
      "Deploy application code that can read from both names or fall back safely while the fleet is rolling.",
      "Dual-write or copy data gradually so both shapes stay current during rollout.",
      "Switch reads to the new name only after every runtime component understands it.",
      "Drop the old name later in a dedicated cleanup step.",
    ],
    sqlSnippet: renameColumn
      ? `-- Step 1: add the replacement column instead of renaming in place.
ALTER TABLE ${table.value}
  ADD COLUMN ${newName.value} column_type;

-- Step 2: deploy code that writes both ${oldName.value} and ${newName.value}.
-- Step 3: backfill existing rows in batches.
-- UPDATE ${table.value}
-- SET ${newName.value} = ${oldName.value}
-- WHERE ${newName.value} IS NULL
--   AND id >= :start_id
--   AND id < :end_id;

-- Step 4: switch reads to ${newName.value} after rollout validation.
-- Step 5: drop ${oldName.value} later in a cleanup migration.`
      : `-- Example compatibility layer for a table rename:
CREATE VIEW ${oldName.value} AS
SELECT * FROM ${newName.value};

-- Keep the compatibility layer only while older app versions may still
-- read the previous name. Remove it later in a cleanup step:
-- DROP VIEW ${oldName.value};`,
    frameworkSnippet: buildFrameworkSnippet(context.framework, "rename"),
    warnings,
    docsLinks: mergeDocumentationLinks(
      [POSTGRES_DOCS.alterTable, POSTGRES_DOCS.ddlAlter],
      context.finding.docsLinks,
    ),
  };
}

export function buildBatchedBackfillRecipe(
  context: RecipeBuildContext,
): SafeRewriteRecipe {
  const warnings: string[] = [
    "This is a generic batching example, not a universally safe SQL recipe. Pick batching keys, retry behavior, and write limits that fit your workload.",
    "Large backfills still create write amplification, replication lag, and cache churn even when batched.",
  ];
  const table = resolveTemplateValue({
    candidate:
      context.statement?.targetObject ??
      extractAlterTableName(context.statement) ??
      extractCreateIndexRelation(context.statement),
    kind: "table name",
    placeholder: "table_name",
    warnings,
  });

  return {
    id: "batched-backfill",
    title: "Batched backfill",
    appliesToRuleIds: [
      "PGM030_LONG_RUNNING_BACKFILL_IN_MIGRATION",
      "PGM038_CREATE_TABLE_AS_SELECT",
    ],
    description:
      "Move long-running data movement out of the schema migration and run it in observable batches you can pause or retry.",
    steps: [
      "Keep the schema change and the data movement separate so the migration lock window stays short.",
      "Choose a stable batching key such as primary-key ranges, a queue cursor, or a job table.",
      "Run the backfill in batches with monitoring, pause controls, and validation between phases.",
      "Tighten constraints or remove compatibility code only after the batched work is complete.",
    ],
    sqlSnippet: `-- Schema step:
ALTER TABLE ${table.value}
  ADD COLUMN new_column target_type;

-- Backfill step run separately in batches.
-- Example only: adapt the write shape, predicate, and batching key.
-- UPDATE ${table.value}
-- SET new_column = source_expression
-- WHERE new_column IS NULL
--   AND id >= :start_id
--   AND id < :end_id;

-- Repeat until complete, then tighten constraints in a later migration.`,
    warnings,
    docsLinks: mergeDocumentationLinks(
      [POSTGRES_DOCS.sqlUpdate, POSTGRES_DOCS.sqlInsert, POSTGRES_DOCS.createTableAs],
      context.finding.docsLinks,
    ),
  };
}

export function buildLockTimeoutRecipe(
  context: RecipeBuildContext,
): SafeRewriteRecipe {
  return {
    id: "lock-timeout-preamble",
    title: "Lock timeout preamble",
    appliesToRuleIds: ["PGM031_MISSING_LOCK_TIMEOUT"],
    description:
      "Add explicit timeout guardrails before risky locking work so the migration does not wait or run far longer than operators intended.",
    steps: [
      "Set lock_timeout so the migration gives up instead of waiting indefinitely behind traffic.",
      "Set statement_timeout so unexpected long-running work does not outlive the deploy window silently.",
      "Tune both values to your workload and operational policy rather than copying example values blindly.",
    ],
    sqlSnippet: `-- Example only: tune these values for your environment.
SET lock_timeout = '5s';
SET statement_timeout = '5min';`,
    warnings: [
      "Shorter timeouts reduce surprise blocking waits, but they can also increase failed migration attempts if your deploy window is too aggressive.",
    ],
    docsLinks: mergeDocumentationLinks(
      [POSTGRES_DOCS.runtimeClientDefaults, POSTGRES_DOCS.explicitLocking],
      context.finding.docsLinks,
    ),
  };
}

export function buildDestructiveDropChecklistRecipe(
  context: RecipeBuildContext,
): SafeRewriteRecipe {
  const warnings: string[] = [
    "There is no generic auto-fix SQL for destructive cleanup. Review the dependency graph, backup posture, and deploy order before dropping production objects.",
  ];
  const objectName = resolveTemplateValue({
    candidate: context.finding.objectName ?? extractDropTargetName(context.statement),
    kind: "object name",
    placeholder: "object_name",
    warnings,
  });

  return {
    id: "destructive-drop-safety-checklist",
    title: "Destructive drop safety checklist",
    appliesToRuleIds: [
      "PGM001_DROP_TABLE",
      "PGM011_DROP_COLUMN",
      "PGM037_DROP_TYPE_OR_DROP_SCHEMA",
    ],
    description:
      "Treat destructive cleanup as a deliberate cleanup milestone, not as an automatic follow-up to a risky schema change.",
    steps: [
      `Confirm the application no longer reads or writes ${objectName.value}.`,
      "Create a backup or restore point that matches your recovery expectations.",
      "Deploy ignore-path or compatibility code before the destructive cleanup step.",
      "Monitor errors and background jobs after the compatibility deploy.",
      "Drop the old object later in a dedicated cleanup migration or maintenance step.",
    ],
    sqlSnippet: null,
    warnings,
    docsLinks: mergeDocumentationLinks(
      [POSTGRES_DOCS.dropTable, POSTGRES_DOCS.dropType, POSTGRES_DOCS.dropSchema, POSTGRES_DOCS.ddlAlter],
      context.finding.docsLinks,
    ),
  };
}

export function buildRecipesForFinding(
  context: RecipeBuildContext,
): SafeRewriteRecipe[] {
  switch (context.finding.ruleId) {
    case "PGM001_DROP_TABLE":
    case "PGM011_DROP_COLUMN":
    case "PGM037_DROP_TYPE_OR_DROP_SCHEMA":
      return [buildDestructiveDropChecklistRecipe(context)];
    case "PGM012_RENAME_TABLE_OR_COLUMN":
      return [buildRenameSafelyRecipe(context)];
    case "PGM013_ALTER_COLUMN_TYPE_REWRITE":
      return [buildAlterColumnTypeSafelyRecipe(context)];
    case "PGM014_SET_NOT_NULL_SCAN":
      return [buildAddCheckConstraintSafelyRecipe(context)];
    case "PGM015_ADD_COLUMN_NOT_NULL_IMMEDIATE":
    case "PGM016_ADD_COLUMN_WITH_DEFAULT_VERSION_AWARE":
      return [buildAddRequiredColumnRecipe(context)];
    case "PGM020_CREATE_INDEX_WITHOUT_CONCURRENTLY":
      return [buildCreateIndexSafelyRecipe(context)];
    case "PGM023_ADD_FOREIGN_KEY_WITHOUT_NOT_VALID":
      return [buildAddForeignKeySafelyRecipe(context)];
    case "PGM025_ADD_CHECK_WITHOUT_NOT_VALID":
      return [buildAddCheckConstraintSafelyRecipe(context)];
    case "PGM026_ADD_UNIQUE_OR_PRIMARY_KEY_DIRECTLY":
      return [buildUniqueOrPrimaryKeySafelyRecipe(context)];
    case "PGM030_LONG_RUNNING_BACKFILL_IN_MIGRATION":
    case "PGM038_CREATE_TABLE_AS_SELECT":
      return [buildBatchedBackfillRecipe(context)];
    case "PGM031_MISSING_LOCK_TIMEOUT":
      return [buildLockTimeoutRecipe(context)];
    default: {
      const legacyRecipe = buildLegacyRecipe(context);
      return legacyRecipe ? [legacyRecipe] : [];
    }
  }
}
