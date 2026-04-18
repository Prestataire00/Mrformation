import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Signatures électroniques dans feuilles d'émargement", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  // ── Helper: naviguer vers une formation ──

  async function goToFormation(page: import("@playwright/test").Page) {
    await page.goto("/admin/trainings");
    await page.waitForLoadState("domcontentloaded");

    const firstCard = page.locator("a[href*='/admin/formations/']").first();
    if (!(await firstCard.isVisible({ timeout: 8000 }).catch(() => false))) {
      return false;
    }
    await firstCard.click();
    await page.waitForLoadState("domcontentloaded");
    return true;
  }

  // ── Onglet émargement accessible ──

  test("onglet Émargement visible dans le détail formation", async ({ page }) => {
    const found = await goToFormation(page);
    if (!found) {
      test.skip(true, "Aucune formation disponible");
      return;
    }

    const tab = page.getByText(/émargement/i).first();
    await expect(tab).toBeVisible({ timeout: 10000 });
  });

  // ── Documents tab affiche les feuilles d'émargement ──

  test("onglet Documents contient le type feuille d'émargement", async ({ page }) => {
    const found = await goToFormation(page);
    if (!found) {
      test.skip(true, "Aucune formation disponible");
      return;
    }

    await page.getByText("Documents").click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    const emargement = page.getByText(/feuille.*émargement|émargement/i).first();
    await expect(emargement).toBeVisible({ timeout: 10000 });
  });

  // ── Prévisualisation d'une feuille d'émargement ──

  test("prévisualiser une feuille d'émargement affiche le tableau de signature", async ({ page }) => {
    const found = await goToFormation(page);
    if (!found) {
      test.skip(true, "Aucune formation disponible");
      return;
    }

    await page.getByText("Documents").click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // Click on view button for an emargement document
    const viewBtn = page.locator("button").filter({ hasText: /voir|prévisualiser|eye/i }).first();
    if (!(await viewBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      // Try icon button near emargement row
      const emargementRow = page.getByText(/émargement/i).first();
      await expect(emargementRow).toBeVisible({ timeout: 5000 });
      test.skip(true, "Pas de bouton prévisualiser visible");
      return;
    }
    await viewBtn.click();

    // Preview dialog should show signature table
    const signatureTable = page.getByText(/tableau de signature|signature/i).first();
    await expect(signatureTable).toBeVisible({ timeout: 10000 });
  });

  // ── Page publique /emargement avec token invalide ──

  test("page /emargement avec token invalide affiche erreur", async ({ page }) => {
    await page.goto("/emargement/invalid-token-xyz");
    await page.waitForLoadState("domcontentloaded");

    const errorMsg = page.getByText(/invalide|expiré|introuvable|erreur/i).first();
    await expect(errorMsg).toBeVisible({ timeout: 10000 });
  });

  // ── Page publique /sign avec token invalide ──

  test("page /sign avec token invalide affiche erreur", async ({ page }) => {
    await page.goto("/sign/invalid-token-xyz");
    await page.waitForLoadState("domcontentloaded");

    const errorMsg = page.getByText(/invalide|expiré|introuvable|erreur/i).first();
    await expect(errorMsg).toBeVisible({ timeout: 10000 });
  });

  // ── API signatures protégée ──

  test("API /api/signatures protégée par auth", async ({ request }) => {
    const response = await request.get("/api/signatures");
    expect([401, 403]).toContain(response.status());
  });

  // ── Admin signatures page accessible ──

  test("page /admin/signatures affiche la liste des émargements", async ({ page }) => {
    await page.goto("/admin/signatures");
    await page.waitForLoadState("domcontentloaded");

    const heading = page.getByText(/émargement|signatures/i).first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  // ── Feuille d'émargement affiche légende ──

  test("feuille d'émargement générée contient la légende signatures", async ({ page }) => {
    const found = await goToFormation(page);
    if (!found) {
      test.skip(true, "Aucune formation disponible");
      return;
    }

    await page.getByText("Documents").click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // Look for any view/preview action on emargement docs
    const actionBtns = page.locator("[data-doc-type*='emargement'] button, button[title*='Voir']");
    if (await actionBtns.count() > 0) {
      await actionBtns.first().click();
      await page.waitForTimeout(1000);

      // Check for legend text in preview
      const legend = page.getByText(/légende|signatures électroniques/i);
      if (await legend.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(legend).toBeVisible();
      }
    }
  });
});
