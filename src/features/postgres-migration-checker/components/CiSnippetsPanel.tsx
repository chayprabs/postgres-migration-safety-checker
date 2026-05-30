"use client";

import { useMemo } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { generateCiSnippets, type AnalysisSettings } from "@pg-migration-checker/analyzer";

type CiSnippetsPanelProps = {
  settings: AnalysisSettings;
};

export function CiSnippetsPanel({ settings }: CiSnippetsPanelProps) {
  const snippets = useMemo(
    () =>
      generateCiSnippets({
        postgresVersion: settings.postgresVersion,
        frameworkPreset: settings.frameworkPreset,
      }),
    [settings.frameworkPreset, settings.postgresVersion],
  );

  async function copySnippet(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    void label;
  }

  return (
    <Card className="space-y-4 p-6">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">CI integration snippets</h3>
        <p className="text-sm leading-7 text-muted-foreground">
          Copy a starter workflow that runs the migration checker CLI in your pipeline.
        </p>
      </div>
      {(["github", "gitlab", "shell"] as const).map((key) => (
        <div key={key} className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              {key}
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                void copySnippet(key, snippets[key]);
              }}
            >
              Copy
            </Button>
          </div>
          <pre className="overflow-x-auto rounded-2xl border border-border bg-background p-4 text-xs">
            {snippets[key]}
          </pre>
        </div>
      ))}
    </Card>
  );
}
