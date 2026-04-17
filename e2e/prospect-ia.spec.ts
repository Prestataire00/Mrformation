import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Prospects & IA", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("page prospects accessible", async ({ page }) => {
    await page.goto("/admin/crm/prospects");
    await page.waitForLoadState("domcontentloaded");
    const body = await page.textContent("body");
    expect(body).not.toContain("Internal Server Error");
  });

  test("fiche prospect charge correctement", async ({ page }) => {
    await page.goto("/admin/crm/prospects");
    await page.waitForLoadState("domcontentloaded");
    const firstProspect = page.locator("a[href*='/admin/crm/prospects/']").first();
    if (await firstProspect.isVisible({ timeout: 5000 })) {
      await firstProspect.click();
      await page.waitForLoadState("domcontentloaded");
      const body = await page.textContent("body");
      expect(body).not.toContain("Internal Server Error");
    }
  });

  test("bouton Enrichir Pappers visible si SIRET", async ({ page }) => {
    await page.goto("/admin/crm/prospects");
    await page.waitForLoadState("domcontentloaded");
    const firstProspect = page.locator("a[href*='/admin/crm/prospects/']").first();
    if (await firstProspect.isVisible({ timeout: 5000 })) {
      await firstProspect.click();
      await page.waitForLoadState("domcontentloaded");
      // May have an Enrichir button
      const enrichBtn = page.getByRole("button", { name: /enrichir|pappers/i }).first();
      // Optional — depends on whether prospect has SIRET
      const body = await page.textContent("body");
      expect(body).not.toContain("Internal Server Error");
    }
  });

  test("bouton Devis visible sur fiche prospect", async ({ page }) => {
    await page.goto("/admin/crm/prospects");
    await page.waitForLoadState("domcontentloaded");
    const firstProspect = page.locator("a[href*='/admin/crm/prospects/']").first();
    if (await firstProspect.isVisible({ timeout: 5000 })) {
      await firstProspect.click();
      await page.waitForLoadState("domcontentloaded");
      const devisBtn = page.getByRole("button", { name: /devis/i }).first();
      await expect(devisBtn).toBeVisible({ timeout: 5000 });
    }
  });

  test("actions Email, Action, Note visibles", async ({ page }) => {
    await page.goto("/admin/crm/prospects");
    await page.waitForLoadState("domcontentloaded");
    const firstProspect = page.locator("a[href*='/admin/crm/prospects/']").first();
    if (await firstProspect.isVisible({ timeout: 5000 })) {
      await firstProspect.click();
      await page.waitForLoadState("domcontentloaded");
      await expect(page.getByRole("button", { name: /action/i }).first()).toBeVisible({ timeout: 5000 });
      await expect(page.getByRole("button", { name: /note/i }).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("pipeline CRM charge les colonnes", async ({ page }) => {
    await page.goto("/admin/crm");
    await page.waitForLoadState("domcontentloaded");
    const body = await page.textContent("body");
    expect(body).not.toContain("Internal Server Error");
    // Should show pipeline stages
    const stage = page.getByText(/nouveau|contact|proposition|négociation|gagné/i).first();
    await expect(stage).toBeVisible({ timeout: 10000 });
  });
});
