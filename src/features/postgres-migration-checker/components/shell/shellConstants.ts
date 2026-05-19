import type { FindingsCategoryFilter, FindingsSeverityFilter, FindingsSortMode } from "../results";
import type { TableSizeProfile, TransactionAssumptionMode } from "@/features/postgres-migration-checker";

export const WORKSPACE_SETTINGS_STORAGE_KEY =
  "authos.postgres-migration-checker.workspace-settings.v1";
export const TOOL_ID = "postgres-migration-safety-checker";
export const STATUS_MESSAGE_TTL_MS = 3200;
export const AUTO_ANALYZE_DEBOUNCE_MS = 750;
export const ANALYZER_INTERNAL_ERROR_MESSAGE =
  "The analyzer hit an internal error, so results may be incomplete. Your SQL was not uploaded. Try simplifying the migration or report this issue with a redacted sample.";

export const PRIVACY_PANEL_POINTS = [
  "SQL is processed client-side.",
  "File uploads are read by the browser only.",
  "Settings may be stored locally.",
  "Raw SQL is not included in analytics.",
  "Reports are generated locally.",
  "Settings links do not include SQL.",
] as const;

export const FINDINGS_SEVERITY_FILTER_VALUES = [
  "all",
  "critical",
  "high",
  "medium",
  "low",
  "info",
] as const satisfies readonly FindingsSeverityFilter[];

export const FINDINGS_CATEGORY_FILTER_VALUES = [
  "all",
  "locking",
  "rewrite",
  "index",
  "constraint",
  "data-loss",
  "transaction",
  "framework",
  "version",
  "reversibility",
  "performance",
  "security",
  "syntax",
] as const satisfies readonly FindingsCategoryFilter[];

export const FINDINGS_SORT_MODE_VALUES = [
  "severity",
  "statement-order",
  "category",
] as const satisfies readonly FindingsSortMode[];

export const RESULTS_TAB_VALUES = ["findings", "safe-rewrites"] as const;

export const DEFAULT_SAFE_SAMPLE_ID = "foreign-key-not-valid";

export const SHORTCUT_LABELS = {
  analyze: "Cmd/Ctrl + Enter",
  commandMenu: "Cmd/Ctrl + K",
  copyMarkdownReport: "Cmd/Ctrl + Shift + C",
  escape: "Esc",
  findingsSearch: "/",
  loadUnsafeExample: "Cmd/Ctrl + Shift + L",
} as const;

export const SHORTCUT_HELP_ITEMS = [
  {
    keys: SHORTCUT_LABELS.analyze,
    action: "Analyze now",
    note: "Run the checker immediately from anywhere on this tool page.",
  },
  {
    keys: SHORTCUT_LABELS.commandMenu,
    action: "Open command menu",
    note: "Jump straight to common actions without leaving the keyboard.",
  },
  {
    keys: SHORTCUT_LABELS.copyMarkdownReport,
    action: "Copy Markdown report",
    note: "Copies the report when an analysis result is available.",
  },
  {
    keys: SHORTCUT_LABELS.loadUnsafeExample,
    action: "Load unsafe example",
    note: "Loads the default risky migration example into the editor.",
  },
  {
    keys: SHORTCUT_LABELS.escape,
    action: "Close dialogs and menus",
    note: "Dismisses open overlays, drawers, and popovers.",
  },
  {
    keys: SHORTCUT_LABELS.findingsSearch,
    action: "Focus findings search",
    note: "Moves focus to findings search when you are not typing in the editor.",
  },
] as const;

export const TABLE_SIZE_PROFILE_OPTIONS: ReadonlyArray<{
  description: string;
  label: string;
  value: TableSizeProfile;
}> = [
  {
    value: "unknown",
    label: "Unknown",
    description:
      "Cautious default when row count is unclear and the checker should avoid assuming a small-table fast path.",
  },
  {
    value: "small",
    label: "Small",
    description:
      "Small tables where some blocking work is easier to absorb, while destructive and transaction-invalid steps still stay risky.",
  },
  {
    value: "medium",
    label: "Medium",
    description:
      "Normal production sizing where locking, scans, and validation still deserve ordinary review.",
  },
  {
    value: "large",
    label: "Large",
    description:
      "High-traffic tables where the checker escalates table scans, rewrites, and non-concurrent index work.",
  },
  {
    value: "very-large",
    label: "Very large",
    description:
      "Hot or massive tables where the checker escalates rewrite, scan, and lock-risk findings aggressively.",
  },
];

export const TRANSACTION_ASSUMPTION_OPTIONS: ReadonlyArray<{
  description: string;
  label: string;
  value: TransactionAssumptionMode;
}> = [
  {
    value: "auto",
    label: "Auto",
    description:
      "Use the framework preset default and honor detected no-transaction annotations.",
  },
  {
    value: "force-transaction",
    label: "Assume transaction",
    description:
      "Force the review to treat the migration as wrapped in a transaction.",
  },
  {
    value: "force-no-transaction",
    label: "Assume no transaction",
    description:
      "Force the review to treat the migration as running outside a transaction.",
  },
];
