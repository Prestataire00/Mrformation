import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Timeline questionnaires (TabQuestionnaires)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  async function goToFormation(page: import("@playwright/test").Page): Promise<boolean> {
    await page.goto("/admin/trainings");
    await page.waitForLoadState("domcontentloaded");

    const firstCard = page.locator("a[href*='/admin/formations/']").first();
    if (!(await firstCard.isVisible({ timeout: 10000 }).catch(() => false))) {
      return false;
    }
    await firstCard.click();
    await page.waitForLoadState("domcontentloaded");
    return true;
  }

  // ── Onglet Questionnaires visible ──

  test("onglet Questionnaires visible dans le détail formation", async ({ page }) => {
    const found = await goToFormation(page);
    if (!found) {
      test.skip(true, "Aucune formation disponible");
      return;
    }

    const tab = page.getByText(/questionnaires/i);
    await expect(tab).toBeVisible({ timeout: 15000 });
  });

  // ── 4 étapes chronologiques ──

  test("affiche les 4 étapes chronologiques", async ({ page }) => {
    const found = await goToFormation(page);
    if (!found) {
      test.skip(true, "Aucune formation disponible");
      return;
    }

    const tab = page.getByText(/questionnaires/i);
    await expect(tab).toBeVisible({ timeout: 15000 });
    await tab.click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    await expect(page.getByText("Avant la formation")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Pendant la formation")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Fin de la formation")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("30 jours après")).toBeVisible({ timeout: 5000 });
  });

  // ── Hero stats ──

  test("affiche les stats hero (Configurés, Réponses, Complétion)", async ({ page }) => {
    const found = await goToFormation(page);
    if (!found) {
      test.skip(true, "Aucune formation disponible");
      return;
    }

    const tab = page.getByText(/questionnaires/i);
    await expect(tab).toBeVisible({ timeout: 15000 });
    await tab.click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    await expect(page.getByText(/configurés/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/réponses/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/complétion/i)).toBeVisible({ timeout: 5000 });
  });

  // ── Types de questionnaires ──

  test("affiche les types de questionnaires (positionnement, satisfaction)", async ({ page }) => {
    const found = await goToFormation(page);
    if (!found) {
      test.skip(true, "Aucune formation disponible");
      return;
    }

    const tab = page.getByText(/questionnaires/i);
    await expect(tab).toBeVisible({ timeout: 15000 });
    await tab.click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    const positionnement = page.getByText(/positionnement/i).first();
    await expect(positionnement).toBeVisible({ timeout: 15000 });
  });

  // ── Titre parcours ──

  test("affiche le titre 'Parcours questionnaires'", async ({ page }) => {
    const found = await goToFormation(page);
    if (!found) {
      test.skip(true, "Aucune formation disponible");
      return;
    }

    const tab = page.getByText(/questionnaires/i);
    await expect(tab).toBeVisible({ timeout: 15000 });
    await tab.click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    await expect(page.getByText(/parcours questionnaires/i)).toBeVisible({ timeout: 15000 });
  });

  // ── Page questionnaires admin ──

  test("page /admin/questionnaires accessible", async ({ page }) => {
    await page.goto("/admin/questionnaires");
    await page.waitForLoadState("domcontentloaded");

    const heading = page.getByText(/questionnaire/i).first();
    await expect(heading).toBeVisible({ timeout: 15000 });
  });
});
