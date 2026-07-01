# Packs d'automatisation — Lot 6 : déclencheurs événementiels sur snapshot — Design

**Date :** 2026-07-01
**Statut :** Approuvé (design), en attente du plan d'implémentation
**Périmètre :** Combler le dernier trou d'exécution : les étapes **événementielles** d'un pack ne se déclenchent pas depuis le snapshot d'une formation pack-driven. Ce lot les branche.

## Problème

Le Lot 1 n'a branché sur le snapshot (`session_automation_steps`) que les déclencheurs **date-based** (`session_start_minus_days` / `session_end_plus_days`). Les déclencheurs **événementiels** (`on_enrollment`, `on_session_completion`, `on_signature_complete`, `questionnaire_reminder`, `certificate_ready`) passent par le **mode ciblé** de `run-cron` (appelé par `/api/formations/automation-rules/trigger-event`), qui lit les **règles d'entité** (`formation_automation_rules`) et **ignore** le snapshot.

**Conséquence** : sur une formation pack-driven, les étapes événementielles du pack **ne partent pas** (ex. pack Qualiopi : positionnement à l'inscription, auto-éval/satisfaction/certificat à la clôture). Seules les date-based partent.

## Solution

Dans le **mode ciblé trigger+session** de `src/app/api/formations/automation-rules/run-cron/route.ts` (bloc `if (specificTrigger && specificSessionId)`), **remplacer la source des « règles »** :
- **Si la session possède ≥1 `session_automation_steps`** (pack-driven) → utiliser les **étapes du snapshot** filtrées par `trigger_type = specificTrigger` et `is_enabled = true`.
- **Sinon** (legacy) → comportement actuel : `formation_automation_rules` par (entity_id, trigger_type, is_enabled).

Le reste du bloc est **inchangé** : préchargement des templates (à faire depuis la source retenue), filtre `condition_subcontracted`, appel `executeRuleForSession` (un step caste vers `RuleInfo` — mêmes colonnes : `id, trigger_type, document_type, days_offset, recipient_type, template_id, condition_subcontracted, name, send_email`). `onlyLearnerId` (cas `on_enrollment`) reste passé tel quel.

Cela reproduit, pour l'événementiel, la logique anti-doublon déjà en place pour le date-based (une session pack-driven ⇒ snapshot uniquement).

## Hors périmètre (assumé, documenté)

- **`opco_deposit_reminder`** : reste géré par le passage cron OPCO dédié (règles d'entité + `formation_financiers`). Ce rappel est de nature « entité/dossier de financement », pas « parcours pédagogique » — le brancher sur le snapshot est peu pertinent et plus risqué. Limitation connue et acceptée : une étape `opco_deposit_reminder` mise dans un pack ne se déclenchera pas depuis le snapshot (mais le pack OPCO reste rare, et le rappel fonctionne au niveau entité).
- **`invoice_overdue`** : trigger CRM, hors module formation.
- Aucune modif du modèle de données, aucune migration.

## Règles projet
- Réutiliser le moteur existant (`executeRuleForSession`) sans le modifier. Pas de type `any` gratuit (les casts `as unknown as RuleInfo` existants sont tolérés, comme le reste du fichier). Barrières : `tsc` + `vitest`.

## Risques / vigilance
1. **Templates** : après le swap, précharger `templateMap`/`customTemplatesById` depuis la source RETENUE (les `template_id` des steps du snapshot, pas des règles d'entité) — sinon un step à template custom retombe sur le fallback `document_type`.
2. **Anti-doublon** : bien garantir « pack-driven ⇒ snapshot uniquement » (ne pas exécuter aussi les règles d'entité pour ce trigger sur cette session).
3. **`onlyLearnerId`** : conserver le passage de `specificLearnerId` (notification du seul nouvel apprenant pour `on_enrollment`).

## Critères d'acceptation
- Sur une formation pack-driven, un événement `on_enrollment` / `on_session_completion` / `on_signature_complete` déclenche les **étapes du snapshot** correspondantes (et PAS les règles d'entité).
- Sur une formation legacy (sans snapshot), le même événement garde le comportement actuel (règles d'entité).
- `tsc` + `vitest` verts.
