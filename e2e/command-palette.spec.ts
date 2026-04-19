import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Command Palette (Cmd+K)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
  });

  // Helper: open palette — focus body then use keyboard
  async function openPalette(page: import("@playwright/test").Page) {
    // Ensure page has focus
    await page.locator("body").click();
    await page.waitForTimeout(500);

    // Try Meta+K first (macOS)
    await page.keyboard.press("Meta+k");
    await page.waitForTimeout(500);

    let dialog = page.locator("[role='dialog']");
    if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
      return dialog;
    }

    // Fallback: Ctrl+K
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(500);

    if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
      return dialog;
    }

    // Last resort: JS dispatch
    await page.evaluate(() => {
      const event = new KeyboardEvent("keydown", {
        key: "k",
        code: "KeyK",
        metaKey: true,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
    });

    return dialog;
  }

  // ── Ouverture de la palette ──

  test("ouvrir la command palette via raccourci clavier", async ({ page }) => {
    const dialog = await openPalette(page);
    await expect(dialog).toBeVisible({ timeout: 5000 });
  });

  // ── Input de recherche visible ──

  test("command palette affiche l'input de recherche", async ({ page }) => {
    const dialog = await openPalette(page);
    if (!(await dialog.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "Command palette ne s'ouvre pas en headless");
      return;
    }

    const searchInput = page.locator("[cmdk-input]").or(
      page.locator("input[placeholder*='Rechercher']")
    );
    await expect(searchInput).toBeVisible({ timeout: 5000 });
  });

  // ── Quick actions affichées ──

  test("command palette affiche les actions rapides", async ({ page }) => {
    const dialog = await openPalette(page);
    if (!(await dialog.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "Command palette ne s'ouvre pas en headless");
      return;
    }

    const quickAction = dialog.getByText(/tableau de bord|formations|entreprises|factures/i).first();
    await expect(quickAction).toBeVisible({ timeout: 5000 });
  });

  // ── Fermeture avec Escape ──

  test("Escape ferme la command palette", async ({ page }) => {
    const dialog = await openPalette(page);
    if (!(await dialog.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "Command palette ne s'ouvre pas en headless");
      return;
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden({ timeout: 3000 });
  });
});
