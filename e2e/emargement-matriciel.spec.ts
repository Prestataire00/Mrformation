import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Feuille d'émargement matricielle", () => {
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

  // ── Onglet Documents ──

  test("onglet Documents affiche les types de documents", async ({ page }) => {
    const found = await goToFormation(page);
    if (!found) {
      test.skip(true, "Aucune formation disponible");
      return;
    }

    await page.getByText("Documents").click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    const docLabel = page.getByText(/convocation|certificat|convention|émargement/i).first();
    await expect(docLabel).toBeVisible({ timeout: 15000 });
  });

  // ── Bouton PDF ──

  test("bouton télécharger PDF visible pour les documents", async ({ page }) => {
    const found = await goToFormation(page);
    if (!found) {
      test.skip(true, "Aucune formation disponible");
      return;
    }

    await page.getByText("Documents").click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    const pdfBtn = page.getByRole("button", { name: /pdf|télécharger|download/i }).first();
    await expect(pdfBtn).toBeVisible({ timeout: 15000 });
  });

  // ── Onglet Émargement ──

  test("onglet Émargement affiche les créneaux ou état vide", async ({ page }) => {
    const found = await goToFormation(page);
    if (!found) {
      test.skip(true, "Aucune formation disponible");
      return;
    }

    const emargementTab = page.getByText(/émargement/i).first();
    await expect(emargementTab).toBeVisible({ timeout: 15000 });
    await emargementTab.click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    const content = page.getByText(/créneau|signature|aucun créneau|planifié|émargement/i).first();
    await expect(content).toBeVisible({ timeout: 15000 });
  });

  // ── Admin signatures page ──

  test("page /admin/signatures se charge sans erreur", async ({ page }) => {
    await page.goto("/admin/signatures");
    await page.waitForLoadState("domcontentloaded");

    const heading = page.getByText(/émargement|signature/i).first();
    await expect(heading).toBeVisible({ timeout: 15000 });
  });
});
