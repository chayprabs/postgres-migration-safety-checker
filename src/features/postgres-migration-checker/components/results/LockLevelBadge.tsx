"use client";

import type { LockLevel } from "../../types";
import { cn } from "@/lib/utils";

type LockLevelBadgeProps = {
  lockLevel?: LockLevel | null;
  className?: string;
};

function getLockLevelTone(lockLevel: LockLevel) {
  switch (lockLevel) {
    case "ACCESS EXCLUSIVE":
      return "border-[color:oklch(0.72_0.15_31)] bg-[color:oklch(0.97_0.02_31)] text-[color:oklch(0.44_0.12_31)]";
    case "EXCLUSIVE":
    case "SHARE ROW EXCLUSIVE":
    case "SHARE":
      return "border-[color:oklch(0.77_0.12_72)] bg-[color:oklch(0.98_0.02_72)] text-[color:oklch(0.42_0.1_72)]";
    default:
      return "border-border bg-background text-muted-foreground";
  }
}

export function LockLevelBadge({
  lockLevel,
  className,
}: LockLevelBadgeProps) {
  if (!lockLevel) {
    return null;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium tracking-wide",
        getLockLevelTone(lockLevel),
        className,
      )}
      title={`Estimated lock level: ${lockLevel}`}
    >
      {lockLevel}
    </span>
  );
}
