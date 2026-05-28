import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DRY_RUN_DIALOG_PATH = resolve(
  process.cwd(),
  "src/components/automation/DryRunDialog.tsx",
);

const dialogSrc = readFileSync(DRY_RUN_DIALOG_PATH, "utf-8");

describe("aut-b-1 — <DryRunDialog> universel (formations + CRM)", () => {
  describe("Conventions Next.js / React", () => {
    it("est un Client Component ('use client')", () => {
      expect(dialogSrc).toMatch(/^"use client";/);
    });

    it("exporte un composant nommé DryRunDialog", () => {
      expect(dialogSrc).toMatch(/export function DryRunDialog\(/);
    });

    it("exporte le type DryRunDomain", () => {
      expect(dialogSrc).toMatch(
        /export type DryRunDomain = "formation" \| "crm"/,
      );
    });
  });

  describe("Props et signature (UX-DR-AUT-1)", () => {
    it("accepte les 6 props requises : open, onClose, ruleId, domain + 3 optionnelles", () => {
      expect(dialogSrc).toMatch(/open: boolean/);
      expect(dialogSrc).toMatch(/onClose: \(\) => void/);
      expect(dialogSrc).toMatch(/ruleId: string/);
      expect(dialogSrc).toMatch(/domain: DryRunDomain/);
      expect(dialogSrc).toMatch(/sessionId\?: string/);
      expect(dialogSrc).toMatch(/onDisableRule\?:/);
      expect(dialogSrc).toMatch(/ruleName\?: string/);
    });

    it("utilise Dialog max-w-4xl (UX-DR-AUT-1 — pas Sheet, modal centré)", () => {
      expect(dialogSrc).toMatch(/className="max-w-4xl/);
    });
  });

  describe("UX-DR-AUT-2 : libellé exact + bannière indélébile", () => {
    it("titre contient '🧪 Aperçu' (libellé Tester sans envoyer cohérent)", () => {
      expect(dialogSrc).toMatch(/🧪 Aperçu/);
    });

    it("bannière jaune avec texte EXACT 'Aucun email envoyé. Mode aperçu.'", () => {
      expect(dialogSrc).toMatch(/Aucun email envoyé\. Mode aperçu\./);
    });

    it("bannière a role='alert' (accessibilité — NFR-AUT-A11Y-1)", () => {
      expect(dialogSrc).toMatch(/role="alert"/);
    });

    it("bannière utilise les couleurs jaune (cohérence visuelle)", () => {
      expect(dialogSrc).toMatch(/border-yellow-300/);
      expect(dialogSrc).toMatch(/bg-yellow-50/);
    });
  });

  describe("Discriminator domain (CD-AUT-5)", () => {
    it("appelle /api/automation/dry-run pour domain='formation'", () => {
      expect(dialogSrc).toMatch(
        /domain === "formation"[\s\S]{0,200}?"\/api\/automation\/dry-run"/,
      );
    });

    it("appelle /api/crm/automations/dry-run pour domain='crm'", () => {
      expect(dialogSrc).toMatch(/\/api\/crm\/automations\/dry-run/);
    });

    it("envoie session_id pour formation, pas pour CRM", () => {
      expect(dialogSrc).toMatch(
        /domain === "formation"[\s\S]{0,200}?session_id: sessionId/,
      );
    });

    it("rend FormationDryRunContent si domain='formation'", () => {
      expect(dialogSrc).toMatch(/domain === "formation" && formationResult/);
      expect(dialogSrc).toMatch(/<FormationDryRunContent/);
    });

    it("rend CrmDryRunContent si domain='crm'", () => {
      expect(dialogSrc).toMatch(/domain === "crm" && crmResult/);
      expect(dialogSrc).toMatch(/<CrmDryRunContent/);
    });
  });

  describe("3 onglets shadcn (Destinataires / Aperçu mail / PJ)", () => {
    it("utilise les composants Tabs shadcn", () => {
      expect(dialogSrc).toMatch(/from "@\/components\/ui\/tabs"/);
      expect(dialogSrc).toMatch(/<Tabs defaultValue="recipients"/);
    });

    it("onglet 'Destinataires' avec count dynamique", () => {
      expect(dialogSrc).toMatch(
        /<TabsTrigger value="recipients"[\s\S]{0,300}?Destinataires \(\{recipientCount\}\)/,
      );
    });

    it("onglet 'Aperçu mail' avec rendu conditionnel (hasEmail)", () => {
      expect(dialogSrc).toMatch(/Aperçu mail/);
      // L'onglet email est conditionné par hasEmail = action_type == send_email
      expect(dialogSrc).toMatch(/\{hasEmail && \(/);
    });

    it("onglet 'Pièces jointes' avec count dynamique", () => {
      expect(dialogSrc).toMatch(
        /<TabsTrigger value="attachments"[\s\S]{0,300}?Pièces jointes \(\{attachmentCount\}\)/,
      );
    });
  });

  describe("Empty state (UX §5.8 + edge cases)", () => {
    it("affiche '🤷 Aucun destinataire ciblé' si 0 recipients (formations)", () => {
      expect(dialogSrc).toMatch(/Aucun destinataire ciblé actuellement/);
      expect(dialogSrc).toMatch(/🤷/);
    });

    it("affiche '🤷 Aucune cible éligible' si 0 cibles (CRM)", () => {
      expect(dialogSrc).toMatch(/Aucune cible éligible actuellement/);
    });
  });

  describe("UX-DR-AUT-7 : warnings visibles non-bloquants", () => {
    it("affiche un panneau warnings avec icône (variables non résolues)", () => {
      expect(dialogSrc).toMatch(/result\.warnings\.length > 0/);
      // Le panneau utilise des couleurs orange (warning) avec icône AlertTriangle
      expect(dialogSrc).toMatch(/border-orange-300/);
      expect(dialogSrc).toMatch(/<AlertTriangle/);
    });

    it("rendu mail reste affiché même si variables non résolues (non-blocking)", () => {
      // Le rendu HTML/text du mail est toujours rendu, indépendamment de result.warnings
      expect(dialogSrc).toMatch(/result\.rendered_email\.subject/);
      expect(dialogSrc).toMatch(/result\.rendered_email\.body/);
    });
  });

  describe("Footer : Fermer + Désactiver la règle", () => {
    it("bouton Fermer primary (single safe button)", () => {
      expect(dialogSrc).toMatch(/<Button onClick=\{onClose\}>Fermer<\/Button>/);
    });

    it("bouton 'Désactiver la règle' destructive ghost (escape hatch)", () => {
      expect(dialogSrc).toMatch(/Désactiver la règle/);
      expect(dialogSrc).toMatch(/variant="ghost"/);
      expect(dialogSrc).toMatch(/text-red-600/);
    });

    it("Désactiver la règle est conditionné par la prop onDisableRule", () => {
      expect(dialogSrc).toMatch(/onDisableRule \? \(/);
    });

    it("PAS de bouton 'Envoyer' ou 'Confirmer' (anti-ambiguïté UX-DR-AUT-2)", () => {
      expect(dialogSrc).not.toMatch(/<Button[^>]*>Envoyer</);
      expect(dialogSrc).not.toMatch(/<Button[^>]*>Confirmer</);
    });
  });

  describe("Loading + Error states", () => {
    it("affiche un loader pendant le fetch", () => {
      expect(dialogSrc).toMatch(/<Loader2/);
      expect(dialogSrc).toMatch(/Calcul de l&apos;aperçu en cours/);
    });

    it("affiche une erreur si le fetch échoue", () => {
      expect(dialogSrc).toMatch(/Impossible de calculer l&apos;aperçu/);
      expect(dialogSrc).toMatch(/border-red-300/);
    });
  });

  describe("CRM : action_type adapté (UX-DR-AUT — Prospects impactés pour update_scores)", () => {
    it("CrmDryRunContent affiche eligibility par trigger", () => {
      expect(dialogSrc).toMatch(/Object\.entries\(result\.eligibility\)/);
      expect(dialogSrc).toMatch(/eligibility\.count/);
      expect(dialogSrc).toMatch(/eligibility\.sample/);
    });

    it("affiche le trigger_type évalué (debug Loris)", () => {
      expect(dialogSrc).toMatch(/Déclencheur évalué/);
      expect(dialogSrc).toMatch(/\{result\.trigger_type\}/);
    });

    it("affiche un sample limité (max 5) avec count total", () => {
      expect(dialogSrc).toMatch(/Math\.min\(5, eligibility\.sample\.length\)/);
      expect(dialogSrc).toMatch(/eligibility\.count - eligibility\.sample\.length/);
    });
  });

  describe("Sécurité (NFR-AUT-SEC-5 garanti côté serveur)", () => {
    it("appelle uniquement les routes proxy (jamais run-cron ou crm/automations/run directement)", () => {
      // Le composant ne doit JAMAIS appeler les routes internes avec Bearer
      // ni run-cron sans le proxy admin-authenticated
      expect(dialogSrc).not.toMatch(/\/api\/formations\/automation-rules\/run-cron/);
      expect(dialogSrc).not.toMatch(/CRON_SECRET/);
      expect(dialogSrc).not.toMatch(/Bearer/);
    });

    it("n'envoie pas de Cookie/Authorization custom (utilise le cookie session natif du navigateur)", () => {
      // fetch() côté navigateur envoie automatiquement les cookies, pas besoin de header custom
      expect(dialogSrc).not.toMatch(/Cookie:/);
      expect(dialogSrc).not.toMatch(/Authorization:/);
    });
  });
});
