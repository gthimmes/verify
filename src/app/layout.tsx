import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { cookies } from "next/headers";
import { CommandKLink } from "@/components/shell/CommandKLink";
import { ProjectSwitcher } from "@/components/shell/ProjectSwitcher";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { api } from "@/lib/api";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// Runs before paint so the stored theme is applied with no flash of the wrong
// palette. Defaults to following the OS when no explicit choice is stored.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export const metadata: Metadata = {
  title: "Verify — Test Case Management",
  description:
    "A lightweight system for organizing, executing, and tracking manual test cases.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // The switcher lives in the shared header, so load the (lightweight)
  // project list here.  Guard it: a header that throws would take down every
  // page, and the project list is non-essential chrome.
  const projects = await api
    .listProjects(false)
    .then((all) => all.map((p) => ({ id: p.id, key: p.key, name: p.name })))
    .catch(() => []);

  // Auth is additive: a session cookie means the user signed in with Google;
  // otherwise the API resolves to the demo user and we offer sign-in.
  const signedIn = (await cookies()).has("verify_session");
  const me = signedIn ? await api.me().catch(() => null) : null;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <header className="border-b border-(--border) bg-(--surface)">
          <div className="mx-auto max-w-[1400px] flex items-center gap-6 px-6 py-3">
            <Link
              href="/"
              className="flex items-center gap-2 font-semibold text-(--fg)"
            >
              <span
                aria-hidden
                className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-(--accent) text-white"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
              <span>Verify</span>
            </Link>
            <span aria-hidden className="h-5 w-px bg-(--border)" />
            <ProjectSwitcher projects={projects} />
            <nav className="flex items-center gap-1 text-sm">
              <Link
                href="/?list=1"
                className="px-3 py-1.5 rounded-md text-(--muted) hover:bg-(--accent-soft) hover:text-(--accent)"
              >
                Projects
              </Link>
              <Link
                href="/runs"
                className="px-3 py-1.5 rounded-md text-(--muted) hover:bg-(--accent-soft) hover:text-(--accent)"
              >
                Active runs
              </Link>
              <Link
                href="/admin"
                className="px-3 py-1.5 rounded-md text-(--muted) hover:bg-(--accent-soft) hover:text-(--accent)"
              >
                Admin
              </Link>
            </nav>
            <div className="ml-auto flex items-center gap-3">
              <CommandKLink />
              <ThemeToggle />
              {signedIn && me ? (
                <div
                  className="flex items-center gap-2 text-sm"
                  aria-label="current user"
                  data-testid="user-menu"
                >
                  <span
                    aria-hidden
                    className="h-7 w-7 rounded-full bg-(--accent-soft) text-(--accent) font-semibold text-xs flex items-center justify-center"
                  >
                    {initials(me.name)}
                  </span>
                  <span className="text-(--fg)">{me.name}</span>
                  <form action="/api/auth/logout" method="post">
                    <button
                      type="submit"
                      className="rounded-md px-2 py-1 text-xs text-(--muted) hover:bg-(--accent-soft) hover:text-(--accent)"
                      data-testid="logout-button"
                    >
                      Sign out
                    </button>
                  </form>
                </div>
              ) : (
                <a
                  href="/api/auth/google/login"
                  className="flex items-center gap-2 rounded-md border border-(--border) bg-(--surface) px-3 py-1.5 text-sm font-medium text-(--fg) hover:border-(--accent) hover:text-(--accent)"
                  data-testid="signin-button"
                >
                  <GoogleGlyph />
                  Sign in with Google
                </a>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-(--border) text-xs text-(--muted) bg-(--surface)">
          <div className="mx-auto max-w-[1400px] px-6 py-3 flex items-center justify-between">
            <span>Verify v1 · manual test catalog · automation-aware</span>
            <span>
              Press <span className="kbd">⌘</span> <span className="kbd">K</span> to search
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.6 2.4 30.1 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.1 5.3-4.6 6.9l7.1 5.5c4.1-3.8 6.5-9.4 6.5-16z" />
      <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C1 16.5 0 20.1 0 24s1 7.5 2.6 10.8l7.9-6.2z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.3-4.5 2.1-8.8 2.1-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.2C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}
