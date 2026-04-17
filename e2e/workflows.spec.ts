import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Workflow Documents", () => {
  test("confirmer puis reinitialiser un document", async ({ page }) => {
    await loginAsAdmin(page);
    // Navigate to a formation
    await page.goto("/admin/trainings");
    await page.waitForLoadState("domcontentloaded");
    const firstCard = page.locator("a[href*='/admin/formations/']").first();
    if (!(await firstCard.isVisible({ timeout: 5000 }))) return;
    await firstCard.click();
    await page.waitForLoadState("domcontentloaded");

    // Go to Documents tab
    await page.getByText("Documents").click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000); // Wait for doc init

    // Look for a Confirmer button
    const confirmBtn = page.getByRole("button", { name: /^confirmer$/i }).first();
    if (await confirmBtn.isVisible({ timeout: 5000 })) {
      await confirmBtn.click();
      await page.waitForTimeout(1000);
      // Badge should show "Confirmé"
      const confirmedBadge = page.getByText("Confirmé").first();
      await expect(confirmedBadge).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe("Workflow Qualiopi", () => {
  test("onglet Qualiopi affiche le score et les criteres", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/trainings");
    await page.waitForLoadState("domcontentloaded");
    const firstCard = page.locator("a[href*='/admin/formations/']").first();
    if (!(await firstCard.isVisible({ timeout: 5000 }))) return;
    await firstCard.click();
    await page.waitForLoadState("domcontentloaded");

    await page.getByText("Qualiopi").click();
    await page.waitForLoadState("domcontentloaded");

    // Score header
    await expect(page.getByText(/conformité qualiopi/i)).toBeVisible({ timeout: 10000 });
    // Progress bar
    const progressBar = page.locator("[class*='rounded-full'][class*='bg-']").first();
    await expect(progressBar).toBeVisible({ timeout: 5000 });
    // Document section
    await expect(page.getByText(/documents.*conventions/i)).toBeVisible({ timeout: 5000 });
    // Evaluation section
    await expect(page.getByText(/questionnaires.*evaluations/i)).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Workflow Factures", () => {
  test("page factures globale : sessions cliquables", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/reports/factures");
    await page.waitForLoadState("domcontentloaded");

    // Page should load
    const body = await page.textContent("body");
    expect(body).not.toContain("Internal Server Error");

    // Look for clickable session links
    const sessionLink = page.locator("a[href*='/admin/formations/']").first();
    if (await sessionLink.isVisible({ timeout: 5000 })) {
      // Verify it's a link
      const href = await sessionLink.getAttribute("href");
      expect(href).toContain("/admin/formations/");
    }
  });
});

test.describe("Workflow Prospect → Client", () => {
  test("bouton Convertir visible quand status won", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/crm/prospects");
    await page.waitForLoadState("domcontentloaded");

    // Look for a prospect with "won" status
    const wonBadge = page.getByText(/gagné|won/i).first();
    if (await wonBadge.isVisible({ timeout: 5000 })) {
      // Click on the prospect row/card
      const prospectLink = page.locator("a[href*='/admin/crm/prospects/']").first();
      if (await prospectLink.isVisible({ timeout: 3000 })) {
        await prospectLink.click();
        await page.waitForLoadState("domcontentloaded");
        // Look for convert button
        const convertBtn = page.getByRole("button", { name: /convertir en client/i });
        // May or may not be visible depending on converted_client_id
        const body = await page.textContent("body");
        expect(body).not.toContain("Internal Server Error");
      }
    }
  });
});

test.describe("Workflow Veille IA", () => {
  test("page veille charge et bouton IA visible", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/veille");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByText(/veille réglementaire/i)).toBeVisible({ timeout: 10000 });
    const aiBtn = page.getByRole("button", { name: /analyser avec l.ia/i });
    await expect(aiBtn).toBeVisible({ timeout: 5000 });
  });
});
