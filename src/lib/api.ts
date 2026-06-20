/**
 * Verify API client.  All data access in the app goes through this module.
 * The Go backend at VERIFY_API_URL is the single source of truth; this file
 * is a thin typed fetch wrapper that re-exports the response shapes.
 */

import { cookies } from "next/headers";

export const apiBase =
  process.env.VERIFY_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";

const v1 = `${apiBase}/api/v1`;

// The web layer stores the session token in an httpOnly cookie on its own
// origin; forward it to the Go API as a bearer token so the request resolves
// to the signed-in user (falling back to the demo user when absent).
async function authHeaders(): Promise<Record<string, string>> {
  try {
    const token = (await cookies()).get("verify_session")?.value;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${v1}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail: unknown;
    try {
      detail = await res.json();
    } catch {
      /* ignore */
    }
    const msg =
      typeof detail === "object" && detail && "error" in detail
        ? String((detail as { error: unknown }).error)
        : `${res.status} ${res.statusText}`;
    throw new Error(`API ${init?.method ?? "GET"} ${path}: ${msg}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// requestText is for non-JSON endpoints (CSV export).  Returns the raw body.
async function requestText(path: string): Promise<string> {
  const res = await fetch(`${v1}${path}`, {
    cache: "no-store",
    headers: await authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`API GET ${path}: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

// ─── shared types (mirror domain/types.go shapes) ────────────────────────────

export type ID = string;

export type CurrentUser = {
  id: ID;
  email: string;
  name: string;
  role: string;
  avatarUrl?: string | null;
};

export type Project = {
  id: ID;
  key: string;
  name: string;
  description: string | null;
  status: string;
  ownerId: ID;
  ownerName: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ProjectSummary = Project & {
  testCaseCount: number;
  areaCount: number;
  runCount: number;
  activeRunCount: number;
  automatedCount: number;
};

export type Area = {
  id: ID;
  projectId: ID;
  key: string;
  name: string;
  description: string | null;
  displayOrder: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Feature = {
  id: ID;
  areaId: ID;
  name: string;
  description: string | null;
  displayOrder: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AreaWithFeatures = Area & { features: Feature[] };

export type FolderNode = {
  id: ID;
  projectId: ID;
  parentId: ID | null;
  name: string;
  description: string | null;
  displayOrder: number;
  archived: boolean;
  ownCount: number;
  caseCount: number;
  children: FolderNode[];
};

export type TestStep = { id?: string; order: number; action: string; expected: string };
export type TestCaseParam = { name: string; order: number };
export type TestCaseDataRow = { order: number; label: string | null; values: Record<string, string> };

export type TestCase = {
  id: ID;
  projectId: ID;
  projectKey: string;
  projectName: string;
  featureId: ID;
  featureName: string;
  areaId: ID;
  areaName: string;
  areaKey: string;
  publicId: string;
  sequenceNum: number;
  title: string;
  description: string | null;
  preconditions: string | null;
  finalExpected: string | null;
  testDataNotes: string | null;
  type: string;
  priority: string;
  status: string;
  automationStatus: string;
  automationFramework: string | null;
  automationRef: string | null;
  automationRepoUrl: string | null;
  automationLastReviewedAt: string | null;
  jiraKeys: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  createdByName: string;
  updatedByName: string;
  tags: string[];
  steps: TestStep[];
  parameters: TestCaseParam[];
  dataRows: TestCaseDataRow[];
};

export type TestCaseLite = TestCase & { dataRowCount: number };

export type TestCaseInput = {
  projectId?: ID;
  featureId: ID;
  title: string;
  description: string;
  preconditions: string;
  finalExpected: string;
  testDataNotes: string;
  type: string;
  priority: string;
  status: string;
  automationStatus: string;
  automationFramework: string;
  automationRef: string;
  automationRepoUrl: string;
  jiraKeys: string;
  tags: string[];
  steps: TestStep[];
  parameters: TestCaseParam[];
  dataRows: TestCaseDataRow[];
};

export type ResultCounts = {
  total: number;
  pass: number;
  fail: number;
  blocked: number;
  skipped: number;
  notRun: number;
};

export type TestRun = {
  id: ID;
  projectId: ID;
  projectName: string;
  parentRunId: ID | null;
  parentRunName: string | null;
  name: string;
  description: string | null;
  environment: string | null;
  build: string | null;
  milestone: string | null;
  status: string;
  abortReason: string | null;
  ownerId: ID;
  ownerName: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  counts: ResultCounts;
};

export type SnapshotCase = {
  id: ID;
  testCaseId: ID;
  publicId: string;
  title: string;
  description: string | null;
  preconditions: string | null;
  finalExpected: string | null;
  type: string;
  priority: string;
  version: number;
  steps: TestStep[];
  parameters: TestCaseParam[];
  dataRows: TestCaseDataRow[];
};

export type ExecutionAttempt = {
  attemptNum: number;
  result: string;
  executedByName: string | null;
  executedAt: string;
  comments: string | null;
  durationSeconds: number | null;
};

export type Execution = {
  id: ID;
  runId: ID;
  snapshotCaseId: ID;
  dataRowIndex: number | null;
  dataRowLabel: string | null;
  result: string;
  executedById: ID | null;
  executedByName: string | null;
  executedAt: string | null;
  durationSeconds: number | null;
  envOverride: string | null;
  buildOverride: string | null;
  comments: string | null;
  jiraDefectKeys: string | null;
  stepResults: { order: number; result: string }[];
  updatedAt: string;
  snapshotCase: SnapshotCase;
  attempts: ExecutionAttempt[];
};

export type CaseVersionMeta = {
  version: number;
  changedByName: string;
  changedAt: string;
};

export type CaseVersion = CaseVersionMeta & { snapshot: TestCaseInput };

export type SavedFilter = {
  id: ID;
  projectId: ID;
  ownerId: ID | null;
  ownerName: string;
  name: string;
  scope: string;
  query: Record<string, string>;
  shared: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AuditLog = {
  id: ID;
  action: string;
  entity: string;
  entityId: ID;
  actorName: string | null;
  createdAt: string;
};

export type ReportPayload = {
  totalCases: number;
  automatedCount: number;
  automationPct: number;
  recentlyExecuted: number;
  areaCoverage: {
    areaId: ID;
    key: string;
    name: string;
    total: number;
    automated: number;
    automationPct: number;
  }[];
  candidates: {
    case: TestCaseLite;
    runs: number;
    fails: number;
    failPct: number;
    score: number;
  }[];
  topFailing: { case: TestCaseLite; count: number }[];
  staleAutomation: TestCaseLite[];
  staleManual: { case: TestCaseLite; lastRunAt: string | null }[];
};

// ─── endpoints ───────────────────────────────────────────────────────────────

export const api = {
  // auth
  me: () => request<CurrentUser>("/auth/me"),
  exchangeGoogle: (body: { code: string; redirectUri: string }) =>
    request<{ token: string; expiresAt: string; user: CurrentUser }>(
      "/auth/google/exchange",
      { method: "POST", body: JSON.stringify(body) },
    ),
  logoutSession: (token: string) =>
    request<void>("/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),

  // projects
  listProjects: (archived = false) =>
    request<ProjectSummary[]>(`/projects${archived ? "?archived=1" : ""}`),
  getProject: (id: ID) => request<Project>(`/projects/${id}`),
  createProject: (input: { name: string; key?: string; description?: string }) =>
    request<Project>("/projects", { method: "POST", body: JSON.stringify(input) }),
  patchProject: (id: ID, body: { name?: string; status?: string }) =>
    request<void>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  // hierarchy / areas / features
  hierarchy: (projectId: ID) =>
    request<AreaWithFeatures[]>(`/projects/${projectId}/hierarchy`),
  folders: (projectId: ID, includeArchived = false) =>
    request<FolderNode[]>(
      `/projects/${projectId}/folders${includeArchived ? "?includeArchived=1" : ""}`,
    ),
  createFolder: (
    projectId: ID,
    input: { name: string; parentId?: ID | null; description?: string },
  ) =>
    request<FolderNode>(`/projects/${projectId}/folders`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  patchFolder: (id: ID, body: { name?: string; archived?: boolean }) =>
    request<void>(`/folders/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  moveFolder: (id: ID, targetParentId: ID | null) =>
    request<void>(`/folders/${id}/move`, {
      method: "POST",
      body: JSON.stringify({ targetParentId }),
    }),
  reorderFolder: (id: ID, direction: "up" | "down") =>
    request<void>(`/folders/${id}/reorder`, {
      method: "POST",
      body: JSON.stringify({ direction }),
    }),
  listAreas: (projectId: ID) => request<Area[]>(`/projects/${projectId}/areas`),
  listFeatures: (projectId: ID) => request<Feature[]>(`/projects/${projectId}/features`),
  createArea: (projectId: ID, input: { name: string; key?: string; description?: string }) =>
    request<Area>(`/projects/${projectId}/areas`, { method: "POST", body: JSON.stringify(input) }),
  patchArea: (id: ID, body: { archived?: boolean }) =>
    request<void>(`/areas/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  reorderArea: (id: ID, direction: "up" | "down") =>
    request<void>(`/areas/${id}/reorder`, { method: "POST", body: JSON.stringify({ direction }) }),
  createFeature: (projectId: ID, input: { areaId: ID; name: string; description?: string }) =>
    request<Feature>(`/projects/${projectId}/features`, { method: "POST", body: JSON.stringify(input) }),
  patchFeature: (id: ID, body: { archived?: boolean; targetAreaId?: ID }) =>
    request<void>(`/features/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  // cases
  listCases: (projectId: ID, params: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== "" && v !== "all") qs.set(k, String(v));
    });
    const tail = qs.toString();
    return request<TestCaseLite[]>(`/projects/${projectId}/cases${tail ? `?${tail}` : ""}`);
  },
  listCasesByFolder: (projectId: ID, folderId: string) =>
    request<TestCaseLite[]>(
      `/projects/${projectId}/cases?folderId=${encodeURIComponent(folderId)}&limit=2500`,
    ),
  getCase: (id: ID) => request<TestCase>(`/cases/${id}`),
  createCase: (projectId: ID, input: TestCaseInput) =>
    request<TestCase>(`/projects/${projectId}/cases`, { method: "POST", body: JSON.stringify(input) }),
  updateCase: (id: ID, input: TestCaseInput) =>
    request<TestCase>(`/cases/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  deleteCase: (id: ID) => request<void>(`/cases/${id}`, { method: "DELETE" }),
  restoreCase: (id: ID) => request<void>(`/cases/${id}/restore`, { method: "POST" }),
  duplicateCase: (id: ID) => request<TestCase>(`/cases/${id}/duplicate`, { method: "POST" }),
  bulkUpdateCases: (
    projectId: ID,
    body: { caseIds: ID[]; op: string; value?: string },
  ) =>
    request<{ updated: number }>(`/projects/${projectId}/cases/bulk`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // runs
  listRuns: (projectId: ID, params: Record<string, string | undefined> = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== "" && v !== "all") qs.set(k, String(v));
    });
    const tail = qs.toString();
    return request<TestRun[]>(`/projects/${projectId}/runs${tail ? `?${tail}` : ""}`);
  },
  listActiveRuns: () => request<TestRun[]>(`/runs?active=1`),
  createRun: (
    projectId: ID,
    input: {
      name: string;
      description?: string;
      environment?: string;
      build?: string;
      milestone?: string;
      plannedStart?: string;
      plannedEnd?: string;
      caseIds: ID[];
    },
  ) => request<TestRun>(`/projects/${projectId}/runs`, { method: "POST", body: JSON.stringify(input) }),
  getRun: (id: ID) => request<TestRun>(`/runs/${id}`),
  listExecutions: (runId: ID) => request<Execution[]>(`/runs/${runId}/executions`),
  setRunStatus: (id: ID, status: string, abortReason?: string) =>
    request<void>(`/runs/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, abortReason }),
    }),
  cloneRun: (id: ID) => request<TestRun>(`/runs/${id}/clone`, { method: "POST" }),
  reRunFailed: (id: ID) => request<TestRun>(`/runs/${id}/rerun-failed`, { method: "POST" }),

  // executions
  recordExecution: (
    id: ID,
    input: {
      result: string;
      comments?: string;
      durationSeconds?: number | null;
      jiraDefectKeys?: string;
      envOverride?: string;
      buildOverride?: string;
      stepResults?: { order: number; result: string }[];
    },
  ) => request<void>(`/executions/${id}`, { method: "PATCH", body: JSON.stringify(input) }),

  // version history
  listCaseVersions: (caseId: ID) =>
    request<CaseVersionMeta[]>(`/cases/${caseId}/versions`),
  getCaseVersion: (caseId: ID, version: number) =>
    request<CaseVersion>(`/cases/${caseId}/versions/${version}`),

  // saved filters
  listSavedFilters: (projectId: ID, scope = "cases") =>
    request<SavedFilter[]>(`/projects/${projectId}/saved-filters?scope=${scope}`),
  createSavedFilter: (
    projectId: ID,
    body: { name: string; scope?: string; query: Record<string, string>; shared?: boolean },
  ) =>
    request<SavedFilter>(`/projects/${projectId}/saved-filters`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteSavedFilter: (id: ID) =>
    request<void>(`/saved-filters/${id}`, { method: "DELETE" }),

  // exports (CSV)
  exportRunCsv: (runId: ID) => requestText(`/runs/${runId}/export.csv`),
  exportCasesCsv: (projectId: ID, params: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== "" && v !== "all") qs.set(k, String(v));
    });
    const tail = qs.toString();
    return requestText(`/projects/${projectId}/cases/export.csv${tail ? `?${tail}` : ""}`);
  },

  // misc
  search: (q: string) =>
    request<TestCaseLite[]>(`/search?q=${encodeURIComponent(q)}`),
  recentAudit: (limit = 25) => request<AuditLog[]>(`/audit/recent?limit=${limit}`),
  projectReport: (projectId: ID) => request<ReportPayload>(`/projects/${projectId}/report`),
};
