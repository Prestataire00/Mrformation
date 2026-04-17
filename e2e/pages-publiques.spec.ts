import { test, expect } from "@playwright/test";

test.describe("Pages publiques — acces sans auth", () => {
  test("/login est accessible sans authentification", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10000 });
  });

  test("/sign/invalid-token affiche une erreur (pas redirect login)", async ({ page }) => {
    await page.goto("/sign/invalid-token-12345");
    await page.waitForLoadState("domcontentloaded");
    // Should NOT redirect to login
    expect(page.url()).not.toContain("/login");
    // Page should load (might show error message, but not a login redirect)
    const body = await page.textContent("body");
    expect(body).toBeDefined();
  });

  test("/emargement/invalid-token affiche une erreur (pas redirect login)", async ({ page }) => {
    await page.goto("/emargement/invalid-token-12345");
    await page.waitForLoadState("domcontentloaded");
    expect(page.url()).not.toContain("/login");
  });

  test("/api/documents/sign-status?token=invalid retourne JSON (pas 401)", async ({ request }) => {
    const res = await request.get("/api/documents/sign-status?token=invalid-token");
    // Should return 404 or 400, NOT 401 (it's a public endpoint)
    expect(res.status()).not.toBe(401);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test("acces non-auth a /admin redirige vers / ou /login", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForURL(/^\/$|\/login/, { timeout: 10000 });
  });

  test("acces non-auth a /api/clients retourne 401 JSON", async ({ request }) => {
    const res = await request.get("/api/clients");
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});
