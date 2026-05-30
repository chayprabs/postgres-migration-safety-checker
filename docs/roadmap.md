# Roadmap

## PostgreSQL checker (shipped)

- [x] CI snippet generator for rollout notes and pipeline starters
- [x] GitHub pull request integration (Action + optional webhook API)
- [x] Browser extension for GitHub/GitLab SQL blob pages
- [x] CLI companion for CI and large files
- [x] Schema-aware checks with optional local schema paste
- [x] Compare two migrations workflow
- [x] Docker self-host for the web checker

## PostgreSQL checker (next)

- Native PostgreSQL 18 parser when upstream WASM is available (fallback banner and tests today)
- Optional npm publish for `@pg-migration-checker/cli` and `@pg-migration-checker/analyzer`

## Product and deployment expansion

- Team and private self-hosted hardening (SSO, audit logs) beyond the current Docker image
- More PostgreSQL Migration Safety Checker tools beyond PostgreSQL migration review, while keeping the same local-first direction
