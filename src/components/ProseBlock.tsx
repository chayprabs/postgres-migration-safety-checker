import * as React from "react";
import { cn } from "@/lib/utils";

export function ProseBlock({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "max-w-3xl space-y-4 text-base leading-7 text-muted-foreground [&_a]:text-foreground [&_a]:underline-offset-4 [&_a:hover]:underline [&_strong]:font-semibold [&_strong]:text-foreground",
        className,
      )}
      {...props}
    />
  );
}
