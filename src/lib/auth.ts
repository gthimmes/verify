import { api } from "@/lib/api";

// Identity is owned by the Go backend. These helpers resolve the current user
// for server components that want to print "the current user" — they return
// the signed-in Google user when a session is present, or the demo user while
// auth is additive. Safe to call only in server contexts (api forwards the
// session cookie).
export async function currentUser() {
  return api.me();
}

export async function requireUser() {
  return currentUser();
}
