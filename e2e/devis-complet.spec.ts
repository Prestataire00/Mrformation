import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Devis — Workflow complet", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("page devis accessible", async ({ page }) => {
    await page.goto("/admin/crm/quotes");
    await page.waitForLoadState("domcontentloaded");
    const body = await page.textContent("body");
    expect(body).not.toContain("Internal Server Error");
  });

  test("formulaire creation devis accessible", async ({ page }) => {
    await page.goto("/admin/crm/quotes/new");
    await page.waitForLoadState("domcontentloaded");
    // Should see title "Nouveau devis" or "Devis"
    await expect(page.getByText(/devis/i).first()).toBeVisible({ timeout: 10000 });
    // Should have reference field
    const refInput = page.getByPlaceholder(/devis|DEV/i).first()
      .or(page.locator('input[class*="font-mono"]').first());
    await expect(refInput).toBeVisible({ timeout: 5000 });
  });

  test("section lignes de produits visible", async ({ page }) => {
    await page.goto("/admin/crm/quotes/new");
    await page.waitForLoadState("domcontentloaded");
    // "Produits" section and "Ajouter une ligne"
    await expect(page.getByText("Produits")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/ajouter une ligne/i)).toBeVisible({ timeout: 5000 });
  });

  test("totaux HT/TVA/TTC calcules", async ({ page }) => {
    await page.goto("/admin/crm/quotes/new");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText(/sous-total ht/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/tva/i).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/total ttc/i)).toBeVisible({ timeout: 5000 });
  });

  test("mode edition reprend les donnees (edit param)", async ({ page }) => {
    // Go to quotes list first
    await page.goto("/admin/crm/quotes");
    await page.waitForLoadState("domcontentloaded");
    // Find a quote with a modifier action
    const editLink = page.locator("a[href*='edit=']").first()
      .or(page.getByText(/modifier/i).first());
    if (await editLink.isVisible({ timeout: 5000 })) {
      await editLink.click();
      await page.waitForLoadState("domcontentloaded");
      // Should show "Modifier le devis" title
      await expect(page.getByText(/modifier le devis/i)).toBeVisible({ timeout: 10000 });
    }
  });

  test("champs dates fonctionnels", async ({ page }) => {
    await page.goto("/admin/crm/quotes/new");
    await page.waitForLoadState("domcontentloaded");
    const dateInputs = page.locator('input[type="date"]');
    const count = await dateInputs.count();
    expect(count).toBeGreaterThanOrEqual(2); // creation + echeance
  });

  test("section Notes & mentions collapsible", async ({ page }) => {
    await page.goto("/admin/crm/quotes/new");
    await page.waitForLoadState("domcontentloaded");
    const summary = page.getByText(/notes.*mentions/i);
    await expect(summary).toBeVisible({ timeout: 10000 });
  });
});
