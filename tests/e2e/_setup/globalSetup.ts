/**
 * Playwright globalSetup — runs once before any test starts.
 *
 * Responsibilities:
 *   1. Verify the Go API is reachable.  The Playwright config also starts
 *      Next.js via `webServer`, but the Go service must already be up.
 *   2. Optionally ensure the Acme/Internal demo projects exist so the
 *      golden-paths specs have a fixture to read.  Controlled by env:
 *
 *        PW_RESEED=1            ensure demos via the (non-destructive) seed
 *        PW_RESEED=wipe         delete the demo projects and re-seed
 *        PW_RESEED=wipe-all     truncate every table and re-seed (test DB)
 *
 *      Default: do nothing.  Tests that need the demo projects either
 *      already have them (you've run the seed manually once), or skip
 *      themselves when the data is missing.
 *
 *      Imported user data (e.g. an FP project from the Testiny importer)
 *      is **never** touched unless PW_RESEED=wipe-all is explicitly set.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const API_URL = process.env.VERIFY_API_URL ?? "http://localhost:4000";

export default async function globalSetup() {
  await waitForApi();
  await maybeSeed();
}

async function waitForApi() {
  const start = Date.now();
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

async function maybeSeed() {
  const mode = process.env.PW_RESEED ?? "";
  if (!mode) {
    console.log(
      "[globalSetup] PW_RESEED not set — leaving DB as-is (tests that need demo data may skip)",
    );
    return;
  }
  const backend = join(process.cwd(), "backend");
  if (!existsSync(join(backend, "go.mod"))) {
    throw new Error(`Cannot find backend at ${backend}`);
  }
  const args = ["run", "./cmd/seed"];
  if (mode === "wipe") args.push("--wipe");
  if (mode === "wipe-all") args.push("--wipe-all");
  console.log(`[globalSetup] running seed: PW_RESEED=${mode}`);
  execFileSync("go", args, { cwd: backend, stdio: "inherit" });
}
