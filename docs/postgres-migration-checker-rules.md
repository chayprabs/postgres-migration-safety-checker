# PostgreSQL Migration Checker Rules

## Goal

The PostgreSQL Migration Safety Checker exists to review migration SQL before it
ships. The analyzer is intended to transform raw SQL into normalized statements,
apply deterministic rule checks, and return a structured `AnalysisResult`.

The current repository includes the data contracts and rule registry foundations
for that future analyzer.

## Coverage areas

The first version of the checker is expected to cover:

- locking
- downtime sequencing
- table rewrites
- unsafe index operations
- dangerous constraint rollout patterns
- destructive or irreversible changes
- transaction incompatibilities
- framework-specific migration runner traps
- version-specific behavior differences

## Supported PostgreSQL targets

The analyzer contracts currently target PostgreSQL versions `11` through `18`.

Notes:

- `11`, `12`, and `13` are treated as legacy analyzer coverage because they
  still appear in long-lived production fleets.
- `14` through `18` are the primary modern targets.
- Official PostgreSQL documentation links are stored in the constants layer so
  rules can reference primary sources.

## Supported framework presets

The analyzer contracts currently include:

- `raw-sql`
- `rails`
- `django`
- `prisma`
- `knex`
- `sequelize`
- `flyway`
- `liquibase`
- `goose`
- `node-pg-migrate`

Framework presets should shape parser hints and transaction assumptions, but the
core rule engine should stay SQL-first.

## Initial rule IDs

The current rule ID registry lives in
`src/features/postgres-migration-checker/constants/ruleIds.ts`.

Initial rule families:

- `pg.locking.access-exclusive-ddl`
- `pg.index.non-concurrent-index-build`
- `pg.index.non-concurrent-index-drop`
- `pg.rewrite.column-rewrite-risk`
- `pg.rewrite.volatile-default-rewrite`
- `pg.constraint.not-valid-recommended`
- `pg.data-loss.destructive-drop-operation`
- `pg.transaction.concurrent-index-in-transaction`
- `pg.version.legacy-version-behavior`
- `pg.framework.transaction-wrapper`

## Finding contract expectations

Every finding must include:

- a stable `id`
- a `ruleId`
- user-facing `title` and `summary`
- `severity`
- `category`
- `statementIndex`
- optional source location information
- `whyItMatters`
- `recommendedAction`
- optional `safeRewrite`
- `docsLinks`
- `confidence`
- `tags`

This is intentionally rich enough to support:

- inline statement annotations
- grouped reports
- JSON export
- future markdown or share-safe summary output

## Rule-writing guidance

- Keep rule evaluation pure and deterministic.
- Prefer explicit statement evidence over fuzzy heuristics when possible.
- If a rule is heuristic, set `confidence` accordingly.
- When possible, attach a concrete `safeRewrite` that reflects phased rollout
  practice rather than only warning about risk.
- Link rules to primary PostgreSQL docs, not blog posts, for baseline guidance.

## Out of scope for the baseline

The repository does not yet include:

- a SQL parser
- a statement normalizer
- a rule execution engine
- a Web Worker analyzer runtime
- automated rule tests

Those pieces should build on the contracts already defined under
`src/features/postgres-migration-checker`.
