/**
 * Playwright globalSetup — runs once before any test starts.
 *
 * Responsibilities:
 *   1. Verify the Go API is reachable (the playwright.config.ts webServer
 *      starts Next.js, but the Go API has to already be running).
 *   2. Run the Go seed binary to put the database in a known state.
 *
 * All E2E tests assume the seed shape (the `Acme Storefront` project, the
 * `ACM-PAY-0001` case, the `May 1 nightly smoke` run, etc.).  Keeping this
 * idempotent is the cheap way to make the suite re-runnable.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const API_URL = process.env.VERIFY_API_URL ?? "http://localhost:4000";

export default async function globalSetup() {
  await waitForApi();
  await runSeed();
}

async function waitForApi() {
  const start = Date.now();
  // Up to 30s — most of the time the API is already up.
  while (Date.now() - start < 30_000) {
    try {
      const res = await fetch(`${API_URL}/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Go API not reachable at ${API_URL} after 30s. Start it with:\n  cd backend && go run ./cmd/server`,
  );
}

async function runSeed() {
  const backend = join(process.cwd(), "backend");
  if (!existsSync(join(backend, "go.mod"))) {
    throw new Error(`Cannot find backend at ${backend}`);
  }
  // Allow tests to opt out (e.g., locally if you're iterating on UI and
  // already seeded).  Skipping the seed will leak state from prior runs, so
  // you only want this when you know what you're doing.
  if (process.env.SKIP_SEED === "1") {
    console.log("[globalSetup] SKIP_SEED=1 — leaving DB as-is");
    return;
  }
  console.log("[globalSetup] reseeding test DB via go run ./cmd/seed");
  execFileSync("go", ["run", "./cmd/seed"], {
    cwd: backend,
    stdio: "inherit",
  });
}
