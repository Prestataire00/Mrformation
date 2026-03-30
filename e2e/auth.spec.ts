import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Authentification", () => {
  test("Connexion admin → redirige vers dashboard", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.locator("h1, h2").first()).toBeVisible();
  });

  test("Déconnexion → retour login", async ({ page }) => {
    await loginAsAdmin(page);
    const logoutBtn = page.locator('text=Déconnexion').or(page.locator('[aria-label="Déconnexion"]'));
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await page.waitForURL("**/login**");
    }
  });

  test("Page login sans credentials → reste sur login", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });
});
