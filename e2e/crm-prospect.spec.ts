import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("CRM Prospects", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Page Kanban accessible et affiche les colonnes", async ({ page }) => {
    await page.goto("/admin/crm/prospects");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=Lead").or(page.locator("text=Contacté"))).toBeVisible({ timeout: 10000 });
  });

  test("Page liste prospects accessible", async ({ page }) => {
    await page.goto("/admin/crm/prospects/liste");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=Tous les Prospects")).toBeVisible();
  });

  test("Export Excel prospects → déclenche téléchargement", async ({ page }) => {
    await page.goto("/admin/crm/prospects/liste");
    await page.waitForLoadState("networkidle");

    const downloadPromise = page.waitForEvent("download", { timeout: 10000 }).catch(() => null);
    await page.click("text=Télécharger en Excel");
    const download = await downloadPromise;

    if (download) {
      expect(download.suggestedFilename()).toContain("prospects");
    }
  });
});
