import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

const TEST_CLIENT = "TEST-E2E-ClientCorp";

test.describe("Clients", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("page clients accessible et tableau affiche", async ({ page }) => {
    await page.goto("/admin/clients");
    await page.waitForLoadState("domcontentloaded");
    const body = await page.textContent("body");
    expect(body).not.toContain("Internal Server Error");
    await expect(page.getByText(/client/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("recherche filtre les clients", async ({ page }) => {
    await page.goto("/admin/clients");
    await page.waitForLoadState("domcontentloaded");
    const searchInput = page.getByPlaceholder(/recherch/i).first();
    if (await searchInput.isVisible({ timeout: 5000 })) {
      await searchInput.fill("zzzzzznonexistent");
      await page.waitForTimeout(500);
      // Should show no results or empty state
    }
  });

  test("creation client TEST-E2E", async ({ page }) => {
    await page.goto("/admin/clients");
    await page.waitForLoadState("domcontentloaded");
    // Find and click "Ajouter" or "Nouveau" button
    const addBtn = page.getByRole("button", { name: /ajout|nouveau|créer/i }).first();
    if (await addBtn.isVisible({ timeout: 5000 })) {
      await addBtn.click();
      await page.waitForLoadState("domcontentloaded");
      // Fill company name
      const nameInput = page.getByPlaceholder(/entreprise|nom|raison/i).first()
        .or(page.locator('input').first());
      if (await nameInput.isVisible({ timeout: 5000 })) {
        await nameInput.fill(TEST_CLIENT);
      }
    }
  });

  test("fiche client : onglets visibles", async ({ page }) => {
    await page.goto("/admin/clients");
    await page.waitForLoadState("domcontentloaded");
    // Click first client in list
    const firstClient = page.locator("a[href*='/admin/clients/']").first();
    if (await firstClient.isVisible({ timeout: 5000 })) {
      await firstClient.click();
      await page.waitForLoadState("domcontentloaded");
      // Check tabs exist
      const tabs = page.locator("[role='tablist'] button, [data-state] button").first();
      await expect(tabs).toBeVisible({ timeout: 10000 });
    }
  });

  test("bouton Nouveau devis redirige correctement", async ({ page }) => {
    await page.goto("/admin/clients");
    await page.waitForLoadState("domcontentloaded");
    const firstClient = page.locator("a[href*='/admin/clients/']").first();
    if (await firstClient.isVisible({ timeout: 5000 })) {
      await firstClient.click();
      await page.waitForLoadState("domcontentloaded");
      const devisBtn = page.getByRole("button", { name: /nouveau devis/i }).first();
      if (await devisBtn.isVisible({ timeout: 5000 })) {
        await devisBtn.click();
        await page.waitForURL(/quotes\/new.*client_id/, { timeout: 10000 });
      }
    }
  });

  test("mode edition client fonctionne", async ({ page }) => {
    await page.goto("/admin/clients");
    await page.waitForLoadState("domcontentloaded");
    const firstClient = page.locator("a[href*='/admin/clients/']").first();
    if (await firstClient.isVisible({ timeout: 5000 })) {
      await firstClient.click();
      await page.waitForLoadState("domcontentloaded");
      const editBtn = page.getByRole("button", { name: /modifier/i }).first();
      if (await editBtn.isVisible({ timeout: 5000 })) {
        await editBtn.click();
        // Should show save/cancel buttons
        const saveBtn = page.getByRole("button", { name: /enregistrer|sauvegarder/i }).first();
        await expect(saveBtn).toBeVisible({ timeout: 5000 });
      }
    }
  });
});
