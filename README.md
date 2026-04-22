# Authos

Authos is a browser-first developer tools website. The product is meant to host
multiple focused tools over time, with the PostgreSQL Migration Safety Checker
as the first complete tool.

The first tool route is:

- `/tools/postgres-migration-safety-checker`

## What the product does

Authos is built for careful, high-signal workflows where developers often paste
sensitive technical input. The initial product surface focuses on PostgreSQL
migration review because schema changes can trigger locks, rewrites, downtime,
unsafe index rollouts, transaction surprises, and destructive operations.

## Local-only privacy promise

- The PostgreSQL Migration Safety Checker is designed to run analysis locally in
  the browser.
- No login is required for the first tool.
- No pasted SQL is sent to a backend.
- Raw user SQL must not be sent to analytics, telemetry, or logs.

See [docs/privacy-and-telemetry.md](./docs/privacy-and-telemetry.md) for the
full privacy boundary.

## Stack

- Next.js App Router
- TypeScript with `strict` mode
- Tailwind CSS
- ESLint
- `src/` directory layout
- `@/*` import alias
- `next-themes` for dark mode

## Project structure

- `src/app/*` contains routes and app-level layout/metadata.
- `src/config/tools.ts` is the product registry for tool metadata.
- `src/components/*` contains generic UI primitives and site chrome.
- `src/features/postgres-migration-checker/*` contains PostgreSQL checker domain
  contracts, constants, and feature-specific content.
- `src/lib/site.ts` contains shared site navigation and site-wide copy.
- `docs/*` contains architecture, privacy, and analyzer planning notes.

## Run locally

This project was initialized with `pnpm` because `pnpm` was available in the
environment.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Test and verify

There is not yet a dedicated unit test suite. For the current baseline, use:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

These commands cover linting, TypeScript validation, and production build
verification.

## Environment

Copy `.env.example` to `.env.local` only if you need local overrides. The
example file documents future-safe flags, but the baseline app does not require
any secrets or backend credentials.

## Extending Authos

To add another tool later:

1. Add a new entry to `src/config/tools.ts`.
2. Create a feature folder under `src/features/<tool-name>`.
3. Add the public route under `src/app/tools/<slug>/page.tsx`.
4. Keep privacy-sensitive analysis browser-local unless there is a deliberate,
   documented reason not to.

## Additional documentation

- [Architecture](./docs/architecture.md)
- [Privacy and telemetry](./docs/privacy-and-telemetry.md)
- [PostgreSQL migration checker rules](./docs/postgres-migration-checker-rules.md)
"# postgres-migration-safety-checker" 
