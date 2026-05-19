export type PostgresVersion = 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18;

export type FrameworkPreset =
  | "raw-sql"
  | "rails"
  | "django"
  | "prisma"
  | "knex"
  | "sequelize"
  | "flyway"
  | "liquibase"
  | "goose"
  | "node-pg-migrate";

export type TableSizeProfile =
  | "unknown"
  | "small"
  | "medium"
  | "large"
  | "very-large";

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";

export type FindingCategory =
  | "locking"
  | "rewrite"
  | "index"
  | "constraint"
  | "data-loss"
  | "transaction"
  | "framework"
  | "version"
  | "reversibility"
  | "performance"
  | "security"
  | "syntax";

export type LockLevel =
  | "ACCESS SHARE"
  | "ROW SHARE"
  | "ROW EXCLUSIVE"
  | "SHARE UPDATE EXCLUSIVE"
  | "SHARE"
  | "SHARE ROW EXCLUSIVE"
  | "EXCLUSIVE"
  | "ACCESS EXCLUSIVE";

export type ConfidenceLevel = "high" | "medium" | "low";

export type ReportFormat = "summary" | "markdown" | "json";
export type TransactionAssumptionMode =
  | "auto"
  | "force-transaction"
  | "force-no-transaction";

export type StatementKind =
  | "alter-table"
  | "create-index"
  | "drop-index"
  | "drop-table"
  | "truncate"
  | "rename"
  | "create-type"
  | "alter-type"
  | "create-trigger"
  | "create-extension"
  | "reindex"
  | "vacuum-full"
  | "cluster"
  | "refresh-materialized-view"
  | "update"
  | "delete"
  | "insert"
  | "begin"
  | "commit"
  | "rollback"
  | "set"
  | "unknown";

export type ParserName = "supabase-pg-parser" | "fallback" | "none";

export type AnalysisDiagnosticSeverity = "error" | "warning" | "info";
export type AnalysisDiagnosticSource = "parser" | "pipeline" | "worker";

export type DocumentationLink = {
  label: string;
  href: string;
  description?: string;
};

export type LockInfo = {
  level: LockLevel;
  description: string;
  conflictsWith: LockLevel[];
  commonCommands: string[];
  blocksReads: boolean;
  blocksWrites: boolean;
  docsLink: DocumentationLink;
};

export type SafeRewrite = {
  title: string;
  sql: string;
  summary: string;
  rolloutNotes?: string[];
};

export type AnalysisDiagnostic = {
  code: string;
  message: string;
  severity: AnalysisDiagnosticSeverity;
  source: AnalysisDiagnosticSource;
  line?: number;
  column?: number;
  startOffset?: number;
  endOffset?: number;
  statementIndex?: number;
};

export type StatementParserMetadata = {
  astNodeType?: string;
  mappingStrategy?: "offset" | "range" | "sequence";
  parser: ParserName;
  statementLength?: number;
  statementLocation?: number;
};

export type MigrationStatement = {
  index: number;
  raw: string;
  normalized: string;
  startOffset: number;
  endOffset: number;
  lineStart: number;
  lineEnd: number;
  columnStart: number;
  columnEnd: number;
  kind: StatementKind;
  targetObject?: string;
  parserMetadata?: StatementParserMetadata;
  transactionalBehavior?: "allowed" | "requires-outside-transaction" | "unknown";
  tags: string[];
};

export type Finding = {
  id: string;
  ruleId: string;
  title: string;
  summary: string;
  severity: FindingSeverity;
  category: FindingCategory;
  statementIndex: number;
  lineStart?: number;
  lineEnd?: number;
  columnStart?: number;
  columnEnd?: number;
  objectName?: string;
  redactedPreview?: string;
  lockLevel?: LockLevel;
  lockInfo?: LockInfo;
  whyItMatters: string;
  recommendedAction: string;
  safeRewrite?: SafeRewrite;
  docsLinks: DocumentationLink[];
  confidence: ConfidenceLevel;
  tags: string[];
};

export type ParserResult = {
  ok: boolean;
  parser: ParserName;
  ast?: unknown;
  errors: AnalysisDiagnostic[];
  warnings: AnalysisDiagnostic[];
  requestedVersion: PostgresVersion;
  effectiveVersion?: 15 | 16 | 17;
};

export type AnalysisSettings = {
  postgresVersion: PostgresVersion;
  frameworkPreset: FrameworkPreset;
  tableSizeProfile: TableSizeProfile;
  includeLowSeverityFindings: boolean;
  includeInfoFindings: boolean;
  includeSafeRewrites: boolean;
  assumeOnlineMigration: boolean;
  assumeRunsInTransaction: boolean;
  transactionAssumptionMode: TransactionAssumptionMode;
  flagDestructiveChanges: boolean;
  redactionMode: boolean;
  autoAnalyze: boolean;
  reportFormat: ReportFormat;
  stopAfterParseError: boolean;
  maxStatements?: number;
};

export type TransactionBoundary = "begin" | "commit" | "rollback" | "none";

export type StatementTransactionState = {
  statementIndex: number;
  boundary: TransactionBoundary;
  insideExplicitTransaction: boolean;
  effectiveTransaction: boolean;
  explicitTransactionDepth: number;
  startsTransaction: boolean;
  endsTransaction: boolean;
};

export type TransactionContext = {
  assumeTransaction: boolean;
  hasExplicitTransactionBlock: boolean;
  hasTransactionControlStatements: boolean;
  statementStates: StatementTransactionState[];
};

export type RiskLabel =
  | "Looks safe"
  | "Review recommended"
  | "Risky migration"
  | "High downtime risk";

export type AnalysisRiskSummary = {
  score: number;
  label: RiskLabel;
  deductions: Record<FindingSeverity, number>;
  highestLockLevel: LockLevel | null;
  destructiveChanges: number;
  rewriteRisks: number;
  tableScans: number;
  transactionRisks: number;
};

export type AnalysisSummary = {
  totalStatements: number;
  totalFindings: number;
  highestSeverity: FindingSeverity | null;
  bySeverity: Record<FindingSeverity, number>;
  byCategory: Partial<Record<FindingCategory, number>>;
  risk: AnalysisRiskSummary;
};

export type AnalysisRuntimeMetadata = {
  fallbackReason?: string;
  mode: "main-thread" | "worker";
};

export type TransactionAssumptionSource =
  | "framework-default"
  | "framework-comment"
  | "user-override";

export type FrameworkAnalysisMetadata = {
  preset: FrameworkPreset;
  label: string;
  description: string;
  sourceFilename?: string;
  assumeTransactionDefault: boolean;
  effectiveAssumeTransaction: boolean;
  transactionAssumptionMode: TransactionAssumptionMode;
  transactionAssumptionSource: TransactionAssumptionSource;
  transactionAssumptionReason: string;
  transactionDisableDetected: boolean;
  transactionDisableHint?: string;
  commonMigrationFilePatterns: string[];
  commonRisks: string[];
  safeIndexAdvice: string;
  safeConstraintAdvice: string;
  docsLinks: DocumentationLink[];
  migrationReviewChecklist: string[];
  detectedSignals: string[];
};

export type AnalysisMetadata = {
  postgresVersionUsed: PostgresVersion;
  parserVersionUsed: 15 | 16 | 17 | null;
  tableSizeProfile: TableSizeProfile;
  frameworkPreset: FrameworkPreset;
  rulesRun: string[];
  rulesSkipped: string[];
  analysisDurationMs: number;
  limitations: string[];
  framework: FrameworkAnalysisMetadata;
  parser: ParserResult;
  runtime: AnalysisRuntimeMetadata;
  statementKinds: Partial<Record<StatementKind, number>>;
  transactionContext: TransactionContext;
  registeredRules: string[];
};

export type AnalysisResult = {
  settings: AnalysisSettings;
  statements: MigrationStatement[];
  findings: Finding[];
  safeRewriteRecipeGroups: import("./analyzer/recipes/types").FindingRecipeGroup[];
  summary: AnalysisSummary;
  metadata: AnalysisMetadata;
  analyzerVersion: string;
  analyzedAt: string;
  sourceFingerprint?: string;
  hasBlockingFindings: boolean;
};
