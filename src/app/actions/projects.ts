"use server";

import { z } from "zod";
import { api } from "@/lib/api";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const ProjectInput = z.object({
  name: z.string().min(2).max(120),
  key: z
    .string()
    .min(2)
    .max(8)
    .regex(/^[A-Z][A-Z0-9]*$/, "Use uppercase letters/numbers, e.g. ACM")
    .optional()
    .or(z.literal("")),
  description: z.string().max(2000).optional().or(z.literal("")),
});

export type FormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
};

export async function createProject(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = ProjectInput.safeParse({
    name: formData.get("name"),
    key: formData.get("key"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] = issue.message;
    }
    return { ok: false, message: "Please fix the highlighted fields.", fieldErrors };
  }
  let project: { id: string };
  try {
    project = await api.createProject({
      name: parsed.data.name.trim(),
      key: parsed.data.key && parsed.data.key !== "" ? parsed.data.key : undefined,
      description: parsed.data.description ?? undefined,
    });
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  revalidatePath("/");
  redirect(`/projects/${project.id}`);
}

export async function renameProject(formData: FormData) {
  const id = String(formData.get("id"));
  const name = String(formData.get("name") || "").trim();
  if (!id || !name) return;
  await api.patchProject(id, { name });
  revalidatePath("/");
  revalidatePath(`/projects/${id}`);
}

export async function archiveProject(formData: FormData) {
  const id = String(formData.get("id"));
  if (!id) return;
  await api.patchProject(id, { status: "archived" });
  revalidatePath("/");
}

export async function unarchiveProject(formData: FormData) {
  const id = String(formData.get("id"));
  if (!id) return;
  await api.patchProject(id, { status: "active" });
  revalidatePath("/");
}
