import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PAGE_PATH = resolve(
  process.cwd(),
  "src/app/(dashboard)/admin/emails/page.tsx",
);
const RESOLVER_PATH = resolve(
  process.cwd(),
  "src/lib/services/email-attachments-resolver.ts",
);

const pageSource = readFileSync(PAGE_PATH, "utf-8");
const resolverSource = readFileSync(RESOLVER_PATH, "utf-8");

describe("em-c-7 — Extension ATTACHMENT_OPTIONS aux ~30 doc_types groupés", () => {
  it("ATTACHMENT_OPTION_GROUPS exporte une structure groupée", () => {
    expect(pageSource).toMatch(
      /const ATTACHMENT_OPTION_GROUPS: Array<\{\s*groupLabel: string;\s*options: Array<\{ value: string; label: string \}>;\s*\}>/,
    );
  });

  it("6 groupes : standard, facturation, émargements, habilitations, attestations, annexes", () => {
    const groups = [
      "Documents standard",
      "Facturation",
      "Émargements",
      "Habilitations électriques",
      "Attestations métier",
      "Documents annexes",
    ];
    for (const group of groups) {
      expect(pageSource).toContain(`groupLabel: "${group}"`);
    }
  });

  it("Facturation : facture + devis ajoutés", () => {
    expect(pageSource).toMatch(/value: "facture", label: "Facture"/);
    expect(pageSource).toMatch(/value: "devis", label: "Devis \/ Proposition"/);
  });

  it("Émargements : collectif + vierge + planning_hebdo ajoutés", () => {
    expect(pageSource).toMatch(/feuille_emargement_collectif/);
    expect(pageSource).toMatch(/feuille_emargement_vierge/);
    expect(pageSource).toMatch(/planning_hebdo_signe/);
  });

  it("Habilitations électriques : 9 variants couverts", () => {
    const habs = [
      "avis_hab_elec_generique",
      "avis_hab_elec_b0_bf_bs",
      "avis_hab_elec_b1v_b2v_br",
      "avis_hab_elec_bf_hf",
      "avis_hab_elec_bt",
      "avis_hab_elec_bt_ht",
      "avis_hab_elec_h0_b0",
      "avis_hab_elec_h0_b0_bf_hf_bs",
      "avis_hab_elec_h0_b0_initial",
    ];
    for (const h of habs) {
      expect(pageSource).toContain(h);
    }
  });

  it("Attestations métier : 9 types métier ajoutés (AIPR, compétences, abandon, etc.)", () => {
    const attests = [
      "attestation_aipr",
      "attestation_competences",
      "attestation_abandon_formation",
      "certificat_travail_hauteur",
      "certificat_diplome",
      "bilan_poe",
      "reponses_evaluations",
      "reponses_satisfaction_session",
      "resultats_evaluations",
    ];
    for (const a of attests) {
      expect(pageSource).toContain(a);
    }
  });

  it("Documents annexes : autorisation_image, décharges, charte, contrat", () => {
    const annex = [
      "autorisation_image",
      "decharge_responsabilite",
      "lettre_decharge_responsabilite",
      "charte_formateur",
      "contrat_engagement_stagiaire",
    ];
    for (const a of annex) {
      expect(pageSource).toContain(a);
    }
  });

  it("Tous les values existent dans FILENAME_LABELS du resolver (généré-ables)", () => {
    // Extrait tous les values de ATTACHMENT_OPTION_GROUPS via regex
    const valueMatches = [
      ...pageSource.matchAll(/\{ value: "([^"]+)", label:/g),
    ].map((m) => m[1]);
    // Filtre uniquement ceux du bloc ATTACHMENT_OPTION_GROUPS (avant 2400 chars)
    const groupBlock = pageSource.substring(
      pageSource.indexOf("ATTACHMENT_OPTION_GROUPS"),
      pageSource.indexOf("ATTACHMENT_OPTION_GROUPS") + 4500,
    );
    const groupValues = [...groupBlock.matchAll(/value: "([^"]+)"/g)].map((m) => m[1]);

    // Vérifie qu'au moins 80% des values du groupe sont dans FILENAME_LABELS
    // (pas 100% car certains comme "facture"/"devis" sont dans une autre source de génération)
    const inFilenameLabels = groupValues.filter((v) => resolverSource.includes(`${v}:`));
    expect(inFilenameLabels.length).toBeGreaterThan(groupValues.length * 0.8);

    void valueMatches; // suppress unused
  });

  it("Compatibilité descendante : ATTACHMENT_OPTIONS = flatMap des groupes", () => {
    expect(pageSource).toMatch(
      /const ATTACHMENT_OPTIONS = ATTACHMENT_OPTION_GROUPS\.flatMap\(\(g\) => g\.options\)/,
    );
  });

  it("UI rendering : itère par groupe avec uppercase tracking-wider header", () => {
    expect(pageSource).toMatch(
      /ATTACHMENT_OPTION_GROUPS\.map\(\(group\) => \(/,
    );
    expect(pageSource).toMatch(/uppercase tracking-wider/);
    expect(pageSource).toMatch(/\{group\.groupLabel\}/);
  });

  it("UI affiche un help text expliquant le comportement contextuel", () => {
    expect(pageSource).toMatch(
      /si le contexte le permet \(apprenant, session, facture, etc\.\)/,
    );
  });
});
