import { test, expect } from "@playwright/test";
import { loginAsAdmin, loginAsTrainer, loginAsClient, loginAsLearner } from "./helpers/auth";

/**
 * Les comptes trainer/client/learner n'existent pas forcément en env de test.
 * On utilise loginAsAdmin comme fallback et on navigue manuellement.
 * Les tests qui nécessitent un rôle spécifique sont skippés si le login échoue.
 */

async function tryLogin(page: import("@playwright/test").Page, loginFn: (p: import("@playwright/test").Page) => Promise<void>): Promise<boolean> {
  try {
    await loginFn(page);
    return true;
  } catch {
    return false;
  }
}

test.describe("Dashboards 3 personas", () => {

  // ═══════════════════════════════════════
  // DASHBOARD FORMATEUR
  // ═══════════════════════════════════════

  test.describe("Dashboard Formateur", () => {
    test("page /trainer se charge sans erreur 500", async ({ page }) => {
      const ok = await tryLogin(page, loginAsTrainer);
      if (!ok) {
        // Fallback: login as admin and go to /trainer
        await loginAsAdmin(page);
      }
      await page.goto("/trainer");
      await page.waitForLoadState("domcontentloaded");

      // Should not show a 500 error
      const error500 = page.getByText(/500|erreur serveur|internal server/i);
      const hasError = await error500.isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasError).toBe(false);
    });

    test("page /trainer affiche du contenu (hero ou redirect login)", async ({ page }) => {
      const ok = await tryLogin(page, loginAsTrainer);
      if (!ok) {
        test.skip(true, "Compte formateur test non disponible");
        return;
      }
      await page.goto("/trainer");
      await page.waitForLoadState("domcontentloaded");

      const hero = page.getByText(/session|formation|planning/i).first();
      await expect(hero).toBeVisible({ timeout: 15000 });
    });
  });

  // ═══════════════════════════════════════
  // DASHBOARD CLIENT (ENTREPRISE)
  // ═══════════════════════════════════════

  test.describe("Dashboard Client", () => {
    test("page /client se charge sans erreur 500", async ({ page }) => {
      const ok = await tryLogin(page, loginAsClient);
      if (!ok) {
        await loginAsAdmin(page);
      }
      await page.goto("/client");
      await page.waitForLoadState("domcontentloaded");

      const error500 = page.getByText(/500|erreur serveur|internal server/i);
      const hasError = await error500.isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasError).toBe(false);
    });

    test("page /client affiche du contenu (hero ou redirect)", async ({ page }) => {
      const ok = await tryLogin(page, loginAsClient);
      if (!ok) {
        test.skip(true, "Compte client test non disponible");
        return;
      }
      await page.goto("/client");
      await page.waitForLoadState("domcontentloaded");

      const hero = page.getByText(/apprenant|formation|entreprise/i).first();
      await expect(hero).toBeVisible({ timeout: 15000 });
    });
  });

  // ═══════════════════════════════════════
  // DASHBOARD APPRENANT
  // ═══════════════════════════════════════

  test.describe("Dashboard Apprenant", () => {
    test("page /learner se charge sans erreur 500", async ({ page }) => {
      const ok = await tryLogin(page, loginAsLearner);
      if (!ok) {
        await loginAsAdmin(page);
      }
      await page.goto("/learner");
      await page.waitForLoadState("domcontentloaded");

      const error500 = page.getByText(/500|erreur serveur|internal server/i);
      const hasError = await error500.isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasError).toBe(false);
    });

    test("page /learner affiche du contenu (hero ou redirect)", async ({ page }) => {
      const ok = await tryLogin(page, loginAsLearner);
      if (!ok) {
        test.skip(true, "Compte apprenant test non disponible");
        return;
      }
      await page.goto("/learner");
      await page.waitForLoadState("domcontentloaded");

      const hero = page.getByText(/formation|session|suivez/i).first();
      await expect(hero).toBeVisible({ timeout: 15000 });
    });
  });

  // ═══════════════════════════════════════
  // ISOLATION DES RÔLES (via admin)
  // ═══════════════════════════════════════

  test.describe("Pages persona accessibles via admin", () => {
    test("admin peut accéder à /trainer sans erreur", async ({ page }) => {
      await loginAsAdmin(page);
      const response = await page.goto("/trainer");
      await page.waitForLoadState("domcontentloaded");

      // Admin should either see the page or be redirected — not 500
      const error500 = page.getByText(/500|erreur serveur/i);
      const hasError = await error500.isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasError).toBe(false);
    });

    test("admin peut accéder à /client sans erreur", async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto("/client");
      await page.waitForLoadState("domcontentloaded");

      const error500 = page.getByText(/500|erreur serveur/i);
      const hasError = await error500.isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasError).toBe(false);
    });

    test("admin peut accéder à /learner sans erreur", async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto("/learner");
      await page.waitForLoadState("domcontentloaded");

      const error500 = page.getByText(/500|erreur serveur/i);
      const hasError = await error500.isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasError).toBe(false);
    });
  });
});
