"use client";

import type { AnalysisSettings } from "@pg-migration-checker/analyzer";
import { CiSnippetsPanel } from "./CiSnippetsPanel";
import { CompareMigrationPanel } from "./CompareMigrationPanel";

type WorkspaceToolsSectionProps = {
  analysisSettings: AnalysisSettings;
  schemaContextSql: string;
  onSchemaContextSqlChange: (value: string) => void;
};

export function WorkspaceToolsSection({
  analysisSettings,
  schemaContextSql,
  onSchemaContextSqlChange,
}: WorkspaceToolsSectionProps) {
  return (
    <div className="space-y-6">
      <label className="block space-y-2 rounded-2xl border border-border bg-card p-4">
        <span className="text-sm font-medium">Optional schema context</span>
        <p className="text-sm leading-6 text-muted-foreground">
          Paste related CREATE TABLE statements for relationship-aware checks. Schema text
          is not included in share links.
        </p>
        <textarea
          value={schemaContextSql}
          onChange={(event) => onSchemaContextSqlChange(event.target.value)}
          rows={6}
          className="w-full rounded-2xl border border-border bg-background px-4 py-3 font-mono text-sm"
          placeholder="CREATE TABLE public.users (id bigint PRIMARY KEY, email text);"
        />
      </label>

      <CompareMigrationPanel settings={analysisSettings} />
      <CiSnippetsPanel settings={analysisSettings} />
    </div>
  );
}
