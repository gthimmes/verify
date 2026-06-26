"use client";

import { useRef, useState, useTransition } from "react";
import type { Attachment } from "@/lib/api";
import {
  uploadAttachment,
  deleteAttachment,
  loadAttachments,
} from "@/app/actions/attachments";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Reusable attachments panel for a test case or execution. Lists files with
 * an inline thumbnail for images, a download link, and delete. Uploads go
 * through a server action that base64-encodes the file for the Go API; the
 * list is kept in local state so there's no full-page refresh.
 */
export function Attachments({
  entityType,
  entityId,
  initial,
  compact = false,
}: {
  entityType: "test_case" | "execution";
  entityId: string;
  initial: Attachment[];
  compact?: boolean;
}) {
  const [items, setItems] = useState<Attachment[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function onPick(file: File) {
    setError(null);
    const fd = new FormData();
    fd.set("entityType", entityType);
    fd.set("entityId", entityId);
    fd.set("file", file);
    startTransition(async () => {
      const res = await uploadAttachment(fd);
      if (res.ok && res.attachment) {
        setItems((prev) => [...prev, res.attachment!]);
      } else {
        setError(res.message ?? "Upload failed.");
      }
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  function onDelete(id: string) {
    startTransition(async () => {
      const res = await deleteAttachment(id);
      if (res.ok) setItems((prev) => prev.filter((a) => a.id !== id));
      else setError(res.message ?? "Delete failed.");
    });
  }

  return (
    <div className="flex flex-col gap-3" data-testid="attachments">
      {items.length === 0 ? (
        <p className="text-xs text-(--muted)">No attachments.</p>
      ) : (
        <ul className={compact ? "flex flex-wrap gap-2" : "flex flex-col gap-2"}>
          {items.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-md border border-(--border) bg-(--surface) px-2 py-1.5 text-sm"
              data-testid="attachment-item"
            >
              {a.contentType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/attachments/${a.id}`}
                  alt={a.filename}
                  className="h-8 w-8 shrink-0 rounded object-cover"
                />
              ) : (
                <FileGlyph />
              )}
              <a
                href={`/api/attachments/${a.id}`}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 truncate text-(--fg) hover:text-(--accent)"
                title={a.filename}
                data-testid="attachment-link"
              >
                {a.filename}
              </a>
              <span className="shrink-0 text-xs text-(--muted)">
                {formatBytes(a.sizeBytes)}
              </span>
              <button
                type="button"
                aria-label={`Delete ${a.filename}`}
                disabled={pending}
                onClick={() => onDelete(a.id)}
                className="shrink-0 text-(--muted-2) hover:text-(--danger)"
                data-testid="attachment-delete"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          data-testid="attachment-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
          }}
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
          className="self-start text-xs text-(--accent) hover:underline disabled:opacity-50"
          data-testid="attachment-add"
        >
          {pending ? "Uploading…" : "+ Attach file"}
        </button>
        {error ? <span className="text-xs text-(--danger)">{error}</span> : null}
      </div>
    </div>
  );
}

/**
 * Collapsed entry point that loads the attachment list only when opened — used
 * on execution rows so a run with many executions doesn't fetch everything up
 * front.
 */
export function LazyAttachments({
  entityType,
  entityId,
}: {
  entityType: "test_case" | "execution";
  entityId: string;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Attachment[] | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (loaded === null) {
      startTransition(async () => {
        setLoaded(await loadAttachments(entityType, entityId));
      });
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="text-xs text-(--accent) hover:underline"
        data-testid="attachments-toggle"
      >
        {open ? "Hide attachments" : "Attachments"}
      </button>
      {open ? (
        <div className="mt-2">
          {loaded === null && pending ? (
            <p className="text-xs text-(--muted)">Loading…</p>
          ) : (
            <Attachments
              entityType={entityType}
              entityId={entityId}
              initial={loaded ?? []}
              compact
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

function FileGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-(--muted)"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}
