import * as React from "react";
import { cn } from "@/lib/utils";

type ContainerProps = React.HTMLAttributes<HTMLElement> & {
  as?: React.ElementType;
  size?: "md" | "lg" | "xl";
};

export function Container({
  as: Component = "div",
  className,
  size = "xl",
  ...props
}: ContainerProps) {
  return (
    <Component
      className={cn(
        "mx-auto w-full px-4 sm:px-6 lg:px-8",
        size === "md" && "max-w-3xl",
        size === "lg" && "max-w-5xl",
        size === "xl" && "max-w-6xl",
        className,
      )}
      {...props}
    />
  );
}
