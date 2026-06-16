import { test, expect } from "@playwright/test";

/**
 * E2E for the dark-mode toggle: cycles system → light → dark, applies the
 * `dark` class to <html> (which swaps the CSS variables), and persists the
 * choice across reloads with no flash (the inline script re-applies it).
 */

test("theme toggle cycles and persists dark mode", async ({ page }) => {
  await page.goto("/?list=1");

  const toggle = page.getByTestId("theme-toggle");
  await expect(toggle).toBeVisible();
  // Fresh context: no stored preference → "system".
  await expect(toggle).toHaveAttribute("data-theme-pref", "system");

  const html = page.locator("html");

  // system → light
  await toggle.click();
  await expect(toggle).toHaveAttribute("data-theme-pref", "light");
  await expect(html).not.toHaveClass(/dark/);

  // light → dark
  await toggle.click();
  await expect(toggle).toHaveAttribute("data-theme-pref", "dark");
  await expect(html).toHaveClass(/dark/);

  // The dark palette is actually applied (slate-950-ish background).
  const bg = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  expect(bg).toBe("rgb(11, 17, 32)");

  // Persists across a reload, with the class set before paint.
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByTestId("theme-toggle")).toHaveAttribute(
    "data-theme-pref",
    "dark",
  );
});
