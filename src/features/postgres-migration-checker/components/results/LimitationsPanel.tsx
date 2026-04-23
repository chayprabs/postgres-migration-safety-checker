"use client";

import type { TableSizeProfile } from "../../types";
import { Card } from "@/components/Card";

type LimitationsPanelProps = {
  limitations: readonly string[];
  tableSizeProfile: TableSizeProfile;
};

function toHeadingCase(value: string) {
  return value
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function LimitationsPanel({
  limitations,
  tableSizeProfile,
}: LimitationsPanelProps) {
  return (
    <Card className="border border-border bg-background px-5 py-5">
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            What this checker cannot know
          </p>
          <p className="text-sm leading-7 text-muted-foreground">
            No database connection is made. The selected{" "}
            {toHeadingCase(tableSizeProfile).toLowerCase()} table-size profile is
            only an estimate used to tune severity and copy.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {limitations.map((limitation) => (
            <div
              key={limitation}
              className="rounded-2xl border border-border bg-card px-4 py-3 text-sm leading-7 text-muted-foreground"
            >
              {limitation}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
