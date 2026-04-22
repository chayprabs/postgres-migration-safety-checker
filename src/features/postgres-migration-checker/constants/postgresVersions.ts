import type { PostgresVersion } from "../types";

export type PostgresVersionDefinition = {
  version: PostgresVersion;
  label: string;
  docsHref: string;
  notes: string;
};

export const POSTGRES_DOCUMENTATION_BASE_URL = "https://www.postgresql.org/docs";

export const SUPPORTED_POSTGRES_VERSIONS = [
  {
    version: 10,
    label: "PostgreSQL 10",
    docsHref: `${POSTGRES_DOCUMENTATION_BASE_URL}/10/index.html`,
    notes:
      "Pre-fast-default legacy target where adding a column with a default is much riskier operationally.",
  },
  {
    version: 11,
    label: "PostgreSQL 11",
    docsHref: `${POSTGRES_DOCUMENTATION_BASE_URL}/11/index.html`,
    notes:
      "Legacy analyzer coverage for long-lived production estates. Upstream PostgreSQL marks 11 as unsupported.",
  },
  {
    version: 12,
    label: "PostgreSQL 12",
    docsHref: `${POSTGRES_DOCUMENTATION_BASE_URL}/12/index.html`,
    notes:
      "Legacy analyzer coverage for older fleets that still need careful migration review.",
  },
  {
    version: 13,
    label: "PostgreSQL 13",
    docsHref: `${POSTGRES_DOCUMENTATION_BASE_URL}/13/index.html`,
    notes:
      "Legacy analyzer coverage for pre-current major versions that still appear in production.",
  },
  {
    version: 14,
    label: "PostgreSQL 14",
    docsHref: `${POSTGRES_DOCUMENTATION_BASE_URL}/14/index.html`,
    notes: "Modern production baseline with wide enterprise usage.",
  },
  {
    version: 15,
    label: "PostgreSQL 15",
    docsHref: `${POSTGRES_DOCUMENTATION_BASE_URL}/15/index.html`,
    notes: "Common current-generation deployment target.",
  },
  {
    version: 16,
    label: "PostgreSQL 16",
    docsHref: `${POSTGRES_DOCUMENTATION_BASE_URL}/16/index.html`,
    notes: "Recent production target with improved planner and DDL ergonomics.",
  },
  {
    version: 17,
    label: "PostgreSQL 17",
    docsHref: `${POSTGRES_DOCUMENTATION_BASE_URL}/17/index.html`,
    notes: "Current-generation production target in many newer environments.",
  },
  {
    version: 18,
    label: "PostgreSQL 18",
    docsHref: `${POSTGRES_DOCUMENTATION_BASE_URL}/18/index.html`,
    notes: "Newest analyzer target and default documentation reference set.",
  },
] as const satisfies readonly PostgresVersionDefinition[];

export const DEFAULT_POSTGRES_VERSION: PostgresVersion = 16;
