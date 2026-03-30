import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Convention & Documents", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Page formations accessible", async ({ page }) => {
    await page.goto("/admin/sessions");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 15000 });
  });

  test("Page documents accessible avec modèles par défaut", async ({ page }) => {
    await page.goto("/admin/documents");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    await expect(page.getByText("Convention de formation").first()).toBeVisible({ timeout: 15000 });
  });

  test("Bouton Utiliser ouvre le dialog de génération", async ({ page }) => {
    await page.goto("/admin/documents");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    const useBtn = page.locator("button").filter({ hasText: "Utiliser" }).first();
    if (await useBtn.isVisible({ timeout: 5000 })) {
      await useBtn.click();
      await expect(page.getByRole("heading", { name: /Générer/ })).toBeVisible({ timeout: 10000 });
    }
  });
});
