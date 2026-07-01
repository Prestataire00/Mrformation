# Packs d'automatisation — Lot 6 (Événementiel sur snapshot) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Les déclencheurs événementiels d'un pack s'exécutent depuis le snapshot d'une formation pack-driven.

**Architecture:** Dans le mode ciblé trigger+session de `run-cron`, choisir la source des « règles » selon que la session est pack-driven (→ `session_automation_steps`) ou non (→ `formation_automation_rules`, legacy). Le reste du bloc est inchangé (les steps castent vers `RuleInfo`).

**Tech Stack:** Next.js route handler, Supabase, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-01-automation-events-snapshot-design.md`

---

## Pré-requis vérifiés

- Bloc à modifier : `src/app/api/formations/automation-rules/run-cron/route.ts`, mode `if (specificTrigger && specificSessionId)` (≈ lignes 204-278). Aujourd'hui : fetch `session` → fetch `formation_automation_rules` par (entity_id, trigger_type, is_enabled) → préchargement templates → boucle avec filtre `condition_subcontracted` → `executeRuleForSession(..., onlyLearnerId: specificLearnerId)`.
- `session_automation_steps` a les colonnes du contrat `RuleInfo` (`id, trigger_type, document_type, days_offset, recipient_type, template_id, condition_subcontracted, name, send_email`) + `is_enabled`.
- Le passage date-based (même fichier) fait déjà « pack-driven ⇒ snapshot uniquement » — on reproduit la même règle pour l'événementiel.
- Barrières : `npx tsc --noEmit` + `npx vitest run`.

## File Structure

| Fichier | Action |
|---|---|
| `src/app/api/formations/automation-rules/run-cron/route.ts` | Modifier : dans le mode ciblé trigger+session, source des règles = snapshot si pack-driven, sinon legacy. |

---

## Task 1 : Swap de source dans le mode ciblé événementiel

**Files:**
- Modify: `src/app/api/formations/automation-rules/run-cron/route.ts`

- [ ] **Step 1 : remplacer le fetch des règles**

Dans le bloc `if (specificTrigger && specificSessionId)`, APRÈS le fetch de `session` (et son check `if (!session) ...`), REMPLACER le fetch actuel :

```ts
      const { data: rules } = await supabase
        .from("formation_automation_rules")
        .select("*")
        .eq("entity_id", session.entity_id)
        .eq("trigger_type", specificTrigger)
        .eq("is_enabled", true);
```

par la version qui choisit la source selon pack-driven :

```ts
      // Pack-driven ? → on exécute le SNAPSHOT de la session (session_automation_steps),
      // sinon les règles d'entité (legacy). Reproduit l'anti-doublon du passage date-based.
      const { data: snapCheck } = await supabase
        .from("session_automation_steps")
        .select("id")
        .eq("session_id", specificSessionId)
        .limit(1);
      const isPackDriven = (snapCheck?.length ?? 0) > 0;

      const { data: rules } = isPackDriven
        ? await supabase
            .from("session_automation_steps")
            .select("*")
            .eq("session_id", specificSessionId)
            .eq("trigger_type", specificTrigger)
            .eq("is_enabled", true)
        : await supabase
            .from("formation_automation_rules")
            .select("*")
            .eq("entity_id", session.entity_id)
            .eq("trigger_type", specificTrigger)
            .eq("is_enabled", true);
```

> Le reste du bloc est INCHANGÉ : le préchargement `templateMap`/`customTemplatesById` lit `rules.filter(r => r.template_id)` — ça marche pour les deux sources (les steps ont aussi `template_id`). La boucle `for (const rule of rules)`, le filtre `condition_subcontracted`, l'appel `executeRuleForSession({ rule: rule as unknown as RuleInfo, ..., onlyLearnerId: specificLearnerId ?? undefined })` restent tels quels.

- [ ] **Step 2 : vérifier qu'aucune autre logique legacy ne double l'exécution**

Confirme (lecture) que ce mode ciblé `return` bien à la fin du bloc (il retourne `NextResponse.json({...})`) et n'enchaîne pas ensuite sur le mode cron normal — donc pas de double exécution. (C'est le cas dans le fichier : le bloc se termine par un `return`.)

- [ ] **Step 3 : type-check**

Run: `npx tsc --noEmit`
Expected: PASS. (`rules` reste `any[] | null` issu de Supabase, casté en `RuleInfo` comme avant — aucun nouveau type requis.)

- [ ] **Step 4 : tests**

Run: `npx vitest run`
Expected: PASS (aucun test ne couvre ce cron ; on ne régresse rien).

- [ ] **Step 5 : commit**

```bash
git add src/app/api/formations/automation-rules/run-cron/route.ts
git commit -m "feat(automation): déclencheurs événementiels lisent le snapshot pour les formations pack-driven

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 : Vérification

**Files:** aucun (gates + test manuel)

- [ ] **Step 1 : tsc** — `npx tsc --noEmit` → PASS.
- [ ] **Step 2 : vitest** — `npx vitest run` → PASS.
- [ ] **Step 3 : test manuel** (après déploiement, C3V) :
  - [ ] Formation pack-driven avec un pack contenant une étape `on_enrollment` (ex. positionnement) → inscrire un apprenant → l'email/questionnaire de l'étape du snapshot part (visible dans `email_history` / logs), et PAS la règle d'entité.
  - [ ] Formation legacy (sans snapshot) → même événement garde le comportement règles-d'entité.
  - [ ] `on_session_completion` sur une formation pack-driven → étapes de clôture du snapshot déclenchées.
- [ ] **Step 4 : pas de commit** (validation).

---

## Self-Review (effectué)

- **Couverture spec :** swap de source pack-driven vs legacy dans le mode ciblé (T1) ; préchargement templates depuis la source retenue (inchangé car `rules` porte `template_id` dans les deux cas) ; anti-doublon « pack-driven ⇒ snapshot uniquement » (T1, le `else` exclut les règles d'entité) ; `onlyLearnerId` conservé (inchangé). `opco_deposit_reminder` hors périmètre (documenté dans le spec). ✅
- **Placeholders :** aucun — l'edit exact est fourni ; le reste du bloc est explicitement « inchangé ».
- **Cohérence des types :** `session_automation_steps` porte les colonnes de `RuleInfo` → cast `as unknown as RuleInfo` déjà en place downstream, rien à changer.
