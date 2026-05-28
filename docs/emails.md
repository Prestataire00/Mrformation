# Module Emails — Architecture & Runbook

**Statut** : v1 (post-refonte BMAD 2026-05-28, 19 PRs sur main)
**Owner** : Wissam (dev) / Loris (admin OF)
**Source** : `bmad_output/planning-artifacts/cadrage-module-emails.md` + suite

Ce document est la **doc opérationnelle** pour quiconque touche au module Emails. Pour la genèse et les décisions, lire le cadrage Mary et l'architecture Winston dans `bmad_output/planning-artifacts/`.

---

## 1. Architecture en 1 schéma

```
┌────────────────────────────────────────────────────────────────┐
│  /admin/emails (panneau unique pour Loris)                     │
│                                                                │
│  Tabs : Modèles · Historique · Automatisations · Archivés     │
│  ↓                                                             │
│  Server Actions (_actions/) :                                  │
│    saveTemplate · archiveTemplate · restoreTemplate            │
│    deleteTemplatePermanent · duplicateTemplateToEntity         │
└──────────────────────────────┬─────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────┐
│  Service unifié : src/lib/services/email-template-resolver.ts  │
│                                                                │
│  resolveEmailTemplate(supabase, key, entityId)                 │
│      → Promise<EmailTemplate | null>                           │
│                                                                │
│  assertSeedComplete(supabase, entityId)                        │
│      → Promise<{ ok, missing }>                                │
└──────────────────────────────┬─────────────────────────────────┘
                               │ reads via index
                               ▼
┌────────────────────────────────────────────────────────────────┐
│  Table email_templates (étendue par em-a-1)                    │
│                                                                │
│  Colonnes lifecycle : key · category · is_active               │
│  Colonnes audit     : created_by · updated_at · updated_by     │
│  Colonnes UX        : sender_name · sender_email               │
│                       recipient_type · trigger_config (JSONB)  │
│                                                                │
│  Index unique PARTIAL :                                        │
│   (entity_id, key) WHERE key IS NOT NULL AND is_active = TRUE  │
│                                                                │
│  Trigger BEFORE UPDATE → updated_at = NOW()                    │
└──────────────────────────────┬─────────────────────────────────┘
                               │
                               ▼
       ┌──────────────────────────────────────────┐
       │  5 pipelines consommateurs (Epic B)      │
       ├──────────────────────────────────────────┤
       │  /api/invoices/process-reminders (cron)  │
       │  /api/crm/quotes/process-reminders (cron)│
       │  /api/crm/quotes/sign-request (admin)    │
       │  /api/formations/automation-rules/       │
       │     run-cron OPCO branch (cron)          │
       │  src/lib/services/batch-email-handler.ts │
       │     (15+ routes /api/documents/send-X-*) │
       └──────────────────────────────────────────┘
                               │
                               ▼
       ┌──────────────────────────────────────────┐
       │  email_queue (table email_history)       │
       │  + worker /api/emails/process-scheduled  │
       │  → Resend / Gmail OAuth                  │
       └──────────────────────────────────────────┘
```

**Vue SQL `email_template_usage`** (em-a-5) : agrège l'utilisation par `formation_automation_rules` + `crm_automation_rules` pour afficher le badge "⚠️ Utilisé par N automations" dans le UI.

---

## 2. Liste des `key` "système" seedés (~22 par entité)

Source : `supabase/migrations/em_a_3_seed_default_email_templates.sql`. Wording pixel-perfect copié depuis les hardcoded pré-refonte.

| Key | Catégorie | Recipient | Pipeline consommateur |
|---|---|---|---|
| `reminder_invoice_first` | reminder | client | `invoices/process-reminders` |
| `reminder_invoice_second` | reminder | client | `invoices/process-reminders` |
| `reminder_invoice_final` | reminder | client | `invoices/process-reminders` |
| `reminder_quote_first` | reminder | client | `crm/quotes/process-reminders` |
| `reminder_quote_second` | reminder | client | `crm/quotes/process-reminders` |
| `reminder_quote_final` | reminder | client | `crm/quotes/process-reminders` |
| `quote_sign_request` | transactional | client | `crm/quotes/sign-request` |
| `opco_deposit` | automation | manager | `formations/automation-rules/run-cron` (OPCO branch) |
| `batch_convocation` | batch | learner | `batch-email-handler` → `/api/documents/send-convocations-batch-email` |
| `batch_attestation_assiduite` | batch | learner | idem |
| `batch_certificat_realisation` | batch | learner | idem |
| `batch_attestation_competences` | batch | learner | idem |
| `batch_attestation_abandon` | batch | learner | idem |
| `batch_avis_habilitation_electrique` | batch | learner | idem |
| `batch_certificat_travail_hauteur` | batch | learner | idem |
| `batch_attestation_aipr` | batch | learner | idem |
| `batch_reponses_satisfaction` | batch | learner | idem |
| `batch_resultats_evaluations` | batch | learner | idem |
| `batch_cgv` | batch | client | idem |
| `batch_politique_confidentialite` | batch | client | idem |
| `batch_bilans_poe` | batch | learner | idem |
| `batch_programme` | batch | learner | idem |
| `batch_convention_entreprise` | batch | client | idem |
| `batch_convention_intervention` | batch | trainer | idem |

**Tag rollback** : tous les seedés ont `trigger_config = {"seed_version": "2026-05-28-v1"}` — permet un rollback ciblé sans toucher aux customisations de Loris (`DELETE FROM email_templates WHERE trigger_config->>'seed_version' = '2026-05-28-v1'`).

**REQUIRED_KEYS** constante côté code : `src/lib/services/email-template-resolver.ts:REQUIRED_KEYS`.

---

## 3. Format `trigger_config` JSONB

Colonne JSONB libre pour stocker la config sémantique du template :

```jsonc
{
  "seed_version": "2026-05-28-v1"     // tag rollback pour seeds
  // Champs additionnels possibles :
  // "trigger": "session_start_minus_days",
  // "offset_days": 7,
  // ...
}
```

Pas de schéma strict — évolutif selon les besoins futurs. Pour l'instant, seul `seed_version` est utilisé.

---

## 4. Comment ajouter un nouveau pipeline email

Checklist 5 étapes :

1. **Définir le `key` sémantique** (ex: `reminder_subscription_renewal`)
2. **Seed le template par défaut** dans une nouvelle migration `supabase/migrations/em_X_seed_new_key.sql` (pattern em-a-3)
3. **Ajouter le `key` à `REQUIRED_KEYS`** dans `src/lib/services/email-template-resolver.ts`
4. **Dans la route consommatrice**, appeler `resolveEmailTemplate(supabase, key, entityId)` + gérer le null en skip + log
5. **Test guardrail Vitest** sur le routeur (mock le resolver)

Pas besoin de feature flag (Epic B a tout cleanup-é en em-b-6 — le resolver est le chemin unique). Si tu veux un fallback de transition, garde un hardcoded inline temporaire avec `console.warn` jusqu'à stabilisation.

---

## 5. Liste des `logEvent()` structurés (Netlify Logs / Sentry)

Toujours via `import { logEvent } from "@/lib/logger"`. Format JSON `{ event, ts, ...context }`. Grep-able.

| Event | Émis par | Payload |
|---|---|---|
| `email_template_resolved` | resolver | `{ entity_id, key, template_id, latency_ms, status: "ok" }` |
| `email_template_missing` | resolver (level error) | `{ entity_id, key, latency_ms, level: "error" }` |
| `email_template_seed_incomplete` | assertSeedComplete (level critical) | `{ entity_id, missing[], level: "critical" }` |
| `email_template_edit_completed` | saveTemplate Server Action | `{ template_id, user_id, duration_ms }` |
| `email_template_archived` | archiveTemplate | `{ template_id, entity_id, archived_by }` |
| `email_template_restored` | restoreTemplate | `{ template_id, entity_id, restored_by }` |
| `email_template_restore_blocked_key_collision` | restoreTemplate | `{ template_id, key }` |
| `email_template_deleted_permanent` | deleteTemplatePermanent | `{ template_id, entity_id, template_name, template_key, deleted_by }` |
| `email_template_delete_blocked_referenced` | deleteTemplatePermanent | `{ template_id, references_count }` |
| `email_template_concurrent_edit_conflict` | saveTemplate (level warn) | `{ template_id, user_id, initial_updated_at, current_updated_at }` |
| `email_template_duplicated_cross_entity` | duplicateTemplateToEntity | `{ source_template_id, source_entity_id, target_entity_id, copy_id, duplicated_by }` |
| `email_template_duplicate_forbidden` | duplicateTemplateToEntity | `{ user_id, template_id, target_entity_id, user_role }` |

**Pour grep en prod Netlify Logs** :
```bash
# Tous les events resolver d'une entité spécifique
grep '"event":"email_template_resolved"' logs.txt | grep '"entity_id":"<uuid>"'

# Détection de seed incomplet (critical, à fixer immédiatement)
grep '"event":"email_template_seed_incomplete"' logs.txt

# Tracking activité Loris (modifications de templates)
grep '"event":"email_template_edit_completed"' logs.txt | jq '.user_id, .template_id, .duration_ms'
```

---

## 6. RLS (Row Level Security)

| Table | Policy | Note |
|---|---|---|
| `email_templates` | admin/super_admin all + trainer read (entity-scoped) | inchangé par la refonte |
| `email_history` | idem | inchangé |
| `crm_automation_rules` | **`USING (entity_id = user_entity_id())`** | em-a-4 fix P0, ex-`USING (true)` |
| `formation_automation_rules` | entity_isolation | inchangé |
| `email_template_usage` (vue) | hérite RLS sous-jacents | em-a-5 |

**Helpers PG** :
- `public.user_role()` — SECURITY DEFINER STABLE, retourne role depuis `profiles`
- `public.user_entity_id()` — idem pour entity_id

---

## 7. Runbook ops

### Activer un nouveau template seedé en prod

```sql
-- Vérifier que les seeds sont bien appliqués
SELECT entity_id, key
FROM email_templates
WHERE trigger_config->>'seed_version' = '2026-05-28-v1'
ORDER BY entity_id, key;

-- Compter : attendu 22 par entité
SELECT entity_id, COUNT(*) FROM email_templates
WHERE trigger_config->>'seed_version' = '2026-05-28-v1'
GROUP BY entity_id;
```

### Détecter un seed incomplet (cron alerte)

```bash
# Filtrer les logs Netlify pour le pattern critical
grep '"event":"email_template_seed_incomplete"' /path/to/netlify-logs.txt
```

Si présent → exécuter ré-seed via `supabase/migrations/em_a_3_seed_default_email_templates.sql` (idempotent grâce à `WHERE NOT EXISTS`).

### Investiguer un `email_template_missing`

1. Récupérer l'`entity_id` + `key` depuis le log
2. Query Supabase :
   ```sql
   SELECT id, key, is_active, updated_at, updated_by
   FROM email_templates
   WHERE entity_id = '<uuid>' AND key = '<key>';
   ```
3. 3 cas :
   - 0 ligne → seed incomplet, re-exécuter em-a-3
   - is_active = false → Loris a archivé par erreur, restore via `/admin/emails` onglet Archivés
   - existe + actif → bug applicatif (filter applicatif vs DB), fouiller le code consommateur

### Rollback complet de la refonte (ultime recours)

Voir les sections `-- ROLLBACK` dans chaque migration `supabase/migrations/em_a_*.sql`. **Non recommandé** : la refonte est en prod stable.

---

## 8. Variables d'env Netlify

| Variable | Valeur | Statut |
|---|---|---|
| `USE_TEMPLATE_RESOLVER_INVOICES` | ❌ retirée em-b-6 | À supprimer du dashboard si encore présente |
| `USE_TEMPLATE_RESOLVER_QUOTES` | ❌ retirée em-b-6 | idem |
| `USE_TEMPLATE_RESOLVER_SIGN_REQUEST` | ❌ retirée em-b-6 | idem |
| `USE_TEMPLATE_RESOLVER_OPCO` | ❌ retirée em-b-6 | idem |
| `USE_TEMPLATE_RESOLVER_BATCH` | ❌ retirée em-b-6 | idem |
| `RESEND_API_KEY` | actif | inchangé |
| `CRON_SECRET` | actif | inchangé |

---

## 9. Tests Vitest

Baseline session refonte : **550 → 751** (+201 tests). Coverage cible par catégorie :
- Server Actions : 100% (5 actions × ~6 cas each)
- Resolver : happy + null graceful + RLS + log emitted + seed incomplete
- Migrations SQL : guardrail content (regex sur fichier .sql)
- UI scaffolds : import + structure + props

Lancer la suite :
```bash
npx vitest run --reporter=basic
```

---

## 10. Hors scope V1 (différés)

- **em-c-3c** : refonte complète Dialog Édition 3-colonnes (MetaPanel + EditorPanel + PreviewPanel + UsagePopover + EditDialogContext). Le dialog actuel fonctionne avec optimistic lock via em-c-3b. Refonte = pure amélioration UX, non bloquante.
- **em-f-4** : smoke test E2E Playwright. Playwright pas configuré dans le projet. Smoke check manuel par Wissam suffit pour V1.
- **Lot E** : CRM campaigns template-driven (`crm_campaigns.template_id` FK + UI sélecteur "Utiliser un template / Saisie libre"). Différé V2 selon décision cadrage Q3.

---

## 11. Liens vers les artefacts BMAD

- [`cadrage-module-emails.md`](../bmad_output/planning-artifacts/cadrage-module-emails.md) — diagnostic + 8 décisions
- [`ux-design-module-emails.md`](../bmad_output/planning-artifacts/ux-design-module-emails.md) — UX-DR + JTBD + wireframes
- [`prd-emails.md`](../bmad_output/planning-artifacts/prd-emails.md) — 64 FR-EML-N + NFR
- [`architecture-module-emails.md`](../bmad_output/planning-artifacts/architecture-module-emails.md) — patterns code + 9 risques
- [`epics-emails.md`](../bmad_output/planning-artifacts/epics-emails.md) — 22 stories INVEST
- [`implementation-readiness-report-emails-2026-05-28.md`](../bmad_output/planning-artifacts/implementation-readiness-report-emails-2026-05-28.md) — score 30/30
- [`sprint-status-emails.yaml`](../bmad_output/implementation-artifacts/sprint-status-emails.yaml) — sprint plan

---

**Fin doc Emails v1** — à mettre à jour si nouvel epic ou changement majeur.
