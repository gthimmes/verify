import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto max-w-[1400px] px-6 py-6", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
}) {
  return (
    <div className="mb-6">
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav className="mb-2 text-xs text-(--muted)" aria-label="breadcrumb">
          <ol className="flex flex-wrap items-center gap-1">
            {breadcrumbs.map((b, i) => (
              <li key={i} className="flex items-center gap-1">
                {i > 0 ? <span aria-hidden>/</span> : null}
                {b.href ? (
                  <Link href={b.href} className="hover:text-(--accent)">
                    {b.label}
                  </Link>
                ) : (
                  <span>{b.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-(--fg)">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm text-(--muted)">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-(--border-strong) bg-(--surface) p-10 text-center">
      <h3 className="text-sm font-semibold text-(--fg)">{title}</h3>
      {description ? (
        <p className="mx-auto mt-1 max-w-md text-sm text-(--muted)">{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
