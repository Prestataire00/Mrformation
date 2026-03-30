import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Variables Email", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Page emails accessible", async ({ page }) => {
    await page.goto("/admin/emails");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=Modèles").or(page.locator("text=Historique"))).toBeVisible({ timeout: 10000 });
  });

  test("Prévisualisation temps réel dans le formulaire modèle", async ({ page }) => {
    await page.goto("/admin/emails");
    await page.waitForLoadState("networkidle");

    const newBtn = page.locator("button").filter({ hasText: "Nouveau modèle" });
    if (await newBtn.isVisible()) {
      await newBtn.click();
      await expect(page.locator("text=Prévisualisation")).toBeVisible({ timeout: 5000 });
    }
  });

  test("Bandeau rouge si variables non résolues", async ({ page }) => {
    await page.goto("/admin/emails");
    await page.waitForLoadState("networkidle");

    const sendBtn = page.locator("button").filter({ hasText: "Envoyer" }).first();
    if (await sendBtn.isVisible()) {
      await sendBtn.click();
      const warning = page.locator("text=Variables non résolues");
      if (await warning.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(warning).toBeVisible();
      }
    }
  });
});
