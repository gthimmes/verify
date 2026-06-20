"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RelatedCase } from "@/lib/api";
import { Badge, priorityTone } from "@/components/ui/Badge";
import {
  addRelation,
  removeRelation,
  searchCasesForLink,
} from "@/app/actions/relations";

type Match = { id: string; publicId: string; title: string };

/**
 * "Related cases" panel on the case detail page: lists see-also links and
 * offers a typeahead to add more.  Search and mutations go through server
 * actions; the list comes from the server and we refresh after changes.
 */
export function RelatedCases({
  caseId,
  projectId,
  relations,
}: {
  caseId: string;
  projectId: string;
  relations: RelatedCase[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  function onQueryChange(value: string) {
    setQuery(value);
    const mine = ++seq.current;
    startTransition(async () => {
      const res = await searchCasesForLink(projectId, value, caseId);
      // Ignore out-of-order responses.
      if (mine === seq.current) setMatches(res);
    });
  }

  function add(targetId: string) {
    setError(null);
    startTransition(async () => {
      const res = await addRelation(caseId, projectId, targetId);
      if (res.ok) {
        setAdding(false);
        setQuery("");
        setMatches([]);
        router.refresh();
      } else {
        setError(res.message ?? "Could not add link.");
      }
    });
  }

  function remove(otherId: string) {
    startTransition(async () => {
      await removeRelation(caseId, projectId, otherId);
      router.refresh();
    });
  }

  // Cases already linked shouldn't appear as add candidates.
  const linkedIds = new Set(relations.map((r) => r.id));
  const candidates = matches.filter((m) => !linkedIds.has(m.id));

  return (
    <div className="flex flex-col gap-3 text-sm" data-testid="related-cases">
      {relations.length === 0 ? (
        <p className="text-xs text-(--muted)">No linked cases.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {relations.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-2"
              data-testid="related-case"
            >
              <Link
                href={`/projects/${projectId}/cases/${r.id}`}
                className="flex min-w-0 items-center gap-2 hover:text-(--accent)"
              >
                <span className="font-mono text-xs text-(--muted)">{r.publicId}</span>
                <span className="truncate">{r.title}</span>
              </Link>
              <div className="flex shrink-0 items-center gap-1.5">
                <Badge tone={priorityTone(r.priority)}>{r.priority}</Badge>
                <button
                  type="button"
                  aria-label={`Unlink ${r.publicId}`}
                  disabled={pending}
                  onClick={() => remove(r.id)}
                  className="text-(--muted-2) hover:text-(--danger)"
                  data-testid="related-remove"
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="flex flex-col gap-1">
          <input
            autoFocus
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search by ID or title…"
            className="w-full rounded-md border border-(--border) bg-(--surface) px-2 py-1.5 text-sm"
            data-testid="related-search"
          />
          {candidates.length > 0 ? (
            <ul className="rounded-md border border-(--border) bg-(--surface)">
              {candidates.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => add(m.id)}
                    disabled={pending}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-(--accent-soft)"
                    data-testid="related-candidate"
                  >
                    <span className="font-mono text-xs text-(--muted)">{m.publicId}</span>
                    <span className="truncate">{m.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : query.trim() && !pending ? (
            <p className="text-xs text-(--muted)">No matches.</p>
          ) : null}
          {error ? <p className="text-xs text-(--danger)">{error}</p> : null}
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setQuery("");
              setMatches([]);
              setError(null);
            }}
            className="self-start text-xs text-(--muted) hover:text-(--accent)"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="self-start text-xs text-(--accent) hover:underline"
          data-testid="related-add-open"
        >
          + Link a case
        </button>
      )}
    </div>
  );
}
