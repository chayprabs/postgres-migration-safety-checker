import type { DocumentationLink } from "./types";

export type PostgresDocsArticleSection = {
  bullets?: readonly string[];
  paragraphs: readonly string[];
  title: string;
};

export type PostgresDocsArticle = {
  cardSummary: string;
  description: string;
  officialLinks: readonly DocumentationLink[];
  relatedSlugs: readonly string[];
  sections: readonly PostgresDocsArticleSection[];
  slug: string;
  sqlExample: {
    code: string;
    title: string;
  };
  title: string;
};

export const postgresDocsArticles = [
  {
    slug: "postgresql-migration-locks",
    title: "PostgreSQL Migration Locks: Why DDL Blocks Production",
    description:
      "Learn the PostgreSQL lock levels behind risky migrations, why ALTER TABLE and CREATE INDEX block production, and how to review DDL before a deploy window.",
    cardSummary:
      "Understand the table-level lock modes behind risky migrations and why even small schema changes can stall traffic.",
    sqlExample: {
      title: "Example migration that can block production traffic",
      code: `BEGIN;
ALTER TABLE public.users
  ADD COLUMN marketing_opt_in boolean NOT NULL DEFAULT false;

CREATE INDEX idx_users_marketing_opt_in
  ON public.users (marketing_opt_in);
COMMIT;`,
    },
    officialLinks: [
      {
        label: "PostgreSQL explicit locking",
        href: "https://www.postgresql.org/docs/current/static/explicit-locking.html",
        description:
          "Official table-level lock mode reference, including SHARE, SHARE UPDATE EXCLUSIVE, and ACCESS EXCLUSIVE.",
      },
      {
        label: "PostgreSQL ALTER TABLE",
        href: "https://www.postgresql.org/docs/current/sql-altertable.html",
        description:
          "Official reference for ALTER TABLE forms that may scan or rewrite a table.",
      },
      {
        label: "PostgreSQL CREATE INDEX",
        href: "https://www.postgresql.org/docs/current/sql-createindex.html",
        description:
          "Official reference for blocking and concurrent index creation behavior.",
      },
    ],
    relatedSlugs: [
      "create-index-concurrently",
      "safe-postgres-not-null-migration",
      "postgres-foreign-key-not-valid",
    ],
    sections: [
      {
        title: "Why migrations block application traffic",
        paragraphs: [
          "PostgreSQL schema changes do not just edit metadata in the background. Many migration statements take table-level locks, and some of those locks conflict with the reads or writes your application needs to keep serving requests.",
          "The dangerous pattern is not only a single strong lock. A migration can also wait behind another transaction, hold locks longer than expected, or stack multiple DDL statements into one transaction so the whole batch behaves like the slowest step.",
        ],
      },
      {
        title: "The lock levels worth memorizing",
        paragraphs: [
          "You do not need every lock matrix entry in your head, but it helps to recognize the names that show up most often during migration review.",
        ],
        bullets: [
          "ACCESS EXCLUSIVE is the red-flag lock. It blocks ordinary SELECT queries and all writes.",
          "SHARE blocks writes while allowing plain reads. A regular CREATE INDEX uses this lock on the table.",
          "SHARE UPDATE EXCLUSIVE is still significant. It protects against competing schema changes and is used by CREATE INDEX CONCURRENTLY and VALIDATE CONSTRAINT.",
          "SHARE ROW EXCLUSIVE appears on some ALTER TABLE and foreign-key operations. It blocks ordinary writes and can serialize competing migration work.",
        ],
      },
      {
        title: "How to review a migration before deploy",
        paragraphs: [
          "Treat migration review as rollout planning, not just syntax review. Ask which statements rewrite the table, which ones validate existing rows, and which ones can be split into smaller phases.",
          "A good default is to separate nullable column addition, backfill, validation, index creation, and constraint enforcement. That keeps the highest-risk steps visible and reduces the chance that a single transaction turns into a production-wide pause.",
        ],
        bullets: [
          "Prefer CREATE INDEX CONCURRENTLY for busy tables when PostgreSQL allows it.",
          "Use NOT VALID plus a later validation step for large foreign keys and check constraints.",
          "Avoid mixing long backfills with blocking DDL in the same migration transaction.",
          "Remember that a migration checker can flag likely lock risks, but it cannot see your live traffic, long-running transactions, or replication lag.",
        ],
      },
    ],
  },
  {
    slug: "create-index-concurrently",
    title: "CREATE INDEX CONCURRENTLY: When to Use It and Why Transactions Matter",
    description:
      "Learn when CREATE INDEX CONCURRENTLY is safer than a regular CREATE INDEX, what caveats it has, and why it fails inside a transaction block.",
    cardSummary:
      "Use CREATE INDEX CONCURRENTLY for busy tables, but understand the transaction caveat and longer-running build behavior.",
    sqlExample: {
      title: "Safe and unsafe index build shapes",
      code: `-- Safer for a busy production table
CREATE INDEX CONCURRENTLY idx_orders_created_at
  ON public.orders (created_at DESC);

-- This fails because CONCURRENTLY cannot run inside a transaction block
BEGIN;
CREATE INDEX CONCURRENTLY idx_orders_status
  ON public.orders (status);
COMMIT;`,
    },
    officialLinks: [
      {
        label: "PostgreSQL CREATE INDEX",
        href: "https://www.postgresql.org/docs/current/sql-createindex.html",
        description:
          "Official syntax and caveats for CREATE INDEX and CREATE INDEX CONCURRENTLY.",
      },
      {
        label: "PostgreSQL index introduction",
        href: "https://www.postgresql.org/docs/current/indexes-intro.html",
        description:
          "High-level explanation of blocking writes for regular CREATE INDEX and the tradeoffs of concurrent builds.",
      },
      {
        label: "PostgreSQL progress reporting",
        href: "https://www.postgresql.org/docs/current/progress-reporting.html",
        description:
          "Useful if you want to observe CREATE INDEX CONCURRENTLY progress in a live system.",
      },
    ],
    relatedSlugs: [
      "postgresql-migration-locks",
      "rails-postgres-migration-safety",
      "safe-postgres-not-null-migration",
    ],
    sections: [
      {
        title: "Why teams reach for CONCURRENTLY",
        paragraphs: [
          "A regular CREATE INDEX uses a SHARE lock on the table, which blocks writes until the build finishes. That can be fine for tiny tables or maintenance windows, but it is often unacceptable on a hot production table.",
          "CREATE INDEX CONCURRENTLY is slower and more operationally awkward, but it allows normal inserts, updates, and deletes to continue during the build. That tradeoff is exactly why it shows up so often in zero-downtime migration plans.",
        ],
      },
      {
        title: "The transaction caveat is real",
        paragraphs: [
          "PostgreSQL does not allow CREATE INDEX CONCURRENTLY inside a transaction block. If your framework wraps migrations in a transaction by default, the statement fails even if the SQL itself looks correct.",
          "That means the migration review question is not only 'did we use CONCURRENTLY?' It is also 'does our migration runner disable DDL transactions for this file?' Rails and other frameworks need an explicit escape hatch here.",
        ],
      },
      {
        title: "Operational costs to plan for",
        paragraphs: [
          "Concurrent index builds usually take longer than regular builds, may perform more than one table scan, and can leave behind an invalid index if the operation is interrupted or conflicts with other failures.",
          "Use CONCURRENTLY when write availability matters more than absolute runtime. For very small tables or one-off maintenance windows, a normal CREATE INDEX may still be the simpler choice.",
        ],
        bullets: [
          "Use it on large or write-heavy tables.",
          "Do not wrap it inside BEGIN/COMMIT.",
          "Check for invalid indexes if a deployment fails partway through.",
          "Prefer one risky index build per migration so failures stay easy to reason about.",
        ],
      },
    ],
  },
  {
    slug: "safe-postgres-not-null-migration",
    title: "Safe PostgreSQL NOT NULL Migration for Busy Tables",
    description:
      "Use a nullable column, backfill, NOT VALID check, validation, and a final SET NOT NULL step to make NOT NULL rollouts safer on large PostgreSQL tables.",
    cardSummary:
      "Roll out NOT NULL in phases instead of forcing a risky one-shot rewrite on a large table.",
    sqlExample: {
      title: "Phased NOT NULL rollout pattern",
      code: `ALTER TABLE public.accounts
  ADD COLUMN billing_plan_id bigint;

UPDATE public.accounts
SET billing_plan_id = 1
WHERE billing_plan_id IS NULL;

ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_billing_plan_id_present
  CHECK (billing_plan_id IS NOT NULL) NOT VALID;

ALTER TABLE public.accounts
  VALIDATE CONSTRAINT accounts_billing_plan_id_present;

ALTER TABLE public.accounts
  ALTER COLUMN billing_plan_id SET NOT NULL;`,
    },
    officialLinks: [
      {
        label: "PostgreSQL ALTER TABLE",
        href: "https://www.postgresql.org/docs/current/sql-altertable.html",
        description:
          "Official reference for SET NOT NULL, CHECK constraints, and validation behavior.",
      },
      {
        label: "PostgreSQL constraints",
        href: "https://www.postgresql.org/docs/current/ddl-constraints.html",
        description:
          "Official background on CHECK and NOT NULL constraints.",
      },
    ],
    relatedSlugs: [
      "postgresql-migration-locks",
      "postgres-foreign-key-not-valid",
      "rails-postgres-migration-safety",
    ],
    sections: [
      {
        title: "Why one-shot NOT NULL changes are risky",
        paragraphs: [
          "The tempting migration is ADD COLUMN ... NOT NULL DEFAULT ... or a direct ALTER COLUMN SET NOT NULL on a column that has not been cleaned up yet. On a large table, that can combine validation, locking, and data movement in one step that is harder to predict under real traffic.",
          "A phased rollout keeps the high-risk work separate: first add the column in a shape the application can tolerate, then backfill, then prove the invariant, and only then enforce the final NOT NULL property.",
        ],
      },
      {
        title: "Why the CHECK plus VALIDATE pattern helps",
        paragraphs: [
          "PostgreSQL documents that SET NOT NULL normally scans the whole table, but that scan can be skipped when a valid CHECK constraint already proves the column contains no NULL values. That is why teams often add CHECK (column IS NOT NULL) NOT VALID first, validate it, and then finish with SET NOT NULL.",
          "The validated CHECK becomes evidence for the final enforcement step, and the migration plan becomes easier to observe and roll back if something goes wrong before the last command.",
        ],
      },
      {
        title: "Practical rollout advice",
        paragraphs: [
          "This is also an application rollout problem. The app usually needs to tolerate NULL during the backfill window, or write both old and new shapes until the migration is complete.",
        ],
        bullets: [
          "Deploy code that can handle NULL before the backfill begins.",
          "Backfill in small batches if the table is large enough to stress autovacuum, WAL, or replicas.",
          "Validate the CHECK before SET NOT NULL so PostgreSQL can use that proof.",
          "Drop the helper CHECK later if you want the final schema to keep only the NOT NULL constraint.",
        ],
      },
    ],
  },
  {
    slug: "postgres-foreign-key-not-valid",
    title: "PostgreSQL Foreign Key NOT VALID and VALIDATE CONSTRAINT",
    description:
      "Add large foreign keys more safely with NOT VALID and VALIDATE CONSTRAINT so the initial migration commits quickly and the expensive verification step happens later.",
    cardSummary:
      "Use NOT VALID plus VALIDATE CONSTRAINT to avoid a painful one-shot foreign-key rollout on large existing tables.",
    sqlExample: {
      title: "Safer foreign-key rollout on a populated table",
      code: `ALTER TABLE public.orders
  ADD CONSTRAINT orders_account_id_fkey
  FOREIGN KEY (account_id)
  REFERENCES public.accounts(id)
  NOT VALID;

ALTER TABLE public.orders
  VALIDATE CONSTRAINT orders_account_id_fkey;`,
    },
    officialLinks: [
      {
        label: "PostgreSQL ALTER TABLE",
        href: "https://www.postgresql.org/docs/current/sql-altertable.html",
        description:
          "Official reference for NOT VALID and VALIDATE CONSTRAINT, including lock notes.",
      },
      {
        label: "PostgreSQL constraints",
        href: "https://www.postgresql.org/docs/current/ddl-constraints.html",
        description:
          "Official foreign-key background and constraint behavior.",
      },
    ],
    relatedSlugs: [
      "postgresql-migration-locks",
      "safe-postgres-not-null-migration",
      "rails-postgres-migration-safety",
    ],
    sections: [
      {
        title: "What NOT VALID changes",
        paragraphs: [
          "A normal ADD CONSTRAINT on a large table may spend a long time verifying old rows before the migration can commit. With NOT VALID, PostgreSQL skips that initial full verification of pre-existing rows, so the constraint can be installed much faster.",
          "New inserts and updates are still checked immediately. The only missing guarantee is about rows that were already in the table before the constraint was added.",
        ],
      },
      {
        title: "Why VALIDATE CONSTRAINT is a separate step",
        paragraphs: [
          "VALIDATE CONSTRAINT performs the slower verification pass later, after the constraint already protects new writes. PostgreSQL documents that this validation step uses a lighter lock than doing the entire operation in one shot.",
          "That split is why NOT VALID is a standard zero-downtime migration pattern for foreign keys and some check constraints on large tables.",
        ],
      },
      {
        title: "When this pattern is a good fit",
        paragraphs: [
          "Use it when the table already holds enough rows that you want the migration to commit quickly and make the slow verification step explicit in rollout notes.",
        ],
        bullets: [
          "Create supporting indexes before the foreign-key validation if the workload needs them.",
          "Clean or backfill orphaned data before running VALIDATE CONSTRAINT.",
          "Keep the validation step separate in deploy notes so reviewers know it may still take time.",
          "Do not oversell it: validation still does real work, so you should schedule and observe it like any other important migration step.",
        ],
      },
    ],
  },
  {
    slug: "rails-postgres-migration-safety",
    title: "Rails PostgreSQL Migration Safety: Concurrent Indexes and Transaction Pitfalls",
    description:
      "Review the Rails migration habits that matter most for PostgreSQL safety, including disable_ddl_transaction!, concurrent indexes, phased backfills, and strong_migrations-style caution.",
    cardSummary:
      "Use Rails migrations with PostgreSQL deliberately: disable DDL transactions when required and split risky changes into phases.",
    sqlExample: {
      title: "Rails-safe shape for a concurrent index",
      code: `class AddUsersEmailIndex < ActiveRecord::Migration[7.2]
  disable_ddl_transaction!

  def change
    add_index :users, :email, algorithm: :concurrently
  end
end`,
    },
    officialLinks: [
      {
        label: "Rails Active Record migrations guide",
        href: "https://guides.rubyonrails.org/v7.2/active_record_migrations.html",
        description:
          "Rails guide covering transactional migrations and disable_ddl_transaction!.",
      },
      {
        label: "Rails add_index API",
        href: "https://api.rubyonrails.org/v7.1.0/classes/ActiveRecord/ConnectionAdapters/SchemaStatements.html",
        description:
          "Rails API example for add_index algorithm: :concurrently.",
      },
      {
        label: "PostgreSQL CREATE INDEX",
        href: "https://www.postgresql.org/docs/current/sql-createindex.html",
        description:
          "Official PostgreSQL rule that CREATE INDEX CONCURRENTLY cannot run inside a transaction block.",
      },
    ],
    relatedSlugs: [
      "create-index-concurrently",
      "safe-postgres-not-null-migration",
      "postgres-foreign-key-not-valid",
    ],
    sections: [
      {
        title: "Why Rails teams still get surprised",
        paragraphs: [
          "Rails migrations are pleasant to write, but PostgreSQL still executes real DDL underneath. That means Rails teams inherit PostgreSQL lock behavior even when the migration file looks like a small Ruby DSL change.",
          "The most common surprise is a migration that is syntactically correct for PostgreSQL but still fails because Rails wrapped it in a transaction. Concurrent indexes and certain enum operations are the classic examples.",
        ],
      },
      {
        title: "The practices worth copying from strong_migrations",
        paragraphs: [
          "You do not need a gem to follow the operational habits that strong_migrations popularized: split risky work, avoid write-blocking defaults on large tables, and make concurrent index creation explicit.",
        ],
        bullets: [
          "Use disable_ddl_transaction! for migrations that need CREATE INDEX CONCURRENTLY or other non-transactional DDL.",
          "Separate schema changes from data backfills so deploy failures stay easy to reason about.",
          "Prefer add_index ... algorithm: :concurrently on large, hot tables.",
          "Roll out NOT NULL and foreign keys in phases instead of forcing one-shot enforcement on big tables.",
        ],
      },
      {
        title: "How to review Rails migrations honestly",
        paragraphs: [
          "Ask two questions for every Rails migration: what SQL will PostgreSQL actually run, and what transaction wrapper will Rails apply around it? That pair of answers catches most production surprises.",
          "A Postgres migration checker can help flag lock-heavy DDL, but it will not replace application rollout planning. Rails deploy order, background jobs, validations, and replica lag still matter.",
        ],
      },
    ],
  },
] satisfies readonly PostgresDocsArticle[];

export function getPostgresDocsArticle(slug: string) {
  return postgresDocsArticles.find((article) => article.slug === slug) ?? null;
}

export function getPostgresDocsPath(slug: string) {
  return `/docs/${slug}`;
}
