import type {
  MigrationStatement,
  StatementTransactionState,
  TransactionBoundary,
  TransactionContext,
} from "../../types";
import { mergeDocumentationLinks } from "../docsLinks";
import { getLockInfo } from "./lockMatrix";
import type {
  AnalyzerRule,
  AnalyzerRuleHelpers,
  RuleFindingInput,
} from "./types";

function toComparableSql(normalizedSql: string) {
  return normalizedSql.toUpperCase();
}

function resolveStatementIndex(
  statementOrIndex: number | MigrationStatement,
) {
  return typeof statementOrIndex === "number"
    ? statementOrIndex
    : statementOrIndex.index;
}

function buildFindingId(ruleId: string, statement: MigrationStatement) {
  return `${ruleId}:${statement.index}:${statement.startOffset}`;
}

export function detectTransactionBoundary(
  statement: MigrationStatement,
): TransactionBoundary {
  const comparableSql = toComparableSql(statement.normalized);

  if (
    comparableSql === "BEGIN" ||
    comparableSql.startsWith("BEGIN ") ||
    comparableSql.startsWith("START TRANSACTION")
  ) {
    return "begin";
  }

  if (
    comparableSql === "COMMIT" ||
    comparableSql.startsWith("COMMIT ") ||
    comparableSql === "END"
  ) {
    return "commit";
  }

  if (
    comparableSql === "ROLLBACK" ||
    comparableSql.startsWith("ROLLBACK ")
  ) {
    return "rollback";
  }

  return "none";
}

export function detectTransactionContext(
  statements: readonly MigrationStatement[],
  assumeRunsInTransaction: boolean,
): TransactionContext {
  let explicitTransactionDepth = 0;
  let hasTransactionControlStatements = false;

  const statementStates = statements.map<StatementTransactionState>((statement) => {
    const boundary = detectTransactionBoundary(statement);
    const insideExplicitTransaction = explicitTransactionDepth > 0;
    const startsTransaction = boundary === "begin";
    const endsTransaction = boundary === "commit" || boundary === "rollback";

    if (boundary !== "none") {
      hasTransactionControlStatements = true;
    }

    const transactionState: StatementTransactionState = {
      statementIndex: statement.index,
      boundary,
      insideExplicitTransaction,
      effectiveTransaction: insideExplicitTransaction || assumeRunsInTransaction,
      explicitTransactionDepth,
      startsTransaction,
      endsTransaction,
    };

    if (startsTransaction) {
      explicitTransactionDepth += 1;
    } else if (endsTransaction && explicitTransactionDepth > 0) {
      explicitTransactionDepth -= 1;
    }

    return transactionState;
  });

  return {
    assumeTransaction: assumeRunsInTransaction,
    hasExplicitTransactionBlock: statementStates.some(
      (statementState) =>
        statementState.startsTransaction ||
        statementState.endsTransaction ||
        statementState.insideExplicitTransaction,
    ),
    hasTransactionControlStatements,
    statementStates,
  };
}

export function createRuleFinding(
  rule: AnalyzerRule,
  input: RuleFindingInput,
) {
  const lockInfo = getLockInfo(input.lockLevel);

  return {
    id: buildFindingId(rule.id, input.statement),
    ruleId: rule.id,
    title: input.title ?? rule.title,
    summary: input.summary,
    severity: input.severity ?? rule.defaultSeverity,
    category: input.category ?? rule.category,
    statementIndex: input.statement.index,
    lineStart: input.statement.lineStart,
    lineEnd: input.statement.lineEnd,
    columnStart: input.statement.columnStart,
    columnEnd: input.statement.columnEnd,
    objectName: input.objectName ?? input.statement.targetObject,
    lockLevel: lockInfo?.level ?? input.lockLevel,
    lockInfo,
    whyItMatters: input.whyItMatters,
    recommendedAction: input.recommendedAction,
    safeRewrite: input.safeRewrite,
    docsLinks: mergeDocumentationLinks(
      rule.docsLinks,
      input.docsLinks,
      lockInfo ? [lockInfo.docsLink] : undefined,
    ),
    confidence: input.confidence ?? "high",
    tags: [...new Set([rule.id, ...input.statement.tags, ...(input.tags ?? [])])],
  };
}

export function createRuleHelpers(
  transactionContext: TransactionContext,
): AnalyzerRuleHelpers {
  function getStatementTransactionState(
    statementOrIndex: number | MigrationStatement,
  ) {
    const statementIndex = resolveStatementIndex(statementOrIndex);

    return transactionContext.statementStates.find(
      (statementState) => statementState.statementIndex === statementIndex,
    );
  }

  return {
    createFinding: createRuleFinding,
    getLockInfo,
    getStatementTransactionState,
    isStatementEffectivelyInTransaction(statementOrIndex) {
      return (
        getStatementTransactionState(statementOrIndex)?.effectiveTransaction ??
        false
      );
    },
    isStatementInsideExplicitTransaction(statementOrIndex) {
      return (
        getStatementTransactionState(statementOrIndex)?.insideExplicitTransaction ??
        false
      );
    },
    normalizedIncludes(statement, fragment) {
      return toComparableSql(statement.normalized).includes(fragment.toUpperCase());
    },
  };
}
