# Authos

Authos is a browser-first developer tools product. The current launchable surface
is the PostgreSQL Migration Safety Checker: a local-first review tool for pasted
or uploaded migration SQL that highlights lock risk, transaction hazards,
destructive operations, parser fallback states, and safer rollout patterns
before deploy.

## Product overview

- No login is required for the PostgreSQL checker.
- SQL can be pasted directly into the editor or loaded from a local `.sql` file.
- Analysis runs in the browser with a Web Worker path when available and a
  main-thread fallback when needed.
- Findings include a risk score, summary, lock context, safer rewrite guidance,
  and framework-aware advice for Rails, Django, Prisma, and raw SQL workflows.
- Reports can be copied or downloaded as Markdown, HTML, and JSON.
- Reports omit raw SQL snippets by default.

## Routes

- `/`
- `/tools`
- `/tools/postgres-migration-safety-checker`
- `/docs`
- `/docs/postgresql-migration-locks`
- `/docs/create-index-concurrently`
- `/docs/safe-postgres-not-null-migration`
- `/docs/postgres-foreign-key-not-valid`
- `/docs/rails-postgres-migration-safety`
- `/privacy`
- `/about`
- `/robots.txt`
- `/sitemap.xml`

## Setup

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000` for local development.

## Environment variables

Copy `.env.example` to `.env.local` when you need local overrides.

- `NEXT_PUBLIC_SITE_URL`
  Use the public production origin for canonical metadata, the sitemap, and
  `robots.txt`. Example: `https://authos.dev`
- `NEXT_PUBLIC_ANALYTICS_VENDOR`
  Optional. Only set this if you deliberately wire a sanitized browser-side
  analytics hook.
- `NEXT_PUBLIC_ANALYTICS_KEY`
  Optional companion public key for the analytics hook.

## Testing and verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

If Playwright browsers are not installed yet:

```bash
pnpm exec playwright install chromium
```

Helpful extras:

```bash
pnpm test:watch
pnpm test:e2e:ui
```

## Privacy model

- Analysis is designed to run locally in the browser.
- Uploaded `.sql` files are read by the browser only.
- Raw SQL is not embedded in shareable settings links.
- Raw SQL is not sent through the analytics adapter.
- Reports are generated locally.
- Local history is opt-in and requires explicit confirmation before storing SQL.
- Summary-only saves avoid storing SQL by default.

More detail: [`docs/privacy-and-telemetry.md`](./docs/privacy-and-telemetry.md)

## Analyzer limitations

- This tool does not connect to your database, inspect live locks, or observe
  table size directly.
- Severity tuning uses the table-size profile you choose, not live row counts.
- Parser fallback can still produce useful findings, but those findings are less
  precise than a full parser-backed run.
- Large migrations may require manual confirmation, worker-only execution, or a
  CLI/CI workflow instead of browser analysis.
- The checker helps with migration review, but it does not guarantee zero
  downtime or replace rollout planning.

## Deployment

### Vercel

1. Create a new Vercel project from this repository.
2. Set `NEXT_PUBLIC_SITE_URL` to the production origin.
3. Install dependencies with `pnpm`.
4. Keep the default Next.js build command or use `pnpm build`.
5. Run the verification commands below before promoting the deploy.

### Any static-capable Next.js host

1. Set `NEXT_PUBLIC_SITE_URL`.
2. Run `pnpm install`.
3. Run the full verification stack.
4. Deploy with `pnpm build` and `pnpm start`, or your host's equivalent Next.js
   production flow.

## Commands before deployment

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

## Known future improvements

- CI snippet generator for migration review steps.
- GitHub PR comment integration.
- Browser extension.
- CLI companion.
- Broader PostgreSQL parser version coverage.
- Schema-aware checks with optional local schema paste.
- Compare-two-migrations workflow.
- Team and self-hosted private deployment options.
- More tools across the wider Authos product.

## Additional documentation

- [`docs/manual-qa-checklist.md`](./docs/manual-qa-checklist.md)
- [`docs/launch-checklist.md`](./docs/launch-checklist.md)
- [`docs/roadmap.md`](./docs/roadmap.md)
- [`docs/architecture.md`](./docs/architecture.md)
- [`docs/postgres-migration-checker-rules.md`](./docs/postgres-migration-checker-rules.md)
