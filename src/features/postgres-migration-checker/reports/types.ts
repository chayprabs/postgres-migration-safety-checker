import type { FindingRecipeGroup } from "../analyzer/recipes/types";
import type {
  AnalysisDiagnostic,
  AnalysisResult,
  Finding,
  FindingCategory,
  FindingSeverity,
  FrameworkPreset,
  PostgresVersion,
  TableSizeProfile,
} from "../types";

export type ReportSeverityFilter = "all" | FindingSeverity;
export type ReportCategoryFilter = "all" | FindingCategory;
export type ReportSortMode = "severity" | "statement-order" | "category";

export type ReportViewFilters = {
  categoryFilter: ReportCategoryFilter;
  resultsTab: "findings" | "safe-rewrites";
  severityFilter: ReportSeverityFilter;
  showLowSeverity: boolean;
  showOnlyBlockingRisks: boolean;
  showSafeRewritesOnly: boolean;
  sortMode: ReportSortMode;
};

export type ReportExportOptions = {
  generatedAt?: string;
  includeSqlSnippets: boolean;
  redactionMode: boolean;
  sourceFilename?: string | null;
};

export type ReportExportInput = {
  findings: readonly Finding[];
  frameworkLabel: string;
  frameworkPreset: FrameworkPreset;
  options: ReportExportOptions;
  parserDiagnostics: readonly AnalysisDiagnostic[];
  postgresVersion: PostgresVersion;
  recipeGroups: readonly FindingRecipeGroup[];
  result: AnalysisResult;
  tableSizeProfile: TableSizeProfile;
  viewFilters: ReportViewFilters;
};

export type ExportedAnalysisStatement = Omit<
  AnalysisResult["statements"][number],
  "normalized" | "raw"
> & {
  normalized?: string;
  raw?: string;
};

export type ExportedAnalysisResult = Omit<AnalysisResult, "statements"> & {
  statements: ExportedAnalysisStatement[];
};

export type JsonReportDocument = {
  analysisResult: ExportedAnalysisResult;
  generatedAt: string;
  privacy: {
    generatedLocally: true;
    includeSqlSnippets: boolean;
    redactionMode: boolean;
    note: string;
  };
  reportContext: {
    findingsIncluded: number;
    frameworkLabel: string;
    frameworkPreset: FrameworkPreset;
    parserDiagnosticsCount: number;
    postgresVersion: PostgresVersion;
    riskLabel: AnalysisResult["summary"]["risk"]["label"];
    riskScore: number;
    tableSizeProfile: TableSizeProfile;
    totalFindings: number;
  };
  title: "PostgreSQL Migration Safety Report";
  viewFilters: ReportViewFilters;
};
