"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { shortKey } from "@/lib/utils";

const AreaInput = z.object({
  projectId: z.string(),
  name: z.string().min(2).max(120),
  key: z
    .string()
    .min(1)
    .max(8)
    .regex(/^[A-Z][A-Z0-9]*$/)
    .optional()
    .or(z.literal("")),
  description: z.string().max(2000).optional().or(z.literal("")),
});

export type AreaFormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
};

export async function createArea(
  _prev: AreaFormState,
  formData: FormData,
): Promise<AreaFormState> {
  const parsed = AreaInput.safeParse({
    projectId: formData.get("projectId"),
    name: formData.get("name"),
    key: formData.get("key"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] = issue.message;
    }
    return { ok: false, message: "Please fix the form.", fieldErrors };
  }
  const { projectId, name, description } = parsed.data;
  let key = (parsed.data.key || shortKey(name)).toUpperCase();
  let suffix = 2;
  while (await prisma.area.findFirst({ where: { projectId, key } })) {
    key = `${(parsed.data.key || shortKey(name)).toUpperCase()}${suffix++}`;
    if (suffix > 50)
      return { ok: false, message: "Could not generate a unique area key." };
  }

  const last = await prisma.area.findFirst({
    where: { projectId },
    orderBy: { displayOrder: "desc" },
  });

  await prisma.area.create({
    data: {
      projectId,
      key,
      name: name.trim(),
      description: description?.trim() || null,
      displayOrder: (last?.displayOrder ?? -1) + 1,
    },
  });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function renameArea(formData: FormData) {
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));
  const name = String(formData.get("name") || "").trim();
  if (!id || !name) return;
  await prisma.area.update({ where: { id }, data: { name } });
  revalidatePath(`/projects/${projectId}`);
}

export async function archiveArea(formData: FormData) {
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));
  const archived = formData.get("archived") === "true";
  await prisma.area.update({ where: { id }, data: { archived } });
  revalidatePath(`/projects/${projectId}`);
}

export async function reorderArea(formData: FormData) {
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));
  const direction = String(formData.get("direction"));
  const area = await prisma.area.findUnique({ where: { id } });
  if (!area) return;
  const op = direction === "up" ? "lt" : "gt";
  const orderDir = direction === "up" ? "desc" : "asc";
  const neighbour = await prisma.area.findFirst({
    where: { projectId: area.projectId, displayOrder: { [op]: area.displayOrder } },
    orderBy: { displayOrder: orderDir },
  });
  if (!neighbour) return;
  await prisma.$transaction([
    prisma.area.update({
      where: { id: area.id },
      data: { displayOrder: neighbour.displayOrder },
    }),
    prisma.area.update({
      where: { id: neighbour.id },
      data: { displayOrder: area.displayOrder },
    }),
  ]);
  revalidatePath(`/projects/${projectId}`);
}
