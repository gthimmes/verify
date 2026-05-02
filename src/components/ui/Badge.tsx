import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "accent" | "success" | "danger" | "warn" | "info" | "muted";

const toneClass: Record<Tone, string> = {
  default: "bg-(--accent-soft) text-(--accent)",
  accent: "bg-(--accent) text-white",
  success: "bg-(--success-soft) text-(--success)",
  danger: "bg-(--danger-soft) text-(--danger)",
  warn: "bg-(--warn-soft) text-(--warn)",
  info: "bg-(--info-soft) text-(--info)",
  muted: "bg-slate-100 text-slate-600",
};

export function Badge({
  tone = "default",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function priorityTone(p: string): Tone {
  if (p === "critical") return "danger";
  if (p === "high") return "warn";
  if (p === "medium") return "info";
  return "muted";
}

export function automationTone(s: string): Tone {
  if (s === "full") return "success";
  if (s === "partial") return "info";
  return "muted";
}

export function resultTone(r: string): Tone {
  if (r === "pass") return "success";
  if (r === "fail") return "danger";
  if (r === "blocked") return "warn";
  if (r === "skipped") return "muted";
  return "muted";
}

export function runStatusTone(s: string): Tone {
  if (s === "in_progress") return "info";
  if (s === "completed") return "success";
  if (s === "blocked") return "warn";
  if (s === "aborted") return "danger";
  return "muted";
}
