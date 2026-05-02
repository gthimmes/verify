import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Badge, automationTone, priorityTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PageContainer, PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const cases = query
    ? await prisma.testCase.findMany({
        where: {
          deletedAt: null,
          OR: [
            { publicId: { contains: query } },
            { title: { contains: query } },
            { description: { contains: query } },
            { steps: { some: { action: { contains: query } } } },
            { steps: { some: { expected: { contains: query } } } },
            { tags: { some: { tag: { name: { contains: query } } } } },
          ],
        },
        take: 50,
        include: {
          project: true,
          feature: { include: { area: true } },
          tags: { include: { tag: true } },
        },
        orderBy: { updatedAt: "desc" },
      })
    : [];

  return (
    <PageContainer>
      <PageHeader
        title="Global search"
        description="Search across every project — by ID, title, description, steps, or tag."
      />
      <Card className="mb-4">
        <form method="get" className="flex items-center gap-2 p-3">
          <Input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="e.g. AIW-PAY-0042, refund, smoke…"
            autoFocus
            data-testid="search-input"
          />
          <Button type="submit">Search</Button>
        </form>
      </Card>

      {!query ? (
        <p className="text-sm text-(--muted)">
          Type a query above to search every test case.
        </p>
      ) : cases.length === 0 ? (
        <p className="text-sm text-(--muted)">No matches for “{query}”.</p>
      ) : (
        <Card>
          <ul className="divide-y divide-(--border)">
            {cases.map((c) => (
              <li key={c.id} className="hover:bg-(--accent-soft)">
                <Link
                  href={`/projects/${c.projectId}/cases/${c.id}`}
                  className="block px-4 py-3"
                  data-testid="search-result"
                >
                  <div className="flex items-center gap-2">
                    <Badge tone="default">{c.project.key}</Badge>
                    <span className="font-mono text-xs text-(--muted)">
                      {c.publicId}
                    </span>
                    <span className="font-medium">{c.title}</span>
                    <Badge tone={priorityTone(c.priority)}>{c.priority}</Badge>
                    <Badge tone={automationTone(c.automationStatus)}>
                      {c.automationStatus}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-(--muted)">
                    {c.project.name} · {c.feature.area.name} › {c.feature.name}
                  </div>
                  {c.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-(--muted)">
                      {c.description}
                    </p>
                  ) : null}
                  {c.tags.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.tags.map((t) => (
                        <Badge key={t.tagId} tone="muted">
                          {t.tag.name}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </PageContainer>
  );
}
