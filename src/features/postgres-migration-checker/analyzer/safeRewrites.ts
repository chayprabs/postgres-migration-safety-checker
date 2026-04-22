import type { SafeRewrite } from "../types";

export const SAFE_REWRITE_DROP_COLUMN: SafeRewrite = {
  title: "Expand-contract the column removal",
  summary:
    "Stop using the old column in application code first, then remove it in a later migration after rollout and backup checks.",
  sql: `-- 1. Deploy application code that no longer reads or writes the old column.
-- 2. Keep the old column in place until all app nodes and background workers are updated.
-- 3. After verification and backups, remove it in a dedicated cleanup migration:
ALTER TABLE users DROP COLUMN legacy_status;`,
  rolloutNotes: [
    "Treat the final DROP COLUMN as a cleanup step, not part of the same deploy as the application change.",
    "Confirm backups and restore drills before deleting production data permanently.",
  ],
};

export const SAFE_REWRITE_RENAME_COLUMN: SafeRewrite = {
  title: "Add the new column and dual-write during rollout",
  summary:
    "Prefer an additive rename strategy so old and new application versions can run safely during rolling deploys.",
  sql: `ALTER TABLE users ADD COLUMN display_name text;
-- Deploy the app to write both nickname and display_name.
-- Backfill existing rows in batches outside the critical DDL step:
-- UPDATE users SET display_name = nickname WHERE id BETWEEN ...;
-- Switch reads to display_name after the fleet is updated.
-- Drop nickname in a later cleanup migration.`,
  rolloutNotes: [
    "Keep both names available until every app node and worker is on the new code path.",
  ],
};

export const SAFE_REWRITE_RENAME_TABLE: SafeRewrite = {
  title: "Use a compatibility layer instead of renaming in place",
  summary:
    "For table renames, preserve a compatibility surface until every application component has moved to the new name.",
  sql: `-- Create the replacement object and move application traffic gradually.
CREATE VIEW legacy_orders AS
SELECT * FROM orders;

-- After all application code uses orders directly, remove the compatibility view later:
DROP VIEW legacy_orders;`,
  rolloutNotes: [
    "A compatibility view is not always enough for writes, so confirm ORM and write-path behavior before relying on it.",
  ],
};

export const SAFE_REWRITE_ALTER_COLUMN_TYPE: SafeRewrite = {
  title: "Migrate through a new column with batched backfill",
  summary:
    "Avoid rewrite-heavy in-place type changes on hot tables by introducing a new column and moving traffic gradually.",
  sql: `ALTER TABLE users ADD COLUMN status_v2 bigint;
-- Backfill existing rows in batches outside the DDL transaction:
-- UPDATE users SET status_v2 = status::bigint WHERE id BETWEEN ...;
-- Deploy the app to dual-write status and status_v2.
-- Switch reads to status_v2 after validation.
-- Drop the old column in a later cleanup migration.`,
  rolloutNotes: [
    "This pattern gives you a reversible deployment point before the destructive cleanup step.",
  ],
};

export const SAFE_REWRITE_SET_NOT_NULL: SafeRewrite = {
  title: "Validate with CHECK NOT VALID before SET NOT NULL",
  summary:
    "Prove the invariant first, then tighten the column metadata after validation succeeds.",
  sql: `ALTER TABLE users
  ADD CONSTRAINT users_status_present CHECK (status IS NOT NULL) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT users_status_present;
ALTER TABLE users ALTER COLUMN status SET NOT NULL;`,
  rolloutNotes: [
    "Backfill existing NULL rows before validation so the constraint can succeed.",
  ],
};

export const SAFE_REWRITE_ADD_COLUMN_NOT_NULL: SafeRewrite = {
  title: "Add nullable first, backfill, then enforce NOT NULL",
  summary:
    "Split the rollout into an expand-contract sequence instead of requiring every existing row to satisfy NOT NULL immediately.",
  sql: `ALTER TABLE users ADD COLUMN status text;
-- Backfill in batches before enforcing the invariant:
-- UPDATE users SET status = 'active' WHERE status IS NULL AND id BETWEEN ...;
ALTER TABLE users
  ADD CONSTRAINT users_status_present CHECK (status IS NOT NULL) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT users_status_present;
ALTER TABLE users ALTER COLUMN status SET NOT NULL;`,
  rolloutNotes: [
    "This keeps the backfill outside the critical DDL lock window.",
  ],
};

export const SAFE_REWRITE_ADD_COLUMN_WITH_DEFAULT: SafeRewrite = {
  title: "Separate the add, backfill, and default steps",
  summary:
    "When the default expression may be rewrite-prone, split the rollout so existing rows are backfilled deliberately.",
  sql: `ALTER TABLE users ADD COLUMN created_at timestamptz;
-- Backfill existing rows in batches:
-- UPDATE users SET created_at = now() WHERE created_at IS NULL AND id BETWEEN ...;
ALTER TABLE users ALTER COLUMN created_at SET DEFAULT now();`,
  rolloutNotes: [
    "Use batched backfills for large tables so you control write load and rollback points.",
  ],
};

export const SAFE_REWRITE_DROP_CONSTRAINT: SafeRewrite = {
  title: "Replace integrity rules before removing the old constraint",
  summary:
    "If the constraint is being changed rather than removed permanently, introduce the replacement first and validate it before deleting the original.",
  sql: `ALTER TABLE orders
  ADD CONSTRAINT orders_state_check_v2 CHECK (state IN ('queued', 'running', 'done')) NOT VALID;
ALTER TABLE orders VALIDATE CONSTRAINT orders_state_check_v2;
-- Drop the old constraint only after the new validation path is live:
ALTER TABLE orders DROP CONSTRAINT orders_state_check;`,
  rolloutNotes: [
    "Keep application validation in place while the database constraint changes are rolling out.",
  ],
};

export const SAFE_REWRITE_CREATE_INDEX_CONCURRENTLY: SafeRewrite = {
  title: "Build the index concurrently",
  summary:
    "Run the index build outside a transaction so PostgreSQL can avoid blocking writes for the full duration of the build.",
  sql: `-- Run in its own non-transactional migration step:
CREATE INDEX CONCURRENTLY index_users_on_lower_email
  ON users ((lower(email)));`,
  rolloutNotes: [
    "Concurrent index builds still use I/O and may take longer, so schedule them with production load in mind.",
  ],
};

export const SAFE_REWRITE_DROP_INDEX_CONCURRENTLY: SafeRewrite = {
  title: "Drop the index concurrently",
  summary:
    "Use CONCURRENTLY when you need to remove an index without taking the blocking path of a plain DROP INDEX.",
  sql: `-- Run in its own non-transactional migration step:
DROP INDEX CONCURRENTLY IF EXISTS index_users_on_lower_email;`,
  rolloutNotes: [
    "DROP INDEX CONCURRENTLY has syntax limitations and cannot run inside a transaction block.",
  ],
};

export const SAFE_REWRITE_ADD_FOREIGN_KEY_NOT_VALID: SafeRewrite = {
  title: "Split foreign key creation from validation",
  summary:
    "Add the foreign key with NOT VALID first, then validate it in a later step with weaker locking.",
  sql: `ALTER TABLE orders
  ADD CONSTRAINT orders_account_id_fkey
  FOREIGN KEY (account_id) REFERENCES accounts(id) NOT VALID;
ALTER TABLE orders VALIDATE CONSTRAINT orders_account_id_fkey;`,
  rolloutNotes: [
    "Validate only after application writes are already compatible with the new relationship.",
  ],
};

export const SAFE_REWRITE_ADD_CHECK_NOT_VALID: SafeRewrite = {
  title: "Add the CHECK constraint with NOT VALID first",
  summary:
    "This keeps the initial DDL lighter and lets you validate after backfills or cleanup are complete.",
  sql: `ALTER TABLE users
  ADD CONSTRAINT users_status_check
  CHECK (status IN ('active', 'disabled')) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT users_status_check;`,
  rolloutNotes: [
    "Use this pattern before SET NOT NULL or other invariant-tightening migrations.",
  ],
};

export const SAFE_REWRITE_ADD_UNIQUE_USING_INDEX: SafeRewrite = {
  title: "Build a unique index concurrently, then attach it",
  summary:
    "Create the backing unique index in the safer online path first, then add the UNIQUE constraint using that existing index.",
  sql: `CREATE UNIQUE INDEX CONCURRENTLY index_users_on_email
  ON users (email);
ALTER TABLE users
  ADD CONSTRAINT users_email_key UNIQUE USING INDEX index_users_on_email;`,
  rolloutNotes: [
    "Confirm duplicate rows are cleaned up before attempting the unique index build.",
  ],
};

export const SAFE_REWRITE_ADD_PRIMARY_KEY_USING_INDEX: SafeRewrite = {
  title: "Prepare the primary key index first",
  summary:
    "When operationally possible, build the unique index first and then attach it as the PRIMARY KEY in a follow-up step.",
  sql: `CREATE UNIQUE INDEX CONCURRENTLY index_users_on_id
  ON users (id);
ALTER TABLE users
  ADD CONSTRAINT users_pkey PRIMARY KEY USING INDEX index_users_on_id;`,
  rolloutNotes: [
    "Primary key changes can still be operationally sensitive, so test the exact rollout against your framework and replication setup.",
  ],
};

export const SAFE_REWRITE_REINDEX_CONCURRENTLY: SafeRewrite = {
  title: "Use concurrent reindexing",
  summary:
    "Where supported, concurrent reindexing reduces the blocking impact of rebuilding index structures.",
  sql: `REINDEX INDEX CONCURRENTLY index_users_on_email;`,
  rolloutNotes: [
    "Pick the INDEX or TABLE target that matches the specific rebuild you need.",
  ],
};

export const SAFE_REWRITE_REFRESH_MATERIALIZED_VIEW_CONCURRENTLY: SafeRewrite = {
  title: "Refresh the materialized view concurrently",
  summary:
    "When the materialized view has a suitable unique index, CONCURRENTLY allows reads to continue during refresh.",
  sql: `-- Requires a unique index that covers all rows of the materialized view.
REFRESH MATERIALIZED VIEW CONCURRENTLY reporting_daily_active_users;`,
  rolloutNotes: [
    "If the view does not yet have the required unique index, add that first before relying on the concurrent refresh path.",
  ],
};

export const SAFE_REWRITE_BATCHED_BACKFILL: SafeRewrite = {
  title: "Move the backfill out of the migration and batch it",
  summary:
    "Large data movement is safer when it runs in controlled batches outside the schema migration transaction.",
  sql: `-- Schema step:
ALTER TABLE users ADD COLUMN normalized_email text;

-- Backfill step run separately in batches:
-- UPDATE users
-- SET normalized_email = lower(email)
-- WHERE id >= :start_id
--   AND id < :end_id
--   AND normalized_email IS NULL;
--
-- Repeat by primary-key range or job queue until complete.
-- After validation, tighten constraints in a later migration.`,
  rolloutNotes: [
    "Use primary-key ranges or a job queue so you can pause, retry, and observe the backfill safely.",
  ],
};

export const SAFE_REWRITE_LOCK_TIMEOUT_PREAMBLE: SafeRewrite = {
  title: "Set explicit timeout guardrails",
  summary:
    "Choose example timeout values as a starting point, then tune them for your environment and rollout expectations.",
  sql: `-- Example only: choose values that fit your workload and deploy policy.
SET lock_timeout = '5s';
SET statement_timeout = '5min';`,
  rolloutNotes: [
    "A short lock_timeout prevents surprise blocking waits; statement_timeout keeps unexpected long-running work from lingering forever.",
  ],
};

export const SAFE_REWRITE_SAFE_ENUM_DEPLOYMENT: SafeRewrite = {
  title: "Roll out enum changes in an application-compatible sequence",
  summary:
    "Prefer additive enum changes and application compatibility windows over in-place renames during rolling deploys.",
  sql: `-- 1. Add the new enum value in a dedicated step:
ALTER TYPE order_state ADD VALUE IF NOT EXISTS 'archived';

-- 2. Deploy the application so it understands both old and new semantics.
-- 3. Backfill data gradually if business meaning changes.
-- 4. Avoid renaming enum labels in place unless every runtime component is already updated.`,
  rolloutNotes: [
    "Enum label renames are hard to roll back cleanly because application code and stored data may both depend on the old literal.",
  ],
};

export const SAFE_REWRITE_SPLIT_RISKY_MIGRATION: SafeRewrite = {
  title: "Split risky DDL into separate deploy steps",
  summary:
    "Break the migration into smaller, purpose-built steps so teams can observe each change independently and recover more easily.",
  sql: `-- Migration 1: additive schema changes
ALTER TABLE users ADD COLUMN status text;

-- Migration 2: online index or validation steps
CREATE INDEX CONCURRENTLY index_users_on_status ON users (status);

-- Separate backfill job
-- UPDATE users SET status = 'active' WHERE id BETWEEN ...;

-- Migration 3: constraint tightening or cleanup
ALTER TABLE users
  ADD CONSTRAINT users_status_present CHECK (status IS NOT NULL) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT users_status_present;`,
  rolloutNotes: [
    "Splitting risky work reduces the blast radius and makes it easier to pause between deploy phases.",
  ],
};
