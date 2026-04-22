"use client";

import type { AnalysisResult, AnalysisSettings } from "../../types";
import { runAnalysisPipeline } from "../analysisPipeline";

type AnalyzeInput = {
  settings: AnalysisSettings;
  sourceFilename?: string;
  sql: string;
};

type PendingWorkerRequest = {
  reject: (reason?: unknown) => void;
  resolve: (value: AnalysisResult) => void;
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

let analyzerWorker: Worker | null = null;
let workerUnavailableReason: string | null = null;
let nextRequestId = 1;
const pendingRequests = new Map<number, PendingWorkerRequest>();

function terminateWorker(reason?: string) {
  if (reason) {
    workerUnavailableReason = reason;
  }

  analyzerWorker?.terminate();
  analyzerWorker = null;

  const error = new Error(reason ?? "The analysis worker became unavailable.");

  pendingRequests.forEach((request) => {
    request.reject(error);
  });
  pendingRequests.clear();
}

function getAnalyzerWorker() {
  if (
    workerUnavailableReason ||
    typeof window === "undefined" ||
    typeof Worker === "undefined"
  ) {
    return null;
  }

  if (analyzerWorker) {
    return analyzerWorker;
  }

  try {
    const worker = new Worker(new URL("./analyzer.worker.ts", import.meta.url), {
      type: "module",
    });

    worker.onmessage = (event: MessageEvent<AnalyzerWorkerResponse>) => {
      const response = event.data;
      const pendingRequest = pendingRequests.get(response.id);

      if (!pendingRequest) {
        return;
      }

      pendingRequests.delete(response.id);

      if (response.ok) {
        pendingRequest.resolve(response.result);
        return;
      }

      pendingRequest.reject(
        new Error(response.error || "The analysis worker returned an unknown error."),
      );
    };

    worker.onerror = () => {
      terminateWorker("The analysis worker failed and the checker fell back to the main thread.");
    };

    analyzerWorker = worker;
    return analyzerWorker;
  } catch (error) {
    workerUnavailableReason =
      error instanceof Error
        ? error.message
        : "The analysis worker could not be created.";
    return null;
  }
}

async function analyzeOnMainThread(
  { settings, sourceFilename, sql }: AnalyzeInput,
  fallbackReason?: string,
) {
  return runAnalysisPipeline({
    sql,
    settings,
    sourceFilename,
    runtime: {
      mode: "main-thread",
      fallbackReason,
    },
  });
}

export async function analyzeInWorkerOrMainThread(input: AnalyzeInput) {
  const worker = getAnalyzerWorker();

  if (!worker) {
    return analyzeOnMainThread(input, workerUnavailableReason ?? undefined);
  }

  const requestId = nextRequestId;
  nextRequestId += 1;

  try {
    return await new Promise<AnalysisResult>((resolve, reject) => {
      pendingRequests.set(requestId, { resolve, reject });
      worker.postMessage({
        id: requestId,
        sourceFilename: input.sourceFilename,
        sql: input.sql,
        settings: input.settings,
      });
    });
  } catch (error) {
    const fallbackReason =
      error instanceof Error
        ? error.message
        : "The analysis worker failed and the checker fell back to the main thread.";

    terminateWorker(fallbackReason);
    return analyzeOnMainThread(input, fallbackReason);
  }
}
