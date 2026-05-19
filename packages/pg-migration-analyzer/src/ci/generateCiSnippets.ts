import type { AnalysisSettings } from "../types";

export type CiSnippetSet = {
  github: string;
  gitlab: string;
  shell: string;
};

export function generateCiSnippets(settings: Pick<AnalysisSettings, "postgresVersion" | "frameworkPreset">) {
  const version = settings.postgresVersion;
  const framework = settings.frameworkPreset;

  const cliCommand = `pg-migration-check --file path/to/migration.sql --postgres-version ${version} --framework ${framework} --fail-on high`;

  return {
    github: `      - name: Check PostgreSQL migration safety
        run: |
          pnpm install
          pnpm exec pg-migration-check --file db/migrate/latest.sql --postgres-version ${version} --framework ${framework} --fail-on high`,
    gitlab: `postgres_migration_safety:
  stage: test
  script:
    - pnpm install
    - pnpm exec pg-migration-check --file db/migrate/latest.sql --postgres-version ${version} --framework ${framework} --fail-on high`,
    shell: `#!/usr/bin/env bash
set -euo pipefail
${cliCommand}`,
  } satisfies CiSnippetSet;
}
