import type {
  AnalysisDiagnostic,
  AnalysisResult,
  AnalysisRuntimeMetadata,
  AnalysisSettings,
  Finding,
  MigrationStatement,
  ParserResult,
  StatementKind,
} from "../types";
import { classifyStatement } from "./classifyStatement";
import { POSTGRES_DOCS } from "./docsLinks";
import { buildFrameworkAnalysisMetadata } from "./frameworkContext";
import { parsePostgresSql } from "./parserAdapter";
import { buildAnalysisSummary } from "./riskSummary";
import {
  REGISTERED_ANALYZER_RULES,
  runRegisteredAnalyzerRules,
} from "./rules";
import { createRuleHelpers, detectTransactionContext } from "./rules/utils";
import {
  buildSqlSourceIndex,
  byteOffsetToCodeUnitOffset,
  splitSqlStatements,
} from "./splitSqlStatements";

type AnalysisPipelineInput = {
  runtime: AnalysisRuntimeMetadata;
  settings: AnalysisSettings;
  sourceFilename?: string;
  sql: string;
};

type TopLevelAstStatement = {
  astNodeType?: string;
  endOffset?: number;
  kind?: StatementKind;
  location?: number;
  statementLength?: number;
  targetObject?: string;
};

const ANALYZER_VERSION = "pipeline-0.3.0";
const PARSER_DIAGNOSTIC_DOCS = [POSTGRES_DOCS.lexicalStructure];

function getSourceFingerprint(sql: string, statements: MigrationStatement[]) {
  const trimmedSql = sql.trim();

  if (trimmedSql.length === 0) {
    return undefined;
  }

  return `${trimmedSql.length}-${statements.length}`;
}

function countStatementKinds(statements: MigrationStatement[]) {
  return statements.reduce<Partial<Record<StatementKind, number>>>(
    (counts, statement) => {
      counts[statement.kind] = (counts[statement.kind] ?? 0) + 1;
      return counts;
    },
    {},
  );
}

function unwrapAstNode(statement: unknown) {
  if (!statement || typeof statement !== "object") {
    return null;
  }

  const keys = Object.keys(statement);

  if (keys.length !== 1) {
    return null;
  }

  const [type] = keys;

  if (!type) {
    return null;
  }

  return {
    type,
    node: (statement as Record<string, unknown>)[type],
  };
}

function getRelationName(relation: unknown) {
  if (!relation || typeof relation !== "object") {
    return undefined;
  }

  const relationRecord = relation as Record<string, unknown>;
  const schemaName =
    typeof relationRecord.schemaname === "string" &&
    relationRecord.schemaname.length > 0
      ? relationRecord.schemaname
      : null;
  const relationName =
    typeof relationRecord.relname === "string" ? relationRecord.relname : null;

  if (!relationName) {
    return undefined;
  }

  return schemaName ? `${schemaName}.${relationName}` : relationName;
}

function classifyAstStatement(statement: unknown): {
  astNodeType?: string;
  kind?: StatementKind;
  targetObject?: string;
} {
  const unwrapped = unwrapAstNode(statement);

  if (!unwrapped) {
    return {};
  }

  const nodeRecord =
    unwrapped.node && typeof unwrapped.node === "object"
      ? (unwrapped.node as Record<string, unknown>)
      : {};

  switch (unwrapped.type) {
    case "TransactionStmt": {
      const kind =
        nodeRecord.kind === "TRANS_STMT_COMMIT" || nodeRecord.kind === "TRANS_STMT_END"
          ? "commit"
          : nodeRecord.kind === "TRANS_STMT_ROLLBACK"
            ? "rollback"
          : nodeRecord.kind === "TRANS_STMT_BEGIN"
            ? "begin"
            : undefined;

      return {
        astNodeType: unwrapped.type,
        kind,
      };
    }
    case "AlterTableStmt":
      return {
        astNodeType: unwrapped.type,
        kind: "alter-table",
        targetObject: getRelationName(nodeRecord.relation),
      };
    case "IndexStmt":
      return {
        astNodeType: unwrapped.type,
        kind: "create-index",
        targetObject:
          typeof nodeRecord.idxname === "string" && nodeRecord.idxname.length > 0
            ? nodeRecord.idxname
            : getRelationName(nodeRecord.relation),
      };
    case "DropStmt": {
      const removeType = nodeRecord.removeType;

      if (removeType === "OBJECT_INDEX") {
        return {
          astNodeType: unwrapped.type,
          kind: "drop-index",
        };
      }

      if (removeType === "OBJECT_TABLE") {
        return {
          astNodeType: unwrapped.type,
          kind: "drop-table",
        };
      }

      return {
        astNodeType: unwrapped.type,
      };
    }
    case "TruncateStmt":
      return {
        astNodeType: unwrapped.type,
        kind: "truncate",
      };
    case "RenameStmt":
      return {
        astNodeType: unwrapped.type,
        kind: "rename",
      };
    case "CreateEnumStmt":
      return {
        astNodeType: unwrapped.type,
        kind: "create-type",
      };
    case "AlterEnumStmt":
      return {
        astNodeType: unwrapped.type,
        kind: "alter-type",
      };
    case "CreateTrigStmt":
      return {
        astNodeType: unwrapped.type,
        kind: "create-trigger",
      };
    case "CreateExtensionStmt":
      return {
        astNodeType: unwrapped.type,
        kind: "create-extension",
        targetObject:
          typeof nodeRecord.extname === "string" ? nodeRecord.extname : undefined,
      };
    case "ReindexStmt":
      return {
        astNodeType: unwrapped.type,
        kind: "reindex",
      };
    case "VacuumStmt":
      return {
        astNodeType: unwrapped.type,
        kind: "vacuum-full",
      };
    case "ClusterStmt":
      return {
        astNodeType: unwrapped.type,
        kind: "cluster",
        targetObject: getRelationName(nodeRecord.relation),
      };
    case "RefreshMatViewStmt":
      return {
        astNodeType: unwrapped.type,
        kind: "refresh-materialized-view",
        targetObject: getRelationName(nodeRecord.relation),
      };
    case "UpdateStmt":
      return {
        astNodeType: unwrapped.type,
        kind: "update",
        targetObject: getRelationName(nodeRecord.relation),
      };
    case "DeleteStmt":
      return {
        astNodeType: unwrapped.type,
        kind: "delete",
        targetObject: getRelationName(nodeRecord.relation),
      };
    case "InsertStmt":
      return {
        astNodeType: unwrapped.type,
        kind: "insert",
        targetObject: getRelationName(nodeRecord.relation),
      };
    case "VariableSetStmt":
      return {
        astNodeType: unwrapped.type,
        kind: "set",
      };
    default:
      return {
        astNodeType: unwrapped.type,
      };
  }
}

function extractTopLevelAstStatements(parserResult: ParserResult, sql: string) {
  if (!parserResult.ok || !parserResult.ast || typeof parserResult.ast !== "object") {
    return [];
  }

  const astRecord = parserResult.ast as Record<string, unknown>;
  const statements = Array.isArray(astRecord.stmts) ? astRecord.stmts : [];
  const sourceIndex = buildSqlSourceIndex(sql);

  return statements.map<TopLevelAstStatement>((statement) => {
    if (!statement || typeof statement !== "object") {
      return {};
    }

    const statementRecord = statement as Record<string, unknown>;
    const location =
      typeof statementRecord.stmt_location === "number"
        ? statementRecord.stmt_location
        : undefined;
    const statementLength =
      typeof statementRecord.stmt_len === "number"
        ? statementRecord.stmt_len
        : undefined;
    const startOffset =
      location === undefined
        ? undefined
        : byteOffsetToCodeUnitOffset(sourceIndex, location);
    const endOffset =
      location === undefined || statementLength === undefined
        ? undefined
        : byteOffsetToCodeUnitOffset(sourceIndex, location + statementLength);
    const classification = classifyAstStatement(statementRecord.stmt);

    return {
      ...classification,
      location: startOffset,
      endOffset,
      statementLength,
    };
  });
}

function attachParserMetadata(
  sql: string,
  splitStatements: MigrationStatement[],
  parserResult: ParserResult,
): {
  parser: ParserResult;
  statements: MigrationStatement[];
} {
  const nextStatements = splitStatements.map((statement) => ({ ...statement }));
  const topLevelStatements = extractTopLevelAstStatements(parserResult, sql);

  if (topLevelStatements.length === 0) {
    return {
      parser: parserResult,
      statements: nextStatements,
    };
  }

  const warnings = [...parserResult.warnings];

  if (topLevelStatements.length !== nextStatements.length) {
    warnings.push({
      code: "parser.mapping-count-mismatch",
      message:
        "Top-level parser statement count did not match the splitter output, so parser metadata was attached conservatively.",
      severity: "warning",
      source: "pipeline",
    });
  }

  topLevelStatements.forEach((parsedStatement, index) => {
    const parsedLocation = parsedStatement.location;
    const parsedEndOffset = parsedStatement.endOffset;
    let statementIndex = nextStatements.findIndex((statement) => {
      if (parsedLocation === undefined) {
        return false;
      }

      return statement.startOffset === parsedLocation;
    });
    let mappingStrategy: "offset" | "range" | "sequence" = "offset";

    if (statementIndex === -1 && parsedLocation !== undefined) {
      statementIndex = nextStatements.findIndex((statement) => {
        if (parsedEndOffset === undefined) {
          return false;
        }

        return (
          statement.startOffset <= parsedLocation &&
          statement.endOffset >= parsedEndOffset
        );
      });
      mappingStrategy = "range";
    }

    if (statementIndex === -1 && index < nextStatements.length) {
      statementIndex = index;
      mappingStrategy = "sequence";
    }

    if (statementIndex === -1) {
      return;
    }

    const current = nextStatements[statementIndex];
    const fallbackClassification = classifyStatement(current.raw);

    nextStatements[statementIndex] = {
      ...current,
      kind: parsedStatement.kind ?? fallbackClassification.kind,
      targetObject:
        parsedStatement.targetObject ??
        current.targetObject ??
        fallbackClassification.targetObject,
      parserMetadata: {
        astNodeType: parsedStatement.astNodeType,
        mappingStrategy,
        parser: parserResult.parser,
        statementLength: parsedStatement.statementLength,
        statementLocation: parsedStatement.location,
      },
    };
  });

  return {
    parser: {
      ...parserResult,
      warnings,
    },
    statements: nextStatements,
  };
}

function findNearestStatementIndex(
  statements: MigrationStatement[],
  diagnostic: AnalysisDiagnostic,
) {
  const diagnosticOffset = diagnostic.startOffset;

  if (diagnosticOffset === undefined) {
    return statements[0]?.index;
  }

  const containingStatement = statements.find(
    (statement) =>
      statement.startOffset <= diagnosticOffset &&
      statement.endOffset >= diagnosticOffset,
  );

  if (containingStatement) {
    return containingStatement.index;
  }

  let bestStatement: MigrationStatement | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const statement of statements) {
    const distance = Math.min(
      Math.abs(statement.startOffset - diagnosticOffset),
      Math.abs(statement.endOffset - diagnosticOffset),
    );

    if (distance < bestDistance) {
      bestDistance = distance;
      bestStatement = statement;
    }
  }

  return bestStatement?.index;
}

function parserDiagnosticsToFindings(
  diagnostics: AnalysisDiagnostic[],
  statements: MigrationStatement[],
): Finding[] {
  return diagnostics
    .filter((diagnostic) => diagnostic.severity === "error")
    .map((diagnostic, index) => {
      const statementIndex = findNearestStatementIndex(statements, diagnostic) ?? 0;

      return {
        id: `parser-diagnostic-${index}`,
        ruleId: `parser.${diagnostic.code}`,
        title: "Parser could not fully understand the migration",
        summary: diagnostic.message,
        severity: "medium",
        category: "syntax",
        statementIndex,
        lineStart: diagnostic.line,
        lineEnd: diagnostic.line,
        columnStart: diagnostic.column,
        columnEnd: diagnostic.column,
        whyItMatters:
          "The fallback classifier can still identify statement types, but parser-backed mapping and future AST-driven rules become less reliable until the syntax issue is resolved.",
        recommendedAction:
          "Fix the SQL syntax issue and re-run the checker to restore parser-backed analysis.",
        docsLinks: PARSER_DIAGNOSTIC_DOCS,
        confidence: "high",
        tags: ["parser", "syntax"],
      };
    });
}

function compareFindings(left: Finding, right: Finding) {
  return (
    left.statementIndex - right.statementIndex ||
    (left.lineStart ?? 0) - (right.lineStart ?? 0) ||
    (left.columnStart ?? 0) - (right.columnStart ?? 0) ||
    left.ruleId.localeCompare(right.ruleId) ||
    left.id.localeCompare(right.id)
  );
}

export async function runAnalysisPipeline({
  runtime,
  settings,
  sourceFilename,
  sql,
}: AnalysisPipelineInput): Promise<AnalysisResult> {
  const splitStatements = splitSqlStatements(sql);
  const parserResult = await parsePostgresSql(sql, settings.postgresVersion);
  const { parser, statements } = attachParserMetadata(sql, splitStatements, parserResult);
  const framework = buildFrameworkAnalysisMetadata({
    sql,
    settings,
    sourceFilename,
  });
  const transactionContext = detectTransactionContext(
    statements,
    framework.effectiveAssumeTransaction,
  );
  const parserFindings = parserDiagnosticsToFindings(parser.errors, statements);
  const ruleFindings = runRegisteredAnalyzerRules({
    sql,
    settings,
    statements,
    parserResult: parser,
    framework,
    priorFindings: [],
    transactionContext,
    helpers: createRuleHelpers(transactionContext),
  });
  const findings = [...parserFindings, ...ruleFindings].sort(compareFindings);

  return {
    settings,
    statements,
    findings,
    summary: buildAnalysisSummary(findings, statements),
    metadata: {
      framework,
      parser,
      runtime,
      statementKinds: countStatementKinds(statements),
      transactionContext,
      registeredRules: REGISTERED_ANALYZER_RULES.map((rule) => rule.id),
    },
    analyzerVersion: ANALYZER_VERSION,
    analyzedAt: new Date().toISOString(),
    sourceFingerprint: getSourceFingerprint(sql, statements),
    hasBlockingFindings: findings.some(
      (finding) => finding.severity === "critical" || finding.severity === "high",
    ),
  };
}
