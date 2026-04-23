"use client";

import type { Finding } from "../../types";
import { Card } from "@/components/Card";
import { FindingCard } from "./FindingCard";

type FindingsListProps = {
  canCopySafeRewrite: (finding: Finding) => boolean;
  findings: readonly Finding[];
  totalFindings: number;
  selectedFindingId: string | null;
  onCopySafeRewrite: (finding: Finding) => void;
  onSelectFinding: (finding: Finding) => void;
};

export function FindingsList({
  canCopySafeRewrite,
  findings,
  totalFindings,
  selectedFindingId,
  onCopySafeRewrite,
  onSelectFinding,
}: FindingsListProps) {
  if (totalFindings === 0) {
    return (
      <Card className="border border-border bg-background px-5 py-5">
        <p className="text-lg font-semibold text-foreground">
          No obvious migration hazards found.
        </p>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          This does not guarantee production safety, but the checker did not detect
          common locking, rewrite, destructive, or transaction risks in this SQL.
        </p>
      </Card>
    );
  }

  if (findings.length === 0) {
    return (
      <Card className="border border-border bg-background px-5 py-5">
        <p className="text-lg font-semibold text-foreground">
          No findings match the current filters.
        </p>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Clear or relax one of the filters to bring findings back into view.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">
          Findings list
        </p>
        <p className="text-sm text-muted-foreground">
          Showing {findings.length} of {totalFindings}
        </p>
      </div>

      <div className="space-y-3 xl:max-h-[920px] xl:overflow-y-auto xl:pr-1">
        {findings.map((finding) => (
          <FindingCard
            key={finding.id}
            canCopySafeRewrite={canCopySafeRewrite(finding)}
            finding={finding}
            isSelected={finding.id === selectedFindingId}
            onCopySafeRewrite={onCopySafeRewrite}
            onSelect={onSelectFinding}
          />
        ))}
      </div>
    </div>
  );
}
