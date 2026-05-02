import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-(--accent) text-white hover:bg-(--accent-hover) disabled:opacity-50",
  secondary:
    "bg-(--accent-soft) text-(--accent) hover:bg-(--accent)/10",
  outline:
    "bg-white border border-(--border) text-(--fg) hover:border-(--accent-strong) hover:bg-(--accent-soft) hover:text-(--accent)",
  ghost:
    "bg-transparent text-(--fg) hover:bg-(--accent-soft) hover:text-(--accent)",
  danger:
    "bg-(--danger) text-white hover:bg-red-700",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs rounded-md",
  md: "h-9 px-4 text-sm rounded-md",
  lg: "h-10 px-5 text-base rounded-md",
  icon: "h-9 w-9 rounded-md",
};

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    size?: Size;
  }
>(({ className, variant = "primary", size = "md", ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center gap-1.5 font-medium transition-colors disabled:cursor-not-allowed",
      variants[variant],
      sizes[size],
      className,
    )}
    {...props}
  />
));
Button.displayName = "Button";
