import type {
  DocumentationLink,
  FindingCategory,
  FindingSeverity,
} from "../../types";

export type SafeRewriteRecipe = {
  id: string;
  title: string;
  appliesToRuleIds: string[];
  description: string;
  steps: string[];
  sqlSnippet: string | null;
  frameworkSnippet?: string;
  warnings: string[];
  docsLinks: DocumentationLink[];
};

export type FindingRecipeGroup = {
  findingId: string;
  ruleId: string;
  title: string;
  summary: string;
  severity: FindingSeverity;
  category: FindingCategory;
  statementIndex: number;
  lineStart?: number;
  lineEnd?: number;
  objectName?: string;
  recipes: SafeRewriteRecipe[];
};
