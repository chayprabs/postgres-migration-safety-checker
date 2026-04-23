import type {
  AnalysisResult,
  FrameworkPreset,
  PostgresVersion,
  TableSizeProfile,
} from "../types";

export type SavedLocalAnalysisMode = "summary-only" | "with-sql";

export type SavedLocalAnalysisResultStatement = Omit<
  AnalysisResult["statements"][number],
  "normalized" | "raw"
> & {
  normalized: string;
  raw: string;
};

export type SavedLocalAnalysisResult = Omit<AnalysisResult, "statements"> & {
  statements: SavedLocalAnalysisResultStatement[];
};

export type SavedLocalAnalysis = {
  analysisResult?: SavedLocalAnalysisResult;
  createdAt: string;
  frameworkPreset: FrameworkPreset;
  id: string;
  postgresVersion: PostgresVersion;
  riskScore: number;
  saveMode: SavedLocalAnalysisMode;
  severityCounts: AnalysisResult["summary"]["bySeverity"];
  sourceFilename?: string | null;
  sqlInput?: string;
  tableSizeProfile: TableSizeProfile;
  title: string;
  updatedAt: string;
};
