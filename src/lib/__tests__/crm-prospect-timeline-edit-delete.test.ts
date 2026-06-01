import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Fix bug Loris : impossible de supprimer/modifier une action dans
 * l'onglet timeline de la page prospect.
 *
 * Périmètre : seuls les types d'actions saisis manuellement par Loris
 * sont modifiables/supprimables (call, email, meeting, comment, relance).
 * Les LOGS SYSTÈME (status_change, quote_*, task_created, document_sent,
 * creation synthétique) restent verrouillés pour préserver l'intégrité
 * de l'historique commercial.
 */

const DIALOG_PATH = resolve(
  process.cwd(),
  "src/components/crm/EditCommercialActionDialog.tsx",
);

const PAGE_PATH = resolve(
  process.cwd(),
  "src/app/(dashboard)/admin/crm/prospects/[id]/page.tsx",
);

describe("EditCommercialActionDialog component", () => {
  const src = readFileSync(DIALOG_PATH, "utf-8");

  it("le fichier existe et exporte EditCommercialActionDialog + EditableCommercialAction", () => {
    expect(existsSync(DIALOG_PATH)).toBe(true);
    expect(src).toMatch(/export function EditCommercialActionDialog/);
    expect(src).toMatch(/export interface EditableCommercialAction/);
  });

  it("Select propose UNIQUEMENT les 5 types éditables (pas les logs système)", () => {
    expect(src).toMatch(/const EDITABLE_TYPES =/);
    for (const value of ["call", "email", "meeting", "relance", "comment"]) {
      expect(src).toMatch(new RegExp(`value: "${value}"`));
    }
    // Verrouillés : ne doivent PAS apparaître dans EDITABLE_TYPES
    for (const locked of ["status_change", "quote_sent", "task_created", "document_sent"]) {
      expect(src).not.toMatch(new RegExp(`value: "${locked}"`));
    }
  });

  it("UPDATE supabase direct sur crm_commercial_actions (pattern handleToggle)", () => {
    expect(src).toMatch(
      /from\("crm_commercial_actions"\)[\s\S]+?\.update\([\s\S]+?\.eq\("id", action\.id\)/,
    );
  });

  it("payload patch inclut action_type, subject, content uniquement (pas entity_id ni id)", () => {
    expect(src).toMatch(/action_type:\s*type/);
    expect(src).toMatch(/subject:\s*subject\.trim\(\)/);
    expect(src).toMatch(/content:\s*content\.trim\(\) \|\| null/);
    expect(src).not.toMatch(/entity_id:\s*[A-Za-z]/);
    expect(src).not.toMatch(/author_id:\s*[A-Za-z]/);
  });

  it("validation : sujet obligatoire", () => {
    expect(src).toMatch(/Sujet obligatoire/);
    expect(src).toMatch(/!subject\.trim\(\)/);
  });

  it("toast d'erreur si update échoue", () => {
    expect(src).toMatch(
      /if \(error\)[\s\S]+?toast\(\{[\s\S]+?title: "Erreur"[\s\S]+?variant: "destructive"/,
    );
  });

  it("re-hydrate le form quand on change d'action (useEffect [action])", () => {
    expect(src).toMatch(/useEffect\([\s\S]+?if \(!action\) return;[\s\S]+?setType\(action\.action_type/);
  });

  it("DialogDescription précise que les actions système ne sont pas modifiables", () => {
    expect(src).toMatch(/actions générées automatiquement/i);
    expect(src).toMatch(/pas modifiables/i);
  });

  it("UPDATE wrappé try/catch/finally (réseau down, abort, etc.)", () => {
    expect(src).toMatch(
      /handleSubmit[\s\S]+?try \{[\s\S]+?catch \(err\)[\s\S]+?finally \{[\s\S]+?setSaving\(false\)/,
    );
  });

  it("EditableCommercialAction.action_type typé union des 5 valeurs éditables (pas string laxe)", () => {
    expect(src).toMatch(
      /action_type:\s*"call" \| "email" \| "meeting" \| "comment" \| "relance"/,
    );
  });

  it("docstring honnête sur le verrouillage UI-only (pas de promesse fausse d'intégrité audit)", () => {
    expect(src).toMatch(/Défense en profondeur incomplète|UI-only|UI only/i);
    expect(src).toMatch(/trigger BEFORE UPDATE/i);
  });
});

describe("/admin/crm/prospects/[id]/page.tsx — intégration edit/delete actions", () => {
  const src = readFileSync(PAGE_PATH, "utf-8");

  it("importe EditCommercialActionDialog + EditableCommercialAction", () => {
    expect(src).toMatch(/import \{[\s\S]+?EditCommercialActionDialog,[\s\S]+?EditableCommercialAction[\s\S]+?\} from "@\/components\/crm\/EditCommercialActionDialog"/);
  });

  it("définit EDITABLE_ACTION_TYPES = Set des 5 types manuels", () => {
    expect(src).toMatch(/const EDITABLE_ACTION_TYPES = new Set\(/);
    for (const value of ["call", "email", "meeting", "comment", "relance"]) {
      expect(src).toMatch(new RegExp(`"${value}"`));
    }
  });

  it("ActivityEntry étendu avec rawSubject / rawContent pour pré-remplir le dialog", () => {
    expect(src).toMatch(/rawSubject\?:\s*string \| null/);
    expect(src).toMatch(/rawContent\?:\s*string \| null/);
  });

  it("fetchTimeline conserve rawSubject + rawContent", () => {
    expect(src).toMatch(/rawSubject:\s*a\.subject/);
    expect(src).toMatch(/rawContent:\s*a\.content/);
  });

  it("state editingAction + deletingActionId", () => {
    expect(src).toMatch(/const \[editingAction, setEditingAction\] = useState<EditableCommercialAction \| null>/);
    expect(src).toMatch(/const \[deletingActionId, setDeletingActionId\] = useState<string \| null>/);
  });

  it("handleDeleteAction : confirm + DELETE supabase + toast + refetch", () => {
    expect(src).toMatch(/async function handleDeleteAction\(actionId: string\)/);
    expect(src).toMatch(/confirm\("Supprimer cette action/);
    expect(src).toMatch(
      /from\("crm_commercial_actions"\)[\s\S]+?\.delete\(\)[\s\S]+?\.eq\("id", actionId\)/,
    );
    expect(src).toMatch(/title: "Action supprimée"/);
    expect(src).toMatch(/handleDeleteAction[\s\S]+?fetchTimeline\(prospect\)/);
  });

  it("boutons Modifier + Supprimer rendus UNIQUEMENT si isEditable", () => {
    expect(src).toMatch(/const isEditable = EDITABLE_ACTION_TYPES\.has\(a\.type\)/);
    expect(src).toMatch(/\{isEditable && \(/);
  });

  it("bouton Modifier ouvre le dialog avec action pré-remplie (id, action_type, subject, content)", () => {
    expect(src).toMatch(
      /setEditingAction\(\{[\s\S]+?id: a\.id,[\s\S]+?action_type: a\.type[\s\S]+?subject: a\.rawSubject[\s\S]+?content: a\.rawContent/,
    );
  });

  it("rendu EditCommercialActionDialog en bas du composant", () => {
    expect(src).toMatch(
      /<EditCommercialActionDialog[\s\S]+?open=\{editingAction !== null\}[\s\S]+?onUpdated=\{[^}]*fetchTimeline/,
    );
  });

  it("boutons toujours visibles sur mobile, hover-only sur desktop md+ (a11y)", () => {
    // opacity-100 base (mobile) puis md:opacity-0 + md:group-hover/focus-within:opacity-100
    expect(src).toMatch(/opacity-100 md:opacity-0/);
    expect(src).toMatch(/md:group-hover:opacity-100/);
    expect(src).toMatch(/md:focus-within:opacity-100/);
    expect(src).toMatch(/className="group /);
  });

  it("handleDeleteAction wrappé try/catch/finally (état non bloqué si exception)", () => {
    expect(src).toMatch(
      /async function handleDeleteAction[\s\S]+?try \{[\s\S]+?catch \(err\)[\s\S]+?finally \{[\s\S]+?setDeletingActionId\(null\)/,
    );
  });
});
