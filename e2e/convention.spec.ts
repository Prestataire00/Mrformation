import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Convention & Documents", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Page formations accessible", async ({ page }) => {
    await page.goto("/admin/sessions");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10000 });
  });

  test("Page documents accessible avec modèles par défaut", async ({ page }) => {
    await page.goto("/admin/documents");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=Convention").or(page.locator("text=Convocation"))).toBeVisible({ timeout: 10000 });
  });

  test("Bouton Utiliser ouvre le dialog de génération", async ({ page }) => {
    await page.goto("/admin/documents");
    await page.waitForLoadState("networkidle");

    const useBtn = page.locator("button").filter({ hasText: "Utiliser" }).first();
    if (await useBtn.isVisible()) {
      await useBtn.click();
      await expect(page.locator("text=Générer").or(page.locator("text=Nom du document"))).toBeVisible({ timeout: 5000 });
    }
  });
});
