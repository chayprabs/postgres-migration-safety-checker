export type ToolCategory =
  | "Authentication"
  | "Database"
  | "API"
  | "Security"
  | "Observability"
  | "Infrastructure";

export type ToolStatus = "Coming soon" | "Preview" | "Beta" | "Stable";
export type ToolPrivacyMode = "local-only" | "hybrid" | "server-assisted";
export type ToolIconName =
  | "database"
  | "shield"
  | "file-code"
  | "search"
  | "key"
  | "wrench";

export type ToolDefinition = {
  id: string;
  name: string;
  slug: string;
  shortDescription: string;
  longDescription: string;
  category: ToolCategory;
  status: ToolStatus;
  href: string;
  primaryKeywords: string[];
  relatedTools: string[];
  privacyMode: ToolPrivacyMode;
  localOnly: boolean;
  iconName: ToolIconName;
};

export type ToolPreviewDefinition = {
  id: string;
  name: string;
  slug: string;
  shortDescription: string;
  category: ToolCategory;
  status: "Coming soon";
  primaryKeywords: string[];
  iconName: ToolIconName;
};

export const postgresMigrationSafetyCheckerTool = {
  id: "postgres-migration-safety-checker",
  name: "PostgreSQL Migration Safety Checker",
  slug: "postgres-migration-safety-checker",
  shortDescription:
    "Review pasted migration SQL for the migration risks that tend to cause ugly deploys, long locks, and avoidable downtime.",
  longDescription:
    "Check PostgreSQL migration SQL locally in the browser for locks, downtime, rewrites, unsafe indexes, dangerous constraints, destructive operations, and transaction issues before you ship.",
  category: "Database",
  status: "Preview",
  href: "/tools/postgres-migration-safety-checker",
  primaryKeywords: [
    "postgresql migrations",
    "migration safety",
    "database locks",
    "online schema changes",
    "sql review",
  ],
  relatedTools: [],
  privacyMode: "local-only",
  localOnly: true,
  iconName: "database",
} satisfies ToolDefinition;

export const tools = [
  postgresMigrationSafetyCheckerTool,
] as const satisfies readonly ToolDefinition[];

export const featuredTool = tools[0];

export const comingSoonTools = [
  {
    id: "openapi-diff",
    name: "OpenAPI Diff",
    slug: "openapi-diff",
    shortDescription:
      "Compare API contract changes and highlight breaking changes before a deploy reaches clients.",
    category: "API",
    status: "Coming soon",
    primaryKeywords: ["openapi", "api diff", "breaking changes"],
    iconName: "file-code",
  },
  {
    id: "kubernetes-readiness-analyzer",
    name: "Kubernetes Readiness Analyzer",
    slug: "kubernetes-readiness-analyzer",
    shortDescription:
      "Spot rollout and readiness gaps across probes, resource settings, and deployment policies.",
    category: "Infrastructure",
    status: "Coming soon",
    primaryKeywords: ["kubernetes", "readiness", "deployment health"],
    iconName: "search",
  },
  {
    id: "terraform-plan-visualizer",
    name: "Terraform Plan Visualizer",
    slug: "terraform-plan-visualizer",
    shortDescription:
      "Turn Terraform plans into clearer infrastructure changes, blast-radius cues, and review summaries.",
    category: "Infrastructure",
    status: "Coming soon",
    primaryKeywords: ["terraform", "plan", "infrastructure review"],
    iconName: "wrench",
  },
  {
    id: "github-actions-analyzer",
    name: "GitHub Actions Analyzer",
    slug: "github-actions-analyzer",
    shortDescription:
      "Inspect CI/CD workflows for flaky orchestration, unsafe permissions, and slow pipeline structure.",
    category: "Observability",
    status: "Coming soon",
    primaryKeywords: ["github actions", "ci", "workflow analysis"],
    iconName: "shield",
  },
] as const satisfies readonly ToolPreviewDefinition[];

export const toolCategories = [
  "All",
  "API",
  "Database",
  "Infrastructure",
  "Security",
  "Observability",
] as const;

export function getToolById(id: string) {
  return tools.find((tool) => tool.id === id);
}

export function getToolBySlug(slug: string) {
  return tools.find((tool) => tool.slug === slug);
}

export function describeToolPrivacy(tool: ToolDefinition) {
  if (tool.localOnly && tool.privacyMode === "local-only") {
    return "Local-only analysis. Sensitive input stays in the browser.";
  }

  if (tool.privacyMode === "hybrid") {
    return "Hybrid privacy mode. Some analysis may require server-side help.";
  }

  return "Server-assisted analysis.";
}
