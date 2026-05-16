"use client";

import Link from "next/link";
import { useState } from "react";
import type { FolderNode } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Sidebar folder tree.  Mirrors the Testiny sidebar:
 *   - "All test cases" pseudo-row at the top with the project total
 *   - Recursive folder rows; chevron toggles expand/collapse
 *   - Each row shows its rolled-up case count
 *   - Clicking a folder row filters the cases list to that folder
 *
 * `selectedFolderId` is the active filter (or null = "All test cases").
 * The tree is data-driven; reordering / archiving / drag-and-drop is
 * deferred to a follow-up.
 */
export function FolderTree({
  total,
  roots,
  selectedFolderId,
  basePath,
}: {
  total: number;
  roots: FolderNode[];
  selectedFolderId: string | null;
  basePath: string; // e.g. "/projects/{id}/cases"
}) {
  return (
    <aside className="w-72 shrink-0 border-r border-(--border) bg-(--surface)">
      <div className="border-b border-(--border) px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-(--muted)">
          Folders
        </h2>
      </div>
      <ul className="p-2 text-sm">
        <li>
          <Link
            href={basePath}
            className={cn(
              "flex items-center justify-between gap-2 rounded-md px-2 py-1.5",
              selectedFolderId === null
                ? "bg-(--accent-soft) font-medium text-(--accent)"
                : "text-(--fg) hover:bg-(--accent-soft) hover:text-(--accent)",
            )}
            data-testid="folder-all"
          >
            <span>All test cases</span>
            <span className="font-mono text-xs text-(--muted)">{total}</span>
          </Link>
        </li>
        {roots.map((node) => (
          <FolderRow
            key={node.id}
            node={node}
            depth={0}
            basePath={basePath}
            selectedFolderId={selectedFolderId}
          />
        ))}
      </ul>
    </aside>
  );
}

function FolderRow({
  node,
  depth,
  basePath,
  selectedFolderId,
}: {
  node: FolderNode;
  depth: number;
  basePath: string;
  selectedFolderId: string | null;
}) {
  // Top two levels open by default; deeper levels collapsed.  Mirrors
  // Testiny's behaviour and keeps the tree skim-able for large imports.
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = node.children.length > 0;
  const active = selectedFolderId === node.id;

  return (
    <li>
      <div
        className={cn(
          "flex items-center gap-1 rounded-md pr-2",
          active
            ? "bg-(--accent-soft)"
            : "hover:bg-(--accent-soft)",
        )}
        style={{ paddingLeft: `${depth * 12}px` }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center text-(--muted)",
            !hasChildren && "invisible",
          )}
          aria-label={open ? "collapse" : "expand"}
          data-testid="folder-chevron"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            className={cn("transition-transform", open && "rotate-90")}
          >
            <path d="M3 1l4 4-4 4" stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <Link
          href={`${basePath}?folder=${node.id}`}
          className={cn(
            "flex flex-1 items-center justify-between gap-2 py-1.5 text-(--fg)",
            active && "font-medium text-(--accent)",
          )}
          data-testid="folder-link"
          data-folder-name={node.name}
        >
          <span className="flex items-center gap-1.5 truncate">
            <FolderIcon />
            <span className="truncate">{node.name}</span>
          </span>
          <span className="font-mono text-xs text-(--muted)">{node.caseCount}</span>
        </Link>
      </div>
      {open && hasChildren ? (
        <ul>
          {node.children.map((c) => (
            <FolderRow
              key={c.id}
              node={c}
              depth={depth + 1}
              basePath={basePath}
              selectedFolderId={selectedFolderId}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function FolderIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      className="shrink-0 text-amber-500"
      fill="currentColor"
    >
      <path d="M1.5 3a1 1 0 0 1 1-1h3l1.2 1.2H11.5a1 1 0 0 1 1 1V11a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V3z" />
    </svg>
  );
}
