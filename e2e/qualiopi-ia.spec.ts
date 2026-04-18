import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Qualiopi IA — audits et qualité", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  // ── Onglet Qualiopi dans formation ──

  test("onglet Qualiopi visible dans le détail formation", async ({ page }) => {
    await page.goto("/admin/trainings");
    await page.waitForLoadState("domcontentloaded");

    const firstCard = page.locator("a[href*='/admin/formations/']").first();
    if (!(await firstCard.isVisible({ timeout: 8000 }).catch(() => false))) {
      test.skip(true, "Aucune formation disponible");
      return;
    }
    await firstCard.click();
    await page.waitForLoadState("domcontentloaded");

    const qualiopiTab = page.getByText("Qualiopi");
    await expect(qualiopiTab).toBeVisible({ timeout: 10000 });
  });

  // ── Score Qualiopi affiché ──

  test("onglet Qualiopi affiche le score de conformité", async ({ page }) => {
    await page.goto("/admin/trainings");
    await page.waitForLoadState("domcontentloaded");

    const firstCard = page.locator("a[href*='/admin/formations/']").first();
    if (!(await firstCard.isVisible({ timeout: 8000 }).catch(() => false))) {
      test.skip(true, "Aucune formation disponible");
      return;
    }
    await firstCard.click();
    await page.waitForLoadState("domcontentloaded");

    await page.getByText("Qualiopi").click();
    await page.waitForLoadState("domcontentloaded");

    const score = page.getByText(/conformité qualiopi|score|%/i).first();
    await expect(score).toBeVisible({ timeout: 10000 });
  });

  // ── Checklist Qualiopi ──

  test("onglet Qualiopi affiche la checklist documentaire", async ({ page }) => {
    await page.goto("/admin/trainings");
    await page.waitForLoadState("domcontentloaded");

    const firstCard = page.locator("a[href*='/admin/formations/']").first();
    if (!(await firstCard.isVisible({ timeout: 8000 }).catch(() => false))) {
      test.skip(true, "Aucune formation disponible");
      return;
    }
    await firstCard.click();
    await page.waitForLoadState("domcontentloaded");

    await page.getByText("Qualiopi").click();
    await page.waitForLoadState("domcontentloaded");

    const checkItem = page.getByText(/convention signée|convocation envoyée|programme|émargement/i).first();
    await expect(checkItem).toBeVisible({ timeout: 10000 });
  });

  // ── Bouton audit blanc IA ──

  test("onglet Qualiopi contient le bouton audit blanc IA", async ({ page }) => {
    await page.goto("/admin/trainings");
    await page.waitForLoadState("domcontentloaded");

    const firstCard = page.locator("a[href*='/admin/formations/']").first();
    if (!(await firstCard.isVisible({ timeout: 8000 }).catch(() => false))) {
      test.skip(true, "Aucune formation disponible");
      return;
    }
    await firstCard.click();
    await page.waitForLoadState("domcontentloaded");

    await page.getByText("Qualiopi").click();
    await page.waitForLoadState("domcontentloaded");

    const auditBtn = page.getByText(/audit.*blanc|lancer.*audit|audit.*ia/i).first();
    await expect(auditBtn).toBeVisible({ timeout: 10000 });
  });

  // ── Page qualité globale ──

  test("page /admin/reports/qualite affiche le suivi qualité", async ({ page }) => {
    await page.goto("/admin/reports/qualite");
    await page.waitForLoadState("domcontentloaded");

    const heading = page.getByText(/suivi qualité|évaluation.*satisfaction/i).first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  // ── Toggles vue Tableau / Qualiopi ──

  test("page qualité a les toggles Tableau et Qualiopi", async ({ page }) => {
    await page.goto("/admin/reports/qualite");
    await page.waitForLoadState("domcontentloaded");

    const tableBtn = page.getByRole("button", { name: /tableau/i });
    const qualiopiBtn = page.getByRole("button", { name: /qualiopi/i });

    await expect(tableBtn).toBeVisible({ timeout: 10000 });
    await expect(qualiopiBtn).toBeVisible({ timeout: 5000 });
  });

  // ── Vue Qualiopi affiche les 7 critères ──

  test("vue Qualiopi affiche les critères avec scores", async ({ page }) => {
    await page.goto("/admin/reports/qualite");
    await page.waitForLoadState("domcontentloaded");

    const qualiopiBtn = page.getByRole("button", { name: /qualiopi/i });
    await expect(qualiopiBtn).toBeVisible({ timeout: 10000 });
    await qualiopiBtn.click();
    await page.waitForTimeout(1000);

    // Au moins un critère Qualiopi visible
    const criterion = page.getByText(/information du public|identification des objectifs|adaptation|moyens pédagogiques|qualification|environnement|amélioration/i).first();
    await expect(criterion).toBeVisible({ timeout: 10000 });
  });

  // ── Export Excel et PDF ──

  test("page qualité a les boutons d'export Excel et PDF", async ({ page }) => {
    await page.goto("/admin/reports/qualite");
    await page.waitForLoadState("domcontentloaded");

    const excelBtn = page.getByRole("button", { name: /excel/i });
    const pdfBtn = page.getByRole("button", { name: /pdf/i });

    await expect(excelBtn).toBeVisible({ timeout: 10000 });
    await expect(pdfBtn).toBeVisible({ timeout: 5000 });
  });

  // ── API IA protégées ──

  test("API /api/ai/qualiopi-mock-audit protégée par auth", async ({ request }) => {
    const response = await request.post("/api/ai/qualiopi-mock-audit", {
      data: {},
    });
    expect([401, 403]).toContain(response.status());
  });

  test("API /api/ai/qualiopi-check-proof protégée par auth", async ({ request }) => {
    const response = await request.post("/api/ai/qualiopi-check-proof", {
      data: {},
    });
    expect([401, 403]).toContain(response.status());
  });
});
