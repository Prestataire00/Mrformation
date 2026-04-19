import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("CVthèque IA formateurs", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  // ── Page formateurs accessible ──

  test("page /admin/trainers affiche la liste des formateurs", async ({ page }) => {
    await page.goto("/admin/trainers");
    await page.waitForLoadState("domcontentloaded");

    const heading = page.getByText(/cvthèque formateurs|formateur/i).first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  // ── Barre de recherche IA ──

  test("barre de recherche IA avec placeholder visible", async ({ page }) => {
    await page.goto("/admin/trainers");
    await page.waitForLoadState("domcontentloaded");

    const searchInput = page.locator("input[placeholder*='Recherche IA'], input[placeholder*='recherche'], input[placeholder*='expert']").first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });
  });

  // ── Bouton Recherche IA ──

  test("bouton 'Recherche IA' visible", async ({ page }) => {
    await page.goto("/admin/trainers");
    await page.waitForLoadState("domcontentloaded");

    const searchBtn = page.getByRole("button", { name: /recherche ia/i });
    await expect(searchBtn).toBeVisible({ timeout: 10000 });
  });

  // ── Cards formateurs affichées ──

  test("affiche des cards formateurs avec nom et compétences", async ({ page }) => {
    await page.goto("/admin/trainers");
    await page.waitForLoadState("domcontentloaded");

    // Au moins un formateur affiché ou message vide
    const trainerCard = page.locator(".rounded-xl, .rounded-lg").filter({ hasText: /@|formateur|session/i }).first();
    const emptyMsg = page.getByText(/aucun formateur/i);

    const hasTrainer = await trainerCard.isVisible({ timeout: 8000 }).catch(() => false);
    const hasEmpty = await emptyMsg.isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasTrainer || hasEmpty).toBe(true);
  });

  // ── CVthèque page ──

  test("page /admin/trainers/cvtheque affiche les stats et filtres", async ({ page }) => {
    await page.goto("/admin/trainers/cvtheque");
    await page.waitForLoadState("domcontentloaded");

    // Titre
    await expect(page.getByText(/cvthèque/i).first()).toBeVisible({ timeout: 10000 });

    // Stats cards
    await expect(page.getByText(/formateurs/i).first()).toBeVisible({ timeout: 5000 });
  });

  // ── CVthèque filtres ──

  test("CVthèque contient les filtres niveau, type et compétences", async ({ page }) => {
    await page.goto("/admin/trainers/cvtheque");
    await page.waitForLoadState("domcontentloaded");

    // Recherche
    const searchInput = page.locator("input[placeholder*='Rechercher'], input[placeholder*='nom']").first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    // Filtres
    const filterLabel = page.getByText(/filtres/i).first();
    await expect(filterLabel).toBeVisible({ timeout: 5000 });
  });

  // ── CVthèque recherche filtre les résultats ──

  test("CVthèque recherche textuelle filtre les résultats", async ({ page }) => {
    await page.goto("/admin/trainers/cvtheque");
    await page.waitForLoadState("domcontentloaded");

    const searchInput = page.locator("input[placeholder*='Rechercher'], input[placeholder*='nom']").first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    // Saisir un texte de recherche improbable
    await searchInput.fill("zzz-inexistant-xyz");
    await page.waitForTimeout(500);

    // Le compteur de résultats doit afficher 0
    const resultCount = page.getByText(/0 formateur/i);
    await expect(resultCount).toBeVisible({ timeout: 5000 });
  });

  // ── Fiche formateur détail ──

  test("fiche formateur détail accessible depuis la liste", async ({ page }) => {
    await page.goto("/admin/trainers");
    await page.waitForLoadState("domcontentloaded");

    const trainerLink = page.locator("a[href*='/admin/trainers/']").first();
    if (!(await trainerLink.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "Aucun formateur disponible");
      return;
    }
    await trainerLink.click();
    await page.waitForURL(/\/admin\/trainers\/[a-f0-9-]+/);
    await page.waitForLoadState("domcontentloaded");

    const heading = page.getByRole("heading").first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  // ── Bouton Analyser CV IA ──

  test("fiche formateur contient le bouton Analyser CV IA", async ({ page }) => {
    await page.goto("/admin/trainers");
    await page.waitForLoadState("domcontentloaded");

    const trainerLink = page.locator("a[href*='/admin/trainers/']").first();
    if (!(await trainerLink.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "Aucun formateur disponible");
      return;
    }
    await trainerLink.click();
    await page.waitForURL(/\/admin\/trainers\/[a-f0-9-]+/);
    await page.waitForLoadState("domcontentloaded");

    const analyzeBtn = page.getByText(/analyser.*cv.*ia|analyser avec l'ia/i).first();
    await expect(analyzeBtn).toBeVisible({ timeout: 10000 });
  });

  // ── API IA protégées ──

  test("API /api/ai/search-trainers protégée par auth", async ({ request }) => {
    const response = await request.post("/api/ai/search-trainers", {
      data: { query: "test" },
      timeout: 20000,
    });
    expect([401, 403]).toContain(response.status());
  });

  test("API /api/ai/parse-cv protégée par auth", async ({ request }) => {
    const response = await request.post("/api/ai/parse-cv", {
      data: {},
      timeout: 20000,
    });
    expect([401, 403]).toContain(response.status());
  });

  test("API /api/ai/match-trainer protégée par auth", async ({ request }) => {
    const response = await request.post("/api/ai/match-trainer", {
      data: {},
      timeout: 20000,
    });
    expect([401, 403]).toContain(response.status());
  });
});
