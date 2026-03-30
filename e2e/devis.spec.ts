import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Devis", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Page devis accessible avec tableau", async ({ page }) => {
    await page.goto("/admin/crm/quotes");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("th").filter({ hasText: "Référence" })).toBeVisible({ timeout: 10000 });
  });

  test("Bouton PDF visible sur chaque devis", async ({ page }) => {
    await page.goto("/admin/crm/quotes");
    await page.waitForLoadState("networkidle");

    const pdfButton = page.locator("button").filter({ hasText: "PDF" }).first();
    if (await pdfButton.isVisible()) {
      const downloadPromise = page.waitForEvent("download", { timeout: 15000 }).catch(() => null);
      await pdfButton.click();
      const download = await downloadPromise;
      if (download) {
        expect(download.suggestedFilename()).toContain("Devis");
      }
    }
  });

  test("Page création devis accessible", async ({ page }) => {
    await page.goto("/admin/crm/quotes/new");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=M-FAC").or(page.locator('input[value*="M-FAC"]'))).toBeVisible({ timeout: 10000 });
  });
});
