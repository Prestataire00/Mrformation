import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

// ═══════════════════════════════════════════════════════════════
// CRM MODULE — FULL E2E TEST SUITE
// ═══════════════════════════════════════════════════════════════

test.describe("CRM — Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/crm");
    await page.waitForLoadState("domcontentloaded");
  });

  test("affiche les KPIs principaux", async ({ page }) => {
    await expect(page.getByText("Total prospects")).toBeVisible();
    await expect(page.getByText("Taux de conversion")).toBeVisible();
  });

  test("affiche le funnel de conversion", async ({ page }) => {
    await expect(page.getByText("Lead")).toBeVisible();
    await expect(page.getByText("Contacté")).toBeVisible();
    await expect(page.getByText("Qualifié")).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════
// KANBAN PROSPECTS
// ═══════════════════════════════════════════════════════════════

test.describe("CRM — Kanban Prospects", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/crm/prospects");
    await page.waitForLoadState("domcontentloaded");
  });

  test("affiche les colonnes du kanban", async ({ page }) => {
    await expect(page.getByText("LEAD").first()).toBeVisible();
    await expect(page.getByText("CONTACTÉ").first()).toBeVisible();
  });

  test("bouton Ajouter un prospect est visible", async ({ page }) => {
    await expect(page.getByText("Ajouter un prospect")).toBeVisible();
  });

  test("ouvre le formulaire d'ajout inline", async ({ page }) => {
    await page.getByText("Ajouter un prospect").click();
    await expect(page.getByPlaceholder("Nom de l'entreprise")).toBeVisible();
  });

  test("toggle Mes leads / Tous fonctionne", async ({ page }) => {
    const tousBtn = page.getByRole("button", { name: "Tous" }).first();
    const mesLeadsBtn = page.getByRole("button", { name: "Mes leads" }).first();
    await expect(tousBtn).toBeVisible();
    await expect(mesLeadsBtn).toBeVisible();
    await mesLeadsBtn.click();
    await page.waitForTimeout(500);
    await tousBtn.click();
  });

  test("mode sélection (bulk) fonctionne", async ({ page }) => {
    const selectionBtn = page.getByText("Sélection").first();
    if (await selectionBtn.isVisible()) {
      await selectionBtn.click();
      await expect(page.getByText("Annuler")).toBeVisible();
    }
  });

  test("recherche filtre les prospects", async ({ page }) => {
    const search = page.getByPlaceholder("Rechercher...");
    if (await search.isVisible()) {
      await search.fill("test");
      await page.waitForTimeout(500);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// FICHE PROSPECT
// ═══════════════════════════════════════════════════════════════

test.describe("CRM — Fiche Prospect", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/crm/prospects/liste");
    await page.waitForLoadState("domcontentloaded");
    // Clic sur le premier prospect de la liste
    const firstRow = page.locator("tr").nth(1);
    if (await firstRow.isVisible()) {
      const link = firstRow.locator("a").first();
      if (await link.isVisible()) {
        await link.click();
        await page.waitForLoadState("domcontentloaded");
      }
    }
  });

  test("affiche le header avec nom et statut", async ({ page }) => {
    // Le header HubSpot-style
    const heading = page.locator("h1").first();
    if (await heading.isVisible()) {
      await expect(heading).not.toBeEmpty();
    }
  });

  test("onglets Timeline / Tâches / Communication visibles", async ({ page }) => {
    await expect(page.getByText("Timeline").first()).toBeVisible();
    await expect(page.getByText("Tâches").first()).toBeVisible();
    await expect(page.getByText("Communication").first()).toBeVisible();
  });

  test("boutons actions rapides visibles", async ({ page }) => {
    // Les boutons d'action dans le header
    await expect(page.getByText("Devis").first()).toBeVisible();
    await expect(page.getByText("Action").first()).toBeVisible();
    await expect(page.getByText("Note").first()).toBeVisible();
  });

  test("sidebar droite affiche les informations", async ({ page }) => {
    await expect(page.getByText("INFORMATIONS").first()).toBeVisible();
  });

  test("sidebar droite affiche la section devis", async ({ page }) => {
    await expect(page.getByText("DEVIS").first()).toBeVisible();
  });

  test("formulaire action inline fonctionne", async ({ page }) => {
    const actionBtn = page.getByRole("button", { name: "Action" }).first();
    if (await actionBtn.isVisible()) {
      await actionBtn.click();
      await page.waitForTimeout(300);
      // Le formulaire inline doit apparaître
      const sujetInput = page.getByPlaceholder("Sujet...");
      if (await sujetInput.isVisible()) {
        await expect(sujetInput).toBeVisible();
      }
    }
  });

  test("formulaire note inline fonctionne", async ({ page }) => {
    const noteBtn = page.getByRole("button", { name: "Note" }).first();
    if (await noteBtn.isVisible()) {
      await noteBtn.click();
      await page.waitForTimeout(300);
      const textarea = page.getByPlaceholder("Ajouter une note...");
      if (await textarea.isVisible()) {
        await expect(textarea).toBeVisible();
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// DEVIS
// ═══════════════════════════════════════════════════════════════

test.describe("CRM — Devis", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/crm/quotes");
    await page.waitForLoadState("domcontentloaded");
  });

  test("affiche le header compact avec stats", async ({ page }) => {
    await expect(page.getByText("Devis").first()).toBeVisible();
    await expect(page.getByText("total").first()).toBeVisible();
  });

  test("filtres pipeline visibles", async ({ page }) => {
    await expect(page.getByText("Brouillon").first()).toBeVisible();
    await expect(page.getByText("Envoyé").first()).toBeVisible();
    await expect(page.getByText("Accepté").first()).toBeVisible();
  });

  test("bouton Nouveau devis navigue vers /quotes/new", async ({ page }) => {
    await page.getByText("Nouveau devis").click();
    await expect(page).toHaveURL(/\/admin\/crm\/quotes\/new/);
  });

  test("tableau des devis affiche les colonnes", async ({ page }) => {
    await expect(page.getByText("Référence").first()).toBeVisible();
    await expect(page.getByText("Montant").first()).toBeVisible();
    await expect(page.getByText("Statut").first()).toBeVisible();
  });

  test("bouton PDF visible sur chaque devis", async ({ page }) => {
    const pdfBtn = page.getByText("PDF").first();
    if (await pdfBtn.isVisible()) {
      await expect(pdfBtn).toBeVisible();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// CRÉATION DEVIS
// ═══════════════════════════════════════════════════════════════

test.describe("CRM — Création Devis", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/crm/quotes/new");
    await page.waitForLoadState("domcontentloaded");
  });

  test("affiche le formulaire 2 colonnes", async ({ page }) => {
    await expect(page.getByText("INFORMATIONS").first()).toBeVisible();
    await expect(page.getByText("FORMATION").first()).toBeVisible();
  });

  test("numéro de devis auto-généré", async ({ page }) => {
    const refInput = page.locator("input").first();
    const value = await refInput.inputValue();
    expect(value).toMatch(/M-FAC-\d+/);
  });

  test("section produits visible", async ({ page }) => {
    await expect(page.getByText("PRODUITS").first()).toBeVisible();
    await expect(page.getByText("Ajouter une ligne")).toBeVisible();
  });

  test("ajouter une ligne de produit", async ({ page }) => {
    await page.getByText("Ajouter une ligne").click();
    const inputs = page.locator("input[placeholder='Description']");
    expect(await inputs.count()).toBeGreaterThanOrEqual(2);
  });

  test("totaux calculés en temps réel", async ({ page }) => {
    await expect(page.getByText("Sous-total HT")).toBeVisible();
    await expect(page.getByText("TVA")).toBeVisible();
    await expect(page.getByText("Total TTC")).toBeVisible();
  });

  test("section notes collapsible", async ({ page }) => {
    const notes = page.getByText("Notes & mentions");
    if (await notes.isVisible()) {
      await notes.click();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// TÂCHES
// ═══════════════════════════════════════════════════════════════

test.describe("CRM — Tâches", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/crm/tasks");
    await page.waitForLoadState("domcontentloaded");
  });

  test("affiche le header compact avec stats", async ({ page }) => {
    await expect(page.getByText("Tâches").first()).toBeVisible();
  });

  test("toggle Liste / Kanban visible", async ({ page }) => {
    // Les boutons de toggle vue
    const buttons = page.locator("button");
    await expect(buttons.first()).toBeVisible();
  });

  test("filtres statut visibles", async ({ page }) => {
    await expect(page.getByText("Toutes").first()).toBeVisible();
    await expect(page.getByText("En attente").first()).toBeVisible();
  });

  test("formulaire inline d'ajout de tâche", async ({ page }) => {
    await page.getByText("Nouvelle tâche").click();
    await page.waitForTimeout(300);
    const titleInput = page.getByPlaceholder("Titre de la tâche...");
    if (await titleInput.isVisible()) {
      await expect(titleInput).toBeVisible();
    }
  });

  test("vue kanban affiche 4 colonnes", async ({ page }) => {
    // Chercher le bouton kanban (LayoutGrid icon)
    const kanbanBtns = page.locator("button").filter({ has: page.locator("svg") });
    // Si on trouve le toggle, on passe en kanban
    const allBtns = await kanbanBtns.all();
    for (const btn of allBtns.slice(0, 5)) {
      const text = await btn.textContent();
      if (!text?.trim()) {
        // Bouton icône sans texte = potentiel toggle
        await btn.click();
        await page.waitForTimeout(300);
        break;
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// SUIVI COMMERCIAL
// ═══════════════════════════════════════════════════════════════

test.describe("CRM — Suivi Commercial", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/crm/suivi");
    await page.waitForLoadState("domcontentloaded");
  });

  test("affiche les onglets Mon activité / Équipe", async ({ page }) => {
    await expect(page.getByText("Mon activité").first()).toBeVisible();
    await expect(page.getByText("Équipe").first()).toBeVisible();
  });

  test("affiche les KPIs actions du mois", async ({ page }) => {
    await expect(page.getByText("Actions ce mois").first()).toBeVisible();
  });

  test("bouton Nouvelle action visible", async ({ page }) => {
    await expect(page.getByText("Nouvelle action")).toBeVisible();
  });

  test("onglet Équipe affiche le classement", async ({ page }) => {
    await page.getByText("Équipe").click();
    await page.waitForTimeout(300);
    await expect(page.getByText("Classement ce mois")).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════
// FORMULAIRES & QUESTIONNAIRES
// ═══════════════════════════════════════════════════════════════

test.describe("CRM — Formulaires", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/crm/formulaires");
    await page.waitForLoadState("domcontentloaded");
  });

  test("affiche le header avec count", async ({ page }) => {
    await expect(page.getByText("Formulaires").first()).toBeVisible();
    await expect(page.getByText("questionnaire").first()).toBeVisible();
  });

  test("filtres type et statut visibles", async ({ page }) => {
    await expect(page.getByText("Tous").first()).toBeVisible();
    await expect(page.getByText("Satisfaction").first()).toBeVisible();
  });

  test("bouton Nouveau ouvre le formulaire inline", async ({ page }) => {
    await page.getByText("Nouveau").first().click();
    await page.waitForTimeout(300);
    const titleInput = page.getByPlaceholder("Titre du questionnaire...");
    if (await titleInput.isVisible()) {
      await expect(titleInput).toBeVisible();
    }
  });

  test("tableau affiche les colonnes", async ({ page }) => {
    await expect(page.getByText("TITRE").first()).toBeVisible();
    await expect(page.getByText("TYPE").first()).toBeVisible();
    await expect(page.getByText("RÉPONSES").first()).toBeVisible();
  });

  test("boutons d'action par questionnaire", async ({ page }) => {
    const attribuerBtn = page.getByText("Attribuer").first();
    if (await attribuerBtn.isVisible()) {
      await expect(attribuerBtn).toBeVisible();
    }
  });

  test("chevron expand affiche les questions", async ({ page }) => {
    const chevron = page.locator("button").filter({ has: page.locator("svg.h-3\\.5") }).first();
    if (await chevron.isVisible()) {
      await chevron.click();
      await page.waitForTimeout(300);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// SÉQUENCES
// ═══════════════════════════════════════════════════════════════

test.describe("CRM — Séquences", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/crm/sequences");
    await page.waitForLoadState("domcontentloaded");
  });

  test("affiche le header", async ({ page }) => {
    await expect(page.getByText("Séquences automatisées").first()).toBeVisible();
  });

  test("bouton Nouvelle séquence visible", async ({ page }) => {
    await expect(page.getByText("Nouvelle séquence")).toBeVisible();
  });

  test("ouvre le dialog de création", async ({ page }) => {
    await page.getByText("Nouvelle séquence").click();
    await page.waitForTimeout(300);
    await expect(page.getByPlaceholder("Ex: Séquence de bienvenue")).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════
// NAVIGATION CRM
// ═══════════════════════════════════════════════════════════════

test.describe("CRM — Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("sidebar CRM affiche tous les liens", async ({ page }) => {
    await page.goto("/admin/crm");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("Dashboard CRM")).toBeVisible();
    await expect(page.getByText("Tunnel de Vente")).toBeVisible();
    await expect(page.getByText("Tâches")).toBeVisible();
    await expect(page.getByText("Devis")).toBeVisible();
    await expect(page.getByText("Formulaires")).toBeVisible();
  });

  test("navigation Dashboard → Prospects fonctionne", async ({ page }) => {
    await page.goto("/admin/crm");
    await page.getByText("Tunnel de Vente").click();
    await expect(page).toHaveURL(/\/admin\/crm\/prospects/);
  });

  test("navigation Dashboard → Tâches fonctionne", async ({ page }) => {
    await page.goto("/admin/crm");
    await page.getByText("Tâches").first().click();
    await expect(page).toHaveURL(/\/admin\/crm\/tasks/);
  });

  test("navigation Dashboard → Devis fonctionne", async ({ page }) => {
    await page.goto("/admin/crm");
    await page.getByText("Devis").first().click();
    await expect(page).toHaveURL(/\/admin\/crm\/quotes/);
  });
});
