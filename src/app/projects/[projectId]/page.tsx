import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ProjectIndexPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/projects/${projectId}/cases`);
}
