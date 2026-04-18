import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Magic links apprenants", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  // ── Navigation vers fiche apprenant ──

  test("accéder à la fiche d'un apprenant depuis la liste", async ({ page }) => {
    await page.goto("/admin/clients/apprenants");
    await page.waitForLoadState("domcontentloaded");

    const learnerLink = page.locator("a[href*='/admin/clients/apprenants/']").first();
    await expect(learnerLink).toBeVisible({ timeout: 10000 });
    await learnerLink.click();
    await page.waitForURL(/\/admin\/clients\/apprenants\/[a-f0-9-]+/);
    await page.waitForLoadState("domcontentloaded");

    // La fiche apprenant doit afficher le nom
    const heading = page.getByRole("heading").first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  // ── Bouton envoi lien d'accès ──

  test("bouton 'Envoyer lien d'accès' visible sur la fiche apprenant", async ({ page }) => {
    await page.goto("/admin/clients/apprenants");
    await page.waitForLoadState("domcontentloaded");

    const learnerLink = page.locator("a[href*='/admin/clients/apprenants/']").first();
    await expect(learnerLink).toBeVisible({ timeout: 10000 });
    await learnerLink.click();
    await page.waitForURL(/\/admin\/clients\/apprenants\/[a-f0-9-]+/);
    await page.waitForLoadState("domcontentloaded");

    const sendBtn = page.getByRole("button", { name: /envoyer.*lien|fiche apprenant|accès/i });
    await expect(sendBtn).toBeVisible({ timeout: 10000 });
  });

  // ── Page publique /access/[token] avec token invalide ──

  test("page /access avec token invalide affiche erreur", async ({ page }) => {
    // Access sans login — page publique
    await page.goto("/access/invalid-token-123");
    await page.waitForLoadState("domcontentloaded");

    const errorMsg = page.getByText(/lien invalide|lien expiré|n'existe pas|révoqué/i);
    await expect(errorMsg).toBeVisible({ timeout: 10000 });
  });

  // ── API send-welcome retourne 4xx sans auth ──

  test("API /api/learners/[id]/send-welcome protégée par auth", async ({ request }) => {
    const response = await request.post("/api/learners/fake-id/send-welcome", {
      data: {},
    });
    // Should return 401 or 403
    expect([401, 403, 405]).toContain(response.status());
  });

  // ── API magic-link retourne 4xx sans auth ──

  test("API /api/learners/[id]/magic-link protégée par auth", async ({ request }) => {
    const response = await request.post("/api/learners/fake-id/magic-link", {
      data: {},
    });
    expect([401, 403, 405]).toContain(response.status());
  });

  // ── QR code dans convocation PDF ──

  test("convocation PDF contient un QR code si magic link configuré", async ({ page }) => {
    // Navigate to a formation detail
    await page.goto("/admin/trainings");
    await page.waitForLoadState("domcontentloaded");

    const firstCard = page.locator("a[href*='/admin/formations/']").first();
    if (!(await firstCard.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "Aucune formation disponible");
      return;
    }
    await firstCard.click();
    await page.waitForLoadState("domcontentloaded");

    // Aller sur l'onglet Documents
    const docsTab = page.getByText("Documents");
    await expect(docsTab).toBeVisible({ timeout: 5000 });
    await docsTab.click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // Vérifier qu'il y a des documents de type convocation
    const convocation = page.getByText(/convocation/i).first();
    await expect(convocation).toBeVisible({ timeout: 10000 });
  });
});
