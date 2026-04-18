import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Import facture externe IA", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  // ── Navigation vers les finances d'une formation ──

  test("onglet Finances visible dans le détail formation", async ({ page }) => {
    await page.goto("/admin/trainings");
    await page.waitForLoadState("domcontentloaded");

    const firstCard = page.locator("a[href*='/admin/formations/']").first();
    if (!(await firstCard.isVisible({ timeout: 8000 }).catch(() => false))) {
      test.skip(true, "Aucune formation disponible");
      return;
    }
    await firstCard.click();
    await page.waitForLoadState("domcontentloaded");

    const financesTab = page.getByText("Finances");
    await expect(financesTab).toBeVisible({ timeout: 10000 });
  });

  // ── Onglet Finances contient les sections facturation ──

  test("onglet Finances affiche les sections de facturation", async ({ page }) => {
    await page.goto("/admin/trainings");
    await page.waitForLoadState("domcontentloaded");

    const firstCard = page.locator("a[href*='/admin/formations/']").first();
    if (!(await firstCard.isVisible({ timeout: 8000 }).catch(() => false))) {
      test.skip(true, "Aucune formation disponible");
      return;
    }
    await firstCard.click();
    await page.waitForLoadState("domcontentloaded");

    await page.getByText("Finances").click();
    await page.waitForLoadState("domcontentloaded");

    const factures = page.getByText(/facture|facturation|import/i).first();
    await expect(factures).toBeVisible({ timeout: 10000 });
  });

  // ── Bouton import facture visible ──

  test("bouton import facture PDF visible dans Finances", async ({ page }) => {
    await page.goto("/admin/trainings");
    await page.waitForLoadState("domcontentloaded");

    const firstCard = page.locator("a[href*='/admin/formations/']").first();
    if (!(await firstCard.isVisible({ timeout: 8000 }).catch(() => false))) {
      test.skip(true, "Aucune formation disponible");
      return;
    }
    await firstCard.click();
    await page.waitForLoadState("domcontentloaded");

    await page.getByText("Finances").click();
    await page.waitForLoadState("domcontentloaded");

    const importBtn = page.getByRole("button", { name: /import|importer|upload/i }).first();
    await expect(importBtn).toBeVisible({ timeout: 10000 });
  });

  // ── Page factures globales ──

  test("page /admin/reports/factures accessible", async ({ page }) => {
    await page.goto("/admin/reports/factures");
    await page.waitForLoadState("domcontentloaded");

    const heading = page.getByText(/facture/i).first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  // ── API parse-invoice protégée ──

  test("API /api/ai/parse-invoice protégée par auth", async ({ request }) => {
    const response = await request.post("/api/ai/parse-invoice", {
      data: {},
    });
    expect([401, 403]).toContain(response.status());
  });

  // ── API import factures protégée ──

  test("API /api/formations/[id]/invoices/import protégée par auth", async ({ request }) => {
    const response = await request.post("/api/formations/fake-id/invoices/import", {
      data: {},
    });
    expect([401, 403]).toContain(response.status());
  });
});
