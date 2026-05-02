import { PrismaClient } from "@/generated/prisma";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

declare global {
  // eslint-disable-next-line no-var
  var __verifyPrisma: PrismaClient | undefined;
}

function makeClient(): PrismaClient {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  // Strip the "file:" prefix the way better-sqlite3 expects.
  const filePath = url.replace(/^file:/, "");
  const adapter = new PrismaBetterSqlite3({ url: `file:${filePath}` });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalThis.__verifyPrisma ?? makeClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__verifyPrisma = prisma;
}
