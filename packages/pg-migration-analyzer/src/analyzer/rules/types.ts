import type {
  AnalysisSettings,
  ConfidenceLevel,
  DocumentationLink,
  Finding,
  FindingCategory,
  FindingSeverity,
  FrameworkAnalysisMetadata,
  LockInfo,
  LockLevel,
  MigrationStatement,
  ParserResult,
  SafeRewrite,
  StatementTransactionState,
  TransactionContext,
} from "../../types";

export type RuleFindingInput = {
  statement: MigrationStatement;
  summary: string;
  whyItMatters: string;
  recommendedAction: string;
  category?: FindingCategory;
  confidence?: ConfidenceLevel;
  docsLinks?: DocumentationLink[];
  lockLevel?: LockLevel;
  objectName?: string;
  safeRewrite?: SafeRewrite;
  severity?: FindingSeverity;
  tags?: string[];
  title?: string;
};

export type AnalyzerRuleHelpers = {
  createFinding: (rule: AnalyzerRule, input: RuleFindingInput) => Finding;
  getLockInfo: (lockLevel?: LockLevel) => LockInfo | undefined;
  getStatementTransactionState: (
    statementOrIndex: number | MigrationStatement,
  ) => StatementTransactionState | undefined;
  isStatementEffectivelyInTransaction: (
    statementOrIndex: number | MigrationStatement,
  ) => boolean;
  isStatementInsideExplicitTransaction: (
    statementOrIndex: number | MigrationStatement,
  ) => boolean;
  normalizedIncludes: (
    statement: MigrationStatement,
    fragment: string,
  ) => boolean;
};

export type AnalyzerRuleContext = {
  sql: string;
  settings: AnalysisSettings;
  statements: MigrationStatement[];
  parserResult: ParserResult;
  framework: FrameworkAnalysisMetadata;
  priorFindings: Finding[];
  transactionContext: TransactionContext;
  helpers: AnalyzerRuleHelpers;
};

export type AnalyzerRule = {
  id: string;
  title: string;
  category: FindingCategory;
  defaultSeverity: FindingSeverity;
  docsLinks: DocumentationLink[];
  evaluate: (context: AnalyzerRuleContext) => Finding[];
};
