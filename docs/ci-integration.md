# CI integration

Use the Authos PostgreSQL migration checker in CI with the workspace CLI or the composite GitHub Action in this repository.

## CLI (recommended)

```bash
pnpm install
pnpm exec pg-migration-check \
  --file db/migrate/latest.sql \
  --postgres-version 16 \
  --framework rails \
  --fail-on high
```

Optional schema context:

```bash
pnpm exec pg-migration-check \
  --file db/migrate/latest.sql \
  --schema-file schema/context.sql \
  --fail-on high
```

## GitHub Action

```yaml
- uses: ./packages/pg-migration-action
  with:
    files: "db/migrate/**/*.sql"
    postgres-version: "16"
    framework: rails
    fail-on: high
```

## GitLab

Copy the GitLab snippet from the checker UI **CI integration snippets** panel after choosing your PostgreSQL version and framework preset.
