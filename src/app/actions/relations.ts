"use server";

import { api } from "@/lib/api";
import { revalidatePath } from "next/cache";

export type RelationActionState = { ok: boolean; message?: string };

/**
 * Search cases in a project for the "add link" picker.  Returns a handful of
 * lite matches (id/publicId/title), excluding the case being edited.
 */
export async function searchCasesForLink(
  projectId: string,
  q: string,
  excludeId: string,
): Promise<{ id: string; publicId: string; title: string }[]> {
  const query = q.trim();
  if (!query) return [];
  try {
    const cases = await api.listCases(projectId, { q: query, limit: "10" });
    return cases
      .filter((c) => c.id !== excludeId)
      .slice(0, 8)
      .map((c) => ({ id: c.id, publicId: c.publicId, title: c.title }));
  } catch {
    return [];
  }
}

export async function addRelation(
  caseId: string,
  projectId: string,
  targetCaseId: string,
): Promise<RelationActionState> {
  if (!targetCaseId) return { ok: false, message: "Pick a case to link." };
  try {
    await api.addRelation(caseId, targetCaseId);
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  revalidatePath(`/projects/${projectId}/cases/${caseId}`);
  return { ok: true };
}

export async function removeRelation(
  caseId: string,
  projectId: string,
  otherId: string,
): Promise<RelationActionState> {
  try {
    await api.removeRelation(caseId, otherId);
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  revalidatePath(`/projects/${projectId}/cases/${caseId}`);
  return { ok: true };
}
