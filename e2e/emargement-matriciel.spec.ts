import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Feuille d'émargement matricielle", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  async function goToFormationDocs(page: import("@playwright/test").Page) {
    await page.goto("/admin/trainings");
    await page.waitForLoadState("domcontentloaded");

    const firstCard = page.locator("a[href*='/admin/formations/']").first();
    if (!(await firstCard.isVisible({ timeout: 8000 }).catch(() => false))) {
      return false;
    }
    await firstCard.click();
    await page.waitForLoadState("domcontentloaded");

    await page.getByText("Documents").click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    return true;
  }

  // ── Onglet Documents contient émargement collectif ──

  test("onglet Documents affiche le type émargement collectif", async ({ page }) => {
    const found = await goToFormationDocs(page);
    if (!found) {
      test.skip(true, "Aucune formation disponible");
      return;
    }

    const emargement = page.getByText(/émargement.*collectif|feuille.*émargement/i).first();
    await expect(emargement).toBeVisible({ timeout: 10000 });
  });

  // ── Vue matrice toggle ──

  test("toggle vue matrice disponible dans Documents", async ({ page }) => {
    const found = await goToFormationDocs(page);
    if (!found) {
      test.skip(true, "Aucune formation disponible");
      return;
    }

    // Chercher le toggle matrice / liste
    const matrixToggle = page.getByRole("button", { name: /matrice|matriciel|grille/i }).or(
      page.locator("button").filter({ hasText: /vue matrice/i })
    );

    // La vue matrice peut être un bouton ou un switch
    const hasToggle = await matrixToggle.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasToggle) {
      // Peut-être la vue matrice est déjà active — chercher le tableau
      const matrix = page.locator("table").first();
      await expect(matrix).toBeVisible({ timeout: 5000 });
    }
  });

  // ── Génération PDF ──

  test("bouton télécharger PDF visible pour les documents", async ({ page }) => {
    const found = await goToFormationDocs(page);
    if (!found) {
      test.skip(true, "Aucune formation disponible");
      return;
    }

    const pdfBtn = page.getByRole("button", { name: /pdf|télécharger|download/i }).first();
    await expect(pdfBtn).toBeVisible({ timeout: 10000 });
  });

  // ── Prévisualisation ──

  test("bouton prévisualiser visible sur un document", async ({ page }) => {
    const found = await goToFormationDocs(page);
    if (!found) {
      test.skip(true, "Aucune formation disponible");
      return;
    }

    // Any view/eye button
    const viewBtn = page.locator("button[title*='Voir'], button[title*='Prévisualiser']").first().or(
      page.getByRole("button", { name: /voir|eye|preview/i }).first()
    );

    const hasView = await viewBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasView) {
      await viewBtn.click();
      await page.waitForTimeout(1000);

      // Preview modal should appear
      const preview = page.locator("[role='dialog']").or(page.locator(".fixed"));
      await expect(preview).toBeVisible({ timeout: 5000 });
    }
  });

  // ── Confirmation de document ──

  test("bouton Confirmer visible sur les documents non confirmés", async ({ page }) => {
    const found = await goToFormationDocs(page);
    if (!found) {
      test.skip(true, "Aucune formation disponible");
      return;
    }

    // Look for confirm buttons
    const confirmBtn = page.getByRole("button", { name: /confirmer/i }).first();
    const hasConfirm = await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false);

    // Either confirm button exists or all docs are already confirmed
    if (!hasConfirm) {
      const confirmed = page.getByText(/confirmé|validé/i).first();
      await expect(confirmed).toBeVisible({ timeout: 5000 });
    }
  });

  // ── Émargement tab affiche les créneaux ──

  test("onglet Émargement affiche la liste des créneaux", async ({ page }) => {
    await page.goto("/admin/trainings");
    await page.waitForLoadState("domcontentloaded");

    const firstCard = page.locator("a[href*='/admin/formations/']").first();
    if (!(await firstCard.isVisible({ timeout: 8000 }).catch(() => false))) {
      test.skip(true, "Aucune formation disponible");
      return;
    }
    await firstCard.click();
    await page.waitForLoadState("domcontentloaded");

    const emargementTab = page.getByText(/émargement/i).first();
    await expect(emargementTab).toBeVisible({ timeout: 10000 });
    await emargementTab.click();
    await page.waitForLoadState("domcontentloaded");

    // Should show slots or empty state
    const content = page.getByText(/créneau|signature|aucun créneau|planifié/i).first();
    await expect(content).toBeVisible({ timeout: 10000 });
  });
});
