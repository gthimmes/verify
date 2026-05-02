// v1 stub: identity is owned by the Go backend.  This module exists only
// for places in the UI that want to print "the current user" without making
// an API call.  When SSO ships, replace with a session-aware fetch.
export async function currentUser() {
  return { id: "demo", name: "Demo Admin", email: "demo@verify.local", role: "admin" };
}
export async function requireUser() {
  return currentUser();
}
