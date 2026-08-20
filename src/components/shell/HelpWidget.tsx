"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { HelpNavigator } from "help-navigator";
import { helpContent } from "@/help/content";
import { helpArticlesFor } from "@/help/context";

// Accent per theme, matching --accent in globals.css.
const ACCENT = { light: "#4f46e5", dark: "#818cf8" } as const;

// Mounts the in-app help center (floating launcher bottom-right, F1 to
// toggle), keeps "Suggested for this page" in sync with the route, and
// follows the app's dark-mode class so the panel matches the palette.
export function HelpWidget() {
  const pathname = usePathname();
  const pathnameRef = useRef<string>("/");
  const helpRef = useRef<HelpNavigator | null>(null);

  useEffect(() => {
    const isDark = () => document.documentElement.classList.contains("dark");

    const mount = (theme: "light" | "dark") => {
      helpRef.current?.destroy();
      const help = HelpNavigator.init({
        content: helpContent,
        theme,
        accentColor: ACCENT[theme],
        position: "bottom-right",
        hotkey: "F1",
        texts: { panelTitle: "Verify Help" },
      });
      help.setContext(helpArticlesFor(pathnameRef.current ?? "/"));
      helpRef.current = help;
    };

    let dark = isDark();
    mount(dark ? "dark" : "light");

    // The ThemeToggle swaps a `dark` class on <html>; remount the widget
    // with the matching theme + accent when it changes.
    const observer = new MutationObserver(() => {
      if (isDark() !== dark) {
        dark = !dark;
        mount(dark ? "dark" : "light");
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      observer.disconnect();
      helpRef.current?.destroy();
      helpRef.current = null;
    };
  }, []);

  useEffect(() => {
    pathnameRef.current = pathname ?? "/";
    helpRef.current?.setContext(helpArticlesFor(pathnameRef.current));
  }, [pathname]);

  return null;
}
