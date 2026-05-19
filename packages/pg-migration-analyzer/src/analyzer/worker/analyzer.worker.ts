import type { AnalysisResult, AnalysisSettings } from "../../types";
import { runAnalysisPipeline } from "../analysisPipeline";

type AnalyzerWorkerRequest = {
  id: number;
  settings: AnalysisSettings;
  sourceFilename?: string;
  sql: string;
};

type AnalyzerWorkerResponse =
  | {
      id: number;
      ok: true;
      result: AnalysisResult;
    }
  | {
      error: string;
      id: number;
      ok: false;
    };

self.onmessage = async (event: MessageEvent<AnalyzerWorkerRequest>) => {
  const { id, settings, sourceFilename, sql } = event.data;

  try {
    const result = await runAnalysisPipeline({
      sql,
      settings,
      sourceFilename,
      runtime: {
        mode: "worker",
      },
    });

    const response: AnalyzerWorkerResponse = {
      id,
      ok: true,
      result,
    };

    self.postMessage(response);
  } catch (error) {
    const response: AnalyzerWorkerResponse = {
      id,
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "The analysis worker failed to complete the request.",
    };

    self.postMessage(response);
  }
};

export {};
