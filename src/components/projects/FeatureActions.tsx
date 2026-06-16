"use client";

import { useState } from "react";
import { archiveFeature, moveFeature } from "@/app/actions/features";

export function FeatureActions({
  featureId,
  projectId,
  archived,
  areas,
  currentAreaId,
}: {
  featureId: string;
  projectId: string;
  archived: boolean;
  areas: { id: string; name: string }[];
  currentAreaId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="text-(--muted) hover:text-(--accent) p-1 rounded hover:bg-(--accent-soft)"
        aria-label="feature menu"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>
      {open ? (
        <div className="absolute right-0 z-10 mt-1 min-w-[200px] rounded-md border border-(--border) bg-(--surface) p-1 shadow-lg">
          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-(--muted)">
            Move to
          </div>
          {areas
            .filter((a) => a.id !== currentAreaId)
            .map((a) => (
              <form key={a.id} action={moveFeature}>
                <input type="hidden" name="id" value={featureId} />
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="targetAreaId" value={a.id} />
                <button
                  type="submit"
                  className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-(--accent-soft) hover:text-(--accent)"
                >
                  {a.name}
                </button>
              </form>
            ))}
          <div className="my-1 h-px bg-(--border)" />
          <form action={archiveFeature}>
            <input type="hidden" name="id" value={featureId} />
            <input type="hidden" name="projectId" value={projectId} />
            <input
              type="hidden"
              name="archived"
              value={archived ? "false" : "true"}
            />
            <button
              type="submit"
              className="block w-full rounded px-2 py-1.5 text-left text-xs text-(--danger) hover:bg-(--danger-soft)"
            >
              {archived ? "Unarchive feature" : "Archive feature"}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
