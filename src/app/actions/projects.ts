"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { shortKey } from "@/lib/utils";

const ProjectInput = z.object({
  name: z.string().min(2).max(120),
  key: z
    .string()
    .min(2)
    .max(8)
    .regex(/^[A-Z][A-Z0-9]*$/, "Use uppercase letters/numbers, e.g. AIW")
    .optional()
    .or(z.literal("")),
  description: z.string().max(2000).optional().or(z.literal("")),
});

export type FormState = { ok: boolean; message?: string; fieldErrors?: Record<string, string> };

function fail(message: string, fieldErrors?: Record<string, string>): FormState {
  return { ok: false, message, fieldErrors };
}

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
    return fail("Please fix the highlighted fields.", fieldErrors);
  }
  const user = await requireUser();
  const desiredKey = parsed.data.key && parsed.data.key !== "" ? parsed.data.key : shortKey(parsed.data.name);

  // ensure unique key
  let key = desiredKey;
  let suffix = 2;
  while (await prisma.project.findUnique({ where: { key } })) {
    key = `${desiredKey}${suffix++}`;
    if (suffix > 50) return fail("Could not generate a unique project key.");
  }

  const project = await prisma.project.create({
    data: {
      key,
      name: parsed.data.name.trim(),
      description: parsed.data.description?.trim() || null,
      ownerId: user.id,
      members: { create: { userId: user.id, role: "admin" } },
    },
  });
  revalidatePath("/");
  redirect(`/projects/${project.id}`);
}

export async function renameProject(formData: FormData) {
  const id = String(formData.get("id"));
  const name = String(formData.get("name") || "").trim();
  if (!id || !name) return;
  await prisma.project.update({ where: { id }, data: { name } });
  revalidatePath("/");
  revalidatePath(`/projects/${id}`);
}

export async function archiveProject(formData: FormData) {
  const id = String(formData.get("id"));
  if (!id) return;
  await prisma.project.update({ where: { id }, data: { status: "archived" } });
  revalidatePath("/");
}

export async function unarchiveProject(formData: FormData) {
  const id = String(formData.get("id"));
  if (!id) return;
  await prisma.project.update({ where: { id }, data: { status: "active" } });
  revalidatePath("/");
}
