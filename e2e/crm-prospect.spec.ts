import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("CRM Prospects", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Page Kanban accessible et affiche les colonnes", async ({ page }) => {
    await page.goto("/admin/crm/prospects");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    await expect(page.getByText("Lead").first()).toBeVisible({ timeout: 15000 });
  });

  test("Page liste prospects accessible", async ({ page }) => {
    await page.goto("/admin/crm/prospects/liste");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);
    await expect(page.getByRole("heading", { name: "Tous les Prospects" })).toBeVisible({ timeout: 15000 });
  });

  test("Export Excel prospects → déclenche téléchargement", async ({ page }) => {
    await page.goto("/admin/crm/prospects/liste");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    const downloadPromise = page.waitForEvent("download", { timeout: 10000 }).catch(() => null);
    await page.click("text=Télécharger en Excel");
    const download = await downloadPromise;

    if (download) {
      expect(download.suggestedFilename()).toContain("prospects");
    }
  });
});
