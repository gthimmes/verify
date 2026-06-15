import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { CommandKLink } from "@/components/shell/CommandKLink";
import { ProjectSwitcher } from "@/components/shell/ProjectSwitcher";
import { api } from "@/lib/api";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

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

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
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
              <div
                className="flex items-center gap-2 text-sm text-(--muted)"
                aria-label="current user"
              >
                <span
                  aria-hidden
                  className="h-7 w-7 rounded-full bg-(--accent-soft) text-(--accent) font-semibold text-xs flex items-center justify-center"
                >
                  DA
                </span>
                <span>Demo Admin</span>
              </div>
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
