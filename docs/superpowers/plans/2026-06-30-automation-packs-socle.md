# Packs d'automatisation — Lot 1 (Socle) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser la fondation des packs d'automatisation éditables et sélectionnables par formation (snapshot figé), sans toucher à l'UX.

**Architecture:** 3 tables (`automation_packs`, `automation_pack_steps`, `session_automation_steps`) ; un service qui instancie un pack en snapshot par session ; le cron exécute le snapshot d'une session quand il existe (sinon comportement legacy) ; seed des packs code→base. Le snapshot réutilise le moteur existant car ses colonnes correspondent au contrat `RuleInfo`.

**Tech Stack:** Supabase (Postgres, RLS), TypeScript, Vitest. Migrations SQL jouées manuellement dans le Dashboard.

**Spec:** `docs/superpowers/specs/2026-06-30-automation-packs-socle-design.md`

---

## Décisions de conception verrouillées

- **Colonne template = `template_id`** (REFERENCES `email_templates`) dans `automation_pack_steps` ET `session_automation_steps` — PAS `email_template_id`. Raison : une ligne `session_automation_steps` doit caster directement vers `RuleInfo` (`src/lib/automation/execute-rule.ts:48`, qui utilise `template_id`) pour réutiliser `executeRuleForSession` sans adaptation. (Léger écart assumé vs spec qui disait `email_template_id`.)
- **Anti-double-exécution** : une session qui possède ≥1 ligne `session_automation_steps` est « pack-driven » ; le cron legacy l'EXCLUT, et le nouveau passage l'exécute.
- **Périmètre moteur Lot 1** : passage cron **date-based** (`session_start_minus_days` / `session_end_plus_days`), qui est le cœur. Les triggers événementiels (on_enrollment, on_completion) restent legacy pour l'instant (aucune session n'aura de snapshot avant le Lot 3 de toute façon ; on étendra quand on branchera la création).
- **Seed** : on seede les packs **scope formation** (`qualiopi-standard`, `opco`, `sous-traitance`). Le pack `commercial` (scope `crm`) est EXCLU (sous-système CRM distinct, non sélectionnable par formation).

## Pré-requis vérifiés

- Pattern RLS existant (`add_formation_automation_rules.sql`) : `USING (entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid()))`. Le service_role (cron/API) bypass la RLS.
- Contrat moteur : `executeRuleForSession(supabase, { rule: RuleInfo, session: SessionInfo, template, customTemplatesById, dedupAgainstHistoryFromDate })` — `src/lib/automation/execute-rule.ts:461`.
- `RuleInfo` = `{ id, trigger_type, document_type, days_offset, recipient_type, template_id, condition_subcontracted, name, send_email? }`.
- Cron normal date-based : `src/app/api/formations/automation-rules/run-cron/route.ts:285-392` (boucle entité → règles → calcul date Paris → sessions → `executeRuleForSession`).
- Seed source : `src/lib/automation/default-packs.ts` (interface `AutomationPack`).
- Barrières : `npx tsc --noEmit` + `npx vitest run` (lint ESLint 9 cassé).

## File Structure

| Fichier | Action |
|---|---|
| `supabase/migrations/add_automation_packs.sql` | Créer : 3 tables + RLS + index. |
| `supabase/migrations/seed_automation_packs.sql` | Créer : seed des 3 packs formation par entité (idempotent). |
| `src/lib/automation/instantiate-pack.ts` | Créer : `packStepToSessionStepRow()` (pur, testé) + `instantiatePackForSession()` (I/O). |
| `src/lib/automation/__tests__/instantiate-pack.test.ts` | Créer : tests du mapper pur. |
| `src/app/api/formations/automation-rules/run-cron/route.ts` | Modifier : exclure sessions pack-driven du passage legacy + ajouter le passage pack-driven date-based. |

---

## Task 1 : Migration — 3 tables + RLS

**Files:**
- Create: `supabase/migrations/add_automation_packs.sql`

- [ ] **Step 1 : écrire la migration**

```sql
-- Packs d'automatisation éditables (Lot 1 socle)
-- 3 tables : packs (gabarit) + pack_steps (étapes gabarit) + session_automation_steps (snapshot par formation)

CREATE TABLE IF NOT EXISTS automation_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  color TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_pack_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES automation_packs(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  trigger_type TEXT NOT NULL,
  days_offset INTEGER NOT NULL DEFAULT 0,
  recipient_type TEXT,
  document_type TEXT,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  condition_subcontracted BOOLEAN DEFAULT NULL,
  send_email BOOLEAN DEFAULT true,
  name TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_automation_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  source_pack_id UUID REFERENCES automation_packs(id) ON DELETE SET NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  trigger_type TEXT NOT NULL,
  days_offset INTEGER NOT NULL DEFAULT 0,
  recipient_type TEXT,
  document_type TEXT,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  condition_subcontracted BOOLEAN DEFAULT NULL,
  send_email BOOLEAN DEFAULT true,
  name TEXT,
  description TEXT,
  is_enabled BOOLEAN DEFAULT true,
  last_executed_at TIMESTAMPTZ,
  execution_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE automation_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_pack_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_automation_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "packs_entity_isolation" ON automation_packs
  FOR ALL TO authenticated
  USING (entity_id = (SELECT entity_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "pack_steps_entity_isolation" ON automation_pack_steps
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM automation_packs p
    JOIN profiles pr ON pr.entity_id = p.entity_id
    WHERE p.id = automation_pack_steps.pack_id AND pr.id = auth.uid()
  ));

CREATE POLICY "session_steps_entity_isolation" ON session_automation_steps
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM sessions s
    JOIN profiles pr ON pr.entity_id = s.entity_id
    WHERE s.id = session_automation_steps.session_id AND pr.id = auth.uid()
  ));

CREATE INDEX idx_automation_packs_entity ON automation_packs (entity_id);
CREATE INDEX idx_automation_pack_steps_pack ON automation_pack_steps (pack_id);
CREATE INDEX idx_session_automation_steps_session ON session_automation_steps (session_id);
CREATE INDEX idx_session_automation_steps_trigger ON session_automation_steps (trigger_type) WHERE is_enabled = true;
```

- [ ] **Step 2 : commit** (la migration sera jouée manuellement dans Supabase ; pas d'exécution locale)

```bash
git add supabase/migrations/add_automation_packs.sql
git commit -m "feat(automation): tables packs + pack_steps + session_automation_steps + RLS

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 : Migration de seed — packs code → base

**Files:**
- Create: `supabase/migrations/seed_automation_packs.sql`

Seed idempotent des 3 packs formation pour CHAQUE entité. Valeurs reprises verbatim de `default-packs.ts` (packs `qualiopi-standard`, `opco`, `sous-traitance`). `qualiopi-standard` marqué `is_default = true`.

- [ ] **Step 1 : écrire le seed (idempotent via NOT EXISTS sur name+entity)**

```sql
-- Seed des packs formation (qualiopi-standard, opco, sous-traitance) pour chaque entité.
-- Idempotent : ne réinsère pas si un pack du même nom existe déjà pour l'entité.
DO $$
DECLARE
  ent RECORD;
  pack_id UUID;
BEGIN
  FOR ent IN SELECT id FROM entities LOOP

    -- ── Pack Qualiopi standard (is_default) ──
    IF NOT EXISTS (SELECT 1 FROM automation_packs WHERE entity_id = ent.id AND name = 'Pack Qualiopi standard') THEN
      INSERT INTO automation_packs (entity_id, name, description, icon, color, is_default)
      VALUES (ent.id, 'Pack Qualiopi standard', 'Les automations essentielles pour respecter Qualiopi', '🎓', 'blue', true)
      RETURNING id INTO pack_id;
      INSERT INTO automation_pack_steps (pack_id, order_index, trigger_type, days_offset, recipient_type, document_type, name, description) VALUES
        (pack_id, 0, 'session_start_minus_days', 5, 'learners', 'convocation', 'Convocation J-5', 'Envoi automatique de la convocation 5 jours avant le début'),
        (pack_id, 1, 'on_enrollment', 0, 'learners', 'questionnaire_positionnement', 'Positionnement à l''inscription', 'Questionnaire de positionnement dès l''inscription'),
        (pack_id, 2, 'on_session_completion', 0, 'learners', 'questionnaire_autoevaluation', 'Auto-évaluation en fin de formation', 'Auto-évaluation à la clôture'),
        (pack_id, 3, 'on_session_completion', 0, 'learners', 'questionnaire_satisfaction', 'Satisfaction à chaud', 'Questionnaire de satisfaction à la fin'),
        (pack_id, 4, 'session_end_plus_days', 7, 'companies', 'questionnaire_satisfaction_client', 'Satisfaction client J+7', 'Questionnaire satisfaction entreprise 7 jours après'),
        (pack_id, 5, 'session_end_plus_days', 30, 'learners', 'questionnaire_satisfaction_froid', 'Satisfaction à froid J+30', 'Évaluation à froid 30 jours après la fin'),
        (pack_id, 6, 'on_session_completion', 0, 'learners', 'certificat_realisation', 'Certificat de réalisation', 'Génération automatique à la fin');
    END IF;

    -- ── Pack OPCO ──
    IF NOT EXISTS (SELECT 1 FROM automation_packs WHERE entity_id = ent.id AND name = 'Pack OPCO') THEN
      INSERT INTO automation_packs (entity_id, name, description, icon, color)
      VALUES (ent.id, 'Pack OPCO', 'Rappels automatiques pour les dossiers OPCO', '💰', 'green')
      RETURNING id INTO pack_id;
      INSERT INTO automation_pack_steps (pack_id, order_index, trigger_type, days_offset, recipient_type, document_type, name, description) VALUES
        (pack_id, 0, 'opco_deposit_reminder', 10, 'all', NULL, 'Rappel dépôt OPCO J-10', 'Rappel 10 jours avant le début pour déposer le dossier OPCO'),
        (pack_id, 1, 'session_end_plus_days', 3, 'companies', 'opco_justificatifs', 'Rappel OPCO post-formation J+3', 'Rappel envoi des pièces justificatives 3 jours après');
    END IF;

    -- ── Pack Sous-traitance ──
    IF NOT EXISTS (SELECT 1 FROM automation_packs WHERE entity_id = ent.id AND name = 'Pack Sous-traitance') THEN
      INSERT INTO automation_packs (entity_id, name, description, icon, color)
      VALUES (ent.id, 'Pack Sous-traitance', 'Workflow spécial pour les formations sous-traitées', '🤝', 'amber')
      RETURNING id INTO pack_id;
      INSERT INTO automation_pack_steps (pack_id, order_index, trigger_type, days_offset, recipient_type, document_type, name, description) VALUES
        (pack_id, 0, 'session_start_minus_days', 10, 'trainers', 'convention_intervention', 'Convention intervention J-10', 'Envoi de la convention d''intervention 10 jours avant'),
        (pack_id, 1, 'session_end_plus_days', 3, 'trainers', 'documents_post_st', 'Documents post-formation ST J+3', 'Rappel récupération documents du sous-traitant');
    END IF;

  END LOOP;
END $$;
```

- [ ] **Step 2 : commit**

```bash
git add supabase/migrations/seed_automation_packs.sql
git commit -m "feat(automation): seed des packs formation (qualiopi/opco/sous-traitance) par entité

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 : Service `instantiatePackForSession` (TDD sur le mapper pur)

**Files:**
- Create: `src/lib/automation/instantiate-pack.ts`
- Test: `src/lib/automation/__tests__/instantiate-pack.test.ts`

- [ ] **Step 1 : écrire le test du mapper pur (échouera)**

```ts
import { describe, it, expect } from "vitest";
import { packStepToSessionStepRow } from "../instantiate-pack";

describe("packStepToSessionStepRow", () => {
  it("copie les champs d'étape et injecte session_id + source_pack_id", () => {
    const step = {
      id: "step-1", order_index: 2, trigger_type: "session_start_minus_days",
      days_offset: 10, recipient_type: "trainers", document_type: "convention_intervention",
      template_id: null, condition_subcontracted: null, send_email: true,
      name: "Convention J-10", description: "desc",
    };
    const row = packStepToSessionStepRow(step, "sess-9", "pack-7");
    expect(row).toEqual({
      session_id: "sess-9",
      source_pack_id: "pack-7",
      order_index: 2,
      trigger_type: "session_start_minus_days",
      days_offset: 10,
      recipient_type: "trainers",
      document_type: "convention_intervention",
      template_id: null,
      condition_subcontracted: null,
      send_email: true,
      name: "Convention J-10",
      description: "desc",
    });
    // ne propage PAS l'id de l'étape gabarit
    expect((row as Record<string, unknown>).id).toBeUndefined();
  });
});
```

- [ ] **Step 2 : lancer → échec**

Run: `npx vitest run src/lib/automation/__tests__/instantiate-pack.test.ts`
Expected: FAIL (`packStepToSessionStepRow` n'existe pas).

- [ ] **Step 3 : implémenter le service**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PackStep {
  id: string;
  order_index: number;
  trigger_type: string;
  days_offset: number;
  recipient_type: string | null;
  document_type: string | null;
  template_id: string | null;
  condition_subcontracted: boolean | null;
  send_email: boolean | null;
  name: string | null;
  description: string | null;
}

export interface SessionStepRow {
  session_id: string;
  source_pack_id: string;
  order_index: number;
  trigger_type: string;
  days_offset: number;
  recipient_type: string | null;
  document_type: string | null;
  template_id: string | null;
  condition_subcontracted: boolean | null;
  send_email: boolean | null;
  name: string | null;
  description: string | null;
}

/** Mapper pur : une étape de gabarit → une ligne de snapshot (sans l'id du gabarit). */
export function packStepToSessionStepRow(step: PackStep, sessionId: string, packId: string): SessionStepRow {
  return {
    session_id: sessionId,
    source_pack_id: packId,
    order_index: step.order_index,
    trigger_type: step.trigger_type,
    days_offset: step.days_offset,
    recipient_type: step.recipient_type ?? null,
    document_type: step.document_type ?? null,
    template_id: step.template_id ?? null,
    condition_subcontracted: step.condition_subcontracted ?? null,
    send_email: step.send_email ?? true,
    name: step.name ?? null,
    description: step.description ?? null,
  };
}

/**
 * Instancie un pack en snapshot pour une session (remplaçant/idempotent).
 * Vérifie que pack et session appartiennent à la même entité.
 * Retourne le nombre d'étapes instanciées.
 */
export async function instantiatePackForSession(
  supabase: SupabaseClient,
  packId: string,
  sessionId: string,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const { data: pack, error: pErr } = await supabase
    .from("automation_packs").select("id, entity_id").eq("id", packId).maybeSingle();
  if (pErr) return { ok: false, error: pErr.message };
  if (!pack) return { ok: false, error: "Pack introuvable" };

  const { data: session, error: sErr } = await supabase
    .from("sessions").select("id, entity_id").eq("id", sessionId).maybeSingle();
  if (sErr) return { ok: false, error: sErr.message };
  if (!session) return { ok: false, error: "Session introuvable" };
  if (session.entity_id !== pack.entity_id) return { ok: false, error: "Pack et session d'entités différentes" };

  const { data: steps, error: stErr } = await supabase
    .from("automation_pack_steps").select("*").eq("pack_id", packId).order("order_index");
  if (stErr) return { ok: false, error: stErr.message };

  // Remplaçant : purge l'ancien snapshot de cette session avant réinsertion.
  const { error: delErr } = await supabase
    .from("session_automation_steps").delete().eq("session_id", sessionId);
  if (delErr) return { ok: false, error: delErr.message };

  const rows = (steps ?? []).map((s) => packStepToSessionStepRow(s as PackStep, sessionId, packId));
  if (rows.length > 0) {
    const { error: insErr } = await supabase.from("session_automation_steps").insert(rows);
    if (insErr) return { ok: false, error: insErr.message };
  }
  return { ok: true, count: rows.length };
}
```

- [ ] **Step 4 : lancer → vert**

Run: `npx vitest run src/lib/automation/__tests__/instantiate-pack.test.ts`
Expected: PASS.

- [ ] **Step 5 : type-check + commit**

Run: `npx tsc --noEmit` → PASS.

```bash
git add src/lib/automation/instantiate-pack.ts src/lib/automation/__tests__/instantiate-pack.test.ts
git commit -m "feat(automation): service instantiatePackForSession (snapshot pack→formation)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 : Moteur — passage pack-driven + exclusion du legacy

**Files:**
- Modify: `src/app/api/formations/automation-rules/run-cron/route.ts`

Objectif : dans le **mode cron normal** (la boucle `for (const entity of entities ...)` du passage date-based, vers la ligne 285-392), (a) exclure les sessions pack-driven du passage legacy, et (b) ajouter un passage qui exécute les `session_automation_steps` date-based. Le step caste vers `RuleInfo` (mêmes champs).

- [ ] **Step 1 : charger l'ensemble des sessions pack-driven (une fois, en tête du mode cron normal)**

Juste après `const { data: entities } = await supabase.from("entities").select("id, name");` (l.285), ajoute :

```ts
    // Sessions « pack-driven » : possèdent un snapshot session_automation_steps.
    // Elles sont exclues du moteur legacy et traitées par le passage dédié.
    const { data: packDrivenRows } = await supabase
      .from("session_automation_steps").select("session_id");
    const packDrivenIds = new Set((packDrivenRows ?? []).map((r) => r.session_id as string));
```

- [ ] **Step 2 : exclure les sessions pack-driven dans la boucle legacy**

Dans la boucle `for (const session of sessions)` (l.370), ajoute en première ligne du corps :

```ts
        for (const session of sessions) {
          if (packDrivenIds.has((session as { id: string }).id)) continue; // pack-driven → passage dédié
          const condSub = ... // (inchangé, reste tel quel en dessous)
```

(Conserve tout le reste de la boucle à l'identique.)

- [ ] **Step 3 : ajouter le passage pack-driven date-based**

Juste APRÈS la fin de la boucle `for (const rule of rules)` du legacy et AVANT `results.push({ entity: entity.name, ... })` (l.~388), insère, dans le même scope `for (const entity ...)` :

```ts
      // ── Passage PACK-DRIVEN (date-based) : exécute les snapshots de l'entité ──
      const { data: sessSteps } = await supabase
        .from("session_automation_steps")
        .select("*, session:sessions!inner(id, title, start_date, end_date, location, entity_id, is_subcontracted, status)")
        .eq("is_enabled", true)
        .in("trigger_type", ["session_start_minus_days", "session_end_plus_days"])
        .eq("session.entity_id", entityId)
        .in("session.status", ["upcoming", "in_progress", "completed"]);

      for (const step of sessSteps ?? []) {
        const sess = (step as { session: { id: string; start_date: string; end_date: string } }).session;
        // Même calcul de date cible (Europe/Paris) que le legacy.
        const todayInParis = new Intl.DateTimeFormat("fr-CA", {
          timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
        }).format(new Date());
        const [yy, mm, dd] = todayInParis.split("-").map(Number);
        const baseLocal = new Date(Date.UTC(yy, mm - 1, dd));
        let targetDate: string;
        let sessionDate: string;
        if ((step as { trigger_type: string }).trigger_type === "session_start_minus_days") {
          baseLocal.setUTCDate(baseLocal.getUTCDate() + (step as { days_offset: number }).days_offset);
          targetDate = baseLocal.toISOString().split("T")[0];
          sessionDate = sess.start_date;
        } else {
          baseLocal.setUTCDate(baseLocal.getUTCDate() - (step as { days_offset: number }).days_offset);
          targetDate = baseLocal.toISOString().split("T")[0];
          sessionDate = sess.end_date;
        }
        if (sessionDate !== targetDate) continue;

        const tplId = (step as { template_id: string | null }).template_id;
        const { enqueued, skipped, failed } = await executeRuleForSession(supabase, {
          rule: step as unknown as RuleInfo,
          session: sess as unknown as SessionInfo,
          template: tplId ? (templateMap[tplId] as TemplateInfo) ?? null : null,
          customTemplatesById,
          dedupAgainstHistoryFromDate: today,
        });
        processed += enqueued + skipped + failed;
        emailsSent += enqueued;
        if (failed > 0) {
          errors.push(`${(step as { name?: string }).name ?? "étape"} (${sess.id}): ${failed} échec(s)`);
        }
        await supabase.from("session_automation_logs").insert({
          session_id: sess.id,
          rule_id: null,
          rule_name: (step as { name?: string }).name ?? null,
          trigger_type: (step as { trigger_type: string }).trigger_type,
          recipient_count: enqueued,
          status: failed > 0 ? "partial" : "success",
        });
      }
```

> Note : `templateMap` et `customTemplatesById` sont déjà construits plus haut dans le mode cron normal à partir des règles legacy. Pour les templates référencés UNIQUEMENT par des steps de snapshot, l'implémenteur DOIT étendre la construction de `templateMap`/`customTemplatesById` pour inclure aussi les `template_id` des `session_automation_steps` de l'entité (même logique que pour les règles : fetch `email_templates` + `document_templates` des `attachment_doc_types`). Si un `template_id` manque dans la map, `executeRuleForSession` retombe sur le fallback `document_type` (comportement acceptable mais à éviter) — donc étendre la map proprement.

- [ ] **Step 4 : type-check**

Run: `npx tsc --noEmit`
Expected: PASS. (`RuleInfo`, `SessionInfo`, `TemplateInfo`, `executeRuleForSession` déjà importés en tête du fichier.)

- [ ] **Step 5 : commit**

```bash
git add src/app/api/formations/automation-rules/run-cron/route.ts
git commit -m "feat(automation): le cron exécute les snapshots pack-driven (date-based) + exclut le legacy

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5 : Vérification globale

**Files:** aucun (gates + contrôle manuel SQL)

- [ ] **Step 1 : type-check complet** — Run: `npx tsc --noEmit` → PASS.
- [ ] **Step 2 : tests** — Run: `npx vitest run` → PASS (dont `instantiate-pack.test.ts`).
- [ ] **Step 3 : contrôle base (après application manuelle des 2 migrations dans Supabase)** :
  - [ ] `select name, is_default from automation_packs order by entity_id, name;` → 3 packs par entité (MR + C3V), `Pack Qualiopi standard` en `is_default`.
  - [ ] `select count(*) from automation_pack_steps;` → 7+2+2 = 11 étapes par entité.
  - [ ] Instancier manuellement un pack sur une session de test (appel `instantiatePackForSession` ou INSERT manuel) puis vérifier que `session_automation_steps` est peuplé et que la session est exclue du legacy (pas d'email en double).
- [ ] **Step 4 : pas de commit** (validation seule).

---

## Self-Review (effectué)

- **Couverture spec :** 3 tables + RLS (T1) ; service snapshot idempotent (T3) ; bascule moteur + anti-double-exécution (T4) ; seed packs code→base par entité (T2). Critères d'acceptation couverts par T5. ✅
- **Écarts assumés & documentés :** `template_id` au lieu de `email_template_id` (réutilisation `RuleInfo`) ; pack `commercial` exclu (CRM) ; triggers événementiels laissés en legacy pour ce lot (aucune session snapshot avant Lot 3).
- **Placeholders :** aucun — SQL et TS complets. La seule consigne « à étendre par l'implémenteur » (templateMap pour les steps) est explicitée avec la logique exacte à reproduire.
- **Cohérence des types :** `PackStep`/`SessionStepRow` définis en T3 et réutilisés ; `session_automation_steps` a les colonnes du contrat `RuleInfo` (cast en T4). `template_id` cohérent entre migration (T1), seed (T2 — non utilisé), mapper (T3) et cast moteur (T4).
