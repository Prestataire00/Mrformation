import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Command Palette (Cmd+K)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin");
    await page.waitForLoadState("domcontentloaded");
  });

  // ── Ouverture avec Cmd+K ──

  test("Cmd+K ouvre la command palette", async ({ page }) => {
    await page.keyboard.press("Meta+k");

    const dialog = page.locator("[role='dialog']").or(page.locator("[cmdk-root]"));
    await expect(dialog).toBeVisible({ timeout: 5000 });
  });

  // ── Input de recherche visible ──

  test("command palette affiche l'input de recherche", async ({ page }) => {
    await page.keyboard.press("Meta+k");

    const searchInput = page.locator("[cmdk-input]").or(
      page.locator("input[placeholder*='Rechercher']")
    );
    await expect(searchInput).toBeVisible({ timeout: 5000 });
  });

  // ── Quick actions affichées ──

  test("command palette affiche les actions rapides", async ({ page }) => {
    await page.keyboard.press("Meta+k");

    const dialog = page.locator("[role='dialog']").or(page.locator("[cmdk-root]"));
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Quick actions
    const quickAction = dialog.getByText(/tableau de bord|formations|entreprises|factures/i).first();
    await expect(quickAction).toBeVisible({ timeout: 5000 });
  });

  // ── Recherche retourne des résultats ──

  test("saisir du texte dans la palette filtre les résultats", async ({ page }) => {
    await page.keyboard.press("Meta+k");

    const searchInput = page.locator("[cmdk-input]").or(
      page.locator("input[placeholder*='Rechercher']")
    );
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    // Type at least 2 chars to trigger search
    await searchInput.fill("fo");
    await page.waitForTimeout(500);

    // Should show results or "no results"
    const hasResults = await page.getByText(/formation|aucun résultat/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasResults).toBe(true);
  });

  // ── Fermeture avec Escape ──

  test("Escape ferme la command palette", async ({ page }) => {
    await page.keyboard.press("Meta+k");

    const dialog = page.locator("[role='dialog']").or(page.locator("[cmdk-root]"));
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden({ timeout: 3000 });
  });

  // ── Navigation via quick action ──

  test("cliquer sur 'Formations' dans les quick actions navigue vers /admin/trainings", async ({ page }) => {
    await page.keyboard.press("Meta+k");

    const dialog = page.locator("[role='dialog']").or(page.locator("[cmdk-root]"));
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const formationsAction = dialog.getByText(/formations/i).first();
    await expect(formationsAction).toBeVisible({ timeout: 5000 });
    await formationsAction.click();

    await page.waitForURL(/\/admin\/trainings|\/admin\/formations/, { timeout: 10000 });
  });

  // ── Ctrl+K fonctionne aussi (Windows/Linux) ──

  test("Ctrl+K ouvre aussi la command palette", async ({ page }) => {
    await page.keyboard.press("Control+k");

    const dialog = page.locator("[role='dialog']").or(page.locator("[cmdk-root]"));
    await expect(dialog).toBeVisible({ timeout: 5000 });
  });
});
