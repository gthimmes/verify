"use client";

import { useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type SwitcherProject = { id: string; key: string; name: string };

/**
 * Global project switcher for the app header.  Shows the project implied by
 * the current route (the `[projectId]` param) and lets the user jump to any
 * other project's cases view.  The project list is fetched server-side in the
 * root layout and passed in, so this stays a thin client control.
 */
export function ProjectSwitcher({ projects }: { projects: SwitcherProject[] }) {
  const params = useParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const activeId =
    typeof params?.projectId === "string" ? params.projectId : undefined;
  const active = projects.find((p) => p.id === activeId);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q),
    );
  }, [filter, projects]);

  function go(id: string) {
    setOpen(false);
    setFilter("");
    router.push(`/projects/${id}/cases`);
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex items-center gap-2 rounded-md border border-(--border) bg-white px-2.5 py-1.5 text-sm hover:border-(--accent) hover:bg-(--accent-soft)"
        data-testid="project-switcher"
      >
        {active ? (
          <>
            <span className="rounded bg-(--accent-soft) px-1.5 py-0.5 font-mono text-xs text-(--accent)">
              {active.key}
            </span>
            <span className="max-w-[180px] truncate font-medium text-(--fg)">
              {active.name}
            </span>
          </>
        ) : (
          <span className="text-(--muted)">Select project</span>
        )}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className={cn("text-(--muted) transition-transform", open && "rotate-180")}
        >
          <path
            d="M2 3.5l3 3 3-3"
            stroke="currentColor"
            fill="none"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <div
          className="absolute left-0 z-20 mt-1 w-72 rounded-md border border-(--border) bg-white p-1 shadow-lg"
          role="listbox"
        >
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter projects…"
            className="mb-1 w-full rounded border border-(--border) px-2 py-1.5 text-sm"
            data-testid="project-switcher-filter"
          />
          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-2 py-2 text-xs text-(--muted)">No matches.</p>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={p.id === activeId}
                  onClick={() => go(p.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-(--accent-soft)",
                    p.id === activeId && "bg-(--accent-soft)",
                  )}
                  data-testid="project-switcher-option"
                  data-project-key={p.key}
                >
                  <span className="rounded bg-(--border)/60 px-1.5 py-0.5 font-mono text-xs text-(--muted)">
                    {p.key}
                  </span>
                  <span className="truncate text-(--fg)">{p.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
