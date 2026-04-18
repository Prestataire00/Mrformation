import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Veille réglementaire IA", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  // ── Page veille accessible ──

  test("page /admin/veille affiche le titre et les sections", async ({ page }) => {
    await page.goto("/admin/veille");
    await page.waitForLoadState("domcontentloaded");

    const heading = page.getByText(/veille réglementaire/i).first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  // ── Bouton Analyser avec l'IA ──

  test("bouton 'Analyser avec l'IA' visible", async ({ page }) => {
    await page.goto("/admin/veille");
    await page.waitForLoadState("domcontentloaded");

    const analyzeBtn = page.getByRole("button", { name: /analyser.*ia/i });
    await expect(analyzeBtn).toBeVisible({ timeout: 10000 });
  });

  // ── Section actualités récentes ──

  test("section 'Actualités récentes' visible", async ({ page }) => {
    await page.goto("/admin/veille");
    await page.waitForLoadState("domcontentloaded");

    const section = page.getByText(/actualités récentes/i).first();
    await expect(section).toBeVisible({ timeout: 10000 });
  });

  // ── Section notes de veille ──

  test("section 'Notes de Veille' visible avec bouton Ajouter", async ({ page }) => {
    await page.goto("/admin/veille");
    await page.waitForLoadState("domcontentloaded");

    const notesSection = page.getByText(/notes de veille/i).first();
    await expect(notesSection).toBeVisible({ timeout: 10000 });

    const addBtn = page.getByRole("button", { name: /ajouter une note/i });
    await expect(addBtn).toBeVisible({ timeout: 5000 });
  });

  // ── Dialog ajout note ──

  test("cliquer 'Ajouter une note' ouvre le formulaire", async ({ page }) => {
    await page.goto("/admin/veille");
    await page.waitForLoadState("domcontentloaded");

    const addBtn = page.getByRole("button", { name: /ajouter une note/i });
    await expect(addBtn).toBeVisible({ timeout: 10000 });
    await addBtn.click();

    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Champs du formulaire
    await expect(dialog.locator("input[placeholder*='Titre']")).toBeVisible({ timeout: 3000 });
  });

  // ── Formulaire note a les champs requis ──

  test("formulaire de note contient titre, contenu, source et URL", async ({ page }) => {
    await page.goto("/admin/veille");
    await page.waitForLoadState("domcontentloaded");

    const addBtn = page.getByRole("button", { name: /ajouter une note/i });
    await expect(addBtn).toBeVisible({ timeout: 10000 });
    await addBtn.click();

    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await expect(dialog.locator("input[placeholder*='Titre']")).toBeVisible({ timeout: 3000 });
    await expect(dialog.locator("textarea[placeholder*='Détails'], textarea[placeholder*='commentaires']")).toBeVisible({ timeout: 3000 });
    await expect(dialog.locator("input[placeholder*='Source'], input[placeholder*='Centre Inffo']")).toBeVisible({ timeout: 3000 });
    await expect(dialog.locator("input[placeholder*='https']")).toBeVisible({ timeout: 3000 });
  });

  // ── Liens vers sources externes ──

  test("affiche des liens vers Centre Inffo ou Ministère du Travail", async ({ page }) => {
    await page.goto("/admin/veille");
    await page.waitForLoadState("domcontentloaded");

    const externalLink = page.getByText(/centre inffo|ministère du travail/i).first();
    await expect(externalLink).toBeVisible({ timeout: 10000 });
  });

  // ── API veille protégée ──

  test("API /api/ai/analyze-veille protégée par auth", async ({ request }) => {
    const response = await request.post("/api/ai/analyze-veille", {
      data: {},
    });
    expect([401, 403]).toContain(response.status());
  });
});
