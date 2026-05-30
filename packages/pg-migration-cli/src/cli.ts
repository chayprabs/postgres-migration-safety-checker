import { readFileSync } from "node:fs";
import { runAnalysisPipeline } from "@pg-migration-checker/analyzer";
import type {
  AnalysisSettings,
  FrameworkPreset,
  PostgresVersion,
  TableSizeProfile,
} from "@pg-migration-checker/analyzer";
import { getUtf8ByteLength } from "@pg-migration-checker/analyzer";

type CliOptions = {
  file?: string;
  postgresVersion: PostgresVersion;
  framework: FrameworkPreset;
  tableSize: TableSizeProfile;
  format: "json" | "markdown";
  failOn: "critical" | "high" | "medium" | "none";
  force: boolean;
  schemaFile?: string;
};

const INPUT_LIMIT_BYTES = 3 * 1024 * 1024;

const SUPPORTED_POSTGRES_VERSIONS = new Set<PostgresVersion>([
  10, 11, 12, 13, 14, 15, 16, 17, 18,
]);

const SUPPORTED_FRAMEWORKS = new Set<FrameworkPreset>([
  "raw-sql",
  "rails",
  "django",
  "prisma",
  "knex",
  "sequelize",
  "flyway",
  "liquibase",
  "goose",
  "node-pg-migrate",
]);

const SUPPORTED_TABLE_SIZES = new Set<TableSizeProfile>([
  "unknown",
  "small",
  "medium",
  "large",
  "very-large",
]);

const SUPPORTED_FORMATS = new Set<CliOptions["format"]>(["json", "markdown"]);

const SUPPORTED_FAIL_ON = new Set<CliOptions["failOn"]>([
  "none",
  "medium",
  "high",
  "critical",
]);

function cliError(message: string): never {
  console.error(message);
  process.exit(2);
}

function readFlagValue(argv: string[], index: number, flag: string) {
  const value = argv[index + 1];

  if (!value || value.startsWith("-")) {
    cliError(`${flag} requires a value.`);
  }

  return value;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    postgresVersion: 16,
    framework: "raw-sql",
    tableSize: "large",
    format: "json",
    failOn: "high",
    force: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--file") {
      options.file = readFlagValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--postgres-version") {
      const raw = readFlagValue(argv, index, arg);
      const parsed = Number(raw);

      if (!Number.isInteger(parsed) || !SUPPORTED_POSTGRES_VERSIONS.has(parsed as PostgresVersion)) {
        cliError(
          `Invalid --postgres-version "${raw}". Supported majors: ${[...SUPPORTED_POSTGRES_VERSIONS].join(", ")}.`,
        );
      }

      options.postgresVersion = parsed as PostgresVersion;
      index += 1;
      continue;
    }

    if (arg === "--framework") {
      const value = readFlagValue(argv, index, arg);

      if (!SUPPORTED_FRAMEWORKS.has(value as FrameworkPreset)) {
        cliError(
          `Invalid --framework "${value}". Supported: ${[...SUPPORTED_FRAMEWORKS].join(", ")}.`,
        );
      }

      options.framework = value as FrameworkPreset;
      index += 1;
      continue;
    }

    if (arg === "--table-size") {
      const value = readFlagValue(argv, index, arg);

      if (!SUPPORTED_TABLE_SIZES.has(value as TableSizeProfile)) {
        cliError(
          `Invalid --table-size "${value}". Supported: ${[...SUPPORTED_TABLE_SIZES].join(", ")}.`,
        );
      }

      options.tableSize = value as TableSizeProfile;
      index += 1;
      continue;
    }

    if (arg === "--format") {
      const value = readFlagValue(argv, index, arg);

      if (!SUPPORTED_FORMATS.has(value as CliOptions["format"])) {
        cliError(`Invalid --format "${value}". Supported: json, markdown.`);
      }

      options.format = value as CliOptions["format"];
      index += 1;
      continue;
    }

    if (arg === "--fail-on") {
      const value = readFlagValue(argv, index, arg);

      if (!SUPPORTED_FAIL_ON.has(value as CliOptions["failOn"])) {
        cliError(`Invalid --fail-on "${value}". Supported: none, medium, high, critical.`);
      }

      options.failOn = value as CliOptions["failOn"];
      index += 1;
      continue;
    }

    if (arg === "--schema-file") {
      options.schemaFile = readFlagValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--force") {
      options.force = true;
    }
  }

  return options;
}

function readSql(options: CliOptions) {
  let sql: string;

  try {
    sql = options.file ? readFileSync(options.file, "utf8") : readFileSync(0, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      cliError(`Migration file not found: ${options.file}`);
    }

    throw error;
  }

  const byteLength = getUtf8ByteLength(sql.trim());

  if (!options.force && byteLength > INPUT_LIMIT_BYTES) {
    console.error(
      `Migration input is ${byteLength} bytes (limit ${INPUT_LIMIT_BYTES}). Use --force to analyze anyway.`,
    );
    process.exit(2);
  }

  return sql;
}

function readSchemaFile(path: string) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      cliError(`Schema file not found: ${path}`);
    }

    throw error;
  }
}

function shouldFail(
  failOn: CliOptions["failOn"],
  counts: Record<string, number>,
) {
  if (failOn === "none") {
    return false;
  }

  if (failOn === "critical") {
    return counts.critical > 0;
  }

  if (failOn === "high") {
    return counts.critical > 0 || counts.high > 0;
  }

  return counts.critical > 0 || counts.high > 0 || counts.medium > 0;
}

function printHelp() {
  console.log(`pg-migration-check — analyze PostgreSQL migration SQL

Usage:
  pg-migration-check --file path.sql [options]
  cat migration.sql | pg-migration-check [options]

Options:
  --file <path>              Migration SQL file
  --postgres-version <n>     PostgreSQL major version (default 16)
  --framework <preset>       raw-sql | rails | django | prisma | ...
  --table-size <profile>     small | medium | large | very-large | unknown
  --format <json|markdown>   Output format (default json)
  --fail-on <level>          none | medium | high | critical (default high)
  --schema-file <path>       Optional schema DDL context
  --force                    Allow inputs above 3 MB
`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const options = parseArgs(process.argv.slice(2));
  const sql = readSql(options);
  const schemaSql = options.schemaFile ? readSchemaFile(options.schemaFile) : undefined;

  const settings: AnalysisSettings = {
    postgresVersion: options.postgresVersion,
    frameworkPreset: options.framework,
    tableSizeProfile: options.tableSize,
    includeLowSeverityFindings: true,
    includeInfoFindings: true,
    includeSafeRewrites: true,
    assumeOnlineMigration: true,
    assumeRunsInTransaction: false,
    transactionAssumptionMode: "auto",
    flagDestructiveChanges: true,
    redactionMode: false,
    autoAnalyze: false,
    reportFormat: options.format,
    stopAfterParseError: false,
    schemaSql,
  };

  const result = await runAnalysisPipeline({
    sql,
    settings,
    runtime: { mode: "main-thread" },
  });

  const output = {
    riskScore: result.summary.risk.score,
    riskLabel: result.summary.risk.label,
    findingCount: result.findings.length,
    severityCounts: result.summary.bySeverity,
    findings: result.findings.map((finding) => ({
      ruleId: finding.ruleId,
      severity: finding.severity,
      title: finding.title,
      summary: finding.summary,
    })),
  };

  if (options.format === "json") {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(`# PostgreSQL Migration Safety Report\n`);
    console.log(`Risk score: ${output.riskScore}/100 (${output.riskLabel})`);
    console.log(`Findings: ${output.findingCount}\n`);

    for (const finding of output.findings) {
      console.log(`- [${finding.severity}] ${finding.title}: ${finding.summary}`);
    }
  }

  if (shouldFail(options.failOn, result.summary.bySeverity)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
});
