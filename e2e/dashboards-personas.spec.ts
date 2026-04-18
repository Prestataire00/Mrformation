import { test, expect } from "@playwright/test";
import { loginAsAdmin, loginAsTrainer, loginAsClient, loginAsLearner } from "./helpers/auth";

test.describe("Dashboards 3 personas", () => {

  // ═══════════════════════════════════════
  // DASHBOARD FORMATEUR
  // ═══════════════════════════════════════

  test.describe("Dashboard Formateur", () => {
    test("page /trainer affiche le hero et les quick actions", async ({ page }) => {
      await loginAsTrainer(page);
      await page.goto("/trainer");
      await page.waitForLoadState("domcontentloaded");

      // Hero card with session count
      const hero = page.getByText(/session|formation|planning/i).first();
      await expect(hero).toBeVisible({ timeout: 10000 });
    });

    test("dashboard formateur affiche les stats (sessions, heures)", async ({ page }) => {
      await loginAsTrainer(page);
      await page.goto("/trainer");
      await page.waitForLoadState("domcontentloaded");

      const stats = page.getByText(/sessions? ce mois|heures délivrées|cette semaine/i).first();
      await expect(stats).toBeVisible({ timeout: 10000 });
    });

    test("dashboard formateur affiche le planning de la semaine", async ({ page }) => {
      await loginAsTrainer(page);
      await page.goto("/trainer");
      await page.waitForLoadState("domcontentloaded");

      const planning = page.getByText(/planning|semaine/i).first();
      await expect(planning).toBeVisible({ timeout: 10000 });
    });

    test("bouton 'Voir mon planning' dans le hero formateur", async ({ page }) => {
      await loginAsTrainer(page);
      await page.goto("/trainer");
      await page.waitForLoadState("domcontentloaded");

      const cta = page.getByRole("link", { name: /voir mon planning/i }).or(
        page.getByRole("button", { name: /voir mon planning/i })
      );
      await expect(cta).toBeVisible({ timeout: 10000 });
    });

    test("section profil formateur visible", async ({ page }) => {
      await loginAsTrainer(page);
      await page.goto("/trainer");
      await page.waitForLoadState("domcontentloaded");

      const profile = page.getByText(/mon profil/i).first();
      await expect(profile).toBeVisible({ timeout: 10000 });
    });
  });

  // ═══════════════════════════════════════
  // DASHBOARD CLIENT (ENTREPRISE)
  // ═══════════════════════════════════════

  test.describe("Dashboard Client", () => {
    test("page /client affiche le hero avec stats entreprise", async ({ page }) => {
      await loginAsClient(page);
      await page.goto("/client");
      await page.waitForLoadState("domcontentloaded");

      const hero = page.getByText(/apprenant|formation|entreprise/i).first();
      await expect(hero).toBeVisible({ timeout: 10000 });
    });

    test("dashboard client affiche les quick action cards", async ({ page }) => {
      await loginAsClient(page);
      await page.goto("/client");
      await page.waitForLoadState("domcontentloaded");

      const quickAction = page.getByText(/apprenants inscrits|formations en cours|formations à venir/i).first();
      await expect(quickAction).toBeVisible({ timeout: 10000 });
    });

    test("dashboard client affiche la liste des apprenants", async ({ page }) => {
      await loginAsClient(page);
      await page.goto("/client");
      await page.waitForLoadState("domcontentloaded");

      const learnersSection = page.getByText(/mes apprenants/i).first();
      await expect(learnersSection).toBeVisible({ timeout: 10000 });
    });

    test("bouton 'Voir mes formations' dans le hero client", async ({ page }) => {
      await loginAsClient(page);
      await page.goto("/client");
      await page.waitForLoadState("domcontentloaded");

      const cta = page.getByRole("link", { name: /voir mes formations/i }).or(
        page.getByRole("button", { name: /voir mes formations/i })
      );
      await expect(cta).toBeVisible({ timeout: 10000 });
    });
  });

  // ═══════════════════════════════════════
  // DASHBOARD APPRENANT
  // ═══════════════════════════════════════

  test.describe("Dashboard Apprenant", () => {
    test("page /learner affiche le hero avec formations count", async ({ page }) => {
      await loginAsLearner(page);
      await page.goto("/learner");
      await page.waitForLoadState("domcontentloaded");

      const hero = page.getByText(/formation|session|suivez/i).first();
      await expect(hero).toBeVisible({ timeout: 10000 });
    });

    test("dashboard apprenant affiche les quick actions", async ({ page }) => {
      await loginAsLearner(page);
      await page.goto("/learner");
      await page.waitForLoadState("domcontentloaded");

      const quickAction = page.getByText(/mes formations|e-learning|questionnaires|documents|certificats/i).first();
      await expect(quickAction).toBeVisible({ timeout: 10000 });
    });

    test("dashboard apprenant affiche les stats (formations, heures)", async ({ page }) => {
      await loginAsLearner(page);
      await page.goto("/learner");
      await page.waitForLoadState("domcontentloaded");

      const stats = page.getByText(/formations inscrites|formations complétées|en cours|heures de formation/i).first();
      await expect(stats).toBeVisible({ timeout: 10000 });
    });

    test("dashboard apprenant affiche les onglets En cours / À venir / Terminées", async ({ page }) => {
      await loginAsLearner(page);
      await page.goto("/learner");
      await page.waitForLoadState("domcontentloaded");

      const tab = page.getByText(/en cours|à venir|terminées/i).first();
      await expect(tab).toBeVisible({ timeout: 10000 });
    });

    test("section certifications visible sur dashboard apprenant", async ({ page }) => {
      await loginAsLearner(page);
      await page.goto("/learner");
      await page.waitForLoadState("domcontentloaded");

      const certSection = page.getByText(/certifications|attestations/i).first();
      await expect(certSection).toBeVisible({ timeout: 10000 });
    });

    test("section profil apprenant visible", async ({ page }) => {
      await loginAsLearner(page);
      await page.goto("/learner");
      await page.waitForLoadState("domcontentloaded");

      const profile = page.getByText(/mon profil/i).first();
      await expect(profile).toBeVisible({ timeout: 10000 });
    });

    test("bouton 'Voir mes formations' dans le hero apprenant", async ({ page }) => {
      await loginAsLearner(page);
      await page.goto("/learner");
      await page.waitForLoadState("domcontentloaded");

      const cta = page.getByRole("link", { name: /voir mes formations/i }).or(
        page.getByRole("button", { name: /voir mes formations/i })
      );
      await expect(cta).toBeVisible({ timeout: 10000 });
    });
  });

  // ═══════════════════════════════════════
  // ISOLATION DES RÔLES
  // ═══════════════════════════════════════

  test.describe("Isolation des rôles", () => {
    test("un formateur ne peut pas accéder à /admin", async ({ page }) => {
      await loginAsTrainer(page);
      const response = await page.goto("/admin");

      // Should redirect or show forbidden
      const url = page.url();
      const isRedirected = !url.includes("/admin") || url.includes("/login") || url.includes("/trainer");
      const hasForbidden = await page.getByText(/403|interdit|accès refusé/i).isVisible({ timeout: 3000 }).catch(() => false);
      expect(isRedirected || hasForbidden).toBe(true);
    });

    test("un apprenant ne peut pas accéder à /admin", async ({ page }) => {
      await loginAsLearner(page);
      const response = await page.goto("/admin");

      const url = page.url();
      const isRedirected = !url.includes("/admin") || url.includes("/login") || url.includes("/learner");
      const hasForbidden = await page.getByText(/403|interdit|accès refusé/i).isVisible({ timeout: 3000 }).catch(() => false);
      expect(isRedirected || hasForbidden).toBe(true);
    });
  });
});
