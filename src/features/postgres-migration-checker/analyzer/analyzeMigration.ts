import type { AnalysisResult, AnalysisSettings } from "../types";
import { runAnalysisPipeline } from "./analysisPipeline";

type AnalyzeMigrationInput = {
  runtime?: AnalysisResult["metadata"]["runtime"];
  sourceFilename?: string;
  sql: string;
  settings: AnalysisSettings;
};

export async function analyzeMigration({
  runtime,
  sourceFilename,
  sql,
  settings,
}: AnalyzeMigrationInput): Promise<AnalysisResult> {
  return runAnalysisPipeline({
    sql,
    sourceFilename,
    settings,
    runtime: runtime ?? {
      mode: "main-thread",
    },
  });
}
