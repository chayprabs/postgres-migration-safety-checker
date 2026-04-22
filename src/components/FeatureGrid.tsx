import * as React from "react";
import { cn } from "@/lib/utils";

type FeatureGridProps = React.HTMLAttributes<HTMLDivElement> & {
  columns?: 2 | 3 | 4;
};

export function FeatureGrid({
  className,
  columns = 3,
  ...props
}: FeatureGridProps) {
  return (
    <div
      className={cn(
        "grid gap-4 sm:gap-6",
        columns === 2 && "md:grid-cols-2",
        columns === 3 && "md:grid-cols-2 xl:grid-cols-3",
        columns === 4 && "md:grid-cols-2 xl:grid-cols-4",
        className,
      )}
      {...props}
    />
  );
}
