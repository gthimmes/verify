import { NextResponse, type NextRequest } from "next/server";
import { api } from "@/lib/api";

/**
 * Revokes the session server-side (best effort) and clears the cookie, then
 * returns to the home page.  POST-only so a stray link can't log you out.
 */
export async function POST(req: NextRequest) {
  const token = req.cookies.get("verify_session")?.value;
  if (token) {
    await api.logoutSession(token).catch(() => {});
  }
  const res = NextResponse.redirect(new URL("/", req.url));
  res.cookies.delete("verify_session");
  return res;
}
