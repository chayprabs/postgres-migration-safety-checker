import type { DocumentationLink, PostgresVersion } from "../types";

export type ProfiledPostgresVersion = 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18;

type PostgresVersionProfileTemplate = {
  version: ProfiledPostgresVersion;
  label: string;
  communitySupportEndsOn: string;
  addColumnDefaultNotes: string;
  concurrentIndexNotes: string;
  enumChangeNotes: string;
  generatedColumnNotes: string;
};

export type PostgresVersionProfile = Omit<
  PostgresVersionProfileTemplate,
  "communitySupportEndsOn"
> & {
  supportStatus: string;
  parserSupportNotes: string;
  docsLinks: DocumentationLink[];
};

const VERSIONING_POLICY_LINK: DocumentationLink = {
  label: "PostgreSQL versioning policy",
  href: "https://www.postgresql.org/support/versioning/",
  description:
    "Official PostgreSQL community support window and lifecycle policy.",
};

const PROFILE_TEMPLATES = [
  {
    version: 10,
    label: "PostgreSQL 10",
    communitySupportEndsOn: "2022-11-10",
    addColumnDefaultNotes:
      "PostgreSQL 10 predates the fast-default optimization, so ADD COLUMN ... DEFAULT usually rewrites existing rows and deserves extra deployment caution on large tables.",
    concurrentIndexNotes:
      "CREATE INDEX CONCURRENTLY and DROP INDEX CONCURRENTLY are available, but they still cannot run inside a transaction block and REINDEX CONCURRENTLY is not available yet.",
    enumChangeNotes:
      "ALTER TYPE ... ADD VALUE cannot run inside a transaction block on PostgreSQL 10, so transaction-wrapped migration runners often need a separate deploy step.",
    generatedColumnNotes:
      "Generated columns are not available in PostgreSQL 10, so generated-column syntax should be treated as version-incompatible.",
  },
  {
    version: 11,
    label: "PostgreSQL 11",
    communitySupportEndsOn: "2023-11-09",
    addColumnDefaultNotes:
      "PostgreSQL 11 introduced the fast-default optimization for many constant defaults, but volatile expressions still need row-by-row work and the checker cannot verify every edge case from SQL alone.",
    concurrentIndexNotes:
      "CREATE INDEX CONCURRENTLY and DROP INDEX CONCURRENTLY are available, but they still cannot run inside a transaction block and REINDEX CONCURRENTLY is not yet available here.",
    enumChangeNotes:
      "ALTER TYPE ... ADD VALUE still has pre-12 transaction limits on PostgreSQL 11, so transaction-wrapped migration frameworks need extra care.",
    generatedColumnNotes:
      "Generated columns are not available in PostgreSQL 11, so any generated-column syntax should be treated as version-incompatible.",
  },
  {
    version: 12,
    label: "PostgreSQL 12",
    communitySupportEndsOn: "2024-11-21",
    addColumnDefaultNotes:
      "PostgreSQL 12 keeps the fast path for many non-volatile defaults, but volatile expressions, identity-style behavior, and combined ALTER TABLE clauses can still make the operation expensive.",
    concurrentIndexNotes:
      "CREATE INDEX CONCURRENTLY, DROP INDEX CONCURRENTLY, and REINDEX CONCURRENTLY are available, but transaction rules and syntax limitations still apply.",
    enumChangeNotes:
      "PostgreSQL 12 allows ALTER TYPE ... ADD VALUE inside a transaction block, but the new enum value cannot be used until that transaction commits.",
    generatedColumnNotes:
      "Stored generated columns arrive in PostgreSQL 12. Adding one to an existing table can require PostgreSQL to compute values for existing rows, which is much heavier than a metadata-only column add.",
  },
  {
    version: 13,
    label: "PostgreSQL 13",
    communitySupportEndsOn: "2025-11-13",
    addColumnDefaultNotes:
      "PostgreSQL 13 keeps the modern fast-default path for many non-volatile defaults, but the checker still treats volatility and large-table lock windows cautiously.",
    concurrentIndexNotes:
      "Online create, drop, and reindex paths are available, but concurrent index operations still require non-transactional execution and may take longer operationally.",
    enumChangeNotes:
      "Enum additions are transactional on PostgreSQL 13, but application code still cannot rely on the new label until commit and mixed-version fleets need rollout planning.",
    generatedColumnNotes:
      "Stored generated columns remain supported. The analyzer treats them as heavier than ordinary defaults because existing rows may need to be materialized.",
  },
  {
    version: 14,
    label: "PostgreSQL 14",
    communitySupportEndsOn: "2026-11-12",
    addColumnDefaultNotes:
      "PostgreSQL 14 still avoids rewrites for many non-volatile ADD COLUMN ... DEFAULT patterns, but volatile functions and combined ALTER TABLE work can change the operational profile.",
    concurrentIndexNotes:
      "Concurrent create, drop, and reindex operations are available, but they remain sensitive to transaction wrappers, long-running scans, and lock waits.",
    enumChangeNotes:
      "Enum value additions behave like other modern releases: allowed in a transaction, but not usable inside that same transaction before commit.",
    generatedColumnNotes:
      "Stored generated columns are supported. The checker stays conservative because adding one can still force expensive work on existing rows.",
  },
  {
    version: 15,
    label: "PostgreSQL 15",
    communitySupportEndsOn: "2027-11-11",
    addColumnDefaultNotes:
      "PostgreSQL 15 keeps the fast path for many non-volatile defaults, but function volatility, domains, and exact table characteristics still matter.",
    concurrentIndexNotes:
      "Concurrent create, drop, and reindex flows are supported. Parser coverage starts here, but syntax support may still use the nearest compatible parser when needed.",
    enumChangeNotes:
      "Enum additions are allowed in transactions, but the new value still becomes usable only after commit.",
    generatedColumnNotes:
      "Stored generated columns are supported and remain materially different from simple metadata-only column additions.",
  },
  {
    version: 16,
    label: "PostgreSQL 16",
    communitySupportEndsOn: "2028-11-09",
    addColumnDefaultNotes:
      "PostgreSQL 16 keeps the modern fast-default path for many non-volatile defaults, but the checker still cannot prove exact volatility or deployment safety from SQL alone.",
    concurrentIndexNotes:
      "Concurrent create, drop, and reindex paths remain available and are usually preferred for online rollouts, subject to the usual non-transactional rules.",
    enumChangeNotes:
      "Enum additions remain transaction-safe in PostgreSQL 16, but application rollout order still matters because new labels are not visible until commit.",
    generatedColumnNotes:
      "Stored generated columns are supported. The checker treats them as potentially rewrite-heavy because PostgreSQL may need to materialize values for existing rows.",
  },
  {
    version: 17,
    label: "PostgreSQL 17",
    communitySupportEndsOn: "2029-11-08",
    addColumnDefaultNotes:
      "PostgreSQL 17 still uses the fast path for many non-volatile defaults, while volatile expressions and very large tables remain worth explicit review.",
    concurrentIndexNotes:
      "Concurrent create, drop, and reindex flows are supported. Parser coverage generally matches PostgreSQL 17, but exact syntax support can still fall back conservatively.",
    enumChangeNotes:
      "Enum additions stay transaction-safe with the same commit-visibility caveat as PostgreSQL 12-16.",
    generatedColumnNotes:
      "Stored generated columns are supported. The checker remains careful because generated expressions may still require heavyweight work on existing data.",
  },
  {
    version: 18,
    label: "PostgreSQL 18",
    communitySupportEndsOn: "2030-11-14",
    addColumnDefaultNotes:
      "PostgreSQL 18 keeps the modern fast-default behavior for many non-volatile defaults, but the checker still cannot inspect exact function volatility, table size, or extension semantics.",
    concurrentIndexNotes:
      "Concurrent create, drop, and reindex flows remain available. Parser support may use the nearest compatible grammar because the bundled parser currently tops out below full PostgreSQL 18 coverage.",
    enumChangeNotes:
      "Enum additions follow the modern transactional behavior, but the new label still should not be used until commit and coordinated app rollout is still required.",
    generatedColumnNotes:
      "PostgreSQL 18 adds virtual generated columns while keeping stored generated columns. The analyzer stays conservative because parser and rule support may need the nearest compatible version for newer syntax.",
  },
] as const satisfies readonly PostgresVersionProfileTemplate[];

function formatSupportDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function createVersionDocLink(
  version: ProfiledPostgresVersion,
  path: string,
  label: string,
  description: string,
): DocumentationLink {
  return {
    label,
    href: `https://www.postgresql.org/docs/${version}/${path}`,
    description,
  };
}

export function getNearestParserVersion(version: PostgresVersion) {
  if (version <= 15) {
    return 15 as const;
  }

  if (version === 16 || version === 17) {
    return version;
  }

  return 17 as const;
}

export function getParserSupportNotes(version: PostgresVersion) {
  const parserVersion = getNearestParserVersion(version);

  if (version <= 14) {
    return `Bundled parser grammars start at PostgreSQL 15, so the checker may use PostgreSQL ${parserVersion} as the nearest compatible parser for a PostgreSQL ${version} target.`;
  }

  if (version === 18) {
    return "Bundled parser grammars currently top out at PostgreSQL 17, so PostgreSQL 18 analysis may use the nearest compatible parser grammar when exact syntax support is unavailable.";
  }

  return `Parser support usually matches PostgreSQL ${parserVersion}, but the checker may still fall back to the nearest compatible grammar when syntax support lags or parsing fails.`;
}

function getSupportStatus(communitySupportEndsOn: string, now: Date) {
  const supportEndDate = new Date(`${communitySupportEndsOn}T23:59:59Z`);
  const formattedDate = formatSupportDate(communitySupportEndsOn);

  if (now.getTime() > supportEndDate.getTime()) {
    return `Community support ended on ${formattedDate}. Review legacy migrations cautiously and verify any version-specific behavior against archived docs.`;
  }

  return `Community support is scheduled through ${formattedDate}. Minor-release behavior can still differ, so verify exact deployment details for production-critical changes.`;
}

function buildPostgresVersionProfile(
  template: PostgresVersionProfileTemplate,
  now: Date,
): PostgresVersionProfile {
  return {
    version: template.version,
    label: template.label,
    supportStatus: getSupportStatus(template.communitySupportEndsOn, now),
    addColumnDefaultNotes: template.addColumnDefaultNotes,
    concurrentIndexNotes: template.concurrentIndexNotes,
    enumChangeNotes: template.enumChangeNotes,
    generatedColumnNotes: template.generatedColumnNotes,
    parserSupportNotes: getParserSupportNotes(template.version),
    docsLinks: [
      createVersionDocLink(
        template.version,
        "index.html",
        `${template.label} docs`,
        `Version-specific PostgreSQL ${template.version} documentation index.`,
      ),
      createVersionDocLink(
        template.version,
        "sql-altertable.html",
        `${template.label} ALTER TABLE`,
        "Reference for ALTER TABLE locking, validation, and rewrite-sensitive behavior.",
      ),
      createVersionDocLink(
        template.version,
        "sql-createindex.html",
        `${template.label} CREATE INDEX`,
        "Reference for concurrent and non-concurrent index build behavior.",
      ),
      createVersionDocLink(
        template.version,
        "sql-altertype.html",
        `${template.label} ALTER TYPE`,
        "Reference for enum changes and type evolution.",
      ),
      createVersionDocLink(
        template.version,
        template.version === 11 ? "sql-createtable.html" : "ddl-generated-columns.html",
        template.version === 11
          ? `${template.label} CREATE TABLE`
          : `${template.label} generated columns`,
        template.version === 11
          ? "Reference for table-definition syntax in PostgreSQL 11, which predates generated columns."
          : "Reference for generated column support and restrictions when available in this major version.",
      ),
      VERSIONING_POLICY_LINK,
    ],
  };
}

export function getPostgresVersionProfile(
  version: PostgresVersion,
  now = new Date(),
) {
  const template = PROFILE_TEMPLATES.find((candidate) => candidate.version === version);

  if (!template) {
    return null;
  }

  return buildPostgresVersionProfile(template, now);
}

export const POSTGRES_VERSION_PROFILES = PROFILE_TEMPLATES.map((template) =>
  buildPostgresVersionProfile(template, new Date()),
);
