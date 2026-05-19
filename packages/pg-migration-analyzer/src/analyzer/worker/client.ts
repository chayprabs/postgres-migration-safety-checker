"use client";

import type { AnalysisResult, AnalysisSettings } from "../../types";
import { getUtf8ByteLength } from "../../inputProfile";
import { runAnalysisPipeline } from "../analysisPipeline";

type AnalyzeInput = {
  settings: AnalysisSettings;
  sourceFilename?: string;
  sql: string;
};

type PendingWorkerRequest = {
  reject: (reason?: unknown) => void;
  resolve: (value: AnalysisResult) => void;
  timeoutId: number | null;
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

type AnalyzeExecutionOptions = {
  allowMainThreadFallback?: boolean;
  inputByteLength?: number;
  workerTimeoutMs?: number;
};

function clearPendingWorkerRequest(requestId: number) {
  const pendingRequest = pendingRequests.get(requestId);

  if (!pendingRequest) {
    return null;
  }

  if (pendingRequest.timeoutId !== null) {
    window.clearTimeout(pendingRequest.timeoutId);
  }

  pendingRequests.delete(requestId);
  return pendingRequest;
}

function getWorkerTimeoutMs(inputByteLength: number) {
  if (inputByteLength > 1024 * 1024) {
    return 15_000;
  }

  return 10_000;
}

function terminateWorker(
  reason?: string,
  { markUnavailable = false }: { markUnavailable?: boolean } = {},
) {
  if (reason && markUnavailable) {
    workerUnavailableReason = reason;
  }

  analyzerWorker?.terminate();
  analyzerWorker = null;

  const error = new Error(reason ?? "The analysis worker became unavailable.");

  pendingRequests.forEach((request) => {
    if (request.timeoutId !== null) {
      window.clearTimeout(request.timeoutId);
    }
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
      const pendingRequest = clearPendingWorkerRequest(response.id);

      if (!pendingRequest) {
        return;
      }

      if (response.ok) {
        pendingRequest.resolve(response.result);
        return;
      }

      pendingRequest.reject(
        new Error(response.error || "The analysis worker returned an unknown error."),
      );
    };

    worker.onerror = () => {
      terminateWorker(
        "The analysis worker failed and the checker fell back to the main thread.",
      );
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

export async function analyzeInWorkerOrMainThread(
  input: AnalyzeInput,
  options: AnalyzeExecutionOptions = {},
) {
  const worker = getAnalyzerWorker();
  const allowMainThreadFallback = options.allowMainThreadFallback !== false;

  if (!worker) {
    if (!allowMainThreadFallback) {
      throw new Error(
        workerUnavailableReason ??
          "The analysis worker is unavailable for this migration size.",
      );
    }

    return analyzeOnMainThread(input, workerUnavailableReason ?? undefined);
  }

  const requestId = nextRequestId;
  nextRequestId += 1;
  const inputByteLength = options.inputByteLength ?? getUtf8ByteLength(input.sql);
  const workerTimeoutMs =
    options.workerTimeoutMs ?? getWorkerTimeoutMs(inputByteLength);

  try {
    return await new Promise<AnalysisResult>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        const pendingRequest = clearPendingWorkerRequest(requestId);

        if (!pendingRequest) {
          return;
        }

        pendingRequest.reject(
          new Error(
            `The analysis worker timed out after ${Math.round(workerTimeoutMs / 1000)} seconds.`,
          ),
        );
      }, workerTimeoutMs);

      pendingRequests.set(requestId, { resolve, reject, timeoutId });
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

    if (!allowMainThreadFallback) {
      throw new Error(fallbackReason);
    }

    return analyzeOnMainThread(input, fallbackReason);
  }
}
