import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function FeaturePage({
  params,
}: {
  params: Promise<{ projectId: string; featureId: string }>;
}) {
  const { projectId, featureId } = await params;
  redirect(`/projects/${projectId}/cases?feature=${featureId}`);
}
