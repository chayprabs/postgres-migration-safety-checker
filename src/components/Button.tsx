import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg" | "icon";

type ButtonVariantOptions = {
  className?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
};

export function buttonStyles({
  className,
  size = "md",
  variant = "primary",
}: ButtonVariantOptions = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
    variant === "primary" &&
      "bg-primary text-primary-foreground shadow-sm hover:opacity-92",
    variant === "secondary" &&
      "border border-border bg-card text-card-foreground hover:bg-accent hover:text-accent-foreground",
    variant === "ghost" &&
      "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
    size === "sm" && "h-9 px-3.5 py-2 text-sm",
    size === "md" && "h-10 px-4 py-2",
    size === "lg" && "h-11 px-5 py-2.5",
    size === "icon" && "size-10",
    className,
  );
}

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: ButtonSize;
  variant?: ButtonVariant;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size, variant, ...props }, ref) => (
    <button
      ref={ref}
      className={buttonStyles({ className, size, variant })}
      {...props}
    />
  ),
);

Button.displayName = "Button";
