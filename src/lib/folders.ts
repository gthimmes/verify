import type { FolderNode } from "@/lib/api";

export type FolderOption = { id: string; label: string };

/**
 * Flattens a folder tree into a depth-ordered list of options with an indented,
 * path-style label (e.g. "Payments › Refunds") for use in a <select>.
 */
export function folderOptions(tree: FolderNode[]): FolderOption[] {
  const out: FolderOption[] = [];
  const walk = (nodes: FolderNode[], prefix: string) => {
    for (const n of nodes) {
      const label = prefix ? `${prefix} › ${n.name}` : n.name;
      out.push({ id: n.id, label });
      if (n.children?.length) walk(n.children, label);
    }
  };
  walk(tree, "");
  return out;
}
