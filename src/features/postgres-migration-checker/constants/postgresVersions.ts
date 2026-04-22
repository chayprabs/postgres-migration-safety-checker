import type { PostgresVersion } from "../types";
import {
  POSTGRES_VERSION_PROFILES,
  getNearestParserVersion,
  getParserSupportNotes,
  getPostgresVersionProfile,
  type PostgresVersionProfile,
} from "./postgresVersionProfiles";

export type PostgresVersionDefinition = {
  version: PostgresVersionProfile["version"];
  label: string;
  docsHref: string;
  notes: string;
};

export const POSTGRES_DOCUMENTATION_BASE_URL = "https://www.postgresql.org/docs";

export const SUPPORTED_POSTGRES_VERSIONS: readonly PostgresVersionDefinition[] =
  POSTGRES_VERSION_PROFILES.map((profile) => ({
    version: profile.version,
    label: profile.label,
    docsHref:
      profile.docsLinks.find((link) => link.label === `${profile.label} docs`)?.href ??
      `${POSTGRES_DOCUMENTATION_BASE_URL}/${profile.version}/index.html`,
    notes: `${profile.supportStatus} ${profile.parserSupportNotes}`,
  }));

export const DEFAULT_POSTGRES_VERSION: PostgresVersion = 16;

export {
  POSTGRES_VERSION_PROFILES,
  getNearestParserVersion,
  getParserSupportNotes,
  getPostgresVersionProfile,
};
export type { PostgresVersionProfile };
