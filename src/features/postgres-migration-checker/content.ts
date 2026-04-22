import type { DocumentationLink } from "./types";

export const postgresMigrationCheckerChecks = [
  "Locks and blocking DDL behavior",
  "Downtime risk and rollout sequencing",
  "Table rewrites from expensive ALTER patterns",
  "Unsafe indexes and missing CONCURRENTLY usage",
  "Dangerous constraints and validation timing",
  "Destructive operations like drops or narrowing type changes",
  "Transaction issues around incompatible statements",
] as const;

export const postgresMigrationCheckerBrowserPromises = [
  "No login required for the first tool.",
  "Pasted SQL is intended to stay in your browser.",
  "No upload of migration text to Authos servers.",
  "No database connection required to inspect a script.",
] as const;

export const postgresMigrationCheckerReferenceLinks = [
  {
    label: "PostgreSQL explicit locking",
    href: "https://www.postgresql.org/docs/18/explicit-locking.html",
    description: "Primary reference for table lock levels and lock conflict behavior.",
  },
  {
    label: "PostgreSQL CREATE INDEX",
    href: "https://www.postgresql.org/docs/18/sql-createindex.html",
    description: "Reference for CONCURRENTLY behavior and non-concurrent index tradeoffs.",
  },
  {
    label: "PostgreSQL ALTER TABLE",
    href: "https://www.postgresql.org/docs/18/sql-altertable.html",
    description: "Primary reference for rewrite-prone ALTER TABLE behavior and constraints.",
  },
] as const satisfies readonly DocumentationLink[];

export const postgresMigrationCheckerTrustBadges = [
  "Runs locally in your browser",
  "No login required",
  "PR-ready report",
] as const;

export const postgresMigrationCheckerUnsafeExampleSql = `BEGIN;
ALTER TABLE users ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX idx_users_last_seen_at ON users (last_seen_at);
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_user_id_fk
  FOREIGN KEY (user_id) REFERENCES users(id);
TRUNCATE TABLE staging_webhooks;
COMMIT;`;

export const postgresMigrationCheckerSafeExampleSql = `ALTER TABLE users ADD COLUMN last_seen_at timestamptz;
UPDATE users SET last_seen_at = NOW() WHERE last_seen_at IS NULL;
CREATE INDEX CONCURRENTLY idx_users_last_seen_at ON users (last_seen_at);
ALTER TABLE users ALTER COLUMN last_seen_at SET NOT NULL;`;

export const postgresMigrationCheckerCatchCards = [
  {
    title: "Table rewrites",
    description:
      "Spot ALTER TABLE patterns that can rewrite an entire large table and turn a normal deploy into a long-running storage event.",
  },
  {
    title: "Access exclusive locks",
    description:
      "Call out statements that can block reads or writes with strong locks and create immediate production impact.",
  },
  {
    title: "Non-concurrent indexes",
    description:
      "Warn when CREATE INDEX or DROP INDEX should likely be rolled out with CONCURRENTLY on a busy table.",
  },
  {
    title: "Constraints that scan large tables",
    description:
      "Highlight foreign keys, checks, and validations that may scan or validate more data than reviewers expect.",
  },
  {
    title: "Drops and truncates",
    description:
      "Surface destructive operations early so the review includes reversibility and rollback planning.",
  },
  {
    title: "Transaction-unsafe statements",
    description:
      "Catch statements that conflict with migration runners that wrap everything in a transaction by default.",
  },
  {
    title: "Framework migration gotchas",
    description:
      "Flag behavior that changes depending on whether the migration came from Rails, Django, Prisma, Flyway, or raw SQL.",
  },
] as const;

export const postgresMigrationCheckerHowItWorksSteps = [
  {
    title: "Paste or upload SQL",
    description:
      "Start with the exact migration you plan to run so review happens against the real production change, not a simplified summary.",
  },
  {
    title: "Choose PostgreSQL version and framework preset",
    description:
      "Match the environment you actually deploy to, because lock behavior, migration wrappers, and rollout advice depend on version and tooling.",
  },
  {
    title: "Review findings",
    description:
      "Read grouped warnings for locks, rewrites, indexes, constraints, data loss, transactions, and framework-specific risk.",
  },
  {
    title: "Copy a safer rewrite or PR report",
    description:
      "Use the output to give reviewers a clearer rollout plan, safer SQL shape, and a PR-ready explanation of risk.",
  },
] as const;

export const postgresMigrationCheckerUseCases = [
  {
    title: "Reviewing Rails, Django, or Prisma migrations",
    description:
      "Use it before a deploy when framework helpers hide the actual SQL or transaction behavior from reviewers.",
  },
  {
    title: "Checking ALTER TABLE statements before deploy",
    description:
      "Validate that a schema change is not about to take a stronger lock or trigger a rewrite on a hot table.",
  },
  {
    title: "Reviewing code review diffs",
    description:
      "Paste the migration from a pull request and get a more operationally useful review than a plain SQL skim.",
  },
  {
    title: "Teaching junior engineers safe migrations",
    description:
      "Turn risky statements into concrete lessons about phased rollouts, validation timing, and concurrent index strategies.",
  },
  {
    title: "Incident prevention",
    description:
      "Use the tool as a fast preflight check before the migration ever reaches a staging or production deploy window.",
  },
] as const;

export const postgresMigrationCheckerWhyLocalFirstPoints = [
  "Migrations can reveal schema design, customer model names, and business logic that should stay inside your team.",
  "The default Authos tool should not upload raw SQL just to provide a basic safety review.",
  "Product analytics, if added later, must never include raw SQL or schema-specific payloads.",
] as const;

export const postgresMigrationCheckerFaqEntries = [
  {
    question: "Is this a replacement for a DBA?",
    answer:
      "No. It is a fast preflight review tool, not a substitute for senior database judgment. The goal is to catch obvious lock, rewrite, constraint, and transaction risks earlier so a reviewer or DBA can spend time on the higher-context decisions.",
  },
  {
    question: "Does it connect to my database?",
    answer:
      "No. The checker is designed to review pasted migration SQL locally in the browser without opening a database connection or inspecting live metadata.",
  },
  {
    question: "Does my SQL leave the browser?",
    answer:
      "The first Authos tool is intentionally designed so pasted SQL stays in the browser. Raw SQL should not be uploaded to a backend and should never appear in analytics payloads.",
  },
  {
    question: "What PostgreSQL versions are supported?",
    answer:
      "The main browser workflow targets PostgreSQL 11 through 18 with version-aware guidance, while some legacy analyzer logic still keeps older behavior in mind for rule tuning.",
  },
  {
    question: "Why is CREATE INDEX CONCURRENTLY safer?",
    answer:
      "A normal CREATE INDEX can block writes on the target table. CREATE INDEX CONCURRENTLY is usually safer for busy production tables because it avoids that write-blocking pattern, even though it comes with its own operational caveats.",
  },
  {
    question: "Why can ALTER TABLE lock production?",
    answer:
      "Some ALTER TABLE operations take strong locks or force a table rewrite. On a high-traffic table that can block application queries long enough to create visible downtime or cascading queue buildup.",
  },
  {
    question: "Can this check Rails migrations?",
    answer:
      "Yes. The checker already supports a Rails preset so you can reason about helpers such as disable_ddl_transaction! and index rollout patterns alongside the SQL itself.",
  },
  {
    question: "Can I use this in CI?",
    answer:
      "Not yet in this baseline. The contracts are being laid out so the same rules can later power browser review, CI validation, and PR summaries from one analyzer core.",
  },
] as const;

export const postgresMigrationCheckerRelatedTools = [
  {
    name: "SQL EXPLAIN Plan Visualizer",
    description:
      "Coming soon for query-shape review and plan debugging during optimization work.",
  },
  {
    name: "SQL Formatter and Linter",
    description:
      "Coming soon for cleaner review diffs and more consistent SQL authoring.",
  },
  {
    name: "DDL to ER Diagram",
    description:
      "Coming soon for fast schema understanding from database definitions.",
  },
  {
    name: "OpenAPI Breaking Change Diff",
    description:
      "Coming soon for contract review on the API side of the same deploy workflow.",
  },
] as const;
