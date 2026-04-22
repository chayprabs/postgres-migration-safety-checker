import type {
  DocumentationLink,
  FrameworkPreset,
} from "../types";

export type FrameworkPresetDefinition = {
  id: FrameworkPreset;
  label: string;
  description: string;
  assumeTransactionDefault: boolean;
  commonMigrationFilePatterns: string[];
  commonRisks: string[];
  safeIndexAdvice: string;
  safeConstraintAdvice: string;
  docsLinks: DocumentationLink[];
  transactionDisableHint?: string;
  migrationReviewChecklist: string[];
};

export const FRAMEWORK_PRESET_DEFINITIONS = [
  {
    id: "raw-sql",
    label: "Raw SQL",
    description:
      "Hand-written SQL reviewed directly, without a framework-owned transaction wrapper or migration helper layer by default.",
    assumeTransactionDefault: false,
    commonMigrationFilePatterns: ["*.sql", "manual review snippets", "psql scripts"],
    commonRisks: [
      "Explicit BEGIN ... COMMIT blocks are easy to miss during review.",
      "Operational guardrails like lock_timeout are only present if teams add them deliberately.",
    ],
    safeIndexAdvice:
      "Use dedicated non-transactional steps for CREATE INDEX CONCURRENTLY and DROP INDEX CONCURRENTLY.",
    safeConstraintAdvice:
      "Prefer NOT VALID plus VALIDATE CONSTRAINT and split large backfills from schema DDL.",
    docsLinks: [
      {
        label: "PostgreSQL CREATE INDEX",
        href: "https://www.postgresql.org/docs/current/sql-createindex.html",
      },
      {
        label: "PostgreSQL ALTER TABLE",
        href: "https://www.postgresql.org/docs/current/sql-altertable.html",
      },
    ],
    transactionDisableHint:
      "Keep online-only DDL outside any explicit BEGIN ... COMMIT block.",
    migrationReviewChecklist: [
      "Confirm whether the script contains an explicit transaction block.",
      "Add lock_timeout and statement_timeout before risky DDL.",
      "Split backfills and destructive cleanup from additive schema changes.",
    ],
  },
  {
    id: "rails",
    label: "Rails",
    description:
      "Active Record migrations usually run in a transaction unless the migration class opts out with disable_ddl_transaction!.",
    assumeTransactionDefault: true,
    commonMigrationFilePatterns: ["db/migrate/*.rb", "db/structure.sql"],
    commonRisks: [
      "CREATE INDEX CONCURRENTLY fails unless disable_ddl_transaction! is used.",
      "Generated ALTER TABLE changes can still be deploy-unsafe during rolling releases.",
      "Strong Migrations-style expand/contract rollouts are often needed for renames and drops.",
    ],
    safeIndexAdvice:
      "Use disable_ddl_transaction! with add_index ..., algorithm: :concurrently for online index rollout steps.",
    safeConstraintAdvice:
      "Split add_constraint-style work into NOT VALID and VALIDATE phases, then deploy cleanup later.",
    docsLinks: [
      {
        label: "Rails Active Record Migrations",
        href: "https://guides.rubyonrails.org/active_record_migrations.html",
      },
      {
        label: "Rails Migration API",
        href: "https://api.rubyonrails.org/classes/ActiveRecord/Migration.html",
      },
    ],
    transactionDisableHint:
      "Add disable_ddl_transaction! to the migration class before concurrent index operations.",
    migrationReviewChecklist: [
      "Check for disable_ddl_transaction! before CREATE INDEX CONCURRENTLY or DROP INDEX CONCURRENTLY.",
      "Prefer additive columns, batched backfills, and later cleanup over direct renames or drops.",
      "Review generated schema helpers with the same caution as raw SQL.",
    ],
  },
  {
    id: "django",
    label: "Django",
    description:
      "Django migrations are atomic by default, so PostgreSQL statements that require non-transactional execution need explicit opt-out.",
    assumeTransactionDefault: true,
    commonMigrationFilePatterns: ["*/migrations/*.py", "sqlmigrate output"],
    commonRisks: [
      "RunSQL with CREATE INDEX CONCURRENTLY needs atomic = False.",
      "Schema and data operations are often bundled into one migration unless reviewers split them deliberately.",
    ],
    safeIndexAdvice:
      "Use atomic = False around RunSQL or a dedicated non-atomic migration for concurrent index work.",
    safeConstraintAdvice:
      "Split state operations from database operations when phased NOT VALID and VALIDATE steps are easier to review separately.",
    docsLinks: [
      {
        label: "Django migrations",
        href: "https://docs.djangoproject.com/en/stable/topics/migrations/",
      },
      {
        label: "Django RunSQL",
        href: "https://docs.djangoproject.com/en/stable/ref/migration-operations/#runsql",
      },
    ],
    transactionDisableHint:
      "Mark the migration with atomic = False before using concurrent index statements.",
    migrationReviewChecklist: [
      "Check whether the migration is atomic by default.",
      "Separate RunSQL backfills from schema DDL when runtime is hard to predict.",
      "Review whether state/database operations should be split for safer rollout.",
    ],
  },
  {
    id: "prisma",
    label: "Prisma",
    description:
      "Prisma migrations are generated first and often reviewed or edited before deploy; treat transaction handling and lock behavior cautiously.",
    assumeTransactionDefault: true,
    commonMigrationFilePatterns: [
      "prisma/migrations/*/migration.sql",
      "_prisma_migrations",
    ],
    commonRisks: [
      "Generated SQL may include destructive or blocking changes that need manual rewrite.",
      "Concurrent index rollout often requires editing the generated SQL and deployment workflow.",
    ],
    safeIndexAdvice:
      "Review generated migration.sql and move concurrent index work into a custom non-transactional deployment step when needed.",
    safeConstraintAdvice:
      "Rewrite generated direct constraints into NOT VALID, VALIDATE, and later cleanup phases for large tables.",
    docsLinks: [
      {
        label: "Prisma customizing migrations",
        href: "https://www.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations",
      },
    ],
    transactionDisableHint:
      "Edit the generated migration flow if PostgreSQL needs the statement to run outside a transaction.",
    migrationReviewChecklist: [
      "Review generated SQL before deploy instead of trusting it blindly.",
      "Rewrite destructive and rewrite-heavy steps into expand/contract phases.",
      "Isolate online index work from the default migration flow when necessary.",
    ],
  },
  {
    id: "knex",
    label: "Knex",
    description:
      "Knex migrations commonly wrap steps in a transaction unless the migration configuration disables it.",
    assumeTransactionDefault: true,
    commonMigrationFilePatterns: ["migrations/*.js", "migrations/*.ts"],
    commonRisks: [
      "Concurrent index operations fail when the migration transaction wrapper stays enabled.",
      "Large backfills are easy to mix into schema changes inside one migration file.",
    ],
    safeIndexAdvice:
      "Disable the migration transaction for steps that use CREATE INDEX CONCURRENTLY or DROP INDEX CONCURRENTLY.",
    safeConstraintAdvice:
      "Use phased constraint rollout with NOT VALID, validation, and follow-up cleanup instead of direct contract changes.",
    docsLinks: [
      {
        label: "Knex migrations",
        href: "https://knexjs.org/guide/migrations.html",
      },
    ],
    transactionDisableHint:
      "Turn off the automatic Knex transaction wrapper for this migration when PostgreSQL requires it.",
    migrationReviewChecklist: [
      "Verify whether the migration config disables transactions for online index steps.",
      "Keep batch backfills outside the schema migration where possible.",
      "Review raw SQL blocks separately from schema builder helpers.",
    ],
  },
  {
    id: "sequelize",
    label: "Sequelize",
    description:
      "Sequelize transaction behavior depends on how the migration author uses queryInterface and transaction objects, so stay explicit.",
    assumeTransactionDefault: false,
    commonMigrationFilePatterns: ["migrations/*.js", "migrations/*.cjs"],
    commonRisks: [
      "Reviewers can over-assume transaction wrapping when the migration actually controls it manually.",
      "Online DDL fails if the migration passes a transaction object anyway.",
    ],
    safeIndexAdvice:
      "Do not pass a transaction object for concurrent index steps that PostgreSQL must run outside a transaction.",
    safeConstraintAdvice:
      "Use explicit phased DDL and avoid coupling Sequelize data fixes with high-lock constraint changes.",
    docsLinks: [
      {
        label: "Sequelize migrations",
        href: "https://sequelize.org/docs/v6/other-topics/migrations/",
      },
    ],
    transactionDisableHint:
      "Keep the concurrent index step outside any Sequelize-managed transaction object.",
    migrationReviewChecklist: [
      "Check whether the migration explicitly creates or passes a transaction.",
      "Review queryInterface helpers for destructive generated SQL.",
      "Separate schema cleanup from data movement where possible.",
    ],
  },
  {
    id: "flyway",
    label: "Flyway",
    description:
      "Flyway transaction handling depends on database support and configuration, so use a cautious default and review non-transactional statements explicitly.",
    assumeTransactionDefault: true,
    commonMigrationFilePatterns: ["V*__*.sql", "R__*.sql"],
    commonRisks: [
      "Statements PostgreSQL rejects in a transaction block may need separate migration handling.",
      "Versioned SQL filenames can hide risky operational differences behind otherwise plain SQL.",
    ],
    safeIndexAdvice:
      "Review Flyway's transaction handling for the target database before shipping concurrent index steps.",
    safeConstraintAdvice:
      "Split large validations and constraint tightening into separate versioned migrations for better review points.",
    docsLinks: [
      {
        label: "Flyway transaction handling",
        href: "https://documentation.red-gate.com/flyway/flyway-concepts/migrations/migration-transaction-handling",
      },
    ],
    transactionDisableHint:
      "Confirm the migration runs outside Flyway transaction wrapping when PostgreSQL requires it.",
    migrationReviewChecklist: [
      "Check whether the uploaded filename matches Flyway versioned migration patterns.",
      "Review PostgreSQL non-transactional statements separately from ordinary DDL.",
      "Prefer smaller versioned migrations over one large mixed-risk file.",
    ],
  },
  {
    id: "liquibase",
    label: "Liquibase",
    description:
      "Liquibase often runs changeSets transactionally, but formatted SQL and changeSet options can disable that per unit of work.",
    assumeTransactionDefault: true,
    commonMigrationFilePatterns: ["changelog/*.sql", "db/changelog/*.sql"],
    commonRisks: [
      "Concurrent index operations need runInTransaction=\"false\" or formatted SQL equivalents.",
      "Large constraint validations can still be bundled into one changeSet unless reviewers split them intentionally.",
    ],
    safeIndexAdvice:
      "Use a dedicated changeSet with runInTransaction=\"false\" for PostgreSQL concurrent index operations.",
    safeConstraintAdvice:
      "Keep constraint creation and validation in separate changeSets when you need NOT VALID plus later validation.",
    docsLinks: [
      {
        label: "Liquibase runInTransaction",
        href: "https://docs.liquibase.com/reference-guide/changelog-attributes/runintransaction",
      },
    ],
    transactionDisableHint:
      "Set runInTransaction=\"false\" on the changeSet that contains concurrent index DDL.",
    migrationReviewChecklist: [
      "Look for formatted SQL comments or changeSet attributes that change transaction behavior.",
      "Prefer separate changeSets for add-not-valid and validate phases.",
      "Review whether lock-heavy changes should be broken into multiple deploys.",
    ],
  },
  {
    id: "goose",
    label: "Goose",
    description:
      "Goose SQL migrations default to transactional execution unless the file opts out with a NO TRANSACTION annotation.",
    assumeTransactionDefault: true,
    commonMigrationFilePatterns: ["migrations/*.sql", "-- +goose Up/Down files"],
    commonRisks: [
      "Concurrent index statements fail unless the file includes -- +goose NO TRANSACTION.",
      "Goose SQL files often mix schema and data work unless reviewers split them deliberately.",
    ],
    safeIndexAdvice:
      "Add -- +goose NO TRANSACTION and isolate concurrent index work into its own migration file.",
    safeConstraintAdvice:
      "Use separate Goose migrations for NOT VALID creation, validation, and later destructive cleanup.",
    docsLinks: [
      {
        label: "Goose SQL migrations",
        href: "https://github.com/pressly/goose#sql-migrations",
      },
    ],
    transactionDisableHint:
      "Add -- +goose NO TRANSACTION before PostgreSQL concurrent index steps.",
    migrationReviewChecklist: [
      "Check for -- +goose NO TRANSACTION when PostgreSQL requires a non-transactional path.",
      "Keep large backfills out of the schema migration file when possible.",
      "Use separate files for additive schema, validations, and destructive cleanup.",
    ],
  },
  {
    id: "node-pg-migrate",
    label: "node-pg-migrate",
    description:
      "node-pg-migrate commonly runs inside a transaction unless configuration disables it for the migration or command.",
    assumeTransactionDefault: true,
    commonMigrationFilePatterns: ["migrations/*.js", "migrations/*.ts"],
    commonRisks: [
      "Concurrent indexes fail unless transactions are disabled for that migration.",
      "Generated helpers can still hide lock-heavy PostgreSQL behavior from reviewers.",
    ],
    safeIndexAdvice:
      "Disable transactions for the migration that contains concurrent index work and keep it isolated.",
    safeConstraintAdvice:
      "Use phased PostgreSQL-native constraint rollout even when helper methods exist.",
    docsLinks: [
      {
        label: "node-pg-migrate migrations",
        href: "https://salsita.github.io/node-pg-migrate/migrations/",
      },
    ],
    transactionDisableHint:
      "Disable transactions for the migration or step that uses concurrent index operations.",
    migrationReviewChecklist: [
      "Verify whether the migration disables transactions for PostgreSQL online DDL.",
      "Review helper-generated SQL with the same caution as hand-written SQL.",
      "Split destructive cleanup into a later migration after application rollout.",
    ],
  },
] as const satisfies readonly FrameworkPresetDefinition[];

export const FRAMEWORK_PRESETS = FRAMEWORK_PRESET_DEFINITIONS.map(
  (definition) => definition.id,
);

const FRAMEWORK_PRESET_DEFINITION_MAP = new Map(
  FRAMEWORK_PRESET_DEFINITIONS.map((definition) => [definition.id, definition]),
);

export function getFrameworkPresetDefinition(
  frameworkPreset: FrameworkPreset,
): FrameworkPresetDefinition {
  const definition = FRAMEWORK_PRESET_DEFINITION_MAP.get(frameworkPreset);

  if (!definition) {
    throw new Error(`Unknown framework preset: ${frameworkPreset}`);
  }

  return definition;
}

export function getFrameworkTransactionDefault(frameworkPreset: FrameworkPreset) {
  return getFrameworkPresetDefinition(frameworkPreset).assumeTransactionDefault;
}
