"use server";

import { z } from "zod";
import { api } from "@/lib/api";
import { revalidatePath } from "next/cache";

/**
 * Folder management actions — thin proxies to the Go API.  Each one
 * revalidates the project's cases page so the sidebar tree reflects the
 * change immediately.  Business logic (cycle checks, cascade archive,
 * sibling reordering) lives in the Go store.
 */

const Name = z.string().trim().min(1).max(200);

export type FolderActionState = { ok: boolean; message?: string };

function revalidateCases(projectId: string) {
  revalidatePath(`/projects/${projectId}/cases`);
}

export async function createFolder(
  _prev: FolderActionState,
  formData: FormData,
): Promise<FolderActionState> {
  const projectId = String(formData.get("projectId"));
  const parsed = Name.safeParse(formData.get("name"));
  if (!parsed.success) {
    return { ok: false, message: "Folder name is required." };
  }
  const parentRaw = formData.get("parentId");
  const parentId =
    parentRaw && String(parentRaw) !== "" ? String(parentRaw) : null;
  try {
    await api.createFolder(projectId, { name: parsed.data, parentId });
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  revalidateCases(projectId);
  return { ok: true };
}

export async function renameFolder(
  _prev: FolderActionState,
  formData: FormData,
): Promise<FolderActionState> {
  const projectId = String(formData.get("projectId"));
  const id = String(formData.get("id"));
  const parsed = Name.safeParse(formData.get("name"));
  if (!parsed.success) {
    return { ok: false, message: "Folder name is required." };
  }
  try {
    await api.patchFolder(id, { name: parsed.data });
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  revalidateCases(projectId);
  return { ok: true };
}

export async function archiveFolder(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const id = String(formData.get("id"));
  const archived = formData.get("archived") === "true";
  await api.patchFolder(id, { archived });
  revalidateCases(projectId);
}

export async function moveFolder(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const id = String(formData.get("id"));
  const targetRaw = formData.get("targetParentId");
  const targetParentId =
    targetRaw && String(targetRaw) !== "" ? String(targetRaw) : null;
  await api.moveFolder(id, targetParentId);
  revalidateCases(projectId);
}

export async function reorderFolder(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const id = String(formData.get("id"));
  const direction = String(formData.get("direction"));
  if (direction !== "up" && direction !== "down") return;
  await api.reorderFolder(id, direction);
  revalidateCases(projectId);
}
