"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
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
  const last = await prisma.feature.findFirst({
    where: { areaId: parsed.data.areaId },
    orderBy: { displayOrder: "desc" },
  });
  await prisma.feature.create({
    data: {
      areaId: parsed.data.areaId,
      name: parsed.data.name.trim(),
      description: parsed.data.description?.trim() || null,
      displayOrder: (last?.displayOrder ?? -1) + 1,
    },
  });
  revalidatePath(`/projects/${parsed.data.projectId}`);
  return { ok: true };
}

export async function renameFeature(formData: FormData) {
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));
  const name = String(formData.get("name") || "").trim();
  if (!id || !name) return;
  await prisma.feature.update({ where: { id }, data: { name } });
  revalidatePath(`/projects/${projectId}`);
}

export async function archiveFeature(formData: FormData) {
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));
  const archived = formData.get("archived") === "true";
  await prisma.feature.update({ where: { id }, data: { archived } });
  revalidatePath(`/projects/${projectId}`);
}

export async function moveFeature(formData: FormData) {
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));
  const targetAreaId = String(formData.get("targetAreaId"));
  if (!id || !targetAreaId) return;
  const last = await prisma.feature.findFirst({
    where: { areaId: targetAreaId },
    orderBy: { displayOrder: "desc" },
  });
  await prisma.feature.update({
    where: { id },
    data: { areaId: targetAreaId, displayOrder: (last?.displayOrder ?? -1) + 1 },
  });
  revalidatePath(`/projects/${projectId}`);
}
