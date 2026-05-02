"use server";

import { z } from "zod";
import { api } from "@/lib/api";
import { revalidatePath } from "next/cache";

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
  try {
    await api.createArea(parsed.data.projectId, {
      name: parsed.data.name.trim(),
      key: parsed.data.key || undefined,
      description: parsed.data.description ?? undefined,
    });
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  revalidatePath(`/projects/${parsed.data.projectId}`);
  return { ok: true };
}

export async function archiveArea(formData: FormData) {
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));
  const archived = formData.get("archived") === "true";
  await api.patchArea(id, { archived });
  revalidatePath(`/projects/${projectId}`);
}

export async function reorderArea(formData: FormData) {
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));
  const direction = String(formData.get("direction"));
  if (direction !== "up" && direction !== "down") return;
  await api.reorderArea(id, direction as "up" | "down");
  revalidatePath(`/projects/${projectId}`);
}
