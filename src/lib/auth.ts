import { prisma } from "./prisma";

// v1 stub: a single fixed admin user.  When SSO ships, swap this for a
// session lookup. Keep the API stable so call sites don't move.
export async function currentUser() {
  let user = await prisma.user.findFirst({ where: { email: "demo@verify.local" } });
  if (!user) {
    user = await prisma.user.create({
      data: { email: "demo@verify.local", name: "Demo Admin", role: "admin" },
    });
  }
  return user;
}

export async function requireUser() {
  return currentUser();
}
