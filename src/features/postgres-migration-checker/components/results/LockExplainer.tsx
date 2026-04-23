"use client";

import type { LockInfo, LockLevel } from "../../types";
import { Card } from "@/components/Card";
import { LockLevelBadge } from "./LockLevelBadge";

type LockExplainerProps = {
  lockInfo?: LockInfo;
  lockLevel?: LockLevel | null;
};

function formatBoolean(value: boolean | undefined) {
  if (value === undefined) {
    return "Depends";
  }

  return value ? "Yes" : "No";
}

export function LockExplainer({ lockInfo, lockLevel }: LockExplainerProps) {
  if (!lockLevel) {
    return null;
  }

  return (
    <Card className="border border-border bg-background px-4 py-4">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Lock explainer</p>
            <p className="text-sm leading-7 text-muted-foreground">
              Estimated PostgreSQL table lock behavior for this finding.
            </p>
          </div>
          <LockLevelBadge lockLevel={lockLevel} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Blocks reads
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {formatBoolean(lockInfo?.blocksReads)}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Blocks writes
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {formatBoolean(lockInfo?.blocksWrites)}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card px-4 py-3 sm:col-span-2">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Short explanation
            </p>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              {lockInfo?.description ??
                "The checker could not map richer lock details for this level, so treat the lock impact as a conservative estimate."}
            </p>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-sm font-medium text-foreground">Conflicts with</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(lockInfo?.conflictsWith ?? []).length === 0 ? (
                <p className="text-sm leading-7 text-muted-foreground">
                  No conflict matrix details were attached.
                </p>
              ) : (
                lockInfo!.conflictsWith.map((conflict) => (
                  <LockLevelBadge key={conflict} lockLevel={conflict} />
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-sm font-medium text-foreground">Common operations</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(lockInfo?.commonCommands ?? []).length === 0 ? (
                <p className="text-sm leading-7 text-muted-foreground">
                  No common operations were attached.
                </p>
              ) : (
                lockInfo!.commonCommands.map((command) => (
                  <span
                    key={command}
                    className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground"
                  >
                    {command}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
