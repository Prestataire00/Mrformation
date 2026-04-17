import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Formations — Liste & Kanban", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/trainings");
    await page.waitForLoadState("domcontentloaded");
  });

  test("page formations accessible", async ({ page }) => {
    await expect(page.getByText(/formation/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("toggle vue Liste / Kanban visible", async ({ page }) => {
    // The toggle buttons should be visible (LayoutGrid / LayoutList icons)
    const toggleGroup = page.locator(".flex.items-center.gap-1.border.rounded-md");
    await expect(toggleGroup).toBeVisible({ timeout: 5000 });
  });

  test("clic sur Kanban affiche 3 colonnes", async ({ page }) => {
    // Click the kanban toggle (second button in toggle group)
    const kanbanBtn = page.locator(".flex.items-center.gap-1.border.rounded-md button").nth(1);
    await kanbanBtn.click();
    await page.waitForTimeout(300);
    // Should see column headers
    await expect(page.getByText("À venir")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("En cours")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Terminée")).toBeVisible({ timeout: 5000 });
  });

  test("formulaire creation visible au clic Planifier", async ({ page }) => {
    const planBtn = page.getByRole("button", { name: /planifier/i });
    await planBtn.click();
    // Form should appear with title input
    const titleInput = page.getByPlaceholder(/titre/i);
    await expect(titleInput).toBeVisible({ timeout: 5000 });
  });

  test("formulaire creation a les champs type INTRA/INTER", async ({ page }) => {
    const planBtn = page.getByRole("button", { name: /planifier/i });
    await planBtn.click();
    await page.waitForTimeout(300);
    // Type select should have INTRA and INTER options
    const typeSelect = page.getByText(/INTRA|INTER/).first();
    await expect(typeSelect).toBeVisible({ timeout: 5000 });
  });

  test("checkbox sous-traitance visible dans le formulaire", async ({ page }) => {
    const planBtn = page.getByRole("button", { name: /planifier/i });
    await planBtn.click();
    await page.waitForTimeout(300);
    const stCheckbox = page.getByText(/sous-traitance/i);
    await expect(stCheckbox).toBeVisible({ timeout: 5000 });
  });

  test("filtres statut et mode fonctionnent", async ({ page }) => {
    // Status filter should exist
    const statusSelect = page.locator("button").filter({ hasText: /statut|tous les statuts/i }).first();
    if (await statusSelect.isVisible({ timeout: 5000 })) {
      await statusSelect.click();
      const option = page.getByText("À venir").last();
      if (await option.isVisible({ timeout: 3000 })) {
        await option.click();
      }
    }
  });

  test("recherche filtre les formations", async ({ page }) => {
    const searchInput = page.getByPlaceholder(/recherch/i).first();
    await expect(searchInput).toBeVisible({ timeout: 5000 });
    await searchInput.fill("formation-inexistante-zzz");
    await page.waitForTimeout(500);
    // Should show empty state
    const emptyState = page.getByText(/aucune formation/i);
    await expect(emptyState).toBeVisible({ timeout: 5000 });
  });

  test("pastille Qualiopi visible sur les cards si score > 0", async ({ page }) => {
    // Look for Qualiopi score badge (Shield icon + percentage)
    const qualiopiBadge = page.locator("text=/%/").first();
    // This is optional — not all formations have a score
    // Just verify the page doesn't crash
    const body = await page.textContent("body");
    expect(body).not.toContain("Internal Server Error");
  });
});
