import type { AnalysisDiagnostic, ParserResult, PostgresVersion } from "../types";
import {
  buildSqlSourceIndex,
  byteOffsetToCodeUnitOffset,
  locateSourcePosition,
} from "./splitSqlStatements";

type SupportedParserVersion = 15 | 16 | 17;

const parserCache = new Map<
  SupportedParserVersion,
  Promise<{
    parse: (sql: string) => Promise<{
      error?: { message: string; position: number; type: string };
      tree?: unknown;
    }>;
  }>
>();

function createDiagnostic(
  sql: string,
  input: {
    code: string;
    message: string;
    severity: AnalysisDiagnostic["severity"];
    offset?: number;
  },
): AnalysisDiagnostic {
  if (input.offset === undefined) {
    return {
      code: input.code,
      message: input.message,
      severity: input.severity,
      source: "parser",
    };
  }

  const sourceIndex = buildSqlSourceIndex(sql);
  const codeUnitOffset = byteOffsetToCodeUnitOffset(sourceIndex, input.offset);
  const position = locateSourcePosition(sourceIndex, codeUnitOffset);

  return {
    code: input.code,
    message: input.message,
    severity: input.severity,
    source: "parser",
    line: position.line,
    column: position.column,
    startOffset: codeUnitOffset,
    endOffset: codeUnitOffset + 1,
  };
}

function resolveParserVersion(version: PostgresVersion) {
  if (version <= 15) {
    return {
      effectiveVersion: 15 as const,
      warning:
        version === 15
          ? null
          : `Parser runtime is available from PostgreSQL 15 onward, so this analysis uses the PostgreSQL 15 parser for a PostgreSQL ${version} target.`,
    };
  }

  if (version === 16 || version === 17) {
    return {
      effectiveVersion: version,
      warning: null,
    };
  }

  return {
    effectiveVersion: 17 as const,
    warning:
      version === 18
        ? "Parser runtime currently tops out at PostgreSQL 17, so PostgreSQL 18 input is parsed with the PostgreSQL 17 grammar and reported as an internal compatibility warning."
        : `Parser runtime currently tops out at PostgreSQL 17, so this analysis uses the PostgreSQL 17 parser for a PostgreSQL ${version} target.`,
  };
}

async function getSupabaseParser(version: SupportedParserVersion) {
  const existing = parserCache.get(version);

  if (existing) {
    return existing;
  }

  const created = (async () => {
    const parserModule = await import("@supabase/pg-parser");
    const parser = new parserModule.PgParser({ version });
    await parser.ready;
    return parser;
  })();

  parserCache.set(version, created);
  return created;
}

export async function parsePostgresSql(
  sql: string,
  version: PostgresVersion,
): Promise<ParserResult> {
  const trimmedSql = sql.trim();

  if (trimmedSql.length === 0) {
    return {
      ok: false,
      parser: "none",
      ast: undefined,
      errors: [],
      warnings: [],
      requestedVersion: version,
    };
  }

  const { effectiveVersion, warning } = resolveParserVersion(version);
  const warnings: AnalysisDiagnostic[] = warning
    ? [
        {
          code: "parser.version-fallback",
          message: warning,
          severity: "warning",
          source: "parser",
        },
      ]
    : [];

  try {
    const parser = await getSupabaseParser(effectiveVersion);
    const result = await parser.parse(sql);

    if (result.error) {
      return {
        ok: false,
        parser: "fallback",
        ast: undefined,
        errors: [
          createDiagnostic(sql, {
            code: `parser.${result.error.type}`,
            message: result.error.message,
            severity: "error",
            offset: result.error.position,
          }),
        ],
        warnings,
        requestedVersion: version,
        effectiveVersion,
      };
    }

    return {
      ok: true,
      parser: "supabase-pg-parser",
      ast: result.tree,
      errors: [],
      warnings,
      requestedVersion: version,
      effectiveVersion,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The PostgreSQL parser adapter failed to initialize.";

    return {
      ok: false,
      parser: "fallback",
      ast: undefined,
      errors: [],
      warnings: [
        ...warnings,
        {
          code: "parser.unavailable",
          message,
          severity: "warning",
          source: "parser",
        },
      ],
      requestedVersion: version,
      effectiveVersion,
    };
  }
}
