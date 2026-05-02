"use server";

import { z } from "zod";
import { api } from "@/lib/api";
import { revalidatePath } from "next/cache";

const FeatureInput = z.object({
  projectId: z.string(),
  areaId: z.string(),
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional().or(z.literal("")),
});

export type FeatureFormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
};

export async function createFeature(
  _prev: FeatureFormState,
  formData: FormData,
): Promise<FeatureFormState> {
  const parsed = FeatureInput.safeParse({
    projectId: formData.get("projectId"),
    areaId: formData.get("areaId"),
    name: formData.get("name"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] = issue.message;
    }
    return { ok: false, message: "Please fix the form.", fieldErrors };
  }
  try {
    await api.createFeature(parsed.data.projectId, {
      areaId: parsed.data.areaId,
      name: parsed.data.name.trim(),
      description: parsed.data.description ?? undefined,
    });
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  revalidatePath(`/projects/${parsed.data.projectId}`);
  return { ok: true };
}

export async function archiveFeature(formData: FormData) {
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));
  const archived = formData.get("archived") === "true";
  await api.patchFeature(id, { archived });
  revalidatePath(`/projects/${projectId}`);
}

export async function moveFeature(formData: FormData) {
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));
  const targetAreaId = String(formData.get("targetAreaId"));
  if (!id || !targetAreaId) return;
  await api.patchFeature(id, { targetAreaId });
  revalidatePath(`/projects/${projectId}`);
}
