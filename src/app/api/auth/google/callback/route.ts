import { NextResponse, type NextRequest } from "next/server";
import { api } from "@/lib/api";

/**
 * Google redirects here with an authorization code.  We verify the `state`
 * against the cookie, hand the code to the Go API (which holds the client
 * secret, exchanges it, upserts the user, and mints a session), then store the
 * returned session token in an httpOnly cookie on this origin.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.cookies.get("oauth_state")?.value;

  if (url.searchParams.get("error")) {
    return fail(origin, "denied");
  }
  if (!code || !state || !cookieState || state !== cookieState) {
    return fail(origin, "state");
  }

  const redirectUri = `${origin}/api/auth/google/callback`;
  let data: { token: string; expiresAt: string };
  try {
    data = await api.exchangeGoogle({ code, redirectUri });
  } catch {
    return fail(origin, "exchange");
  }

  const res = NextResponse.redirect(`${origin}/`);
  res.cookies.set("verify_session", data.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(data.expiresAt),
    secure: process.env.NODE_ENV === "production",
  });
  res.cookies.delete("oauth_state");
  return res;
}

function fail(origin: string, reason: string) {
  return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent(reason)}`);
}
