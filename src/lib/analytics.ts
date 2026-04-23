type SeverityCounts = Record<
  "critical" | "high" | "medium" | "low" | "info",
  number
>;

type StatementCountBucket = "0" | "1" | "2-5" | "6-20" | "21+";
type InputSizeBucket = "empty" | "small" | "medium" | "large" | "huge";
type FindingCountBucket = "0" | "1" | "2-5" | "6-20" | "21+";
type AnalysisDurationBucket =
  | "<100ms"
  | "100-499ms"
  | "500-1999ms"
  | "2000-4999ms"
  | "5000ms+";
type ParserMode = "parser" | "fallback" | "error";
type ExportActionType =
  | "copy-markdown"
  | "download-markdown"
  | "download-html"
  | "download-json"
  | "print";

type DebugEventListener = () => void;

type AnalyticsEventName =
  | "tool_page_opened"
  | "sample_loaded"
  | "analysis_completed"
  | "analysis_failed"
  | "report_exported"
  | "local_save_saved"
  | "local_save_opened"
  | "redaction_mode_enabled"
  | "settings_link_copied";

type AnalyticsSanitizedPayload = {
  analysisDurationBucket?: AnalysisDurationBucket;
  categoriesPresent?: string[];
  exportActionType?: ExportActionType;
  findingCountBucket?: FindingCountBucket;
  frameworkPreset?: string;
  inputSizeBucket?: InputSizeBucket;
  parserMode?: ParserMode;
  postgresVersion?: number;
  redactionModeEnabled?: boolean;
  sampleUsed?: boolean;
  severityCounts?: SeverityCounts;
  statementCountBucket?: StatementCountBucket;
  tableSizeProfile?: string;
  timestamp: string;
  toolId: string;
};

export type AnalyticsDebugEvent = {
  name: AnalyticsEventName;
  payload: AnalyticsSanitizedPayload;
};

export type AnalyticsSettingsSummary = {
  frameworkPreset: string;
  postgresVersion: number;
  redactionMode: boolean;
  tableSizeProfile: string;
};

export type AnalysisCompletedPayload = {
  categoriesPresent: string[];
  durationMs: number;
  findingCount: number;
  inputLength: number;
  parserUsed: string;
  sampleUsed: boolean;
  settingsSummary: AnalyticsSettingsSummary;
  severityCounts: SeverityCounts;
  statementCount: number;
  toolId: string;
};

export type AnalysisFailedPayload = {
  inputLength: number;
  sampleUsed: boolean;
  settingsSummary: AnalyticsSettingsSummary;
  toolId: string;
};

export type ReportExportedPayload = {
  exportActionType: ExportActionType;
  redactionModeEnabled: boolean;
  sampleUsed: boolean;
  toolId: string;
};

export type LocalSaveUsedPayload = {
  redactionModeEnabled: boolean;
  sampleUsed: boolean;
  toolId: string;
};

export type SettingsLinkCopiedPayload = {
  redactionModeEnabled: boolean;
  sampleUsed: boolean;
  toolId: string;
};

declare global {
  interface Window {
    __AUTHOS_ANALYTICS__?: {
      track: (eventName: AnalyticsEventName, payload: AnalyticsSanitizedPayload) => void;
    };
  }
}

const debugEventListeners = new Set<DebugEventListener>();
let debugEventsSnapshot: readonly AnalyticsDebugEvent[] = [];
const MAX_DEBUG_EVENTS = 20;
const EMPTY_DEBUG_EVENTS: readonly AnalyticsDebugEvent[] = [];
const dangerousExactKeys = new Set([
  "sql",
  "rawsql",
  "normalizedsql",
  "statementsql",
  "statementtext",
  "statementpreview",
  "snippet",
  "snippets",
  "preview",
  "redactedpreview",
  "filename",
  "sourcefilename",
  "uploadedfilename",
  "filecontent",
  "filecontents",
  "content",
  "tablename",
  "columnname",
  "constraintname",
  "indexname",
  "objectname",
  "secret",
  "secretpreview",
  "reporttext",
  "clipboardcontent",
  "clipboardtext",
  "stack",
  "errorstack",
]);

function isDevelopment() {
  return process.env.NODE_ENV === "development";
}

function isBrowser() {
  return typeof window !== "undefined";
}

function normalizeKey(key: string) {
  return key.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`).replace(/[^a-z0-9]+/gi, "").toLowerCase();
}

function isDangerousKey(key: string) {
  const normalizedKey = normalizeKey(key);
  return dangerousExactKeys.has(normalizedKey);
}

function cloneWithoutDangerousKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneWithoutDangerousKeys(entry));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !isDangerousKey(key))
      .map(([key, nestedValue]) => [key, cloneWithoutDangerousKeys(nestedValue)]),
  );
}

function coerceSeverityCounts(value: unknown): SeverityCounts {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<Record<keyof SeverityCounts, unknown>>)
      : {};

  return {
    critical: typeof candidate.critical === "number" ? candidate.critical : 0,
    high: typeof candidate.high === "number" ? candidate.high : 0,
    medium: typeof candidate.medium === "number" ? candidate.medium : 0,
    low: typeof candidate.low === "number" ? candidate.low : 0,
    info: typeof candidate.info === "number" ? candidate.info : 0,
  };
}

function bucketCount(value: number): StatementCountBucket {
  if (value <= 0) {
    return "0";
  }

  if (value === 1) {
    return "1";
  }

  if (value <= 5) {
    return "2-5";
  }

  if (value <= 20) {
    return "6-20";
  }

  return "21+";
}

function bucketInputSize(value: number): InputSizeBucket {
  if (value <= 0) {
    return "empty";
  }

  if (value <= 500) {
    return "small";
  }

  if (value <= 3_000) {
    return "medium";
  }

  if (value <= 12_000) {
    return "large";
  }

  return "huge";
}

function bucketAnalysisDuration(value: number): AnalysisDurationBucket {
  if (value < 100) {
    return "<100ms";
  }

  if (value < 500) {
    return "100-499ms";
  }

  if (value < 2_000) {
    return "500-1999ms";
  }

  if (value < 5_000) {
    return "2000-4999ms";
  }

  return "5000ms+";
}

function coerceParserMode(value: unknown): ParserMode {
  if (value === "supabase-pg-parser") {
    return "parser";
  }

  if (value === "fallback") {
    return "fallback";
  }

  if (value === "parser" || value === "fallback" || value === "error") {
    return value;
  }

  return "error";
}

function coerceCategories(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return [...new Set(value.filter((entry): entry is string => typeof entry === "string"))].sort(
    (left, right) => left.localeCompare(right),
  );
}

function coerceSettingsSummary(value: unknown): AnalyticsSettingsSummary {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<Record<keyof AnalyticsSettingsSummary, unknown>>)
      : {};

  return {
    frameworkPreset:
      typeof candidate.frameworkPreset === "string"
        ? candidate.frameworkPreset
        : "unknown",
    postgresVersion:
      typeof candidate.postgresVersion === "number"
        ? candidate.postgresVersion
        : 16,
    redactionMode:
      typeof candidate.redactionMode === "boolean"
        ? candidate.redactionMode
        : false,
    tableSizeProfile:
      typeof candidate.tableSizeProfile === "string"
        ? candidate.tableSizeProfile
        : "unknown",
  };
}

function readBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function readNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function recordDebugEvent(event: AnalyticsDebugEvent) {
  if (!isDevelopment()) {
    return;
  }

  debugEventsSnapshot = [event, ...debugEventsSnapshot].slice(0, MAX_DEBUG_EVENTS);
  debugEventListeners.forEach((listener) => {
    listener();
  });
}

function getConfiguredVendor() {
  const vendor = process.env.NEXT_PUBLIC_ANALYTICS_VENDOR;
  const publicKey = process.env.NEXT_PUBLIC_ANALYTICS_KEY;

  if (!vendor || !publicKey) {
    return null;
  }

  return {
    publicKey,
    vendor,
  };
}

function sendToVendor(event: AnalyticsDebugEvent) {
  const configuredVendor = getConfiguredVendor();

  if (!configuredVendor || !isBrowser()) {
    return;
  }

  if (configuredVendor.vendor === "window-hook") {
    window.__AUTHOS_ANALYTICS__?.track(event.name, event.payload);
  }
}

function logInDevelopment(event: AnalyticsDebugEvent) {
  if (!isDevelopment()) {
    return;
  }

  console.info(`[analytics:${event.name}]`, event.payload);
}

export function sanitizeAnalyticsEvent(
  eventName: AnalyticsEventName,
  payload: unknown,
): AnalyticsDebugEvent {
  const safePayload = cloneWithoutDangerousKeys(payload) as Record<string, unknown>;
  const timestamp = new Date().toISOString();
  const toolId =
    typeof safePayload.toolId === "string" ? safePayload.toolId : "unknown-tool";
  const settingsSummary = coerceSettingsSummary(safePayload.settingsSummary);
  const basePayload: AnalyticsSanitizedPayload = {
    timestamp,
    toolId,
  };

  switch (eventName) {
    case "tool_page_opened":
    case "sample_loaded":
      return {
        name: eventName,
        payload: basePayload,
      };

    case "analysis_completed":
      return {
        name: eventName,
        payload: {
          ...basePayload,
          statementCountBucket: bucketCount(readNumber(safePayload.statementCount)),
          inputSizeBucket: bucketInputSize(readNumber(safePayload.inputLength)),
          findingCountBucket: bucketCount(readNumber(safePayload.findingCount)),
          severityCounts: coerceSeverityCounts(safePayload.severityCounts),
          categoriesPresent: coerceCategories(safePayload.categoriesPresent),
          postgresVersion: settingsSummary.postgresVersion,
          frameworkPreset: settingsSummary.frameworkPreset,
          tableSizeProfile: settingsSummary.tableSizeProfile,
          parserMode: coerceParserMode(safePayload.parserUsed),
          analysisDurationBucket: bucketAnalysisDuration(
            readNumber(safePayload.durationMs),
          ),
          redactionModeEnabled: settingsSummary.redactionMode,
          sampleUsed: readBoolean(safePayload.sampleUsed),
        },
      };

    case "analysis_failed":
      return {
        name: eventName,
        payload: {
          ...basePayload,
          inputSizeBucket: bucketInputSize(readNumber(safePayload.inputLength)),
          postgresVersion: settingsSummary.postgresVersion,
          frameworkPreset: settingsSummary.frameworkPreset,
          tableSizeProfile: settingsSummary.tableSizeProfile,
          parserMode: "error",
          redactionModeEnabled: settingsSummary.redactionMode,
          sampleUsed: readBoolean(safePayload.sampleUsed),
        },
      };

    case "report_exported":
      return {
        name: eventName,
        payload: {
          ...basePayload,
          exportActionType:
            safePayload.exportActionType === "download-markdown" ||
            safePayload.exportActionType === "download-html" ||
            safePayload.exportActionType === "download-json" ||
            safePayload.exportActionType === "print"
              ? safePayload.exportActionType
              : "copy-markdown",
          redactionModeEnabled: readBoolean(
            safePayload.redactionModeEnabled,
          ),
          sampleUsed: readBoolean(safePayload.sampleUsed),
        },
      };

    case "local_save_saved":
    case "local_save_opened":
    case "settings_link_copied":
      return {
        name: eventName,
        payload: {
          ...basePayload,
          redactionModeEnabled: readBoolean(
            safePayload.redactionModeEnabled,
          ),
          sampleUsed: readBoolean(safePayload.sampleUsed),
        },
      };

    case "redaction_mode_enabled":
      return {
        name: eventName,
        payload: basePayload,
      };
  }
}

function dispatchAnalyticsEvent(
  eventName: AnalyticsEventName,
  payload: unknown,
) {
  const event = sanitizeAnalyticsEvent(eventName, payload);
  recordDebugEvent(event);
  logInDevelopment(event);

  if (process.env.NODE_ENV === "production") {
    sendToVendor(event);
  }
}

export function subscribeAnalyticsDebugEvents(listener: DebugEventListener) {
  if (!isDevelopment()) {
    return () => {};
  }

  debugEventListeners.add(listener);

  return () => {
    debugEventListeners.delete(listener);
  };
}

export function readAnalyticsDebugEvents() {
  return isDevelopment() ? debugEventsSnapshot : EMPTY_DEBUG_EVENTS;
}

export function trackToolOpened(toolId: string) {
  dispatchAnalyticsEvent("tool_page_opened", {
    toolId,
  });
}

export function trackSampleLoaded(toolId: string) {
  dispatchAnalyticsEvent("sample_loaded", {
    toolId,
  });
}

export function trackAnalysisCompleted(payload: AnalysisCompletedPayload) {
  dispatchAnalyticsEvent("analysis_completed", payload);
}

export function trackAnalysisFailed(payload: AnalysisFailedPayload) {
  dispatchAnalyticsEvent("analysis_failed", payload);
}

export function trackReportExported(payload: ReportExportedPayload) {
  dispatchAnalyticsEvent("report_exported", payload);
}

export function trackReportCopied(payload: {
  format: "markdown";
  redactionModeEnabled: boolean;
  sampleUsed: boolean;
  toolId: string;
}) {
  trackReportExported({
    toolId: payload.toolId,
    redactionModeEnabled: payload.redactionModeEnabled,
    sampleUsed: payload.sampleUsed,
    exportActionType: "copy-markdown",
  });
}

export function trackLocalSaveSaved(payload: LocalSaveUsedPayload) {
  dispatchAnalyticsEvent("local_save_saved", payload);
}

export function trackLocalSaveOpened(payload: LocalSaveUsedPayload) {
  dispatchAnalyticsEvent("local_save_opened", payload);
}

export function trackRedactionModeEnabled(toolId: string) {
  dispatchAnalyticsEvent("redaction_mode_enabled", {
    toolId,
  });
}

export function trackSettingsLinkCopied(payload: SettingsLinkCopiedPayload) {
  dispatchAnalyticsEvent("settings_link_copied", payload);
}
