import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Story aut-d-2 — trigger `certificate_ready`.
 *
 * Le PRD prévoyait un check croisé (session OK + tous émargements signés)
 * mais on adopte la philosophie V1 loose : l'admin est responsable de
 * marquer "terminée" uniquement quand tous les émargements sont signés.
 * Le check strict est documenté comme ADR V2 dans docs/automatisations.md.
 *
 * Couvre :
 * - Ping `certificate_ready` ajouté dans TabParcours.tsx:handleMarkCompleted
 *   juste après le ping `on_session_completion` existant.
 * - Pas de nouveau backend (la route /api/formations/automation-rules/trigger-event
 *   existante supporte n'importe quel trigger_type ; run-cron TARGETED MODE
 *   générique).
 * - ADR doc créé docs/automatisations.md (FR-AUT-56) couvrant les 3 triggers
 *   différés V2 : on_signature_complete, questionnaire_reminder, invoice_overdue.
 */

const TAB_PARCOURS_PATH = resolve(
  process.cwd(),
  "src/app/(dashboard)/admin/formations/[id]/_components/TabParcours.tsx",
);

const AUTOMATISATIONS_DOC_PATH = resolve(
  process.cwd(),
  "docs/automatisations.md",
);

describe("aut-d-2 — ping certificate_ready dans TabParcours.tsx", () => {
  const src = readFileSync(TAB_PARCOURS_PATH, "utf-8");

  it("conserve le ping on_session_completion existant", () => {
    expect(src).toMatch(/trigger_type: "on_session_completion"/);
  });

  it("ajoute un ping certificate_ready après on_session_completion", () => {
    expect(src).toMatch(/trigger_type: "certificate_ready"/);
  });

  it("certificate_ready utilise la route trigger-event (admin-auth + Bearer côté serveur)", () => {
    expect(src).toMatch(
      /fetch\("\/api\/formations\/automation-rules\/trigger-event"[\s\S]+?trigger_type: "certificate_ready"/,
    );
  });

  it("catch silencieux : un échec du ping ne casse pas le marquage 'terminée'", () => {
    expect(src).toMatch(
      /trigger_type: "certificate_ready"[\s\S]+?\}\),\s*\}\)\.catch\(/,
    );
  });

  it("les deux pings sont déclenchés dans handleMarkCompleted (transition status → completed)", () => {
    const markCompletedRegion = src.match(
      /async function handleMarkCompleted\([\s\S]+?^\s{2}\}/m,
    );
    expect(markCompletedRegion).not.toBeNull();
    expect(markCompletedRegion![0]).toMatch(/trigger_type: "on_session_completion"/);
    expect(markCompletedRegion![0]).toMatch(/trigger_type: "certificate_ready"/);
  });
});

describe("aut-d-2 — ADR docs/automatisations.md (FR-AUT-56)", () => {
  const docSrc = readFileSync(AUTOMATISATIONS_DOC_PATH, "utf-8");

  it("le doc existe", () => {
    expect(existsSync(AUTOMATISATIONS_DOC_PATH)).toBe(true);
  });

  it("liste les 7 triggers V1 supportés avec leur mécanisme", () => {
    for (const trigger of [
      "session_start_minus_days",
      "session_end_plus_days",
      "on_session_creation",
      "on_session_completion",
      "on_enrollment",
      "certificate_ready",
      "opco_deposit_reminder",
    ]) {
      expect(docSrc).toMatch(new RegExp(`\`${trigger}\``));
    }
  });

  it("documente les 3 triggers différés V2 avec justification", () => {
    expect(docSrc).toMatch(/`on_signature_complete`[\s\S]+?différé V2/);
    expect(docSrc).toMatch(/`questionnaire_reminder`[\s\S]+?différé V2/);
    expect(docSrc).toMatch(/`invoice_overdue`[\s\S]+?différé V2/);
  });

  it("explique la philosophie V1 loose pour certificate_ready (vs check strict V2)", () => {
    expect(docSrc).toMatch(/philosophie V1[\s\S]*loose/i);
    expect(docSrc).toMatch(/Check strict[\s\S]+?certificate_ready/);
  });
});
