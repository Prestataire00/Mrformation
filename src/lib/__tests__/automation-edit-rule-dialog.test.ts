import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Mini-dialog d'édition rapide des règles d'automatisation formation.
 *
 * Objectif : permettre à Loris de modifier le template email + autres
 * champs courants d'une règle existante sans passer par le RuleWizard
 * 5-étapes (qui est mode CREATE only et lourd pour juste changer un template).
 *
 * Couvre les rules formation uniquement — les rules CRM ont une structure
 * différente (action_type + config JSONB, pas de template email) et seraient
 * traitées par un composant dédié si besoin.
 */

const EDIT_DIALOG_PATH = resolve(
  process.cwd(),
  "src/components/automation/EditRuleDialog.tsx",
);

const AUTOMATION_PAGE_PATH = resolve(
  process.cwd(),
  "src/app/(dashboard)/admin/automation/page.tsx",
);

describe("EditRuleDialog component", () => {
  const src = readFileSync(EDIT_DIALOG_PATH, "utf-8");

  it("le fichier existe et exporte EditRuleDialog + EditableRule", () => {
    expect(existsSync(EDIT_DIALOG_PATH)).toBe(true);
    expect(src).toMatch(/export function EditRuleDialog/);
    expect(src).toMatch(/export interface EditableRule/);
  });

  it("charge les email_templates de l'entité quand le dialog s'ouvre", () => {
    expect(src).toMatch(/from\("email_templates"\)[\s\S]+?\.eq\("entity_id", entityId\)/);
    expect(src).toMatch(/useEffect[\s\S]+?if \(!open \|\| !entityId\)/);
  });

  it("UPDATE supabase direct sur formation_automation_rules (pattern handleToggle)", () => {
    expect(src).toMatch(
      /from\("formation_automation_rules"\)[\s\S]+?\.update\([\s\S]+?\.eq\("id", rule\.id\)/,
    );
  });

  it("payload patch inclut name, template_id, recipient_type, condition_subcontracted", () => {
    expect(src).toMatch(/name:\s*name\.trim\(\)/);
    expect(src).toMatch(/template_id:\s*templateId \|\| null/);
    expect(src).toMatch(/recipient_type:\s*recipientType/);
    expect(src).toMatch(/condition_subcontracted/);
  });

  it("days_offset n'est ajouté au payload QUE si trigger date-based (évite NOT NULL violation)", () => {
    expect(src).toMatch(/if \(isDateBased\)[\s\S]+?payload\.days_offset = Number\(daysOffset\)/);
  });

  it("toast d'erreur si fetch email_templates échoue", () => {
    expect(src).toMatch(
      /from\("email_templates"\)[\s\S]+?if \(error\)[\s\S]+?toast\(\{[\s\S]+?Erreur de chargement des templates/,
    );
  });

  it("days_offset n'est exposé que pour les triggers date-based", () => {
    expect(src).toMatch(/DATE_BASED_TRIGGERS[\s\S]+?session_start_minus_days[\s\S]+?session_end_plus_days/);
    expect(src).toMatch(/isDateBased\s*=[\s\S]+?DATE_BASED_TRIGGERS\.has\(rule\.trigger_type\)/);
    expect(src).toMatch(/\{isDateBased && \(/);
  });

  it("validation : nom obligatoire + days_offset >= 0 si date-based", () => {
    expect(src).toMatch(/Nom obligatoire/);
    expect(src).toMatch(/parsed < 0/);
  });

  it("re-hydrate le form quand on change de rule (useEffect [rule])", () => {
    expect(src).toMatch(/useEffect\([\s\S]+?if \(!rule\) return;[\s\S]+?setName\(rule\.name/);
  });

  it("condition_subcontracted a 3 valeurs (any / true / false)", () => {
    expect(src).toMatch(/"any" \| "true" \| "false"/);
    expect(src).toMatch(/conditionSub === "any" \? null : conditionSub === "true"/);
  });

  it("DialogDescription explique qu'il faut supprimer + recréer pour changer le trigger", () => {
    expect(src).toMatch(/supprimez la règle et recréez-la|trigger.*supprim|supprimez/i);
  });
});

describe("/admin/automation/page.tsx — intégration EditRuleDialog", () => {
  const src = readFileSync(AUTOMATION_PAGE_PATH, "utf-8");

  it("importe EditRuleDialog + EditableRule + icône Pencil", () => {
    expect(src).toMatch(/import \{ EditRuleDialog, type EditableRule \}/);
    expect(src).toMatch(/\bPencil\b[\s\S]+?from "lucide-react"/);
  });

  it("Rule type étendu avec template_id", () => {
    expect(src).toMatch(/template_id:\s*string \| null/);
  });

  it("fetchRules query inclut template_id", () => {
    expect(src).toMatch(/\.select\("[^"]*template_id[^"]*"\)/);
  });

  it("state editingRule + setter dans le composant", () => {
    expect(src).toMatch(/const \[editingRule, setEditingRule\] = useState<EditableRule \| null>/);
  });

  it("bouton Modifier (Pencil) entre Audit et Supprimer", () => {
    expect(src).toMatch(/<Pencil className=/);
    expect(src).toMatch(/onClick=\{[^}]*setEditingRule\(\{/);
  });

  it("rendu du dialog en bas du composant", () => {
    expect(src).toMatch(
      /<EditRuleDialog[\s\S]+?open=\{editingRule !== null\}[\s\S]+?onUpdated=\{fetchRules\}/,
    );
  });
});
