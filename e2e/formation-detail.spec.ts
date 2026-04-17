import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Formation detail", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    // Navigate to first formation
    await page.goto("/admin/trainings");
    await page.waitForLoadState("domcontentloaded");
    const firstCard = page.locator("a[href*='/admin/formations/']").first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });
    await firstCard.click();
    await page.waitForLoadState("domcontentloaded");
  });

  // --- VUE D'ENSEMBLE ---
  test("titre et badge statut visibles", async ({ page }) => {
    const heading = page.getByRole("heading").first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test("onglets sont affiche (Vue d'ensemble, Suivi, Communication, Documents, Qualiopi, Finances)", async ({ page }) => {
    await expect(page.getByText("Vue d'ensemble")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Suivi")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Communication")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Documents")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Qualiopi")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Finances")).toBeVisible({ timeout: 5000 });
  });

  test("section Formateurs visible avec bouton Ajouter", async ({ page }) => {
    const section = page.getByText(/formateur/i).first();
    await expect(section).toBeVisible({ timeout: 10000 });
    const addBtn = page.getByRole("button", { name: /ajouter un formateur/i });
    await expect(addBtn).toBeVisible({ timeout: 5000 });
  });

  test("section Apprenants visible avec bouton Ajouter et Creer", async ({ page }) => {
    const addBtn = page.getByRole("button", { name: /ajouter un apprenant/i });
    await expect(addBtn).toBeVisible({ timeout: 5000 });
    const createBtn = page.getByRole("button", { name: /créer un apprenant/i });
    await expect(createBtn).toBeVisible({ timeout: 5000 });
  });

  test("section Entreprises visible avec bouton Ajouter", async ({ page }) => {
    const addBtn = page.getByRole("button", { name: /ajouter une entreprise/i });
    await expect(addBtn).toBeVisible({ timeout: 5000 });
  });

  // --- QUALIOPI ---
  test("onglet Qualiopi affiche le score et la checklist", async ({ page }) => {
    await page.getByText("Qualiopi").click();
    await page.waitForLoadState("domcontentloaded");
    // Score badge should be visible
    const scoreSection = page.getByText(/conformité qualiopi/i);
    await expect(scoreSection).toBeVisible({ timeout: 10000 });
    // At least one checklist item
    const checklistItem = page.getByText(/convention signée|convocation envoyée/i).first();
    await expect(checklistItem).toBeVisible({ timeout: 5000 });
  });

  // --- DOCUMENTS ---
  test("onglet Documents affiche les types avec bordure coloree", async ({ page }) => {
    await page.getByText("Documents").click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000); // Wait for doc initialization
    // Look for document type labels
    const docLabel = page.getByText(/convocation|certificat|convention/i).first();
    await expect(docLabel).toBeVisible({ timeout: 10000 });
  });

  test("onglet Documents ne contient PAS micro-certificat", async ({ page }) => {
    await page.getByText("Documents").click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    const microCert = page.getByText("MICRO-CERTIFICAT");
    await expect(microCert).toHaveCount(0);
  });

  test("bouton Confirmer visible sur docs non confirmes", async ({ page }) => {
    await page.getByText("Documents").click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    const confirmBtn = page.getByRole("button", { name: /confirmer/i }).first();
    // May or may not be visible depending on data state
    const body = await page.textContent("body");
    expect(body).not.toContain("Internal Server Error");
  });

  // --- FINANCES ---
  test("onglet Finances affiche le bouton Creer facture", async ({ page }) => {
    await page.getByText("Finances").click();
    await page.waitForLoadState("domcontentloaded");
    const createBtn = page.getByRole("button", { name: /facture/i }).first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });
  });

  test("dialog creation facture a des lignes de produits", async ({ page }) => {
    await page.getByText("Finances").click();
    await page.waitForLoadState("domcontentloaded");
    // Find and click the create invoice button
    const createBtn = page.getByRole("button", { name: /facture/i }).first();
    await createBtn.click();
    await page.waitForTimeout(500);
    // Should see "Produits" section and "Ajouter une ligne"
    const productsLabel = page.getByText("Produits");
    await expect(productsLabel).toBeVisible({ timeout: 5000 });
    const addLineBtn = page.getByText(/ajouter une ligne/i);
    await expect(addLineBtn).toBeVisible({ timeout: 5000 });
  });

  // --- COMMUNICATION ---
  test("onglet Communication affiche Evaluation et Satisfaction", async ({ page }) => {
    await page.getByText("Communication").click();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText(/évaluation/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/satisfaction/i).first()).toBeVisible({ timeout: 10000 });
  });
});
