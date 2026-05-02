/**
 * Demo seed — populates Verify with realistic test cases, runs, and executions
 * so the app is meaningful to demo and to verify with Playwright.
 */
import { PrismaClient } from "../src/generated/prisma";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

function pad(n: number, w: number) {
  return String(n).padStart(w, "0");
}

async function main() {
  // wipe everything
  console.log("Wiping demo data…");
  await prisma.$transaction([
    prisma.executionAttempt.deleteMany(),
    prisma.testExecution.deleteMany(),
    prisma.runSnapshotCase.deleteMany(),
    prisma.testRun.deleteMany(),
    prisma.testCaseVersion.deleteMany(),
    prisma.testCaseDataRow.deleteMany(),
    prisma.testCaseParam.deleteMany(),
    prisma.testStep.deleteMany(),
    prisma.testCaseTag.deleteMany(),
    prisma.attachment.deleteMany(),
    prisma.testCase.deleteMany(),
    prisma.feature.deleteMany(),
    prisma.area.deleteMany(),
    prisma.testCaseTemplate.deleteMany(),
    prisma.projectMember.deleteMany(),
    prisma.project.deleteMany(),
    prisma.tag.deleteMany(),
    prisma.savedFilter.deleteMany(),
    prisma.auditLog.deleteMany(),
  ]);

  const admin = await prisma.user.upsert({
    where: { email: "demo@verify.local" },
    update: {},
    create: { email: "demo@verify.local", name: "Demo Admin", role: "admin" },
  });
  const tester = await prisma.user.upsert({
    where: { email: "tester@verify.local" },
    update: { name: "Riya Tester" },
    create: { email: "tester@verify.local", name: "Riya Tester", role: "member" },
  });
  const dev = await prisma.user.upsert({
    where: { email: "dev@verify.local" },
    update: { name: "Sam Dev" },
    create: { email: "dev@verify.local", name: "Sam Dev", role: "member" },
  });

  // ─── tags ─────────────────────────────────────────────────────────────────
  const tagNames = [
    "smoke",
    "regression",
    "P0",
    "release-blocker",
    "happy-path",
    "edge-case",
    "auth",
    "money",
    "calendar-ui",
  ];
  const tags = new Map<string, string>();
  for (const name of tagNames) {
    const t = await prisma.tag.create({ data: { name } });
    tags.set(name, t.id);
  }

  // ─── Project: Aiwyn Core ──────────────────────────────────────────────────
  const aiwyn = await prisma.project.create({
    data: {
      key: "AIW",
      name: "Aiwyn Core",
      description:
        "Customer-facing app: payments, calendar, identity. Year-1 manual catalog.",
      ownerId: admin.id,
      members: {
        create: [
          { userId: admin.id, role: "admin" },
          { userId: tester.id, role: "tester" },
          { userId: dev.id, role: "manager" },
        ],
      },
    },
  });
  const internal = await prisma.project.create({
    data: {
      key: "INT",
      name: "Aiwyn Internal Tools",
      description: "Internal admin console used by support and finance.",
      ownerId: admin.id,
      members: {
        create: [
          { userId: admin.id, role: "admin" },
          { userId: tester.id, role: "tester" },
        ],
      },
    },
  });

  type AreaSpec = {
    key: string;
    name: string;
    description: string;
    features: { name: string; description: string }[];
  };

  const aiwynAreas: AreaSpec[] = [
    {
      key: "PAY",
      name: "Payments",
      description: "Charges, refunds, payouts, methods.",
      features: [
        { name: "One-time payment", description: "Customer pays an invoice once." },
        { name: "Recurring payments", description: "Schedule and renewal logic." },
        { name: "Refunds", description: "Full and partial refunds." },
        { name: "Payment methods", description: "Add, remove, default." },
      ],
    },
    {
      key: "AUTH",
      name: "Auth",
      description: "Sign-in, MFA, sessions, recovery.",
      features: [
        { name: "Sign in", description: "Username/password and SSO." },
        { name: "Account recovery", description: "Forgot password, magic link." },
        { name: "MFA", description: "TOTP, recovery codes." },
      ],
    },
    {
      key: "CAL",
      name: "Calendar",
      description: "Scheduling, availability, reminders.",
      features: [
        { name: "Booking flow", description: "External booking page → confirmed slot." },
        { name: "Recurring events", description: "Daily, weekly, monthly recurrence." },
        { name: "Reminders", description: "Email and push reminders." },
      ],
    },
    {
      key: "ACCT",
      name: "Account",
      description: "Profile, preferences, organizations.",
      features: [
        { name: "Profile", description: "Name, email, avatar." },
        { name: "Notifications prefs", description: "Per-channel preferences." },
      ],
    },
  ];

  const internalAreas: AreaSpec[] = [
    {
      key: "REP",
      name: "Reports",
      description: "Internal reporting console.",
      features: [{ name: "Revenue report", description: "Daily revenue rollup." }],
    },
    {
      key: "OPS",
      name: "Ops",
      description: "Support tooling.",
      features: [
        { name: "Customer search", description: "Find customers by email/name." },
        { name: "Refund tooling", description: "Issue manual refunds." },
      ],
    },
  ];

  type CaseSpec = {
    title: string;
    description: string;
    preconditions?: string;
    steps: { action: string; expected: string }[];
    finalExpected?: string;
    type:
      | "functional"
      | "regression"
      | "smoke"
      | "integration"
      | "exploratory"
      | "performance"
      | "security"
      | "accessibility";
    priority: "critical" | "high" | "medium" | "low";
    automationStatus: "not_automated" | "partial" | "full";
    automationFramework?: string;
    automationRef?: string;
    tags: string[];
    parameters?: { name: string }[];
    dataRows?: { label: string; values: Record<string, string> }[];
    jiraKeys?: string;
  };

  const aiwynCases: Record<string, CaseSpec[]> = {
    "One-time payment": [
      {
        title: "Pay an invoice with a credit card",
        description: "Customer pays a single invoice with a saved card.",
        preconditions: "Customer is signed in with at least one saved card.",
        steps: [
          { action: "Navigate to /invoices and open a pending invoice.", expected: "Invoice page renders with amount due." },
          { action: "Click 'Pay now'.", expected: "Payment modal appears." },
          { action: "Confirm with default card.", expected: "Card charge succeeds; modal shows receipt." },
          { action: "Close modal.", expected: "Invoice status moves to 'Paid'." },
        ],
        type: "functional",
        priority: "critical",
        automationStatus: "full",
        automationFramework: "Playwright",
        automationRef: "apps/web-e2e/src/payments/pay-invoice.spec.ts",
        tags: ["smoke", "happy-path", "money", "P0"],
        jiraKeys: "AIW-101",
      },
      {
        title: "Pay an invoice across multiple payment methods",
        description: "Verify checkout against different payment instruments.",
        steps: [
          { action: "Open invoice and choose payment method {{method}}.", expected: "Method selector shows {{method}}." },
          { action: "Confirm.", expected: "Charge succeeds with {{method}}; receipt shows fee {{fee}}." },
        ],
        type: "regression",
        priority: "high",
        automationStatus: "partial",
        automationFramework: "Cypress",
        automationRef: "apps/web-e2e/src/payments/methods.cy.ts",
        tags: ["regression", "money"],
        parameters: [{ name: "method" }, { name: "fee" }],
        dataRows: [
          { label: "credit_card", values: { method: "credit card", fee: "$0.30" } },
          { label: "ach", values: { method: "ACH", fee: "$0.80" } },
          { label: "wire", values: { method: "wire", fee: "$15.00" } },
          { label: "gift_card", values: { method: "gift card", fee: "$0.00" } },
        ],
      },
      {
        title: "Pay invoice with declined card shows actionable error",
        description: "Failure path — declined card should not charge.",
        steps: [
          { action: "Use the declining test card 4000-0000-0000-0002.", expected: "Charge is declined; error message names the card." },
          { action: "Verify invoice unchanged.", expected: "Invoice still 'Pending'; no audit row." },
        ],
        type: "regression",
        priority: "high",
        automationStatus: "not_automated",
        tags: ["edge-case", "money"],
      },
    ],
    "Recurring payments": [
      {
        title: "Create a monthly recurring schedule",
        description: "Customer enrolls in monthly auto-pay.",
        steps: [
          { action: "Open the Subscriptions page.", expected: "Active and past subscriptions render." },
          { action: "Click 'New schedule' and choose monthly.", expected: "Form shows next charge date." },
          { action: "Confirm.", expected: "Schedule listed under Active." },
        ],
        type: "functional",
        priority: "high",
        automationStatus: "not_automated",
        tags: ["money", "happy-path"],
      },
      {
        title: "Recurring payment retries on a soft decline",
        description: "Verify retry policy after soft-decline.",
        steps: [
          { action: "Trigger a soft decline via the test fixture.", expected: "Initial charge fails." },
          { action: "Wait 1 minute (test clock).", expected: "Retry succeeds; subscription stays active." },
        ],
        type: "regression",
        priority: "critical",
        automationStatus: "not_automated",
        tags: ["money", "regression", "release-blocker"],
      },
      {
        title: "Cancel a recurring schedule keeps history",
        description: "Cancellation does not delete past charges.",
        steps: [
          { action: "Cancel an active schedule.", expected: "Schedule moves to 'Canceled'." },
          { action: "Open history tab.", expected: "Past charges are visible and immutable." },
        ],
        type: "functional",
        priority: "medium",
        automationStatus: "partial",
        automationFramework: "Cypress",
        automationRef: "apps/web-e2e/src/payments/cancel.cy.ts",
        tags: ["money"],
      },
    ],
    Refunds: [
      {
        title: "Refund a successful credit card payment",
        description: "Issue a full refund and verify customer is notified.",
        steps: [
          { action: "Open a paid invoice.", expected: "Refund button visible to manager role." },
          { action: "Click Refund and confirm.", expected: "Charge is refunded; status 'Refunded'." },
          { action: "Check email log.", expected: "Customer receives refund confirmation." },
        ],
        type: "functional",
        priority: "critical",
        automationStatus: "full",
        automationFramework: "Playwright",
        automationRef: "apps/web-e2e/src/payments/refund.spec.ts",
        tags: ["smoke", "money", "P0"],
        jiraKeys: "AIW-204,AIW-220",
      },
      {
        title: "Partial refund on a parameterized payment",
        description: "Issue a partial refund across instruments.",
        steps: [
          { action: "Open a {{method}} payment of {{amount}}.", expected: "Refund modal shows refundable {{amount}}." },
          { action: "Refund {{partial}}.", expected: "Status changes to 'Partially refunded'." },
        ],
        type: "regression",
        priority: "high",
        automationStatus: "not_automated",
        tags: ["money", "regression"],
        parameters: [{ name: "method" }, { name: "amount" }, { name: "partial" }],
        dataRows: [
          { label: "card_50_of_200", values: { method: "credit card", amount: "$200", partial: "$50" } },
          { label: "ach_25_of_75", values: { method: "ACH", amount: "$75", partial: "$25" } },
          { label: "wire_500_of_1000", values: { method: "wire", amount: "$1,000", partial: "$500" } },
        ],
      },
      {
        title: "Refund disabled for already-refunded payment",
        description: "Don't allow double refunds.",
        steps: [
          { action: "Open a refunded invoice.", expected: "Refund button is disabled with tooltip." },
        ],
        type: "regression",
        priority: "medium",
        automationStatus: "not_automated",
        tags: ["edge-case"],
      },
    ],
    "Payment methods": [
      {
        title: "Add a new credit card",
        description: "Customer adds a new card to their account.",
        steps: [
          { action: "Open settings → Payment methods.", expected: "Saved cards list renders." },
          { action: "Click 'Add card', enter test card.", expected: "Card is tokenized; modal closes." },
          { action: "Verify card appears in the list.", expected: "Card visible with last-4 and brand." },
        ],
        type: "smoke",
        priority: "high",
        automationStatus: "full",
        automationFramework: "Playwright",
        automationRef: "apps/web-e2e/src/payments/add-card.spec.ts",
        tags: ["smoke", "happy-path"],
      },
      {
        title: "Remove the last payment method blocks active subscriptions",
        description: "Don't strand subscribers with no method.",
        steps: [
          { action: "Account has only one saved method and an active subscription.", expected: "Remove button shows warning." },
          { action: "Confirm remove.", expected: "Removal blocked with explanatory error." },
        ],
        type: "regression",
        priority: "high",
        automationStatus: "not_automated",
        tags: ["edge-case", "money"],
      },
    ],
    "Sign in": [
      {
        title: "Sign in with email and password",
        description: "Standard login.",
        steps: [
          { action: "Visit /login.", expected: "Login form renders with email + password." },
          { action: "Enter valid creds and submit.", expected: "Redirected to dashboard." },
        ],
        type: "smoke",
        priority: "critical",
        automationStatus: "full",
        automationFramework: "Cypress",
        automationRef: "apps/web-e2e/src/auth/login.cy.ts",
        tags: ["smoke", "auth", "P0", "happy-path"],
      },
      {
        title: "Sign in with SSO (Google) succeeds",
        description: "OIDC happy path.",
        steps: [
          { action: "Click 'Sign in with Google'.", expected: "Provider consent screen appears." },
          { action: "Approve.", expected: "Redirected back; signed-in." },
        ],
        type: "integration",
        priority: "high",
        automationStatus: "partial",
        automationFramework: "Cypress",
        automationRef: "apps/web-e2e/src/auth/sso.cy.ts",
        tags: ["auth", "happy-path"],
      },
      {
        title: "Lockout after 5 invalid attempts",
        description: "Brute-force protection.",
        steps: [
          { action: "Submit 5 wrong passwords in a row.", expected: "Account is locked for 10 minutes." },
        ],
        type: "security",
        priority: "high",
        automationStatus: "not_automated",
        tags: ["auth", "edge-case"],
      },
    ],
    "Account recovery": [
      {
        title: "Forgot password sends a magic link",
        description: "Forgot-password happy path.",
        steps: [
          { action: "From /login, click 'Forgot password'.", expected: "Email entry form appears." },
          { action: "Submit email.", expected: "Confirmation message + email arrives." },
          { action: "Click link in email.", expected: "Reset form opens." },
        ],
        type: "functional",
        priority: "high",
        automationStatus: "not_automated",
        tags: ["auth"],
      },
    ],
    MFA: [
      {
        title: "Enroll TOTP authenticator",
        description: "Add a TOTP authenticator and confirm with a code.",
        steps: [
          { action: "Open Security → Add authenticator.", expected: "QR code shown." },
          { action: "Scan with authenticator app and submit code.", expected: "MFA enabled." },
        ],
        type: "functional",
        priority: "high",
        automationStatus: "not_automated",
        tags: ["auth", "regression"],
      },
      {
        title: "Sign in with MFA across factor types",
        description: "Verify each enabled factor signs the user in.",
        steps: [
          { action: "Sign in with email/password.", expected: "Prompted for {{factor}}." },
          { action: "Provide valid {{factor}}.", expected: "Signed in." },
        ],
        type: "regression",
        priority: "high",
        automationStatus: "not_automated",
        tags: ["auth", "regression"],
        parameters: [{ name: "factor" }],
        dataRows: [
          { label: "totp", values: { factor: "TOTP code" } },
          { label: "recovery_code", values: { factor: "recovery code" } },
        ],
      },
    ],
    "Booking flow": [
      {
        title: "Book a 30-minute slot from a public booking page",
        description: "External user books an appointment.",
        steps: [
          { action: "Open the public booking page URL.", expected: "Available slots render." },
          { action: "Pick a 30-minute slot.", expected: "Form prompts for name + email." },
          { action: "Submit.", expected: "Confirmation page shows; calendar event created." },
        ],
        type: "functional",
        priority: "critical",
        automationStatus: "partial",
        automationFramework: "Playwright",
        automationRef: "apps/web-e2e/src/calendar/book.spec.ts",
        tags: ["smoke", "happy-path", "calendar-ui", "P0"],
      },
      {
        title: "Booking page handles full-day-blocked correctly",
        description: "All slots blocked → empty state.",
        steps: [
          { action: "Block all hours for the day under test.", expected: "Booking page shows 'No availability'." },
        ],
        type: "exploratory",
        priority: "low",
        automationStatus: "not_automated",
        tags: ["edge-case", "calendar-ui"],
      },
    ],
    "Recurring events": [
      {
        title: "Create a weekly recurring event",
        description: "Recurring schedule across weeks.",
        steps: [
          { action: "Create event with weekly recurrence and 4 occurrences.", expected: "All 4 occurrences appear on the calendar." },
        ],
        type: "functional",
        priority: "high",
        automationStatus: "not_automated",
        tags: ["calendar-ui"],
      },
      {
        title: "Editing one occurrence does not break the series",
        description: "Per-occurrence override.",
        steps: [
          { action: "Edit a single occurrence and change time.", expected: "Only that occurrence is changed." },
          { action: "Verify other occurrences are unchanged.", expected: "Series still consistent." },
        ],
        type: "regression",
        priority: "medium",
        automationStatus: "not_automated",
        tags: ["calendar-ui", "regression"],
      },
    ],
    Reminders: [
      {
        title: "Email reminder sends 1 hour before event",
        description: "Reminder timing.",
        steps: [
          { action: "Schedule event with 1-hour email reminder.", expected: "Email queued at scheduled minus 1h." },
          { action: "Advance the test clock to T-1h.", expected: "Email is sent." },
        ],
        type: "integration",
        priority: "medium",
        automationStatus: "not_automated",
        tags: ["calendar-ui"],
      },
    ],
    Profile: [
      {
        title: "Update display name persists across sessions",
        description: "Profile update sticks.",
        steps: [
          { action: "Edit display name and save.", expected: "Name updates in header." },
          { action: "Sign out and sign in.", expected: "Name still updated." },
        ],
        type: "functional",
        priority: "medium",
        automationStatus: "full",
        automationFramework: "Playwright",
        automationRef: "apps/web-e2e/src/account/profile.spec.ts",
        tags: ["happy-path"],
      },
    ],
    "Notifications prefs": [
      {
        title: "Toggle email notifications off and verify",
        description: "Honor opt-out.",
        steps: [
          { action: "Disable 'Booking reminders' email.", expected: "Setting persists; toggle stays off after refresh." },
          { action: "Trigger a booking event.", expected: "No email is sent for that event." },
        ],
        type: "functional",
        priority: "low",
        automationStatus: "not_automated",
        tags: ["regression"],
      },
    ],
  };

  const internalCases: Record<string, CaseSpec[]> = {
    "Revenue report": [
      {
        title: "Daily revenue report renders for selected date",
        description: "Internal report — pick a date, verify totals.",
        steps: [
          { action: "Open reports → Daily revenue.", expected: "Date picker defaults to yesterday." },
          { action: "Pick a known date with revenue.", expected: "Totals match recorded test data." },
        ],
        type: "functional",
        priority: "high",
        automationStatus: "not_automated",
        tags: ["regression"],
      },
    ],
    "Customer search": [
      {
        title: "Search customer by email returns matches",
        description: "Internal lookup tool.",
        steps: [
          { action: "Open Ops → Customer search.", expected: "Search box renders." },
          { action: "Enter known email and submit.", expected: "Customer card shows." },
        ],
        type: "smoke",
        priority: "medium",
        automationStatus: "partial",
        automationFramework: "Cypress",
        automationRef: "apps/internal-e2e/src/ops/search.cy.ts",
        tags: ["smoke"],
      },
    ],
    "Refund tooling": [
      {
        title: "Manual refund requires manager role",
        description: "RBAC.",
        steps: [
          { action: "Sign in as ops user (no manager role).", expected: "Refund button is hidden." },
          { action: "Sign in as manager user.", expected: "Refund button is visible and clickable." },
        ],
        type: "security",
        priority: "high",
        automationStatus: "not_automated",
        tags: ["regression", "auth"],
      },
    ],
  };

  async function buildCases(
    project: { id: string; key: string },
    areaSpec: AreaSpec[],
    casesByFeature: Record<string, CaseSpec[]>,
  ) {
    const created: any[] = [];
    let seq = 0;
    const areaOrder = [...areaSpec];
    for (let ai = 0; ai < areaOrder.length; ai++) {
      const a = areaOrder[ai];
      const area = await prisma.area.create({
        data: {
          projectId: project.id,
          key: a.key,
          name: a.name,
          description: a.description,
          displayOrder: ai,
        },
      });
      for (let fi = 0; fi < a.features.length; fi++) {
        const f = a.features[fi];
        const feature = await prisma.feature.create({
          data: {
            areaId: area.id,
            name: f.name,
            description: f.description,
            displayOrder: fi,
          },
        });
        const cases = casesByFeature[f.name] ?? [];
        for (const c of cases) {
          seq++;
          const publicId = `${project.key}-${a.key}-${pad(seq, 4)}`;
          const tc = await prisma.testCase.create({
            data: {
              projectId: project.id,
              featureId: feature.id,
              publicId,
              sequenceNum: seq,
              title: c.title,
              description: c.description,
              preconditions: c.preconditions,
              finalExpected: c.finalExpected,
              type: c.type,
              priority: c.priority,
              status: "active",
              automationStatus: c.automationStatus,
              automationFramework: c.automationFramework,
              automationRef: c.automationRef,
              automationLastReviewedAt:
                c.automationStatus !== "not_automated"
                  ? new Date(Date.now() - Math.random() * 1000 * 60 * 60 * 24 * 180)
                  : null,
              jiraKeys: c.jiraKeys,
              createdById: admin.id,
              updatedById: admin.id,
              steps: {
                create: c.steps.map((s, i) => ({
                  order: i,
                  action: s.action,
                  expected: s.expected,
                })),
              },
              parameters: {
                create: (c.parameters ?? []).map((p, i) => ({
                  name: p.name,
                  order: i,
                })),
              },
              dataRows: {
                create: (c.dataRows ?? []).map((r, i) => ({
                  order: i,
                  label: r.label,
                  valuesJson: JSON.stringify(r.values),
                })),
              },
              tags: {
                create: c.tags
                  .map((t) => tags.get(t))
                  .filter(Boolean)
                  .map((tagId) => ({ tagId: tagId! })),
              },
            },
          });
          await prisma.testCaseVersion.create({
            data: {
              testCaseId: tc.id,
              version: 1,
              snapshotJson: JSON.stringify(c),
              changedById: admin.id,
            },
          });
          created.push(tc);
        }
      }
    }
    return created;
  }

  console.log("Seeding Aiwyn Core…");
  const aiwynCasesCreated = await buildCases(
    { id: aiwyn.id, key: aiwyn.key },
    aiwynAreas,
    aiwynCases,
  );
  console.log(`  + ${aiwynCasesCreated.length} cases`);

  console.log("Seeding Aiwyn Internal Tools…");
  const internalCasesCreated = await buildCases(
    { id: internal.id, key: internal.key },
    internalAreas,
    internalCases,
  );
  console.log(`  + ${internalCasesCreated.length} cases`);

  // ─── runs + executions for Aiwyn Core ─────────────────────────────────────
  // Run 1: completed staging regression last week
  console.log("Seeding runs…");
  async function buildRun({
    project,
    name,
    description,
    environment,
    build,
    status,
    plan,
    cases,
    fillResults,
  }: {
    project: { id: string };
    name: string;
    description: string;
    environment: string;
    build: string;
    status: "draft" | "in_progress" | "completed";
    plan: { start: number; end: number }; // days ago
    cases: any[];
    fillResults: (
      i: number,
      total: number,
      caseSeq: number,
      params: any,
    ) => "pass" | "fail" | "blocked" | "skipped" | "not_run";
  }) {
    const start = new Date();
    start.setDate(start.getDate() - plan.start);
    const end = new Date();
    end.setDate(end.getDate() - plan.end);
    const run = await prisma.testRun.create({
      data: {
        projectId: project.id,
        name,
        description,
        environment,
        build,
        ownerId: admin.id,
        status,
        actualStart: status !== "draft" ? start : null,
        actualEnd: status === "completed" ? end : null,
        plannedStart: start,
        plannedEnd: end,
      },
    });

    const fullCases = await prisma.testCase.findMany({
      where: { id: { in: cases.map((c) => c.id) } },
      include: {
        steps: { orderBy: { order: "asc" } },
        parameters: { orderBy: { order: "asc" } },
        dataRows: { orderBy: { order: "asc" } },
      },
    });
    let i = 0;
    const total = fullCases.length;
    for (const tc of fullCases) {
      const snapshot = await prisma.runSnapshotCase.create({
        data: {
          runId: run.id,
          testCaseId: tc.id,
          publicId: tc.publicId,
          title: tc.title,
          description: tc.description,
          preconditions: tc.preconditions,
          finalExpected: tc.finalExpected,
          type: tc.type,
          priority: tc.priority,
          version: tc.version,
          snapshotJson: JSON.stringify({
            steps: tc.steps.map((s) => ({
              order: s.order,
              action: s.action,
              expected: s.expected,
            })),
            parameters: tc.parameters.map((p) => ({
              name: p.name,
              order: p.order,
            })),
            dataRows: tc.dataRows.map((d) => ({
              order: d.order,
              label: d.label,
              values: JSON.parse(d.valuesJson),
            })),
          }),
        },
      });
      if (tc.dataRows.length === 0) {
        const r = fillResults(i, total, tc.sequenceNum, {});
        const dt = new Date(start);
        dt.setHours(dt.getHours() + i);
        await prisma.testExecution.create({
          data: {
            runId: run.id,
            snapshotCaseId: snapshot.id,
            result: r,
            executedById: r === "not_run" ? null : tester.id,
            executedAt: r === "not_run" ? null : dt,
            comments: r === "fail" ? "Reproduces with the steps above." : null,
            jiraDefectKeys: r === "fail" ? "AIW-999" : null,
          },
        });
      } else {
        for (let ri = 0; ri < tc.dataRows.length; ri++) {
          const row = tc.dataRows[ri];
          const r = fillResults(i, total, tc.sequenceNum, JSON.parse(row.valuesJson));
          const dt = new Date(start);
          dt.setHours(dt.getHours() + i);
          await prisma.testExecution.create({
            data: {
              runId: run.id,
              snapshotCaseId: snapshot.id,
              dataRowIndex: row.order,
              dataRowLabel: row.label,
              result: r,
              executedById: r === "not_run" ? null : tester.id,
              executedAt: r === "not_run" ? null : dt,
              comments: r === "fail" ? `Failed for ${row.label} variant.` : null,
            },
          });
        }
      }
      i++;
    }
    return run;
  }

  // Pick a subset for completed run
  const aiwynActive = aiwynCasesCreated.filter((c) =>
    ["active", "draft"].includes(c.status),
  );
  const completedSelected = aiwynActive
    .filter((c) =>
      ["critical", "high"].includes(c.priority) && c.status === "active",
    )
    .slice(0, 14);

  await buildRun({
    project: aiwyn,
    name: "April staging regression",
    description: "Pre-release smoke + regression on staging.",
    environment: "staging",
    build: "v2.41.0-rc1",
    status: "completed",
    plan: { start: 21, end: 14 },
    cases: completedSelected,
    fillResults: (i, _t, seq) => {
      // mostly pass, fail a couple of unlucky ones
      if (seq % 7 === 0) return "fail";
      if (seq % 11 === 0) return "blocked";
      return "pass";
    },
  });

  // In-progress run
  const inProgressSelected = aiwynActive.slice(0, 18);
  await buildRun({
    project: aiwyn,
    name: "May 1 nightly smoke",
    description: "Daily smoke run.",
    environment: "staging",
    build: "main@a3f81c",
    status: "in_progress",
    plan: { start: 1, end: -1 },
    cases: inProgressSelected,
    fillResults: (i, t, seq) => {
      if (i < t * 0.55) {
        if (seq % 9 === 0) return "fail";
        if (seq % 13 === 0) return "blocked";
        return "pass";
      }
      return "not_run";
    },
  });

  // Draft run for demoing 'New run' creation
  // (no, actually no — leave a draft handle for users to start.)
  await buildRun({
    project: aiwyn,
    name: "Prod release verification (draft)",
    description: "Release-day smoke; not started.",
    environment: "prod",
    build: "v2.42.0",
    status: "draft",
    plan: { start: 0, end: -2 },
    cases: aiwynActive
      .filter((c) => c.priority === "critical")
      .slice(0, 8),
    fillResults: () => "not_run",
  });

  // Internal one quick run
  await buildRun({
    project: internal,
    name: "Internal weekly smoke",
    description: "Weekly smoke for internal tools.",
    environment: "staging",
    build: "internal@b7d12",
    status: "completed",
    plan: { start: 4, end: 3 },
    cases: internalCasesCreated,
    fillResults: (i, _t, seq) => {
      if (seq % 5 === 0) return "fail";
      return "pass";
    },
  });

  // ─── audit log seed ──────────────────────────────────────────────────────
  for (const tc of aiwynCasesCreated.slice(0, 8)) {
    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "test_case.create",
        entity: "TestCase",
        entityId: tc.id,
        afterJson: JSON.stringify({ title: tc.title, publicId: tc.publicId }),
      },
    });
  }

  console.log("Done.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
