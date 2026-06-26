"use server";

import { z } from "zod";
import { api } from "@/lib/api";
import { revalidatePath } from "next/cache";

const StepSchema = z.object({
  order: z.number().default(0),
  action: z.string().default(""),
  expected: z.string().default(""),
});

const ParamSchema = z.object({
  name: z.string(),
  order: z.number().default(0),
});

const BodySchema = z.object({
  title: z.string().default(""),
  description: z.string().default(""),
  preconditions: z.string().default(""),
  finalExpected: z.string().default(""),
  testDataNotes: z.string().default(""),
  type: z.string().default("functional"),
  priority: z.string().default("medium"),
  tags: z.array(z.string()).default([]),
  steps: z.array(StepSchema).default([]),
  parameters: z.array(ParamSchema).default([]),
});

const TemplateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Name your template").max(120),
  description: z.string().default(""),
  body: BodySchema,
});

export type TemplateFormState = { ok: boolean; message?: string };

// parseFormData pulls the JSON-encoded body + scalar fields out of a form.
function fromForm(formData: FormData) {
  return {
    id: (formData.get("id") as string) || undefined,
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    body: JSON.parse(String(formData.get("bodyJson") ?? "{}")),
  };
}

export async function saveTemplate(
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const parsed = TemplateSchema.safeParse(fromForm(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { id, name, description, body } = parsed.data;
  try {
    if (id) {
      await api.updateTemplate(id, { name, description, body });
    } else {
      await api.createTemplate({ name, description, body });
    }
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  revalidatePath("/admin/templates");
  return { ok: true };
}

export async function deleteTemplate(id: string): Promise<TemplateFormState> {
  if (!id) return { ok: false, message: "Missing id." };
  try {
    await api.deleteTemplate(id);
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  revalidatePath("/admin/templates");
  return { ok: true };
}
