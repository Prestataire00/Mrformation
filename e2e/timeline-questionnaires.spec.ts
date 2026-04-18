import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Timeline questionnaires (TabQuestionnaires)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  async function goToFormationQuestionnaires(page: import("@playwright/test").Page) {
    await page.goto("/admin/trainings");
    await page.waitForLoadState("domcontentloaded");

    const firstCard = page.locator("a[href*='/admin/formations/']").first();
    if (!(await firstCard.isVisible({ timeout: 8000 }).catch(() => false))) {
      return false;
    }
    await firstCard.click();
    await page.waitForLoadState("domcontentloaded");

    // Cliquer sur l'onglet Questionnaires
    const tab = page.getByText(/questionnaires/i);
    await expect(tab).toBeVisible({ timeout: 10000 });
    await tab.click();
    await page.waitForLoadState("domcontentloaded");
    return true;
  }

  // ── Onglet visible ──

  test("onglet Questionnaires visible dans le détail formation", async ({ page }) => {
    await page.goto("/admin/trainings");
    await page.waitForLoadState("domcontentloaded");

    const firstCard = page.locator("a[href*='/admin/formations/']").first();
    if (!(await firstCard.isVisible({ timeout: 8000 }).catch(() => false))) {
      test.skip(true, "Aucune formation disponible");
      return;
    }
    await firstCard.click();
    await page.waitForLoadState("domcontentloaded");

    const tab = page.getByText(/questionnaires/i);
    await expect(tab).toBeVisible({ timeout: 10000 });
  });

  // ── 4 étapes chronologiques ──

  test("affiche les 4 étapes chronologiques", async ({ page }) => {
    const found = await goToFormationQuestionnaires(page);
    if (!found) {
      test.skip(true, "Aucune formation disponible");
      return;
    }

    await expect(page.getByText("Avant la formation")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Pendant la formation")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Fin de la formation")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("30 jours après")).toBeVisible({ timeout: 5000 });
  });

  // ── Hero stats ──

  test("affiche les stats hero (Configurés, Réponses, Complétion)", async ({ page }) => {
    const found = await goToFormationQuestionnaires(page);
    if (!found) {
      test.skip(true, "Aucune formation disponible");
      return;
    }

    await expect(page.getByText(/configurés/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/réponses/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/complétion/i)).toBeVisible({ timeout: 5000 });
  });

  // ── Types de questionnaires ──

  test("affiche les types de questionnaires dans chaque étape", async ({ page }) => {
    const found = await goToFormationQuestionnaires(page);
    if (!found) {
      test.skip(true, "Aucune formation disponible");
      return;
    }

    // Étape 1 - Avant
    await expect(page.getByText(/positionnement/i).first()).toBeVisible({ timeout: 10000 });

    // Étape 3 - Fin
    await expect(page.getByText(/satisfaction à chaud/i).first()).toBeVisible({ timeout: 5000 });

    // Étape 4 - +30j
    await expect(page.getByText(/satisfaction à froid/i).first()).toBeVisible({ timeout: 5000 });
  });

  // ── Cliquer sur un item ouvre le panneau latéral ──

  test("cliquer sur un questionnaire ouvre le panneau de configuration", async ({ page }) => {
    const found = await goToFormationQuestionnaires(page);
    if (!found) {
      test.skip(true, "Aucune formation disponible");
      return;
    }

    // Cliquer sur le premier item de questionnaire
    const firstItem = page.getByText(/positionnement|auto-évaluation|satisfaction/i).first();
    await expect(firstItem).toBeVisible({ timeout: 10000 });
    await firstItem.click();

    // Le panneau latéral (Dialog) doit s'ouvrir
    const panel = page.locator("[role='dialog']");
    await expect(panel).toBeVisible({ timeout: 5000 });
  });

  // ── Attribution d'un questionnaire ──

  test("le panneau affiche un dropdown d'attribution avec bouton Attribuer", async ({ page }) => {
    const found = await goToFormationQuestionnaires(page);
    if (!found) {
      test.skip(true, "Aucune formation disponible");
      return;
    }

    const firstItem = page.getByText(/positionnement|auto-évaluation|évaluation/i).first();
    await expect(firstItem).toBeVisible({ timeout: 10000 });
    await firstItem.click();

    const panel = page.locator("[role='dialog']");
    await expect(panel).toBeVisible({ timeout: 5000 });

    // Chercher le bouton Attribuer ou le dropdown
    const assignBtn = panel.getByText(/attribuer|choisir/i).first();
    await expect(assignBtn).toBeVisible({ timeout: 5000 });
  });

  // ── Badges de statut ──

  test("les items affichent des badges de statut", async ({ page }) => {
    const found = await goToFormationQuestionnaires(page);
    if (!found) {
      test.skip(true, "Aucune formation disponible");
      return;
    }

    // Au moins un badge de statut doit être visible
    const statusBadge = page.getByText(/à configurer|envoyé|en cours|complet/i).first();
    await expect(statusBadge).toBeVisible({ timeout: 10000 });
  });

  // ── Titre parcours ──

  test("affiche le titre 'Parcours questionnaires'", async ({ page }) => {
    const found = await goToFormationQuestionnaires(page);
    if (!found) {
      test.skip(true, "Aucune formation disponible");
      return;
    }

    await expect(page.getByText(/parcours questionnaires/i)).toBeVisible({ timeout: 10000 });
  });
});
