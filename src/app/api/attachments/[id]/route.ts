import { type NextRequest } from "next/server";
import { api } from "@/lib/api";

/**
 * Streams an attachment's bytes from the Go API to the browser, forwarding the
 * session cookie (via api) and the upstream content headers. Same-origin, so
 * an <img src> or download link can point straight here.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const upstream = await api.fetchAttachmentBlob(id);
  if (!upstream.ok || !upstream.body) {
    return new Response("Not found", { status: upstream.status || 404 });
  }
  const headers = new Headers();
  const ct = upstream.headers.get("content-type");
  const cd = upstream.headers.get("content-disposition");
  const cl = upstream.headers.get("content-length");
  if (ct) headers.set("content-type", ct);
  if (cd) headers.set("content-disposition", cd);
  if (cl) headers.set("content-length", cl);
  return new Response(upstream.body, { status: 200, headers });
}
