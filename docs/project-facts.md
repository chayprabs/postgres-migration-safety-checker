# Project facts (verified)

This document records answers to common onboarding questions. Values were verified
against the repository, dependency capabilities, and live domain checks.

## Repository vs product name

| Name | Value |
|------|--------|
| Git remote | `https://github.com/chayprabs/postgres-migration-safety-checker` |
| npm `package.json` name | `authos` (product codename for the multi-tool site) |
| Shipped tool | PostgreSQL Migration Safety Checker only |

This is a **single-app repository**, not a monorepo. The `pnpm-workspace.yaml` file
only configures pnpm build ignores; it does not define workspace packages.

## Production deployment

- **This checker is not deployed at `https://authos.dev`.** That domain serves a
  different product (AuthOS — a self-hosted authentication platform by
  `drmhse/sso`). The checker route `/tools/postgres-migration-safety-checker`
  returns **404** there.
- **No production URL for this repo is configured in git.** Deploy by connecting
  this repository to Vercel (or another Next.js host) and setting
  `NEXT_PUBLIC_SITE_URL` to your deployment origin. Until then, CI and local builds
  use `http://localhost:3000` or `VERCEL_URL` when deployed without the public env var.
- **Canonical URL resolution** (see `src/lib/metadata.ts`):
  1. `NEXT_PUBLIC_SITE_URL` when set
  2. `https://${VERCEL_URL}` on Vercel when unset
  3. `http://localhost:3000` otherwise

## Environment files

- **`.env.example`** is the committed template (copy to `.env.local`).
- **`.env.example` was never present in git history** before this file; README
  referenced it aspirationally.
- All `.env*` paths are gitignored except `.env.example` (see `.gitignore`).

## Verification status (local, 2026-05-19)

After `pnpm install`:

| Command | Result |
|---------|--------|
| `pnpm typecheck` | Pass |
| `pnpm test` | **65 / 65** tests pass (9 files) |
| `pnpm lint` | Pass |
| `pnpm build` | Pass (16 static/SSG routes) |
| `pnpm test:e2e` | Run in CI / locally with Playwright Chromium |

## PostgreSQL 18 and `@supabase/pg-parser`

- The bundled parser (**v0.1.7**) ships WASM grammars for **PostgreSQL 15, 16, and 17 only**.
- Selecting **PostgreSQL 18** (or 10–14) uses `getNearestParserVersion()` in
  `postgresVersionProfiles.ts` (PG 18 → parser **17**) and emits an explicit
  `parser.version-fallback` warning in analysis metadata.
- Rule evaluation remains SQL-heuristic and does not require PG 18 AST support.
- Upgrading parser coverage depends on a future `@supabase/pg-parser` release;
  there is no PG 18 grammar in npm today.

## Next tools and shared architecture

- Additional Authos tools are **registry placeholders** in `src/config/tools.ts`
  (`comingSoonTools`) without routes or feature modules.
- The intended pattern for new tools is documented in `docs/architecture.md`:
  registry entry → `src/features/<tool>` → `src/app/tools/<slug>/page.tsx`.
- The PostgreSQL checker UI is concentrated in
  `PostgresMigrationCheckerShell.tsx` (~4.7k lines). Future tools should extract
  reusable workspace primitives (editor shell, export drawer, settings persistence)
  rather than copying that file wholesale.

## Branding and trademark note

- **Authos** (this repo) is a browser-first **developer tools** brand name used in
  UI copy and package metadata.
- **`authos.dev`** is occupied by an unrelated **authentication / SSO** product.
  Do not point `NEXT_PUBLIC_SITE_URL` at that domain for this project unless you
  intentionally control a separate deployment path on it.
- This document is not legal advice; perform your own trademark and domain review
  before public launch under the Authos name.
