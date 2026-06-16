"use client";

import Link from "next/link";
import { useState } from "react";
import type { FolderNode } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  createFolder,
  renameFolder,
  archiveFolder,
  moveFolder,
  reorderFolder,
  type FolderActionState,
} from "@/app/actions/folders";

/**
 * Sidebar folder tree with inline management.
 *   - "All test cases" pseudo-row at the top with the project total
 *   - Recursive folder rows; chevron toggles expand/collapse
 *   - Each row shows its rolled-up case count and a "⋯" menu offering
 *     rename, add-subfolder, move up/down, move-to-parent, archive
 *   - Header offers "New folder" (root) and a "Show archived" toggle
 *
 * `selectedFolderId` is the active filter (or null = "All test cases").
 * All mutations go through server actions that revalidate the cases page;
 * the cycle/cascade/reorder rules live in the Go store.
 */

type FlatFolder = { id: string; name: string; depth: number };

function flatten(nodes: FolderNode[], depth = 0, acc: FlatFolder[] = []) {
  for (const n of nodes) {
    acc.push({ id: n.id, name: n.name, depth });
    flatten(n.children, depth + 1, acc);
  }
  return acc;
}

function descendantIds(node: FolderNode, acc = new Set<string>()) {
  acc.add(node.id);
  for (const c of node.children) descendantIds(c, acc);
  return acc;
}

export function FolderTree({
  total,
  roots,
  selectedFolderId,
  basePath,
  projectId,
  showArchived,
}: {
  total: number;
  roots: FolderNode[];
  selectedFolderId: string | null;
  basePath: string; // e.g. "/projects/{id}/cases"
  projectId: string;
  showArchived: boolean;
}) {
  const allFolders = flatten(roots);
  return (
    <aside className="w-72 shrink-0 border-r border-(--border) bg-(--surface)">
      <div className="flex items-center justify-between border-b border-(--border) px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-(--muted)">
          Folders
        </h2>
        <NewFolderControl projectId={projectId} />
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
            projectId={projectId}
            allFolders={allFolders}
          />
        ))}
      </ul>
      <div className="border-t border-(--border) px-4 py-2">
        <Link
          href={showArchived ? basePath : `${basePath}?showArchived=1`}
          className="text-xs text-(--muted) hover:text-(--accent)"
          data-testid="show-archived-toggle"
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </Link>
      </div>
    </aside>
  );
}

const initial: FolderActionState = { ok: true };

function NewFolderControl({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md px-1.5 py-0.5 text-xs text-(--accent) hover:bg-(--accent-soft)"
        data-testid="new-folder-open"
      >
        + New
      </button>
    );
  }
  return (
    <form
      action={async (fd) => {
        const res = await createFolder(initial, fd);
        if (res.ok) {
          setOpen(false);
          setError(undefined);
        } else {
          setError(res.message);
        }
      }}
      className="flex items-center gap-1"
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input
        name="name"
        autoFocus
        placeholder="Folder name"
        className="w-28 rounded border border-(--border) px-1.5 py-0.5 text-xs"
        data-testid="new-folder-input"
        title={error}
      />
      <button
        type="submit"
        className="rounded bg-(--accent) px-1.5 py-0.5 text-xs text-white"
        data-testid="new-folder-save"
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-(--muted)"
      >
        ✕
      </button>
    </form>
  );
}

type RowMode = "none" | "menu" | "rename" | "addChild" | "move";

function FolderRow({
  node,
  depth,
  basePath,
  selectedFolderId,
  projectId,
  allFolders,
}: {
  node: FolderNode;
  depth: number;
  basePath: string;
  selectedFolderId: string | null;
  projectId: string;
  allFolders: FlatFolder[];
}) {
  // Top two levels open by default; deeper levels collapsed.
  const [open, setOpen] = useState(depth < 1);
  const [mode, setMode] = useState<RowMode>("none");
  const hasChildren = node.children.length > 0;
  const active = selectedFolderId === node.id;
  const descendants = descendantIds(node);
  const moveTargets = allFolders.filter((f) => !descendants.has(f.id));

  return (
    <li>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md pr-1",
          active ? "bg-(--accent-soft)" : "hover:bg-(--accent-soft)",
          node.archived && "opacity-60",
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

        {mode === "rename" ? (
          <RenameForm
            node={node}
            projectId={projectId}
            onDone={() => setMode("none")}
          />
        ) : (
          <Link
            href={`${basePath}?folder=${node.id}`}
            className={cn(
              "flex flex-1 items-center justify-between gap-2 py-1.5 text-(--fg)",
              active && "font-medium text-(--accent)",
            )}
            data-testid="folder-link"
            data-folder-name={node.name}
            title={
              node.caseCount > node.ownCount
                ? `${node.ownCount} in this folder · ${node.caseCount} including subfolders`
                : undefined
            }
          >
            <span className="flex items-center gap-1.5 truncate">
              <FolderIcon />
              <span className="truncate">{node.name}</span>
              {node.archived ? (
                <span className="rounded bg-(--border) px-1 text-[10px] uppercase text-(--muted)">
                  archived
                </span>
              ) : null}
            </span>
            <span className="font-mono text-xs text-(--muted)">
              {node.ownCount}
              {node.caseCount > node.ownCount ? (
                <span className="text-(--muted)/60"> / {node.caseCount}</span>
              ) : null}
            </span>
          </Link>
        )}

        <div className="relative">
          <button
            type="button"
            onClick={() => setMode((m) => (m === "menu" ? "none" : "menu"))}
            onBlur={() => setTimeout(() => setMode((m) => (m === "menu" ? "none" : m)), 150)}
            className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-(--muted) opacity-0 group-hover:opacity-100 hover:bg-(--accent-soft) hover:text-(--accent) aria-expanded:opacity-100"
            aria-label="folder menu"
            aria-expanded={mode === "menu"}
            data-testid="folder-menu"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="19" cy="12" r="1.6" />
            </svg>
          </button>
          {mode === "menu" ? (
            <div className="absolute right-0 z-10 mt-1 min-w-[170px] rounded-md border border-(--border) bg-(--surface) p-1 shadow-lg">
              <MenuButton
                label="Rename"
                testid="folder-rename"
                onClick={() => setMode("rename")}
              />
              <MenuButton
                label="Add subfolder"
                testid="folder-add-sub"
                onClick={() => setMode("addChild")}
              />
              <MenuButton
                label="Move to…"
                testid="folder-move-open"
                onClick={() => setMode("move")}
              />
              <form action={reorderFolder}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="id" value={node.id} />
                <input type="hidden" name="direction" value="up" />
                <MenuSubmit label="Move up" testid="folder-up" />
              </form>
              <form action={reorderFolder}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="id" value={node.id} />
                <input type="hidden" name="direction" value="down" />
                <MenuSubmit label="Move down" testid="folder-down" />
              </form>
              <form action={archiveFolder}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="id" value={node.id} />
                <input
                  type="hidden"
                  name="archived"
                  value={node.archived ? "false" : "true"}
                />
                <button
                  type="submit"
                  className="block w-full rounded px-2 py-1.5 text-left text-xs text-(--danger) hover:bg-(--danger-soft)"
                  data-testid="folder-archive"
                >
                  {node.archived ? "Unarchive" : "Archive"}
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </div>

      {mode === "move" ? (
        <form
          action={moveFolder}
          className="ml-7 mb-1 flex items-center gap-1"
          style={{ marginLeft: `${depth * 12 + 28}px` }}
        >
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="id" value={node.id} />
          <select
            name="targetParentId"
            defaultValue=""
            className="flex-1 rounded border border-(--border) px-1 py-0.5 text-xs"
            data-testid="folder-move-select"
          >
            <option value="">— Root —</option>
            {moveTargets.map((f) => (
              <option key={f.id} value={f.id}>
                {" ".repeat(f.depth * 2)}
                {f.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            onClick={() => setMode("none")}
            className="rounded bg-(--accent) px-1.5 py-0.5 text-xs text-white"
            data-testid="folder-move-save"
          >
            Move
          </button>
        </form>
      ) : null}

      {mode === "addChild" ? (
        <AddChildForm
          parent={node}
          projectId={projectId}
          depth={depth}
          onDone={() => setMode("none")}
        />
      ) : null}

      {open && hasChildren ? (
        <ul>
          {node.children.map((c) => (
            <FolderRow
              key={c.id}
              node={c}
              depth={depth + 1}
              basePath={basePath}
              selectedFolderId={selectedFolderId}
              projectId={projectId}
              allFolders={allFolders}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function RenameForm({
  node,
  projectId,
  onDone,
}: {
  node: FolderNode;
  projectId: string;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | undefined>();
  return (
    <form
      action={async (fd) => {
        const res = await renameFolder(initial, fd);
        if (res.ok) onDone();
        else setError(res.message);
      }}
      className="flex flex-1 items-center gap-1 py-1"
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="id" value={node.id} />
      <input
        name="name"
        defaultValue={node.name}
        autoFocus
        className="flex-1 rounded border border-(--border) px-1.5 py-0.5 text-xs"
        data-testid="folder-rename-input"
        title={error}
      />
      <button
        type="submit"
        className="rounded bg-(--accent) px-1.5 py-0.5 text-xs text-white"
        data-testid="folder-rename-save"
      >
        Save
      </button>
      <button type="button" onClick={onDone} className="text-xs text-(--muted)">
        ✕
      </button>
    </form>
  );
}

function AddChildForm({
  parent,
  projectId,
  depth,
  onDone,
}: {
  parent: FolderNode;
  projectId: string;
  depth: number;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | undefined>();
  return (
    <form
      action={async (fd) => {
        const res = await createFolder(initial, fd);
        if (res.ok) onDone();
        else setError(res.message);
      }}
      className="mb-1 flex items-center gap-1"
      style={{ marginLeft: `${depth * 12 + 28}px` }}
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="parentId" value={parent.id} />
      <input
        name="name"
        autoFocus
        placeholder="Subfolder name"
        className="flex-1 rounded border border-(--border) px-1.5 py-0.5 text-xs"
        data-testid="folder-subname-input"
        title={error}
      />
      <button
        type="submit"
        className="rounded bg-(--accent) px-1.5 py-0.5 text-xs text-white"
        data-testid="folder-subname-save"
      >
        Add
      </button>
      <button type="button" onClick={onDone} className="text-xs text-(--muted)">
        ✕
      </button>
    </form>
  );
}

function MenuButton({
  label,
  testid,
  onClick,
}: {
  label: string;
  testid: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      // onMouseDown so it fires before the menu button's onBlur closes us.
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-(--accent-soft) hover:text-(--accent)"
      data-testid={testid}
    >
      {label}
    </button>
  );
}

function MenuSubmit({ label, testid }: { label: string; testid: string }) {
  return (
    <button
      type="submit"
      className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-(--accent-soft) hover:text-(--accent)"
      data-testid={testid}
    >
      {label}
    </button>
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
