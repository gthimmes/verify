import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function pluralize(n: number, singular: string, plural?: string) {
  return `${n} ${n === 1 ? singular : plural ?? singular + "s"}`;
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function shortKey(s: string, max = 4): string {
  // produce e.g. "Payments" -> "PAY", "Auth" -> "AUTH"
  const cleaned = s.replace(/[^a-zA-Z0-9 ]/g, "").trim();
  if (!cleaned) return "X";
  const words = cleaned.split(/\s+/);
  if (words.length === 1) return words[0].slice(0, max).toUpperCase();
  const first = words.map((w) => w[0]).join("");
  return first.slice(0, max).toUpperCase();
}

export function pad(n: number, width: number) {
  return String(n).padStart(width, "0");
}
