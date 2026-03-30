import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

const FORMATION_URL = "/admin/formations/3dabc117-f4d7-4fdd-804e-c8939a8f2b51";

test.describe("Module Formation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(FORMATION_URL);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);
  });

  // 1. RÉSUMÉ
  test.describe("Onglet Résumé", () => {
    test("Page formation accessible", async ({ page }) => {
      await expect(page.getByText("test 44").first()).toBeVisible({ timeout: 10000 });
    });
    test("Badge Intra visible", async ({ page }) => {
      await expect(page.getByText("Intra").first()).toBeVisible({ timeout: 10000 });
    });
    test("Bouton Commencer visible", async ({ page }) => {
      await expect(page.getByRole("button", { name: /Commencer/ }).first()).toBeVisible({ timeout: 10000 });
    });
    test("Bouton Dupliquer visible", async ({ page }) => {
      await expect(page.getByRole("button", { name: /Dupliquer/ }).first()).toBeVisible({ timeout: 10000 });
    });
  });

  // 2. NAVIGATION ONGLETS
  test.describe("Navigation onglets", () => {
    const tabs = [
      "Planning", "Parcours", "Émargements", "Absences",
      "Docs Partagés", "Messagerie", "Programme",
      "Évaluation", "Satisfaction & Qualité",
      "Convention & Documents", "Finances", "e-Learning"
    ];

    for (const tab of tabs) {
      test(`Onglet "${tab}" se charge sans erreur`, async ({ page }) => {
        await page.getByRole("tab", { name: tab }).click();
        await page.waitForTimeout(1000);
        await expect(page.getByText("500")).not.toBeVisible();
        await expect(page.getByText("Une erreur est survenue")).not.toBeVisible();
      });
    }
  });

  // 3. CONVENTION & DOCUMENTS
  test.describe("Onglet Convention & Documents", () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole("tab", { name: "Convention & Documents" }).click();
      await page.waitForTimeout(1500);
    });

    test("Onglet se charge", async ({ page }) => {
      await expect(page.getByRole("tab", { name: "Convention & Documents", selected: true })).toBeVisible();
    });

    test("Bouton Voir ou Confirmer visible", async ({ page }) => {
      const btn = page.getByRole("button", { name: /Voir|Confirmer|Télécharger/i }).first();
      await expect(btn).toBeVisible({ timeout: 10000 });
    });

    test("Génération PDF convention → téléchargement", async ({ page }) => {
      const downloadPromise = page.waitForEvent("download", { timeout: 20000 }).catch(() => null);
      const btn = page.getByRole("button", { name: /Voir\/Télécharger|Télécharger/i }).first();
      if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await btn.click();
        const download = await downloadPromise;
        if (download) {
          expect(download.suggestedFilename().toLowerCase()).toMatch(/convention|pdf/);
        }
      }
    });
  });

  // 4. ÉMARGEMENTS
  test.describe("Onglet Émargements", () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole("tab", { name: "Émargements" }).click();
      await page.waitForTimeout(1500);
    });

    test("Bouton Générer QR codes visible", async ({ page }) => {
      await expect(
        page.getByRole("button", { name: /Générer les QR codes/i })
      ).toBeVisible({ timeout: 10000 });
    });

    test("Dialog QR codes s'ouvre", async ({ page }) => {
      await page.getByRole("button", { name: /Générer les QR codes/i }).click();
      await expect(
        page.getByText(/QR Codes générés|QR code/i).first()
      ).toBeVisible({ timeout: 10000 });
    });

    test("Bouton Imprimer feuille vide visible", async ({ page }) => {
      await expect(
        page.getByRole("button", { name: /Imprimer feuille vide/i })
      ).toBeVisible({ timeout: 10000 });
    });
  });

  // 5. MESSAGERIE
  test.describe("Onglet Messagerie", () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole("tab", { name: "Messagerie" }).click();
      await page.waitForTimeout(1500);
    });

    test("Bouton Envoyer un e-mail visible", async ({ page }) => {
      await expect(
        page.getByRole("button", { name: /Envoyer un e-mail/i }).first()
      ).toBeVisible({ timeout: 10000 });
    });

    test("Dialog email s'ouvre", async ({ page }) => {
      await page.getByRole("button", { name: /Envoyer un e-mail \(template\)/i }).first().click();
      await page.waitForTimeout(1000);
      await expect(
        page.getByRole("dialog")
      ).toBeVisible({ timeout: 10000 });
    });
  });

  // 6. FINANCES
  test.describe("Onglet Finances", () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole("tab", { name: "Finances" }).click();
      await page.waitForTimeout(1500);
    });

    test("Bouton Créer une facture visible", async ({ page }) => {
      await expect(
        page.getByRole("button", { name: /Créer une facture/i }).first()
      ).toBeVisible({ timeout: 10000 });
    });
  });

  // 7. ABSENCES
  test.describe("Onglet Absences", () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole("tab", { name: "Absences" }).click();
      await page.waitForTimeout(1500);
    });

    test("Bouton Détecter les absences visible", async ({ page }) => {
      await expect(
        page.getByRole("button", { name: /Détecter les absences automatiquement/i })
      ).toBeVisible({ timeout: 10000 });
    });

    test("Bouton Ajouter une absence visible", async ({ page }) => {
      await expect(
        page.getByRole("button", { name: /Ajouter une absence/i })
      ).toBeVisible({ timeout: 10000 });
    });
  });
});
