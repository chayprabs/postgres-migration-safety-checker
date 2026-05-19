# PostgreSQL Migration Checker Rules

## Goal

The PostgreSQL Migration Safety Checker reviews migration SQL before it ships. The
analyzer splits input into `MigrationStatement[]`, parses with `@supabase/pg-parser`
when possible, applies deterministic `PGM*` rules, and returns a structured
`AnalysisResult`.

## Implemented pipeline

| Stage | Location |
|-------|----------|
| Statement splitting | `analyzer/splitSqlStatements.ts` |
| Parser adapter | `analyzer/parserAdapter.ts` (`@supabase/pg-parser` 15–17) |
| Fallback classification | `analyzer/classifyStatement.ts` |
| Framework + transaction context | `analyzer/frameworkContext.ts`, `rules/utils.ts` |
| Rule engine | `analyzer/rules/index.ts` (**39 registered rules**) |
| Derived rules | `PGM031` (lock timeout), `PGM039` (bundled risky DDL) |
| Secret detection | `analyzer/security/secretDetection.ts` |
| Safe rewrite recipes | `analyzer/recipes/` |
| Risk scoring | `analyzer/scoring.ts`, `analyzer/riskSummary.ts` |
| Browser execution | `analyzer/worker/client.ts`, `analyzer.worker.ts` |
| Tests | `__tests__/`, `analyzer/rules/index.test.ts`, E2E in `e2e/` |

## Coverage areas

- Locking and explicit `LOCK TABLE`
- Downtime sequencing and migration bundling
- Table rewrites (`ALTER COLUMN TYPE`, `VACUUM FULL`, `CLUSTER`, defaults)
- Unsafe index operations (non-concurrent create/drop/reindex)
- Constraint rollout (`NOT VALID`, `VALIDATE CONSTRAINT`, FK, CHECK, UNIQUE)
- Destructive operations (drop table/column/schema/type, truncate)
- Transaction incompatibilities (`CREATE INDEX CONCURRENTLY` in transactions)
- Framework-specific traps (Rails, Goose, Liquibase, Prisma, etc.)
- Version-specific behavior (PG 10–18 profiles; parser maps to 15–17 grammar)
- Secret patterns in pasted SQL

## Supported PostgreSQL targets

UI and rule profiles target PostgreSQL **10 through 18**.

Parser WASM bundles support **15, 16, and 17** only. Older and PG 18 targets use
`getNearestParserVersion()` with a `parser.version-fallback` diagnostic. See
`docs/project-facts.md`.

## Supported framework presets

`raw-sql`, `rails`, `django`, `prisma`, `knex`, `sequelize`, `flyway`, `liquibase`,
`goose`, `node-pg-migrate` — defined in `constants/frameworkPresets.ts`.

Framework presets shape transaction assumptions and advisory copy; the rule engine
remains SQL-first.

## Rule IDs

Stable rule identifiers live in `constants/ruleIds.ts` and match exported rules in
`analyzer/rules/index.ts` (`PGM001` … `PGM039`).

Legacy dotted IDs such as `pg.locking.access-exclusive-ddl` from early design docs
were **not implemented**; use the `PGM*` registry instead.

## Finding contract

Every finding includes: `id`, `ruleId`, `title`, `summary`, `severity`, `category`,
`statementIndex`, optional source location, `whyItMatters`, `recommendedAction`,
optional `safeRewrite`, `docsLinks`, `confidence`, and `tags`.

## Rule-writing guidance

- Keep rule evaluation pure and deterministic.
- Prefer explicit statement evidence; set `confidence` for heuristics.
- Attach concrete `safeRewrite` templates when possible.
- Link to primary PostgreSQL documentation via `docsLinks.ts`.

## Out of scope (by design)

- Live database connections, lock observation, or row counts
- Schema-aware validation from pasted DDL (roadmap)
- Guaranteed zero-downtime outcomes
