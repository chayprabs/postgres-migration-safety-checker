# PostgreSQL Migration Safety Checker

Local-first web tool to review PostgreSQL migration SQL before deploy. Paste or upload `.sql`, click **Analyze migration**, and get lock-risk findings, safer rewrites, and exportable reports — all in your browser.

## Use it

Open `/` — no login. Your SQL stays in the browser.

## Develop

```bash
pnpm install
pnpm exec playwright install chromium
pnpm lint && pnpm typecheck && pnpm test && pnpm test:analyzer && pnpm test:cli && pnpm build && pnpm test:e2e
pnpm dev
```

## Routes

- `/` — checker
- `/privacy` — privacy policy
- `/terms` — terms & conditions

## Packages

- `@pg-migration-checker/analyzer` — rule engine
- `@pg-migration-checker/cli` — `pg-migration-check`
- `packages/pg-migration-action` — GitHub Action

## Deploy

Set `NEXT_PUBLIC_SITE_URL` to your production URL on Vercel or Docker (`docker compose up --build`).

## License

MIT — see [LICENSE](./LICENSE).

[GitHub](https://github.com/chayprabs/postgres-migration-safety-checker) · [@chayprabs](https://x.com/chayprabs) · [chaitanyaprabuddha.com](https://www.chaitanyaprabuddha.com)
