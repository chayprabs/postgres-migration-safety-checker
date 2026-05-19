# CLI usage

The `@authos/pg-migration-cli` package exposes the `pg-migration-check` binary.

## Install

From this monorepo:

```bash
pnpm install
pnpm exec pg-migration-check --help
```

## Analyze a file

```bash
pnpm exec pg-migration-check \
  --file path/to/migration.sql \
  --postgres-version 16 \
  --framework raw-sql \
  --table-size large \
  --format json \
  --fail-on high
```

## Stdin

```bash
cat migration.sql | pnpm exec pg-migration-check --fail-on critical
```

## Flags

| Flag | Description |
|------|-------------|
| `--file` | Path to migration SQL |
| `--postgres-version` | Target PostgreSQL major version |
| `--framework` | `raw-sql`, `rails`, `django`, `prisma` |
| `--table-size` | `small`, `medium`, `large`, `very-large`, `unknown` |
| `--format` | `json` or `markdown` |
| `--fail-on` | `none`, `medium`, `high`, `critical` |
| `--schema-file` | Optional pasted schema DDL |
| `--force` | Allow inputs above 3 MB |

Exit code `1` when findings meet the `--fail-on` threshold.
