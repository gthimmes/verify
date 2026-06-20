import { NextResponse, type NextRequest } from "next/server";

/**
 * Starts the Google OAuth flow: redirect the browser to Google's consent
 * screen.  A random `state` is stored in a short-lived httpOnly cookie and
 * checked in the callback to defend against CSRF.  The client secret never
 * touches this layer — only the public client id is used to build the URL.
 */
export function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const origin = new URL(req.url).origin;
  if (!clientId) {
    return NextResponse.redirect(`${origin}/?auth_error=not_configured`);
  }
  const redirectUri = `${origin}/api/auth/google/callback`;
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });

  const res = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  );
  res.cookies.set("oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
