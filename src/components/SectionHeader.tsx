import * as React from "react";
import { Badge } from "@/components/Badge";
import { cn } from "@/lib/utils";

type SectionHeaderProps = {
  badge?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
  titleAs?: "h1" | "h2" | "h3";
};

export function SectionHeader({
  badge,
  title,
  description,
  actions,
  align = "left",
  className,
  titleAs: TitleTag = "h2",
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "space-y-4",
        align === "center" && "mx-auto max-w-3xl text-center",
        className,
      )}
    >
      {badge ? (
        <div className={cn(align === "center" && "flex justify-center")}>
          <Badge variant="outline">{badge}</Badge>
        </div>
      ) : null}
      <div className="space-y-3">
        <TitleTag className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl md:text-5xl">
          {title}
        </TitleTag>
        {description ? (
          <div className="max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            {description}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div
          className={cn(
            "flex flex-wrap gap-3",
            align === "center" && "justify-center",
          )}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}
