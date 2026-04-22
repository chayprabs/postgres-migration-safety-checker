export type PostgresMigrationSampleGroup =
  | "Unsafe"
  | "Safer pattern"
  | "Framework gotcha";

export type PostgresMigrationSampleDifficulty =
  | "Starter"
  | "Intermediate"
  | "Advanced";

export type PostgresMigrationSample = {
  description: string;
  difficulty: PostgresMigrationSampleDifficulty;
  expectedTopics: string[];
  group: PostgresMigrationSampleGroup;
  id: string;
  name: string;
  sql: string;
  tags: string[];
};

export const POSTGRES_MIGRATION_SAMPLE_GROUPS: readonly PostgresMigrationSampleGroup[] =
  ["Unsafe", "Safer pattern", "Framework gotcha"];

export const DEFAULT_POSTGRES_MIGRATION_SAMPLE_ID =
  "unsafe-add-default-and-index";

export const POSTGRES_MIGRATION_SAMPLES = [
  {
    id: "unsafe-add-default-and-index",
    group: "Unsafe",
    name: "Add defaulted column and blocking index",
    description:
      "Shows an immediate NOT NULL column addition paired with a plain CREATE INDEX that can block writes on a hot table.",
    difficulty: "Starter",
    tags: ["alter-table", "create-index", "version-aware-default", "locking"],
    sql: `ALTER TABLE users ADD COLUMN status text NOT NULL DEFAULT 'active';
CREATE INDEX index_users_on_email ON users(email);`,
    expectedTopics: [
      "Why adding a NOT NULL column with a default still needs rollout planning on large tables",
      "How PostgreSQL version changes the risk profile of ADD COLUMN ... DEFAULT",
      "Why a plain CREATE INDEX can block writes compared with CREATE INDEX CONCURRENTLY",
      "Rollout sequencing for expanding a hot production table safely",
    ],
  },
  {
    id: "safe-expand-contract-column",
    group: "Safer pattern",
    name: "Expand-contract for a required column",
    description:
      "A phased migration that adds a nullable column first, backfills outside the critical DDL path, then tightens the constraint.",
    difficulty: "Intermediate",
    tags: ["expand-contract", "constraint-validation", "not-null", "backfill"],
    sql: `ALTER TABLE users ADD COLUMN status text;
-- Backfill in batches before enforcing the invariant:
-- UPDATE users SET status = 'active' WHERE status IS NULL AND id BETWEEN ...;
ALTER TABLE users ADD CONSTRAINT users_status_present CHECK (status IS NOT NULL) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT users_status_present;
ALTER TABLE users ALTER COLUMN status SET NOT NULL;`,
    expectedTopics: [
      "Safe expand-contract sequencing for backfills on large tables",
      "Why CHECK ... NOT VALID reduces lock pressure during rollout",
      "When VALIDATE CONSTRAINT is safer than forcing NOT NULL immediately",
    ],
  },
  {
    id: "foreign-key-not-valid",
    group: "Safer pattern",
    name: "Foreign key with NOT VALID",
    description:
      "Adds a new foreign key without forcing an immediate full-table validation scan inside the initial DDL step.",
    difficulty: "Intermediate",
    tags: ["foreign-key", "constraint", "not-valid", "validation"],
    sql: `ALTER TABLE orders
  ADD CONSTRAINT orders_account_id_fkey
  FOREIGN KEY (account_id) REFERENCES accounts(id) NOT VALID;
ALTER TABLE orders VALIDATE CONSTRAINT orders_account_id_fkey;`,
    expectedTopics: [
      "How NOT VALID changes the operational profile of foreign key rollout",
      "Validation timing and lock behavior for large referencing tables",
      "Application-side checks to do before enforcing the foreign key fully",
    ],
  },
  {
    id: "dangerous-drop-and-truncate",
    group: "Unsafe",
    name: "Drop column and truncate table",
    description:
      "Highlights destructive schema changes that need explicit rollback planning and confirmation that the data can be discarded.",
    difficulty: "Starter",
    tags: ["data-loss", "drop-column", "truncate", "rollback"],
    sql: `ALTER TABLE customer_events DROP COLUMN payload_json;
TRUNCATE TABLE staging_webhooks;`,
    expectedTopics: [
      "Irreversible data-loss risks around DROP COLUMN and TRUNCATE",
      "Rollback and retention questions reviewers should ask before deployment",
      "Why destructive operations deserve higher scrutiny even when they look small",
    ],
  },
  {
    id: "transaction-unsafe-concurrent-index",
    group: "Framework gotcha",
    name: "Concurrent index inside a transaction",
    description:
      "Demonstrates a migration runner conflict where CREATE INDEX CONCURRENTLY is wrapped in BEGIN/COMMIT and becomes invalid.",
    difficulty: "Intermediate",
    tags: ["concurrently", "transaction", "framework", "index"],
    sql: `BEGIN;
CREATE INDEX CONCURRENTLY index_users_on_lower_email ON users ((lower(email)));
COMMIT;`,
    expectedTopics: [
      "Why CREATE INDEX CONCURRENTLY must run outside a transaction block",
      "Framework presets that default to wrapping migrations in a transaction",
      "How to split concurrent index work into a separate rollout step",
    ],
  },
  {
    id: "enum-change",
    group: "Framework gotcha",
    name: "Enum change and rollout coordination",
    description:
      "Focuses on enum evolution, including an added value, a renamed value, and the application compatibility risks around label changes.",
    difficulty: "Advanced",
    tags: ["enum", "application-rollout", "framework", "compatibility"],
    sql: `ALTER TYPE order_state ADD VALUE 'archived';
-- PostgreSQL allows renaming enum values, but application code may still depend on the old literal.
ALTER TYPE order_state RENAME VALUE 'pending_review' TO 'awaiting_review';
-- Risk note: enum label changes can break old app nodes, background jobs, and validation layers during rollout.`,
    expectedTopics: [
      "Version-dependent behavior for enum changes and deployment sequencing",
      "Why enum renames can be riskier than the SQL itself suggests",
      "How to coordinate application compatibility when enum literals change",
    ],
  },
] as const satisfies readonly PostgresMigrationSample[];

export function getPostgresMigrationSample(sampleId: string) {
  return POSTGRES_MIGRATION_SAMPLES.find((sample) => sample.id === sampleId) ?? null;
}
