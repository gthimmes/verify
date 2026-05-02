"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  width?: "sm" | "md" | "lg" | "xl";
};

const widthClass: Record<NonNullable<DialogProps["width"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  width = "md",
}: DialogProps) {
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div
        className={cn(
          "w-full rounded-lg bg-(--surface) shadow-2xl border border-(--border)",
          widthClass[width],
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-(--border) px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-(--fg)">{title}</h3>
            {description ? (
              <p className="mt-1 text-xs text-(--muted)">{description}</p>
            ) : null}
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-(--muted) hover:text-(--fg)"
            aria-label="close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function DialogFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mt-4 flex items-center justify-end gap-2 border-t border-(--border) -mx-5 px-5 pt-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
