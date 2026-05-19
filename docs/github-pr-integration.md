# GitHub pull request integration

Two supported paths:

## 1. GitHub Action (no App required)

Add a workflow that uses the composite action in `packages/pg-migration-action`:

```yaml
jobs:
  migration-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./packages/pg-migration-action
        with:
          files: "db/migrate/**/*.sql"
          postgres-version: "16"
          framework: rails
          fail-on: high
```

## 2. Webhook comment bot (optional)

Deploy the Next.js API route at `/api/github/migration-review` and configure a GitHub webhook for `pull_request` events.

### Server environment variables

| Variable | Purpose |
|----------|---------|
| `GITHUB_WEBHOOK_SECRET` | Verifies `x-hub-signature-256` |
| `GITHUB_TOKEN` | Reads PR files and posts review comments |

See `.env.example` for placeholders. **Never** expose these in client bundles.

The webhook analyzes `.sql` file patches only and posts a summary comment. Raw SQL is not logged.
