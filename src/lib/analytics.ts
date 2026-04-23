type SeverityCounts = Record<"critical" | "high" | "medium" | "low" | "info", number>;

export type AnalyticsSettingsSummary = {
  autoAnalyze: boolean;
  frameworkPreset: string;
  postgresVersion: number;
  redactionMode: boolean;
  tableSizeProfile: string;
  transactionAssumptionMode: string;
};

export type AnalysisCompletedPayload = {
  durationMs: number;
  findingCount: number;
  parserUsed: string;
  settingsSummary: AnalyticsSettingsSummary;
  severityCounts: SeverityCounts;
  statementCount: number;
  toolId: string;
};

export type ReportCopiedPayload = {
  format: string;
  toolId: string;
};

type AnalyticsAdapter = {
  trackAnalysisCompleted: (payload: AnalysisCompletedPayload) => void;
  trackReportCopied: (payload: ReportCopiedPayload) => void;
  trackToolOpened: (toolId: string) => void;
};

function logInDevelopment(eventName: string, payload: unknown) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.info(`[analytics:${eventName}]`, payload);
}

const defaultAnalyticsAdapter: AnalyticsAdapter = {
  trackToolOpened(toolId) {
    logInDevelopment("tool-opened", {
      toolId,
    });
  },
  trackAnalysisCompleted(payload) {
    logInDevelopment("analysis-completed", payload);
  },
  trackReportCopied(payload) {
    logInDevelopment("report-copied", payload);
  },
};

export function trackToolOpened(toolId: string) {
  defaultAnalyticsAdapter.trackToolOpened(toolId);
}

export function trackAnalysisCompleted(payload: AnalysisCompletedPayload) {
  defaultAnalyticsAdapter.trackAnalysisCompleted(payload);
}

export function trackReportCopied(payload: ReportCopiedPayload) {
  defaultAnalyticsAdapter.trackReportCopied(payload);
}
