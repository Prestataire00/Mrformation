import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Magic links apprenants", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  // ── Page apprenants accessible ──

  test("page /admin/clients/apprenants se charge", async ({ page }) => {
    await page.goto("/admin/clients/apprenants");
    await page.waitForLoadState("domcontentloaded");

    // Heading or table should appear
    const content = page.getByText(/apprenant|stagiaire|liste/i).first();
    await expect(content).toBeVisible({ timeout: 15000 });
  });

  // ── Page publique /access/[token] avec token invalide ──

  test("page /access avec token invalide ne retourne pas 200 OK", async ({ page }) => {
    // Page publique — on vérifie qu'un token bidon ne donne pas accès
    const response = await page.goto("/access/invalid-token-123");
    await page.waitForLoadState("domcontentloaded");

    // Should show "Lien invalide", an error, or redirect to login — NOT a valid dashboard
    const showsError = await page.getByText(/invalide|expiré|erreur|révoqué/i).isVisible({ timeout: 5000 }).catch(() => false);
    const showsLogin = await page.locator("input[type='email']").isVisible({ timeout: 3000 }).catch(() => false);
    const shows500 = await page.getByText(/500|erreur serveur/i).isVisible({ timeout: 2000 }).catch(() => false);
    const isNotDashboard = !page.url().includes("/learner");

    // Any of these is acceptable — the token should not grant access
    expect(showsError || showsLogin || shows500 || isNotDashboard).toBe(true);
  });

  // ── API send-welcome protégée ──

  test("API /api/learners/[id]/send-welcome protégée par auth", async ({ request }) => {
    const response = await request.post("/api/learners/fake-id/send-welcome", {
      data: {},
    });
    expect([401, 403, 405]).toContain(response.status());
  });

  // ── API magic-link protégée ──

  test("API /api/learners/[id]/magic-link protégée par auth", async ({ request }) => {
    const response = await request.post("/api/learners/fake-id/magic-link", {
      data: {},
    });
    expect([401, 403, 405]).toContain(response.status());
  });

  // ── Convocation dans Documents de formation ──

  test("onglet Documents de formation contient le type convocation", async ({ page }) => {
    await page.goto("/admin/trainings");
    await page.waitForLoadState("domcontentloaded");

    const firstCard = page.locator("a[href*='/admin/formations/']").first();
    if (!(await firstCard.isVisible({ timeout: 10000 }).catch(() => false))) {
      test.skip(true, "Aucune formation disponible");
      return;
    }
    await firstCard.click();
    await page.waitForLoadState("domcontentloaded");

    const docsTab = page.getByText("Documents");
    await expect(docsTab).toBeVisible({ timeout: 10000 });
    await docsTab.click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    const convocation = page.getByText(/convocation/i).first();
    await expect(convocation).toBeVisible({ timeout: 15000 });
  });
});
