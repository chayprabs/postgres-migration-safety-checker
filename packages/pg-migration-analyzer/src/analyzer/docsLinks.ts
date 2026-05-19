import type { DocumentationLink } from "../types";

const POSTGRES_DOCS_BASE = "https://www.postgresql.org/docs/18";

function createPostgresDocsLink(
  path: string,
  label: string,
  description?: string,
): DocumentationLink {
  return {
    label,
    href: `${POSTGRES_DOCS_BASE}/${path}`,
    description,
  };
}

export const POSTGRES_DOCS = {
  ddlAlter: createPostgresDocsLink(
    "ddl-alter.html",
    "Modifying tables",
    "Overview of ALTER TABLE patterns, rollout concerns, and schema evolution guidance.",
  ),
  alterTable: createPostgresDocsLink(
    "sql-altertable.html",
    "ALTER TABLE",
    "Reference for ALTER TABLE subcommands, locking behavior, validation, and rewrite-sensitive operations.",
  ),
  alterType: createPostgresDocsLink(
    "sql-altertype.html",
    "ALTER TYPE",
    "Reference for enum evolution, type renames, and version-dependent transactional behavior.",
  ),
  lock: createPostgresDocsLink(
    "sql-lock.html",
    "LOCK",
    "Reference for explicit LOCK TABLE usage and its default ACCESS EXCLUSIVE behavior.",
  ),
  constraints: createPostgresDocsLink(
    "ddl-constraints.html",
    "Constraints",
    "Overview of NOT NULL, CHECK, foreign key, and application integrity tradeoffs.",
  ),
  lexicalStructure: createPostgresDocsLink(
    "sql-syntax-lexical.html",
    "PostgreSQL lexical structure",
    "Reference for comments, quotes, dollar-quoted strings, and tokenization rules that influence parser diagnostics.",
  ),
  explicitLocking: createPostgresDocsLink(
    "explicit-locking.html",
    "PostgreSQL explicit locking",
    "Lock mode reference for how schema and data changes conflict with reads and writes.",
  ),
  createIndex: createPostgresDocsLink(
    "sql-createindex.html",
    "CREATE INDEX",
    "Reference for index build behavior, including the operational tradeoffs of CONCURRENTLY.",
  ),
  createExtension: createPostgresDocsLink(
    "sql-createextension.html",
    "CREATE EXTENSION",
    "Reference for extension installation behavior and privilege requirements.",
  ),
  createTableAs: createPostgresDocsLink(
    "sql-createtableas.html",
    "CREATE TABLE AS",
    "Reference for bulk table creation from query results.",
  ),
  createTrigger: createPostgresDocsLink(
    "sql-createtrigger.html",
    "CREATE TRIGGER",
    "Reference for trigger creation and trigger execution behavior.",
  ),
  dropIndex: createPostgresDocsLink(
    "sql-dropindex.html",
    "DROP INDEX",
    "Reference for dropping indexes and the limitations of CONCURRENTLY.",
  ),
  dropSchema: createPostgresDocsLink(
    "sql-dropschema.html",
    "DROP SCHEMA",
    "Reference for destructive schema removal and cascading dependencies.",
  ),
  dropTable: createPostgresDocsLink(
    "sql-droptable.html",
    "DROP TABLE",
    "Reference for table removal semantics, cascades, and irreversible behavior.",
  ),
  dropType: createPostgresDocsLink(
    "sql-droptype.html",
    "DROP TYPE",
    "Reference for dropping custom types and dependent objects.",
  ),
  reindex: createPostgresDocsLink(
    "sql-reindex.html",
    "REINDEX",
    "Reference for rebuilding indexes and when CONCURRENTLY is supported.",
  ),
  refreshMaterializedView: createPostgresDocsLink(
    "sql-refreshmaterializedview.html",
    "REFRESH MATERIALIZED VIEW",
    "Reference for refresh behavior, including CONCURRENTLY requirements and locking tradeoffs.",
  ),
  truncate: createPostgresDocsLink(
    "sql-truncate.html",
    "TRUNCATE",
    "Reference for fast table truncation, locking, and restart identity behavior.",
  ),
  generatedColumns: createPostgresDocsLink(
    "ddl-generated-columns.html",
    "Generated columns",
    "Reference for stored generated columns and their storage behavior.",
  ),
  runtimeClientDefaults: createPostgresDocsLink(
    "runtime-config-client.html",
    "Client connection defaults",
    "Reference for lock_timeout and statement_timeout settings.",
  ),
  sqlDelete: createPostgresDocsLink(
    "sql-delete.html",
    "DELETE",
    "Reference for row deletion behavior and filtering.",
  ),
  sqlInsert: createPostgresDocsLink(
    "sql-insert.html",
    "INSERT",
    "Reference for INSERT, including INSERT ... SELECT bulk-copy patterns.",
  ),
  sqlUpdate: createPostgresDocsLink(
    "sql-update.html",
    "UPDATE",
    "Reference for row updates and WHERE clause behavior.",
  ),
  vacuum: createPostgresDocsLink(
    "sql-vacuum.html",
    "VACUUM",
    "Reference for VACUUM FULL and its rewrite-heavy locking behavior.",
  ),
  cluster: createPostgresDocsLink(
    "sql-cluster.html",
    "CLUSTER",
    "Reference for CLUSTER and its rewrite-heavy operational behavior.",
  ),
  begin: createPostgresDocsLink(
    "sql-begin.html",
    "BEGIN",
    "Reference for explicit transaction blocks.",
  ),
  commit: createPostgresDocsLink(
    "sql-commit.html",
    "COMMIT",
    "Reference for ending explicit transaction blocks.",
  ),
} as const;

export function mergeDocumentationLinks(
  ...groups: ReadonlyArray<readonly DocumentationLink[] | undefined>
) {
  const uniqueLinks = new Map<string, DocumentationLink>();

  groups.forEach((group) => {
    group?.forEach((link) => {
      if (!uniqueLinks.has(link.href)) {
        uniqueLinks.set(link.href, link);
      }
    });
  });

  return [...uniqueLinks.values()];
}
