import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

// Streams the filtered case list as a CSV download.  The same query params the
// /cases page understands (q, priority, status, automation, type, tag, folder,
// archived) are forwarded to the backend so the export matches the screen.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const sp = new URL(req.url).searchParams;
  const get = (k: string) => sp.get(k) ?? undefined;

  const folder = get("folder");
  let csv: string;
  try {
    csv = await api.exportCasesCsv(projectId, {
      q: get("q"),
      type: get("type"),
      priority: get("priority"),
      status: get("status"),
      automationStatus: get("automation"),
      folderId: folder,
      descendants: folder ? "0" : undefined,
      tag: get("tag"),
      archived: get("archived"),
    });
  } catch (err) {
    return new Response((err as Error).message, { status: 502 });
  }
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${projectId}-cases.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
