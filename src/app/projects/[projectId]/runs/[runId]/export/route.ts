import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

// Streams a run's results table as a CSV download.  Proxies the Go API so the
// browser never talks to the backend directly (and api.ts stays the only
// fetch chokepoint).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  let csv: string;
  try {
    csv = await api.exportRunCsv(runId);
  } catch (err) {
    return new Response((err as Error).message, { status: 502 });
  }
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="run-${runId}-results.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
