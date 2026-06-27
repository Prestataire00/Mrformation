import { describe, it, expect } from "vitest";
import { resolveDocumentVariables, type ResolveContext } from "@/lib/utils/resolve-variables";
import { isEnrichedProgramContent } from "@/lib/utils/program-content";

/**
 * Garde-fou : le document « Programme de formation » tire ses variables de
 * `session.program` (table `programs`). Retour Loris : « PROGRAMME DE LA
 * FORMATION — aucune variable fonctionne ». Cause racine : la route
 * `generate-from-template` (bouton Voir/PDF de l'onglet Documents) chargeait
 * la session SANS le join `program:programs(*)` → `session.program` undefined
 * → toutes les variables programme retombaient sur leur fallback `[…]`.
 *
 * Ces tests verrouillent le contrat résolveur ↔ programme : si `program` est
 * présent, les variables rendent le vrai contenu ; s'il est absent, elles
 * rendent le fallback (l'état buggé). La correction est d'ajouter le join.
 */

const ctxWithProgram = {
  session: {
    start_date: "2026-09-01",
    end_date: "2026-09-02",
    program: {
      objectives: "Maîtriser les fondamentaux de la sécurité électrique",
      version: 3,
      description: "Formation habilitation électrique B1V",
      created_at: "2026-01-15T00:00:00.000Z",
      content: {
        progression: "Jour 1 : théorie. Jour 2 : pratique sur platine.",
        target_audience: "Électriciens et techniciens de maintenance",
      },
    },
  },
} as unknown as ResolveContext;

const ctxNoProgram = {
  session: { start_date: "2026-09-01", end_date: "2026-09-02" },
} as unknown as ResolveContext;

describe("résolution des variables Programme (session.program)", () => {
  it("résout les variables {{…}} depuis session.program quand il est chargé", () => {
    expect(resolveDocumentVariables("{{programme_objectifs}}", ctxWithProgram))
      .toContain("Maîtriser les fondamentaux");
    expect(resolveDocumentVariables("{{version_programme}}", ctxWithProgram)).toBe("3");
    expect(resolveDocumentVariables("{{programme_contenu}}", ctxWithProgram))
      .toContain("Jour 1");
    expect(resolveDocumentVariables("{{programme_public}}", ctxWithProgram))
      .toContain("Électriciens");
    expect(resolveDocumentVariables("{{description_formation}}", ctxWithProgram))
      .toContain("habilitation électrique B1V");
  });

  it("résout aussi le format alias [%…%] utilisé par le template programme", () => {
    // [%Version du programme%] → {{version_programme}} (cf ALIAS_TO_VARIABLE_KEY)
    expect(resolveDocumentVariables("Version : [%Version du programme%]", ctxWithProgram))
      .toBe("Version : 3");
  });

  it("retombe sur les fallbacks [...] quand session.program est absent (état buggé)", () => {
    // C'est précisément ce que voyait Loris : aucune donnée programme.
    expect(resolveDocumentVariables("{{programme_objectifs}}", ctxNoProgram)).toBe("[Objectifs]");
    expect(resolveDocumentVariables("{{version_programme}}", ctxNoProgram)).toBe("1");
    expect(resolveDocumentVariables("{{programme_contenu}}", ctxNoProgram))
      .toBe("[Contenu du programme]");
  });
});

/**
 * Lot A2 — Résolveurs du template v2 (PDF format exemples client). Vérifie le
 * rendu des séquences enrichies et le repli propre (pas de label orphelin) sur
 * les modules partiels / le content legacy.
 */
const ctxEnrichi = {
  session: {
    program: {
      objectives: "Objectif racine ignoré",
      content: {
        general_objectives: [
          "Comprendre les bonnes pratiques d'installation",
          "Sécuriser le résident lors des transferts",
        ],
        access_terms: "Accès sous 10 jours.\nInscription en ligne.",
        modules: [
          {
            id: 1,
            title: "Installer le résident au lit",
            duration_hours: 7,
            summary_objective: "Maîtriser les positions d'installation",
            operational_objectives: [
              "Identifier les points d'appui",
              "Prévenir les escarres",
            ],
            content_details: ["Anatomie des appuis", "Aides techniques"],
            methods: "Ateliers pratiques en binôme",
            evaluation: "Mise en situation observée",
          },
          {
            id: 2,
            title: "Transfert lit-fauteuil",
            duration_hours: 7,
            summary_objective: "Réaliser un transfert sécurisé",
            operational_objectives: ["Choisir la technique adaptée"],
            content_details: ["Manutention manuelle"],
            // Module partiel : ni methods ni evaluation.
          },
        ],
      },
    },
  },
} as unknown as ResolveContext;

const ctxLegacy = {
  session: {
    program: {
      content: {
        modules: [
          { id: 1, title: "Module legacy", topics: ["Sujet A", "Sujet B"] },
        ],
      },
    },
  },
} as unknown as ResolveContext;

describe("Lot A2 — résolveurs template v2 (séquences enrichies)", () => {
  it("{{objectifs_generaux}} rend des puces depuis general_objectives, précédées du titre de section", () => {
    const html = resolveDocumentVariables("{{objectifs_generaux}}", ctxEnrichi);
    // PATCH 1 : le titre de section est désormais émis par le résolveur
    // (anti-titre-orphelin), avec le MÊME markup que le template v2.
    expect(html).toContain("<h2 class=\"section\">Objectifs généraux</h2>");
    expect(html).toContain("<ul class=\"bullets\">");
    expect(html).toContain("Comprendre les bonnes pratiques");
    expect(html).toContain("Sécuriser le résident");
  });

  it("{{objectifs_generaux}} renvoie \"\" (ni titre, ni bloc) quand aucun objectif", () => {
    const ctxVide = {
      session: { program: { content: { modules: [] } } },
    } as unknown as ResolveContext;
    const html = resolveDocumentVariables("{{objectifs_generaux}}", ctxVide);
    expect(html).toBe("");
  });

  it("{{delais_modalites_acces}} rend access_terms avec <br>", () => {
    const html = resolveDocumentVariables("{{delais_modalites_acces}}", ctxEnrichi);
    expect(html).toContain("Accès sous 10 jours.");
    expect(html).toContain("<br>");
    expect(html).toContain("Inscription en ligne.");
  });

  it("{{sequences_resume}} produit une grille de cartes (titre + durée + objectif), précédée du titre de section", () => {
    const html = resolveDocumentVariables("{{sequences_resume}}", ctxEnrichi);
    // PATCH 1 : titre de section émis par le résolveur.
    expect(html).toContain("<h2 class=\"section\">Résumé des séquences</h2>");
    expect(html).toContain("seq-grid");
    expect(html).toContain("seq-card");
    expect(html).toContain("Installer le résident au lit");
    expect(html).toContain("<div class=\"seq-duration\">7h</div>");
    // Apostrophe échappée par escapeProgrammeHtml (' → &#39;).
    expect(html).toContain("Maîtriser les positions d&#39;installation");
  });

  it("{{sequences_resume}} renvoie \"\" quand aucun module", () => {
    const ctxVide = {
      session: { program: { content: { modules: [] } } },
    } as unknown as ResolveContext;
    expect(resolveDocumentVariables("{{sequences_resume}}", ctxVide)).toBe("");
  });

  it("{{sequences_resume}} n'émet pas de <p></p> vide et skip un module sans titre ni objectif", () => {
    const ctx = {
      session: {
        program: {
          content: {
            modules: [
              // Module valide mais sans summary_objective → pas de <p></p>.
              { id: 1, title: "Séquence sans synthèse", duration_hours: 3 },
              // Module sans titre ni summary → carte entièrement omise.
              { id: 2, duration_hours: 2 },
            ],
          },
        },
      },
    } as unknown as ResolveContext;
    const html = resolveDocumentVariables("{{sequences_resume}}", ctx);
    expect(html).toContain("Séquence sans synthèse");
    // PATCH 2 : pas de paragraphe vide pour le module sans objectif.
    expect(html).not.toContain("<p></p>");
    // PATCH 2 : une seule carte (le module 2 vide est skip).
    expect(html.match(/seq-card/g)).toHaveLength(1);
  });

  it("{{sequences_detail}} produit les blocs texte avec titres, puces et labels, précédés du titre de section", () => {
    const html = resolveDocumentVariables("{{sequences_detail}}", ctxEnrichi);
    // PATCH 1 : titre de section émis par le résolveur.
    expect(html).toContain("<h2 class=\"section\">Déroulé pédagogique détaillé</h2>");
    // Titre de séquence + durée
    expect(html).toContain("Installer le résident au lit (7h)");
    // Labels présents pour le module complet
    expect(html).toContain("Objectifs opérationnels");
    expect(html).toContain("Contenus détaillés");
    expect(html).toContain("Méthodes pédagogiques");
    expect(html).toContain("Évaluation");
    // Puces des objectifs opérationnels (apostrophe échappée)
    expect(html).toContain("Identifier les points d&#39;appui");
    expect(html).toContain("Prévenir les escarres");
    // Texte des méthodes / évaluation
    expect(html).toContain("Ateliers pratiques en binôme");
    expect(html).toContain("Mise en situation observée");
  });

  it("module partiel : pas de label orphelin « Méthodes »/« Évaluation »", () => {
    const html = resolveDocumentVariables("{{sequences_detail}}", ctxEnrichi);
    // Le 2e module n'a ni methods ni evaluation → on isole son bloc.
    const blocs = html.split("<div class=\"sequence\">");
    const blocModule2 = blocs.find((b) => b.includes("Transfert lit-fauteuil"));
    expect(blocModule2).toBeDefined();
    expect(blocModule2!).not.toContain("Méthodes pédagogiques");
    expect(blocModule2!).not.toContain("Évaluation");
    // Mais ses champs présents restent rendus.
    expect(blocModule2!).toContain("Objectifs opérationnels");
    expect(blocModule2!).toContain("Choisir la technique adaptée");
  });

  it("repli : module legacy sans champs enrichis affiche ses topics en « Contenus »", () => {
    const html = resolveDocumentVariables("{{sequences_detail}}", ctxLegacy);
    expect(html).toContain("Module legacy");
    expect(html).toContain("Contenus");
    expect(html).toContain("Sujet A");
  });

  it("{{sequences_detail}} renvoie \"\" quand aucun module", () => {
    const ctxVide = {
      session: { program: { content: { modules: [] } } },
    } as unknown as ResolveContext;
    expect(resolveDocumentVariables("{{sequences_detail}}", ctxVide)).toBe("");
  });

  it("{{sequences_detail}} skip un module sans titre ni aucun corps (pas de bloc sequence)", () => {
    const ctx = {
      session: {
        program: {
          content: {
            // Module entièrement vide (ni titre, ni champ enrichi, ni topics).
            modules: [{ id: 1, duration_hours: 4 }],
          },
        },
      },
    } as unknown as ResolveContext;
    const html = resolveDocumentVariables("{{sequences_detail}}", ctx);
    // PATCH 2 : aucun bloc → résolveur entièrement vide (ni titre de section).
    expect(html).toBe("");
    expect(html).not.toContain("class=\"sequence\"");
  });

  it("{{sequences_detail}} n'émet pas de <h3></h3> vide quand un module a du corps mais pas de titre", () => {
    const ctx = {
      session: {
        program: {
          content: {
            modules: [
              {
                id: 1,
                // Pas de titre, mais des objectifs opérationnels.
                operational_objectives: ["Objectif sans titre de module"],
              },
            ],
          },
        },
      },
    } as unknown as ResolveContext;
    const html = resolveDocumentVariables("{{sequences_detail}}", ctx);
    // PATCH 2 : le bloc existe (il a du corps) mais sans <h3> orphelin vide.
    expect(html).toContain("class=\"sequence\"");
    expect(html).not.toContain("<h3></h3>");
    expect(html).toContain("Objectif sans titre de module");
  });
});

describe("Lot A2 — isEnrichedProgramContent (routage v2/legacy)", () => {
  it("vrai si general_objectives non vide", () => {
    expect(isEnrichedProgramContent(ctxEnrichi.session!.program!.content)).toBe(true);
  });

  it("vrai si un module porte operational_objectives ou content_details", () => {
    expect(
      isEnrichedProgramContent({
        modules: [{ id: 1, title: "M", operational_objectives: ["x"] }],
      }),
    ).toBe(true);
  });

  it("faux pour un content legacy (sans champs enrichis)", () => {
    expect(isEnrichedProgramContent(ctxLegacy.session!.program!.content)).toBe(false);
  });

  it("faux pour null / non-objet / objet vide", () => {
    expect(isEnrichedProgramContent(null)).toBe(false);
    expect(isEnrichedProgramContent("foo")).toBe(false);
    expect(isEnrichedProgramContent({})).toBe(false);
    expect(isEnrichedProgramContent({ general_objectives: [] })).toBe(false);
  });
});
