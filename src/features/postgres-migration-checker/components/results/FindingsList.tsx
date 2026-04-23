"use client";

import { useRef } from "react";
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
  const viewDetailsRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function focusFindingActionAtIndex(index: number) {
    viewDetailsRefs.current[index]?.focus();
  }

  if (totalFindings === 0) {
    return (
      <Card className="border border-border bg-background px-5 py-5">
        <p className="text-lg font-semibold text-foreground">
          No obvious hazards found.
        </p>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Still review table size, traffic, and deployment order.
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
      <p className="text-sm leading-6 text-muted-foreground">
        Use Tab to move through actions, or Arrow Up and Arrow Down on View
        details buttons to move through findings faster.
      </p>

      <div
        aria-label="Findings list"
        className="space-y-3 xl:max-h-[920px] xl:overflow-y-auto xl:pr-1"
      >
        {findings.map((finding, index) => (
          <FindingCard
            key={finding.id}
            canCopySafeRewrite={canCopySafeRewrite(finding)}
            finding={finding}
            isSelected={finding.id === selectedFindingId}
            onViewDetailsKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                focusFindingActionAtIndex(
                  Math.min(index + 1, findings.length - 1),
                );
              }

              if (event.key === "ArrowUp") {
                event.preventDefault();
                focusFindingActionAtIndex(Math.max(index - 1, 0));
              }
            }}
            onCopySafeRewrite={onCopySafeRewrite}
            onSelect={onSelectFinding}
            viewDetailsRef={(node) => {
              viewDetailsRefs.current[index] = node;
            }}
          />
        ))}
      </div>
    </div>
  );
}
