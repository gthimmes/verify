"use server";

import { z } from "zod";
import { api } from "@/lib/api";
import { revalidatePath } from "next/cache";

const SaveBody = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1, "Name your filter").max(120),
  scope: z.enum(["cases", "runs"]).default("cases"),
  query: z.record(z.string(), z.string()).default({}),
  shared: z.boolean().default(false),
});

export type SaveFilterState = { ok: boolean; message?: string };

export async function saveFilter(
  input: z.input<typeof SaveBody>,
): Promise<SaveFilterState> {
  const parsed = SaveBody.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { projectId, name, scope, query, shared } = parsed.data;
  try {
    await api.createSavedFilter(projectId, { name, scope, query, shared });
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  revalidatePath(`/projects/${projectId}/cases`);
  return { ok: true };
}

export async function deleteFilter(input: {
  projectId: string;
  id: string;
}): Promise<SaveFilterState> {
  if (!input.id) return { ok: false, message: "Missing id." };
  try {
    await api.deleteSavedFilter(input.id);
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  revalidatePath(`/projects/${input.projectId}/cases`);
  return { ok: true };
}
