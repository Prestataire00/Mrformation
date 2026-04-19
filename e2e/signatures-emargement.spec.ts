import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Signatures électroniques dans feuilles d'émargement", () => {

  // ── Pages publiques (pas besoin d'auth) ──

  test("page /emargement avec token invalide affiche erreur", async ({ page }) => {
    await page.goto("/emargement/invalid-token-xyz");
    await page.waitForLoadState("domcontentloaded");

    const errorMsg = page.getByText(/invalide|expiré|introuvable|erreur|token/i).first();
    await expect(errorMsg).toBeVisible({ timeout: 10000 });
  });

  test("page /sign avec token invalide affiche erreur", async ({ page }) => {
    await page.goto("/sign/invalid-token-xyz");
    await page.waitForLoadState("domcontentloaded");

    const errorMsg = page.getByText(/invalide|expiré|introuvable|erreur|token/i).first();
    await expect(errorMsg).toBeVisible({ timeout: 10000 });
  });

  // ── API signatures protégée ──

  test("API /api/signatures protégée par auth", async ({ request }) => {
    const response = await request.get("/api/signatures");
    expect([401, 403]).toContain(response.status());
  });

  // ── Admin signatures page ──

  test("page /admin/signatures affiche la liste des émargements", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/signatures");
    await page.waitForLoadState("domcontentloaded");

    const heading = page.getByText(/émargement|signatures/i).first();
    await expect(heading).toBeVisible({ timeout: 15000 });
  });

  // ── Documents formation avec émargement ──

  test("onglet Documents de formation contient feuille d'émargement", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/trainings");
    await page.waitForLoadState("domcontentloaded");

    const firstCard = page.locator("a[href*='/admin/formations/']").first();
    if (!(await firstCard.isVisible({ timeout: 10000 }).catch(() => false))) {
      test.skip(true, "Aucune formation disponible");
      return;
    }
    await firstCard.click();
    await page.waitForLoadState("domcontentloaded");

    await page.getByText("Documents").click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    const emargement = page.getByText(/émargement/i).first();
    await expect(emargement).toBeVisible({ timeout: 15000 });
  });

  // ── Onglet Émargement visible ──

  test("onglet Émargement visible dans le détail formation", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/trainings");
    await page.waitForLoadState("domcontentloaded");

    const firstCard = page.locator("a[href*='/admin/formations/']").first();
    if (!(await firstCard.isVisible({ timeout: 10000 }).catch(() => false))) {
      test.skip(true, "Aucune formation disponible");
      return;
    }
    await firstCard.click();
    await page.waitForLoadState("domcontentloaded");

    const tab = page.getByText(/émargement/i).first();
    await expect(tab).toBeVisible({ timeout: 15000 });
  });
});
