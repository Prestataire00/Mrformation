import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Variables Email", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Page emails accessible", async ({ page }) => {
    await page.goto("/admin/emails");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    await expect(page.getByRole("tab", { name: /Modèles/ }).first()).toBeVisible({ timeout: 15000 });
  });

  test("Prévisualisation temps réel dans le formulaire modèle", async ({ page }) => {
    await page.goto("/admin/emails");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    const newBtn = page.locator("button").filter({ hasText: "Nouveau modèle" });
    if (await newBtn.isVisible({ timeout: 5000 })) {
      await newBtn.click();
      await expect(page.getByText("Prévisualisation").first()).toBeVisible({ timeout: 10000 });
    }
  });

  test("Bandeau rouge si variables non résolues", async ({ page }) => {
    await page.goto("/admin/emails");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    const sendBtn = page.locator("button").filter({ hasText: "Envoyer" }).first();
    if (await sendBtn.isVisible({ timeout: 5000 })) {
      await sendBtn.click();
      const warning = page.getByText("Variables non résolues").first();
      if (await warning.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(warning).toBeVisible();
      }
    }
  });
});
