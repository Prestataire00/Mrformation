import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Automatisation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("page automatisation accessible", async ({ page }) => {
    // Navigate to automation page (may be under formations or admin)
    await page.goto("/admin/trainings");
    await page.waitForLoadState("domcontentloaded");
    // First, navigate to a formation detail
    const firstCard = page.locator("a[href*='/admin/formations/']").first();
    if (await firstCard.isVisible({ timeout: 5000 })) {
      await firstCard.click();
      await page.waitForLoadState("domcontentloaded");
      const body = await page.textContent("body");
      expect(body).not.toContain("Internal Server Error");
    }
  });

  test("onglet Emails/Communication accessible", async ({ page }) => {
    await page.goto("/admin/emails");
    await page.waitForLoadState("domcontentloaded");
    const body = await page.textContent("body");
    expect(body).not.toContain("Internal Server Error");
    // Should see email interface
    await expect(page.getByText(/email|envoi|historique/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("bouton previsualiser email visible", async ({ page }) => {
    await page.goto("/admin/emails");
    await page.waitForLoadState("domcontentloaded");
    // Find compose/send button
    const composeBtn = page.getByRole("button", { name: /compos|envoy|nouveau/i }).first();
    if (await composeBtn.isVisible({ timeout: 5000 })) {
      await composeBtn.click();
      await page.waitForTimeout(500);
      const previewBtn = page.getByRole("button", { name: /prévisualiser/i });
      await expect(previewBtn).toBeVisible({ timeout: 5000 });
    }
  });
});
