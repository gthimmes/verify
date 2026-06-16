"use client";

import { useState } from "react";
import { archiveArea, reorderArea } from "@/app/actions/areas";

export function AreaActions({
  areaId,
  projectId,
  archived,
}: {
  areaId: string;
  projectId: string;
  archived: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="text-(--muted) hover:text-(--accent) p-1 rounded-md hover:bg-(--accent-soft)"
        aria-label="area menu"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>
      {open ? (
        <div className="absolute right-0 z-10 mt-1 min-w-[180px] rounded-md border border-(--border) bg-(--surface) p-1 shadow-lg">
          <form action={reorderArea}>
            <input type="hidden" name="id" value={areaId} />
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="direction" value="up" />
            <button
              type="submit"
              className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-(--accent-soft) hover:text-(--accent)"
            >
              Move up
            </button>
          </form>
          <form action={reorderArea}>
            <input type="hidden" name="id" value={areaId} />
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="direction" value="down" />
            <button
              type="submit"
              className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-(--accent-soft) hover:text-(--accent)"
            >
              Move down
            </button>
          </form>
          <form action={archiveArea}>
            <input type="hidden" name="id" value={areaId} />
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="archived" value={archived ? "false" : "true"} />
            <button
              type="submit"
              className="block w-full rounded px-2 py-1.5 text-left text-xs text-(--danger) hover:bg-(--danger-soft)"
            >
              {archived ? "Unarchive area" : "Archive area"}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
