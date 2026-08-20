// Maps app routes to the help articles most relevant on that page —
// surfaced as "Suggested for this page" when the help panel opens.
// Order matters: the first matching pattern wins, so more specific
// routes come before their parents.

const ROUTE_HELP: Array<{ pattern: RegExp; articles: string[] }> = [
  { pattern: /^\/search/, articles: ["global-search", "finding-filtering"] },
  { pattern: /^\/runs/, articles: ["run-lifecycle", "creating-runs", "executing-tests"] },
  { pattern: /^\/admin\/templates/, articles: ["case-templates", "authoring-cases"] },
  { pattern: /^\/admin/, articles: ["admin-audit", "automation-tracking", "case-templates"] },
  { pattern: /^\/projects\/[^/]+\/overview/, articles: ["verify-tour", "folder-tree", "reports-overview"] },
  { pattern: /^\/projects\/[^/]+\/cases\/new/, articles: ["authoring-cases", "case-templates", "case-parameters"] },
  { pattern: /^\/projects\/[^/]+\/cases\/[^/]+\/edit/, articles: ["authoring-cases", "case-parameters", "automation-tracking"] },
  { pattern: /^\/projects\/[^/]+\/cases\/[^/]+\/history/, articles: ["case-detail-extras", "authoring-cases"] },
  { pattern: /^\/projects\/[^/]+\/cases\/[^/]+/, articles: ["case-detail-extras", "case-lifecycle", "automation-tracking"] },
  { pattern: /^\/projects\/[^/]+\/cases/, articles: ["folder-tree", "finding-filtering", "bulk-editing"] },
  { pattern: /^\/projects\/[^/]+\/runs\/new/, articles: ["creating-runs", "case-parameters"] },
  { pattern: /^\/projects\/[^/]+\/runs\/[^/]+\/execute/, articles: ["executing-tests", "execution-details", "case-parameters"] },
  { pattern: /^\/projects\/[^/]+\/runs\/[^/]+/, articles: ["run-lifecycle", "rerun-clone", "executing-tests"] },
  { pattern: /^\/projects\/[^/]+\/runs/, articles: ["creating-runs", "run-lifecycle", "finding-filtering"] },
  { pattern: /^\/projects\/[^/]+\/reports/, articles: ["reports-overview", "automation-candidates", "automation-tracking"] },
  { pattern: /^\/projects\/[^/]+\/settings/, articles: ["members-roles", "projects-basics"] },
  { pattern: /^\/$/, articles: ["projects-basics", "verify-tour", "global-search"] },
];

export function helpArticlesFor(pathname: string): string[] {
  return ROUTE_HELP.find((r) => r.pattern.test(pathname))?.articles ?? ["verify-tour"];
}

// Every article id referenced by the map (useful for sanity checks).
export function allMappedArticleIds(): string[] {
  return [...new Set(ROUTE_HELP.flatMap((r) => r.articles))];
}
