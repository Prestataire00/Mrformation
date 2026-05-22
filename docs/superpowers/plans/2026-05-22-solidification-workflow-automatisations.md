# Solidification du workflow Automatisations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre le sous-onglet « Automatisations » fonctionnel, fiable et cohérent — corriger les 4 défauts (vue Règles morte, bouton Tester inopérant, actions en masse stub, moteur jamais planifié) et solder la dette.

**Architecture:** Approche hybride. Le cœur d'exécution (résolution des destinataires + exécution d'une règle), aujourd'hui dupliqué dans `run-cron`, est extrait dans un module testable `src/lib/automation/execute-rule.ts`. `run-cron` devient un routeur à 3 modes (global / ciblé-trigger / ciblé-règle) s'appuyant dessus. Une fonction planifiée Netlify déclenche enfin le moteur quotidien. Les correctifs UI et la dette sont traités en place.

**Tech Stack:** Next.js 14 (App Router, route handlers), TypeScript strict, Supabase (PostgreSQL), Netlify Scheduled Functions, Vitest (environnement `node`).

**Spec :** `docs/superpowers/specs/2026-05-22-solidification-workflow-automatisations-design.md`
**Branche :** `feat/automation-solidification`

**Rappels :** jamais de `any` ; `tsc --noEmit` et `vitest run` doivent rester verts ; `npm run lint` est cassé au niveau projet (config eslint) — NE PAS l'utiliser, la vérification se fait par `tsc` + `vitest`.

---

## File Structure

- `supabase/migrations/automation_solidification.sql` — **créé.** `DROP COLUMN document_types`.
- `src/lib/automation/execute-rule.ts` — **créé.** Cœur d'exécution : `resolveRecipients`, `buildAttachmentsForRecipient`, `buildFallbackEmail`, `executeRuleForSession`.
- `src/lib/automation/__tests__/execute-rule.test.ts` — **créé.** Tests des parties pures.
- `src/lib/automation/__tests__/compute-events.test.ts` — **créé.** Tests de `buildSessionEvents`.
- `src/lib/automation/compute-events.ts` — **modifié.** Typage `SupabaseClient` (retrait du `any`).
- `src/app/api/formations/automation-rules/run-cron/route.ts` — **modifié.** 3 modes délégant au helper + mode ciblé-règle.
- `src/app/api/formations/automation-rules/trigger-event/route.ts` — **modifié.** Transmet `rule_id`.
- `src/app/api/formations/automation-rules/route.ts` — **modifié.** `DEFAULT_RULES` dérivé de `AUTOMATION_PACKS`.
- `netlify/functions/run-automations.mts` — **créé.** Fonction planifiée quotidienne.
- `src/app/(dashboard)/admin/formations/[id]/_components/TabAutomation.tsx` — **modifié.** B1, B2, B3, sémantique d'override.
- `src/app/(dashboard)/admin/formations/[id]/_components/AutomationTimeline.tsx` — **modifié.** Sémantique d'override.
- `src/app/api/formations/automation-rules/run/route.ts` — **supprimé.** Moteur mort.
- `src/app/api/formations/[id]/automation-trigger/route.ts` — **supprimé.** Stub B3.
- `src/app/api/formations/[id]/automation-overrides/route.ts` — **supprimé.** Route inutilisée.

**Convention de test :** Vitest `node`. Les fonctions pures (`buildSessionEvents`, `buildAttachmentsForRecipient`, `buildFallbackEmail`) sont testées unitairement ; les routes et la fonction Netlify sont vérifiées par `tsc --noEmit` + suite verte.

---

## Task 1 : Migration SQL — retrait de `document_types`

**Files:**
- Create: `supabase/migrations/automation_solidification.sql`

- [ ] **Step 1 : Écrire la migration**

Créer `supabase/migrations/automation_solidification.sql` :

```sql
-- ============================================================
-- Solidification automatisations — 2026-05-22
-- Retrait de la colonne orpheline document_types : ajoutée par
-- extend_automation_system.sql, elle n'est lue par aucun code
-- (tout utilise document_type au singulier).
-- A executer dans le Dashboard Supabase (SQL Editor).
-- ============================================================

ALTER TABLE formation_automation_rules
  DROP COLUMN IF EXISTS document_types;
```

- [ ] **Step 2 : Commit**

```bash
git add supabase/migrations/automation_solidification.sql
git commit -m "feat(automatisations): migration — retrait colonne orpheline document_types"
```

*Note d'exécution : ce fichier SQL est à jouer dans le Dashboard Supabase au moment du déploiement. Le code n'en dépend pas (la colonne n'était lue nulle part) — la migration n'est pas bloquante pour les autres tâches.*

---

## Task 2 : Cœur d'exécution `execute-rule.ts` + tests

**Files:**
- Create: `src/lib/automation/execute-rule.ts`
- Create: `src/lib/automation/__tests__/execute-rule.test.ts`

- [ ] **Step 1 : Écrire les tests**

Créer `src/lib/automation/__tests__/execute-rule.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import {
  buildAttachmentsForRecipient,
  buildFallbackEmail,
  type SessionInfo,
  type RecipientInfo,
  type RuleInfo,
  type CustomTemplateInfo,
} from "@/lib/automation/execute-rule";

const session: SessionInfo = {
  id: "s1", title: "Formation X", start_date: "2026-06-01",
  end_date: "2026-06-03", location: "Paris", entity_id: "ent-A",
};
const learner: RecipientInfo = {
  id: "l1", email: "l@x.fr", first_name: "Jean", last_name: "Dupont", type: "learner",
};

describe("buildAttachmentsForRecipient", () => {
  it("renvoie [] quand aucun type de document", () => {
    expect(buildAttachmentsForRecipient(null, session, learner, "learners", {})).toEqual([]);
    expect(buildAttachmentsForRecipient([], session, learner, "learners", {})).toEqual([]);
  });

  it("mappe un type système (convocation) vers un descripteur payload", () => {
    const res = buildAttachmentsForRecipient(["convocation"], session, learner, "learners", {});
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      type: "convocation",
      payload: { session_id: "s1", learner_id: "l1" },
    });
  });

  it("mappe un UUID vers un descripteur uploaded_docx si le template custom est en mode docx_fidelity", () => {
    const tplId = "11111111-1111-1111-1111-111111111111";
    const customById: Record<string, CustomTemplateInfo> = {
      [tplId]: { id: tplId, name: "Attestation", mode: "docx_fidelity", source_docx_url: "https://x/a.docx" },
    };
    const res = buildAttachmentsForRecipient([tplId], session, learner, "learners", customById);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ type: "uploaded_docx", filename: "Attestation.pdf", url: "https://x/a.docx" });
  });

  it("ignore un UUID dont le template custom n'est pas en mode docx_fidelity", () => {
    const tplId = "22222222-2222-2222-2222-222222222222";
    const customById: Record<string, CustomTemplateInfo> = {
      [tplId]: { id: tplId, name: "X", mode: "editable", source_docx_url: null },
    };
    expect(buildAttachmentsForRecipient([tplId], session, learner, "learners", customById)).toEqual([]);
  });
});

describe("buildFallbackEmail", () => {
  it("construit un sujet et un corps avec le libellé du document et le nom du destinataire", () => {
    const rule: RuleInfo = {
      id: "r1", trigger_type: "session_start_minus_days", document_type: "convocation",
      days_offset: 5, recipient_type: "learners", template_id: null,
      condition_subcontracted: null, name: "Convocation J-5",
    };
    const { subject, body } = buildFallbackEmail(rule, session, learner);
    expect(subject).toBe("Convocation à la formation — Formation X");
    expect(body).toContain("Jean Dupont");
    expect(body).toContain("Convocation à la formation");
    expect(body).toContain("Formation X");
  });
});
```

- [ ] **Step 2 : Lancer les tests → échec attendu**

Run: `npx vitest run src/lib/automation/__tests__/execute-rule.test.ts`
Expected: FAIL — `execute-rule` n'existe pas.

- [ ] **Step 3 : Écrire le module**

Créer `src/lib/automation/execute-rule.ts` :

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveVariables } from "@/lib/utils/resolve-variables";
import { enqueueEmail, type EmailAttachmentDescriptor } from "@/lib/services/email-queue";
import type { Session, Learner, Trainer } from "@/lib/types";

/**
 * Cœur d'exécution du moteur d'automatisation, partagé par les 3 modes de
 * run-cron (global / ciblé-trigger / ciblé-règle). Cf. spec §3.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DOCUMENT_TYPE_SUBJECTS: Record<string, string> = {
  convention_entreprise: "Convention de formation",
  convocation: "Convocation à la formation",
  certificat_realisation: "Certificat de réalisation",
  questionnaire_satisfaction: "Questionnaire de satisfaction",
};

export interface CustomTemplateInfo {
  id: string;
  name: string;
  mode: "editable" | "docx_fidelity" | null;
  source_docx_url: string | null;
}

export interface RecipientInfo {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  type: "learner" | "trainer";
}

export interface SessionInfo {
  id: string;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  entity_id: string;
  is_subcontracted?: boolean;
}

export interface RuleInfo {
  id: string;
  trigger_type: string;
  document_type: string;
  days_offset: number | null;
  recipient_type: string | null;
  template_id: string | null;
  condition_subcontracted: boolean | null;
  name: string | null;
}

export interface TemplateInfo {
  subject: string;
  body: string;
  attachment_doc_types: string[] | null;
}

/**
 * Pure — construit les descripteurs d'attachements d'un destinataire.
 * 2 sources : types système (string lisible) et templates Word custom (UUID).
 */
export function buildAttachmentsForRecipient(
  attachmentDocTypes: string[] | null | undefined,
  session: SessionInfo,
  recipient: RecipientInfo,
  recipientType: string,
  customTemplatesById: Record<string, CustomTemplateInfo>,
): EmailAttachmentDescriptor[] {
  if (!attachmentDocTypes || attachmentDocTypes.length === 0) return [];

  const descriptors: EmailAttachmentDescriptor[] = [];

  for (const docType of attachmentDocTypes) {
    // Cas 1 : UUID → template Word custom
    if (UUID_REGEX.test(docType)) {
      const tpl = customTemplatesById[docType];
      if (!tpl || tpl.mode !== "docx_fidelity" || !tpl.source_docx_url) continue;
      descriptors.push({
        type: "uploaded_docx",
        filename: `${tpl.name}.pdf`,
        url: tpl.source_docx_url,
        variables: {
          nom_apprenant: `${recipient.first_name ?? ""} ${recipient.last_name ?? ""}`.trim(),
          prenom_apprenant: recipient.first_name ?? "",
          email_apprenant: recipient.email ?? "",
          titre_formation: session.title ?? "",
          date_debut: session.start_date ?? "",
          date_fin: session.end_date ?? "",
          lieu: session.location ?? "",
          date_today: new Date().toLocaleDateString("fr-FR"),
        },
      });
      continue;
    }

    // Cas 2 : type système
    switch (docType) {
      case "convocation":
      case "certificat_realisation":
        if (recipient.type === "learner") {
          descriptors.push({ type: docType, payload: { session_id: session.id, learner_id: recipient.id } });
        }
        break;
      case "convention_entreprise":
        if (recipientType === "companies") {
          descriptors.push({ type: "convention_entreprise", payload: { session_id: session.id, client_id: recipient.id } });
        }
        break;
      case "convention_intervention":
        if (recipient.type === "trainer") {
          descriptors.push({ type: docType, payload: { session_id: session.id, trainer_id: recipient.id } });
        }
        break;
      case "programme_formation":
        descriptors.push({ type: "programme_formation", payload: { session_id: session.id } });
        break;
    }
  }
  return descriptors;
}

/** Pure — sujet + corps de repli quand la règle n'a pas de template email. */
export function buildFallbackEmail(
  rule: RuleInfo,
  session: SessionInfo,
  recipient: RecipientInfo,
): { subject: string; body: string } {
  const docLabel = DOCUMENT_TYPE_SUBJECTS[rule.document_type] ?? rule.document_type;
  return {
    subject: `${docLabel} — ${session.title}`,
    body: `Bonjour ${recipient.first_name} ${recipient.last_name},\n\nVeuillez trouver ci-joint votre document : ${docLabel}.\n\nFormation : ${session.title}\n\nCordialement,\nL'équipe de formation`,
  };
}

/** Résout les destinataires d'une session selon le recipient_type de la règle. */
export async function resolveRecipients(
  supabase: SupabaseClient,
  sessionId: string,
  recipientType: string,
): Promise<RecipientInfo[]> {
  const recipients: RecipientInfo[] = [];

  if (recipientType === "learners" || recipientType === "all") {
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("learner:learners!enrollments_learner_id_fkey(id, email, first_name, last_name)")
      .eq("session_id", sessionId)
      .in("status", ["registered", "confirmed", "completed"]);
    for (const e of enrollments ?? []) {
      const l = e.learner as unknown as { id: string; email: string | null; first_name: string; last_name: string } | null;
      if (l?.email) recipients.push({ id: l.id, email: l.email, first_name: l.first_name, last_name: l.last_name, type: "learner" });
    }
  }

  if (recipientType === "trainers" || recipientType === "all") {
    const { data: trainerLinks } = await supabase
      .from("formation_trainers")
      .select("trainer:trainers!formation_trainers_trainer_id_fkey(id, email, first_name, last_name)")
      .eq("session_id", sessionId);
    for (const tl of trainerLinks ?? []) {
      const t = tl.trainer as unknown as { id: string; email: string | null; first_name: string; last_name: string } | null;
      if (t?.email) recipients.push({ id: t.id, email: t.email, first_name: t.first_name, last_name: t.last_name, type: "trainer" });
    }
  }

  if (recipientType === "companies") {
    const { data: companyLinks } = await supabase
      .from("formation_companies")
      .select("email, client:clients!formation_companies_client_id_fkey(id, company_name)")
      .eq("session_id", sessionId);
    for (const cl of companyLinks ?? []) {
      const c = cl.client as unknown as { id: string; company_name: string } | null;
      const companyEmail = (cl as { email: string | null }).email;
      // Les entreprises sont portées en type "learner" : les attachements
      // d'entreprise sont aiguillés par recipientType ("companies"), pas par recipient.type.
      if (c && companyEmail) recipients.push({ id: c.id, email: companyEmail, first_name: c.company_name, last_name: "", type: "learner" });
    }
  }

  return recipients;
}

/**
 * Exécute une règle pour une session : résout les destinataires, construit
 * sujet/corps (template ou repli) + attachements, enqueue chaque email.
 * Renvoie le nombre d'emails enqueués. Une erreur d'enqueue par destinataire
 * est journalisée sans interrompre les autres.
 */
export async function executeRuleForSession(
  supabase: SupabaseClient,
  args: {
    rule: RuleInfo;
    session: SessionInfo;
    template: TemplateInfo | null;
    customTemplatesById: Record<string, CustomTemplateInfo>;
  },
): Promise<{ enqueued: number }> {
  const { rule, session, template, customTemplatesById } = args;
  const recipientType = rule.recipient_type || "learners";
  const recipients = await resolveRecipients(supabase, session.id, recipientType);

  let enqueued = 0;
  for (const recipient of recipients) {
    let subject: string;
    let body: string;
    if (template) {
      const ctx = {
        session: session as unknown as Session,
        learner: recipient.type === "learner" ? (recipient as unknown as Learner) : null,
        trainer: recipient.type === "trainer" ? (recipient as unknown as Trainer) : null,
      };
      subject = resolveVariables(template.subject, ctx);
      body = resolveVariables(template.body, ctx);
    } else {
      const fb = buildFallbackEmail(rule, session, recipient);
      subject = fb.subject;
      body = fb.body;
    }

    try {
      await enqueueEmail(supabase, {
        to: recipient.email,
        subject,
        body,
        entity_id: session.entity_id,
        session_id: session.id,
        recipient_type: recipient.type,
        recipient_id: recipient.id,
        attachments: buildAttachmentsForRecipient(
          template?.attachment_doc_types,
          session,
          recipient,
          recipientType,
          customTemplatesById,
        ),
      });
      enqueued++;
    } catch (err) {
      console.error(`[automation] enqueue failed for ${recipient.email}:`, err instanceof Error ? err.message : err);
    }
  }
  return { enqueued };
}
```

- [ ] **Step 4 : Lancer les tests → succès attendu**

Run: `npx vitest run src/lib/automation/__tests__/execute-rule.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5 : Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: aucune erreur.

- [ ] **Step 6 : Commit**

```bash
git add src/lib/automation/execute-rule.ts src/lib/automation/__tests__/execute-rule.test.ts
git commit -m "feat(automatisations): coeur d'execution extrait et testable (execute-rule)"
```

---

## Task 3 : Tests `compute-events` + retrait du `any`

**Files:**
- Modify: `src/lib/automation/compute-events.ts`
- Create: `src/lib/automation/__tests__/compute-events.test.ts`

- [ ] **Step 1 : Écrire les tests**

Créer `src/lib/automation/__tests__/compute-events.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { buildSessionEvents } from "@/lib/automation/compute-events";

const session = {
  id: "s1", title: "Formation X",
  start_date: "2026-06-10", end_date: "2026-06-12", is_subcontracted: false,
};

const ruleConvocation = {
  id: "r1", name: "Convocation J-5", trigger_type: "session_start_minus_days",
  days_offset: 5, document_type: "convocation", recipient_type: "learners",
  condition_subcontracted: null,
};

describe("buildSessionEvents", () => {
  it("calcule la date planifiée d'une règle J-X (début - offset)", () => {
    const events = buildSessionEvents(session, [ruleConvocation], [], []);
    expect(events).toHaveLength(1);
    expect(events[0].scheduled_date.slice(0, 10)).toBe("2026-06-05");
    expect(events[0].status).toBe("pending");
  });

  it("marque l'événement 'overridden' quand un override le désactive", () => {
    const events = buildSessionEvents(session, [ruleConvocation], [{ rule_id: "r1", is_enabled: false, days_offset_override: null }], []);
    expect(events[0].status).toBe("overridden");
  });

  it("marque l'événement 'executed' quand un log success existe", () => {
    const events = buildSessionEvents(session, [ruleConvocation], [], [
      { id: "log1", rule_id: "r1", executed_at: "2026-06-05T08:00:00Z", recipient_count: 3, status: "success" },
    ]);
    expect(events[0].status).toBe("executed");
    expect(events[0].recipient_count).toBe(3);
  });

  it("exclut une règle condition_subcontracted=true sur une session non sous-traitée", () => {
    const events = buildSessionEvents(session, [{ ...ruleConvocation, condition_subcontracted: true }], [], []);
    expect(events).toHaveLength(0);
  });
});
```

- [ ] **Step 2 : Lancer les tests → succès attendu**

Run: `npx vitest run src/lib/automation/__tests__/compute-events.test.ts`
Expected: PASS — 4 tests (`buildSessionEvents` existe déjà et est une fonction pure).

- [ ] **Step 3 : Retirer le `any` de `compute-events.ts`**

Dans `src/lib/automation/compute-events.ts`, remplacer l'en-tête du fichier. Localiser :

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = { from: (table: string) => any };
```

Remplacer par :

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
```

Puis, dans les signatures de `computeSessionEvents` et `computeBatchEvents`, remplacer le type du paramètre `supabase: SupabaseLike` par `supabase: SupabaseClient`. Aucune autre modification (les appels `.from(...)` restent identiques).

- [ ] **Step 4 : Typecheck + tests**

Run: `npx tsc --noEmit -p tsconfig.json` → aucune erreur.
Run: `npx vitest run src/lib/automation/__tests__/compute-events.test.ts` → PASS — 4 tests.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/automation/compute-events.ts src/lib/automation/__tests__/compute-events.test.ts
git commit -m "feat(automatisations): tests buildSessionEvents + typage SupabaseClient (retrait any)"
```

---

## Task 4 : `run-cron` — 3 modes sur le helper + mode ciblé-règle

**Files:**
- Modify: `src/app/api/formations/automation-rules/run-cron/route.ts`
- Modify: `src/app/api/formations/automation-rules/trigger-event/route.ts`

**Contexte.** `run-cron` est protégée par `Bearer CRON_SECRET` et crée un client service-role. Elle a aujourd'hui 2 modes : ciblé (`{trigger_type, session_id}`) et global (body vide). Chacun ré-implémente la construction des destinataires et l'enqueue. On délègue désormais à `executeRuleForSession` (Task 2) et on ajoute un 3ᵉ mode ciblé-règle.

- [ ] **Step 1 : Brancher les modes existants sur le helper**

Dans `run-cron/route.ts` : remplacer l'import local de `buildAttachmentsForRecipient` et la fonction du même nom (lignes ~6-117) ainsi que les `DOCUMENT_TYPE_SUBJECTS` par un import du helper :

```ts
import {
  executeRuleForSession,
  type RuleInfo,
  type SessionInfo,
  type TemplateInfo,
  type CustomTemplateInfo,
} from "@/lib/automation/execute-rule";
```

Dans le **mode ciblé** et le **mode global**, remplacer la boucle interne `for (const recipient of recipients) { … enqueueEmail(…) }` (et la construction de `recipients`) par un appel :

```ts
const { enqueued } = await executeRuleForSession(supabase, {
  rule: rule as RuleInfo,
  session: session as SessionInfo,
  template: rule.template_id ? (templateMap[rule.template_id] as TemplateInfo) ?? null : null,
  customTemplatesById,
});
emailsSent += enqueued;
```

Conserver inchangés : la garde `CRON_SECRET`, le préchargement des templates (`templateMap`, `customTemplatesById`), le filtrage `condition_subcontracted`, le calcul des dates cibles du mode global, l'anti-doublon `email_history`, et la branche « OPCO deposit reminders ». Le mode global garde sa structure ; seule la boucle d'envoi par session passe par le helper.

- [ ] **Step 2 : Ajouter le mode ciblé-règle**

Toujours dans `run-cron/route.ts`, après le parsing du body (qui lit déjà `specificTrigger` et `specificSessionId`), lire aussi `specificRuleId` :

```ts
let specificRuleId: string | null = null;
// dans le try du parsing du body :
specificRuleId = body.rule_id || null;
```

Ajouter, **avant** le bloc « TARGETED MODE » existant, un nouveau bloc :

```ts
// ── RULE-SCOPED MODE: une règle précise, une session précise ──
if (specificRuleId && specificSessionId) {
  try {
    const { data: rule } = await supabase
      .from("formation_automation_rules")
      .select("*")
      .eq("id", specificRuleId)
      .single();
    if (!rule) return NextResponse.json({ error: "Règle introuvable" }, { status: 404 });

    const { data: session } = await supabase
      .from("sessions")
      .select("id, title, start_date, end_date, location, entity_id, is_subcontracted, status")
      .eq("id", specificSessionId)
      .single();
    if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });

    // Contrôle d'appartenance : la règle et la session doivent être de la même entité.
    if (rule.entity_id !== session.entity_id) {
      return NextResponse.json({ error: "Règle hors de l'entité de la session" }, { status: 403 });
    }

    let template: TemplateInfo | null = null;
    const customTemplatesById: Record<string, CustomTemplateInfo> = {};
    if (rule.template_id) {
      const { data: tpl } = await supabase
        .from("email_templates")
        .select("subject, body, attachment_doc_types")
        .eq("id", rule.template_id)
        .single();
      template = (tpl as TemplateInfo) ?? null;
      for (const v of template?.attachment_doc_types ?? []) {
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
          const { data: ct } = await supabase
            .from("document_templates")
            .select("id, name, mode, source_docx_url")
            .eq("id", v)
            .eq("entity_id", session.entity_id)
            .single();
          if (ct) customTemplatesById[v] = ct as CustomTemplateInfo;
        }
      }
    }

    const { enqueued } = await executeRuleForSession(supabase, {
      rule: rule as RuleInfo,
      session: session as SessionInfo,
      template,
      customTemplatesById,
    });

    await supabase.from("session_automation_logs").insert({
      session_id: session.id,
      rule_id: rule.id,
      rule_name: rule.name || rule.document_type,
      trigger_type: rule.trigger_type,
      recipient_count: enqueued,
      status: enqueued > 0 ? "success" : "skipped",
      is_manual: true,
      details: { mode: "rule_scoped" },
    });

    return NextResponse.json({ success: true, enqueued });
  } catch (err) {
    console.error("[automation rule-scoped]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 3 : `trigger-event` transmet `rule_id`**

Dans `src/app/api/formations/automation-rules/trigger-event/route.ts` : la route lit aujourd'hui `{ trigger_type, session_id }` et exige les deux. La remplacer pour accepter **soit** `rule_id` **soit** `trigger_type` :

```ts
const { trigger_type, session_id, rule_id } = await request.json();

if (!session_id || (!trigger_type && !rule_id)) {
  return NextResponse.json({ error: "session_id et (trigger_type ou rule_id) requis" }, { status: 400 });
}

const res = await fetch(`${appUrl}/api/formations/automation-rules/run-cron`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.CRON_SECRET}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(rule_id ? { rule_id, session_id } : { trigger_type, session_id }),
});
```

Conserver le reste (garde `requireRole(["admin","super_admin","trainer"])`, le `appUrl`, le `try/catch`).

- [ ] **Step 4 : Typecheck + tests**

Run: `npx tsc --noEmit -p tsconfig.json` → aucune erreur.
Run: `npx vitest run` → suite verte.

- [ ] **Step 5 : Commit**

```bash
git add "src/app/api/formations/automation-rules/run-cron/route.ts" "src/app/api/formations/automation-rules/trigger-event/route.ts"
git commit -m "feat(automatisations): run-cron 3 modes sur le helper + mode cible-regle + proxy rule_id"
```

---

## Task 5 : Fonction planifiée Netlify `run-automations.mts`

**Files:**
- Create: `netlify/functions/run-automations.mts`

- [ ] **Step 1 : Écrire la fonction planifiée**

Créer `netlify/functions/run-automations.mts` (calquée sur `process-scheduled-emails.mts`) :

```ts
import type { Config } from "@netlify/functions";

export default async () => {
  const baseUrl = process.env.URL || "http://localhost:3000";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[cron] CRON_SECRET not configured");
    return new Response("CRON_SECRET not configured", { status: 500 });
  }

  try {
    // Body vide → run-cron s'exécute en mode global (toutes entités, règles date-based + OPCO).
    const res = await fetch(`${baseUrl}/api/formations/automation-rules/run-cron`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });

    const data = await res.json();
    console.log("[cron] run-automations result:", data);

    return new Response(JSON.stringify(data), { status: res.status });
  } catch (err) {
    console.error("[cron] Failed to call run-cron:", err);
    return new Response("Failed", { status: 500 });
  }
};

// 1×/jour à 7h UTC (≈ 9h Paris) : déclenche les automatisations à date
// (convocation J-X, certificat J+X, satisfaction, rappels OPCO).
export const config: Config = {
  schedule: "0 7 * * *",
};
```

- [ ] **Step 2 : Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` → aucune erreur.

*Note : `run-cron` traite un body vide comme le mode global (le `await request.json()` échoue sur un body vide et le `catch` bascule en mode global — comportement existant conservé). La fonction est planifiée par Netlify ; pas de test d'intégration cron dans le projet.*

- [ ] **Step 3 : Commit**

```bash
git add netlify/functions/run-automations.mts
git commit -m "feat(automatisations): fonction planifiee Netlify — declenche le moteur quotidien"
```

---

## Task 6 : `TabAutomation` + `AutomationTimeline` — B1, B2, B3, overrides

**Files:**
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/TabAutomation.tsx`
- Modify: `src/app/(dashboard)/admin/formations/[id]/_components/AutomationTimeline.tsx`

- [ ] **Step 1 : B1 — `is_active` → `is_enabled` + toast d'erreur**

Dans `TabAutomation.tsx` :

1. Dans l'interface `AutoRule`, renommer le champ `is_active: boolean;` en `is_enabled: boolean;`.
2. Dans `fetchData`, le `select` de `formation_automation_rules` : remplacer `is_active` par `is_enabled` dans la liste de colonnes.
3. Dans `fetchData`, remplacer le `catch { /* ignore */ }` par un `catch` qui pose un toast :

```ts
} catch {
  toast({ title: "Erreur de chargement des automatisations", variant: "destructive" });
}
```

4. Dans le calcul `applicableRules`, remplacer `r.is_active` par `r.is_enabled` :

```ts
const applicableRules = rules.filter(r => r.is_enabled && ruleApplies(r));
```

- [ ] **Step 2 : B2 — bouton « Exécuter maintenant » réel**

Dans `TabAutomation.tsx`, le `handleTest` envoie déjà `rule_id` — seul le libellé et le toast changent. Renommer la fonction `handleTest` en `handleRunRule` (et l'état `testing`/`setTesting` peut rester tel quel). Le `fetch` vers `trigger-event` est déjà correct (`{ trigger_type: "manual_test", session_id, rule_id }`) — **retirer le `trigger_type: "manual_test"`** désormais inutile, ne garder que `{ session_id, rule_id }` :

```ts
body: JSON.stringify({ session_id: formation.id, rule_id: ruleId }),
```

Et le toast de succès :

```ts
toast({ title: "Exécution lancée", description: `${data.enqueued ?? 0} email(s) en file d'envoi` });
```

Dans le JSX, remplacer le libellé du bouton `Tester` par `Exécuter` (et l'icône `Play` est conservée).

Dans `AutomationTimeline.tsx`, `handleTriggerNow` : remplacer le body du `fetch` par `{ session_id: sessionId, rule_id: event.rule_id }` (retrait de `trigger_type: "manual_test"`).

- [ ] **Step 3 : B3 — retrait des actions manuelles en masse**

Dans `TabAutomation.tsx`, supprimer :
- l'état `bulkDialog` / `setBulkDialog` et `bulkSending` / `setBulkSending` ;
- la fonction `handleBulkAction` ;
- le tableau `bulkActions` ;
- le bloc JSX `{/* Actions manuelles rapides */}` (le `<h4>Actions manuelles</h4>` et ses boutons) ;
- le bloc JSX `{/* Bulk action confirmation dialog */}` (le `<Dialog>` complet).

Retirer les imports devenus inutiles (`Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`, et l'icône `Send` si elle n'est plus utilisée ailleurs dans le fichier — vérifier).

- [ ] **Step 4 : Sémantique d'override unifiée**

Dans `TabAutomation.tsx`, `handleToggle` : remplacer la logique insert-or-update par un `upsert` unique (même sémantique que `AutomationTimeline`) :

```ts
const handleToggle = async (ruleId: string, enabled: boolean) => {
  setToggling(ruleId);
  try {
    const { error } = await supabase
      .from("session_automation_overrides")
      .upsert(
        { session_id: formation.id, rule_id: ruleId, is_enabled: enabled },
        { onConflict: "session_id,rule_id" },
      );
    if (error) throw error;
    await fetchData();
  } catch {
    toast({ title: "Erreur", variant: "destructive" });
  }
  setToggling(null);
};
```

Dans `AutomationTimeline.tsx`, `handleToggleOverride` : aujourd'hui « réactiver » fait un `delete` de l'override. Remplacer par la même sémantique upsert (réactiver = `is_enabled: true`) :

```ts
const handleToggleOverride = async (event: TimelineEvent) => {
  setActing(event.id);
  const isCurrentlyEnabled = event.status !== "overridden";
  await supabase
    .from("session_automation_overrides")
    .upsert(
      { session_id: sessionId, rule_id: event.rule_id, is_enabled: !isCurrentlyEnabled },
      { onConflict: "session_id,rule_id" },
    );
  toast({ title: isCurrentlyEnabled ? "Règle désactivée pour cette formation" : "Règle réactivée" });
  await fetchTimeline();
  setActing(null);
  setDetailEvent(null);
};
```

- [ ] **Step 5 : Typecheck + tests**

Run: `npx tsc --noEmit -p tsconfig.json` → aucune erreur.
Run: `npx vitest run` → suite verte.

- [ ] **Step 6 : Commit**

```bash
git add "src/app/(dashboard)/admin/formations/[id]/_components/TabAutomation.tsx" "src/app/(dashboard)/admin/formations/[id]/_components/AutomationTimeline.tsx"
git commit -m "feat(automatisations): TabAutomation — B1 vue Regles, B2 execution reelle, B3 retrait actions en masse"
```

---

## Task 7 : Dette — suppressions + unification des règles par défaut

**Files:**
- Delete: `src/app/api/formations/automation-rules/run/route.ts`
- Delete: `src/app/api/formations/[id]/automation-trigger/route.ts`
- Delete: `src/app/api/formations/[id]/automation-overrides/route.ts`
- Modify: `src/app/api/formations/automation-rules/route.ts`

- [ ] **Step 1 : Supprimer les 3 routes mortes / inutiles**

```bash
git rm "src/app/api/formations/automation-rules/run/route.ts"
git rm "src/app/api/formations/[id]/automation-trigger/route.ts"
git rm "src/app/api/formations/[id]/automation-overrides/route.ts"
```

(`run` : moteur synchrone sans appelant. `automation-trigger` : stub B3, plus appelé après Task 6. `automation-overrides` : route GET/PATCH/DELETE jamais appelée, les composants écrivent la table en direct.)

- [ ] **Step 2 : `DEFAULT_RULES` dérivé de `AUTOMATION_PACKS`**

Dans `src/app/api/formations/automation-rules/route.ts`, remplacer la constante `DEFAULT_RULES` (le tableau littéral en tête de fichier) par une dérivation du pack Qualiopi standard — source unique :

```ts
import { AUTOMATION_PACKS } from "@/lib/automation/default-packs";

// Règles par défaut proposées quand une entité n'a encore aucune règle :
// dérivées du pack Qualiopi standard (source unique, cf. default-packs.ts).
const DEFAULT_RULES = AUTOMATION_PACKS
  .find((p) => p.id === "qualiopi-standard")!
  .rules
  .filter((r) => r.scope === "formation")
  .map((r) => ({
    trigger_type: r.trigger_type,
    document_type: r.document_type ?? "",
    days_offset: r.days_offset ?? 0,
    is_enabled: true,
    template_id: null,
    recipient_type: r.recipient_type ?? "learners",
    name: r.name,
  }));
```

Conserver le reste de la route (GET avec ce fallback, PUT) inchangé.

- [ ] **Step 3 : Typecheck + tests + recherche de résidus**

Run: `npx tsc --noEmit -p tsconfig.json` → aucune erreur (vérifie qu'aucun import ne pointe vers les routes supprimées).
Run: `npx vitest run` → suite verte.
Run: `grep -rn "automation-trigger\|automation-rules/run\b\|automation-overrides" src/` — vérifier qu'il ne reste aucune référence aux routes supprimées (hors `run-cron`).

- [ ] **Step 4 : Commit**

```bash
git add -A "src/app/api/formations"
git commit -m "feat(automatisations): dette — suppression moteur mort/routes inutilisees + DEFAULT_RULES unifie"
```

---

## Task 8 : Vérification finale

**Files:** aucun (vérification uniquement).

- [ ] **Step 1 : Typecheck global** — Run: `npx tsc --noEmit -p tsconfig.json`. Expected: aucune erreur.
- [ ] **Step 2 : Suite complète** — Run: `npx vitest run`. Expected: toute la suite verte (dont les 9 nouveaux tests des Tasks 2-3).
- [ ] **Step 3 : Recherche de résidus** —
  - Run: `grep -rn "is_active" src/app/\(dashboard\)/admin/formations/` — Expected: 0 résultat dans `TabAutomation.tsx` (B1 corrigé).
  - Run: `grep -rn "manual_test" src/` — Expected: 0 résultat (le faux trigger a été retiré des composants).
  - Run: `grep -rln ": any" src/lib/automation/` — Expected: 0 résultat.
- [ ] **Step 4 : Revue manuelle — critères de succès du spec §11 :**
  - La vue « Règles » de `TabAutomation` lit `is_enabled` ; une erreur de chargement pose un toast.
  - « Exécuter maintenant » envoie `{ session_id, rule_id }` → `trigger-event` → `run-cron` mode ciblé-règle → `executeRuleForSession` + log.
  - Les 3 actions en masse et la route `automation-trigger` n'existent plus.
  - `netlify/functions/run-automations.mts` existe, planifiée `0 7 * * *`, appelle `run-cron` body vide.
  - `execute-rule.ts` est partagé par les 3 modes de `run-cron` ; pas de duplication de la résolution des destinataires.
  - `run/route.ts`, `automation-overrides/route.ts`, la colonne `document_types`, les `any` de `compute-events.ts` et le doublon `DEFAULT_RULES` sont supprimés.
  - `buildSessionEvents` + parties pures de `execute-rule.ts` couverts par Vitest.

---

## Vérification manuelle (après déploiement)

- Exécuter `supabase/migrations/automation_solidification.sql` dans le Dashboard Supabase.
- Vérifier que la fonction planifiée `run-automations` apparaît dans l'onglet Netlify « Functions » → « Scheduled ».
- Ouvrir une fiche formation → onglet Automatisations → vue « Règles » : les règles de l'entité s'affichent ; « Exécuter maintenant » sur une règle enqueue les emails (vérifiables dans `email_history`).
