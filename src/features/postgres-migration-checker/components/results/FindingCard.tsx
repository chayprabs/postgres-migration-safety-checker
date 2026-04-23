"use client";

import type { ConfidenceLevel, Finding } from "../../types";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { cn } from "@/lib/utils";
import { LockLevelBadge } from "./LockLevelBadge";

type FindingCardProps = {
  canCopySafeRewrite: boolean;
  finding: Finding;
  isSelected: boolean;
  onCopySafeRewrite: (finding: Finding) => void;
  onSelect: (finding: Finding) => void;
};

function getSeverityTone(severity: Finding["severity"]) {
  switch (severity) {
    case "critical":
      return "border-[color:oklch(0.72_0.15_31)] bg-[color:oklch(0.97_0.02_31)] text-[color:oklch(0.44_0.12_31)]";
    case "high":
      return "border-[color:oklch(0.78_0.12_72)] bg-[color:oklch(0.98_0.02_72)] text-[color:oklch(0.42_0.1_72)]";
    case "medium":
      return "border-[color:oklch(0.78_0.08_230)] bg-[color:oklch(0.98_0.01_230)] text-[color:oklch(0.42_0.09_230)]";
    case "low":
      return "border-border bg-background text-muted-foreground";
    case "info":
      return "border-border bg-background text-muted-foreground";
  }
}

function getConfidenceLabel(confidence: ConfidenceLevel) {
  switch (confidence) {
    case "high":
      return "High confidence";
    case "medium":
      return "Medium confidence";
    case "low":
      return "Low confidence";
  }
}

function toHeadingCase(value: string) {
  return value
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function FindingCard({
  canCopySafeRewrite,
  finding,
  isSelected,
  onCopySafeRewrite,
  onSelect,
}: FindingCardProps) {
  return (
    <Card
      className={cn(
        "border bg-background px-4 py-4 transition",
        isSelected
          ? "border-foreground/25 shadow-[0_12px_24px_rgba(15,23,42,0.08)]"
          : "border-border",
      )}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium tracking-wide",
                  getSeverityTone(finding.severity),
                )}
              >
                {finding.severity}
              </span>
              <span
                className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground"
                title={getConfidenceLabel(finding.confidence)}
              >
                {getConfidenceLabel(finding.confidence)}
              </span>
              <LockLevelBadge lockLevel={finding.lockLevel} />
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">{finding.title}</p>
              <p className="text-sm leading-7 text-muted-foreground">
                {finding.summary}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={isSelected ? "primary" : "secondary"}
              onClick={() => {
                onSelect(finding);
              }}
            >
              View details
            </Button>
            {canCopySafeRewrite ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  onCopySafeRewrite(finding);
                }}
              >
                Copy fix
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1">
            Statement {finding.statementIndex + 1}
          </span>
          {finding.lineStart && finding.lineEnd ? (
            <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1">
              Lines {finding.lineStart}-{finding.lineEnd}
            </span>
          ) : null}
          <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1">
            {toHeadingCase(finding.category)}
          </span>
        </div>
      </div>
    </Card>
  );
}
