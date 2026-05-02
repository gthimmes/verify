import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageContainer, PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

export default async function FeaturePage({
  params,
}: {
  params: Promise<{ projectId: string; featureId: string }>;
}) {
  const { projectId, featureId } = await params;
  const feature = await prisma.feature.findFirst({
    where: { id: featureId, area: { projectId } },
    include: { area: true },
  });
  if (!feature) return notFound();
  // Just bounce to cases filtered by this feature.
  redirect(`/projects/${projectId}/cases?feature=${featureId}`);
}
