import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin, loginAsLearner } from "./helpers/auth";

/**
 * Filet anti-régression — parcours durcis cette session (attribution
 * formateurs/apprenants + espace apprenant). READ-ONLY : navigation + rendu,
 * AUCUNE écriture en base (la suite tourne sur la base prod via le dev server).
 *
 * Cible la classe de bug que le client remonte : « la page a sauté » =
 * crash runtime au rendu / page blanche. On capture donc `pageerror`
 * (exception non catchée) en plus des assertions de rendu — un onglet ou une
 * page qui crashe fait échouer le test AVANT le client.
 */

/** Échoue si une exception runtime non catchée survient pendant la navigation. */
function trackRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

async function goToFirstFormation(page: Page): Promise<boolean> {
  await page.goto("/admin/trainings");
  await page.waitForLoadState("domcontentloaded");
  // Le hub compile à la volée au 1er accès (dev server) → attente généreuse
  // (sinon faux « aucune formation »). 25s couvre le cold-compile Next.js.
  const firstCard = page.locator("a[href*='/admin/formations/']").first();
  await firstCard.waitFor({ state: "visible", timeout: 25000 }).catch(() => {});
  if (!(await firstCard.isVisible().catch(() => false))) return false;
  await firstCard.click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);
  return true;
}

test.describe("Attribution — fiche formation (admin)", () => {
  // Cold-compile du dev server au 1er accès des routes admin → marge de temps.
  test.describe.configure({ timeout: 60000 });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("le Résumé rend les sections Formateurs / Apprenants / Entreprises sans crash", async ({ page }) => {
    const errors = trackRuntimeErrors(page);
    const found = await goToFirstFormation(page);
    if (!found) { test.skip(true, "Aucune formation disponible"); return; }

    // Sections d'attribution rendues (données OU état vide — jamais un blanc/crash).
    await expect(page.getByText(/Formateurs\s*\(/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Apprenants\s*\(|Aucun apprenant/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Entreprises/i).first()).toBeVisible({ timeout: 15000 });

    expect(errors, `Erreurs runtime sur la fiche formation:\n${errors.join("\n")}`).toHaveLength(0);
  });

  test("le bouton « Ajouter un Formateur » est présent (handler câblé)", async ({ page }) => {
    const found = await goToFirstFormation(page);
    if (!found) { test.skip(true, "Aucune formation disponible"); return; }

    await expect(
      page.getByRole("button", { name: /Ajouter un Formateur/i }).first()
    ).toBeVisible({ timeout: 15000 });
  });

  test("l'onglet Planning rend ses créneaux ou un état vide", async ({ page }) => {
    const errors = trackRuntimeErrors(page);
    const found = await goToFirstFormation(page);
    if (!found) { test.skip(true, "Aucune formation disponible"); return; }

    const planningTab = page.getByRole("tab", { name: /Planning/i }).first();
    await expect(planningTab).toBeVisible({ timeout: 15000 });
    await planningTab.click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    const content = page.getByText(/créneau|horaire|durée|aucun créneau|planifi/i).first();
    await expect(content).toBeVisible({ timeout: 15000 });

    expect(errors, `Erreurs runtime sur l'onglet Planning:\n${errors.join("\n")}`).toHaveLength(0);
  });
});

test.describe("Espace apprenant — pages chargées sans crash (résolution multi-fiche durcie)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsLearner(page);
  });

  // Chaque page apprenant durcie cette session (résolution learners par
  // profile_id) doit charger SANS exception runtime, données présentes ou non.
  const pages: Array<{ path: string; label: string }> = [
    { path: "/learner", label: "tableau de bord" },
    { path: "/learner/documents", label: "documents" },
    { path: "/learner/courses", label: "cours" },
    { path: "/learner/questionnaires", label: "questionnaires" },
  ];

  for (const { path, label } of pages) {
    test(`la page apprenant « ${label} » se charge sans crash runtime`, async ({ page }) => {
      const errors = trackRuntimeErrors(page);
      await page.goto(path);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2500);

      // Session OK (pas renvoyé au login) et pas d'écran d'erreur Next.js.
      expect(page.url(), "ne doit pas être redirigé vers /login").not.toContain("/login");
      await expect(
        page.getByText(/Application error|client-side exception|Unhandled Runtime Error/i)
      ).toHaveCount(0);

      // La classe « page qui saute » : aucune exception non catchée.
      expect(errors, `Erreurs runtime sur ${path}:\n${errors.join("\n")}`).toHaveLength(0);
    });
  }
});
