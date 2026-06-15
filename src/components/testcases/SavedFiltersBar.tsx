"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SavedFilter } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { saveFilter, deleteFilter } from "@/app/actions/savedFilters";

export function SavedFiltersBar({
  projectId,
  filters,
  currentQuery,
  canSave,
  scope = "cases",
}: {
  projectId: string;
  filters: SavedFilter[];
  currentQuery: Record<string, string>;
  canSave: boolean;
  scope?: "cases" | "runs";
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [shared, setShared] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function hrefFor(query: Record<string, string>) {
    const qs = new URLSearchParams(query).toString();
    return `/projects/${projectId}/${scope}${qs ? `?${qs}` : ""}`;
  }

  function onSave() {
    setError(null);
    startTransition(async () => {
      const res = await saveFilter({ projectId, name, scope, query: currentQuery, shared });
      if (res.ok) {
        setOpen(false);
        setName("");
        setShared(false);
        router.refresh();
      } else {
        setError(res.message ?? "Could not save.");
      }
    });
  }

  function onDelete(id: string) {
    startTransition(async () => {
      await deleteFilter({ projectId, id, scope });
      router.refresh();
    });
  }

  if (filters.length === 0 && !canSave) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-(--border) px-4 py-2 text-sm"
      data-testid="saved-filters-bar"
    >
      <span className="text-xs font-medium text-(--muted)">Saved:</span>
      {filters.length === 0 ? (
        <span className="text-xs text-(--muted-2)">None yet</span>
      ) : (
        filters.map((f) => (
          <span
            key={f.id}
            className="inline-flex items-center gap-1 rounded-full border border-(--border) bg-white px-2 py-0.5 text-xs"
            data-testid="saved-filter-chip"
          >
            <Link href={hrefFor(f.query)} className="hover:text-(--accent)">
              {f.name}
            </Link>
            {f.shared ? <span className="text-(--muted-2)" title="Shared with the project">★</span> : null}
            <button
              type="button"
              aria-label={`Delete ${f.name}`}
              disabled={pending}
              onClick={() => onDelete(f.id)}
              className="text-(--muted-2) hover:text-(--danger)"
            >
              ×
            </button>
          </span>
        ))
      )}

      {canSave ? (
        <div className="ml-auto flex items-center gap-2">
          {open ? (
            <>
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Filter name"
                className="h-8 w-40 text-xs"
                data-testid="saved-filter-name"
              />
              <label className="flex items-center gap-1 text-xs text-(--muted)">
                <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
                Shared
              </label>
              <Button size="sm" disabled={pending || !name.trim()} onClick={onSave} data-testid="saved-filter-save">
                Save
              </Button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-(--muted) hover:text-(--accent)"
              >
                Cancel
              </button>
              {error ? <span className="text-xs text-(--danger)">{error}</span> : null}
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOpen(true)}
              data-testid="saved-filter-open"
            >
              Save current view
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
