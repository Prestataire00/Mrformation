---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
completedAt: '2026-05-28'
inputDocuments:
  - bmad_output/planning-artifacts/cadrage-module-emails.md
  - bmad_output/planning-artifacts/ux-design-module-emails.md
  - bmad_output/planning-artifacts/prd-emails.md
  - bmad_output/planning-artifacts/architecture.md (référence format)
  - CLAUDE.md
  - src/lib/services/email-queue.ts
  - src/lib/services/batch-email-handler.ts
  - src/lib/template-variables.ts
  - src/app/(dashboard)/admin/emails/page.tsx
workflowType: 'architecture'
project_name: 'lms-platform'
user_name: 'Wissam'
date: '2026-05-28'
scope: 'Module Emails — refonte big bang : service resolver + schéma étendu + RLS fix + UI 3-colonnes + soft-archive + cross-entity'
status: 'draft-v1'
---

# Architecture Decision Document — Refonte Module Emails

_This document refines and challenges PRD §10 (Technical Architecture). It surfaces trade-offs rather than verdicts and proposes concrete patterns developers will implement._

## Context

Cette architecture documente la refonte **big bang** du module Emails, qui doit consolider 7 pipelines disparates en une source de vérité unique et donner à Loris (admin OF solo) l'autonomie complète sur le contenu des emails.

**Scope** :
1. Service `email-template-resolver.ts` unifié (Lot A.2)
2. Schéma `email_templates` étendu (lifecycle + audit + key index) — Lot A.1
3. Seed templates par défaut idempotent — Lot A.3
4. Fix RLS `crm_automation_rules` (vulnérabilité allow_all P0) — Lot A.4 / **PR hotfix indépendant**
5. Migration des 5 pipelines (invoices, quotes, sign-request, OPCO, batch) vers le resolver — Lot B
6. Refonte UI `/admin/emails` (4 tabs + dialog 3-colonnes + soft-archive + audit) — Lot C
7. Cross-entity duplication super_admin — Lot D
8. Vue SQL `email_template_usage` + UsagePopover — annexe Lot A
9. Hygiène : tests Vitest + E2E Playwright + doc + logs structurés — Lot F

**Décisions de scope (validées avec Wissam 2026-05-28)** :
- Client autonome = admin entité (Loris), pas client B2B final
- Tous les champs éditables (subject, body, variables, attachments, recipient_type, sender override, trigger)
- Big bang complet, suppression des fallbacks hardcoded après stabilisation
- Pas de full versioning (s'appuie sur `email_history.body`)
- Tout est custom (pas de templates système verrouillés type `OFFICIAL_TEMPLATES` de documents)
- Cross-entity sharing autorisé pour super_admin
- Lot E (campaigns template-driven) différé V2

**Sources d'autorité** :
- [cadrage-module-emails.md](./cadrage-module-emails.md) (Mary, validé 2026-05-28)
- [ux-design-module-emails.md](./ux-design-module-emails.md) (Sally, validé 2026-05-28)
- [prd-emails.md](./prd-emails.md) (John, draft v1.0 2026-05-28)

---

## Project Context Analysis

### Requirements Overview

**64 FR-EML-N** couvrant 8 catégories (cf. PRD §7) :

| Catégorie | FR range | Volume code estimé |
|---|---|---|
| Service resolver | FR-EML-1 → 5 | ~120 LOC + tests ~200 LOC |
| Schéma étendu | FR-EML-6 → 11 | ~100 LOC SQL migration + ~50 LOC `down.sql` |
| Seed | FR-EML-12 → 15 | ~250 LOC SQL (25 templates × 2 entités = 50 INSERTs) |
| Fix RLS | FR-EML-16 → 19 | ~20 LOC SQL + ~80 LOC tests |
| Migration pipelines | FR-EML-20 → 26 | ~150 LOC refactor par route × 5 routes = ~750 LOC |
| UI refondue | FR-EML-27 → 46 | ~2 000 LOC (split + nouveaux composants) |
| Cross-entity | FR-EML-47 → 50 | ~150 LOC |
| Vue usage | FR-EML-51 → 53 | ~30 LOC SQL + ~80 LOC tests |
| Observabilité | FR-EML-54 → 58 | ~200 LOC tests E2E + docs |

**Effort total agrégé** : ~4 000 LOC nouveau code + suppression de ~700 LOC hardcoded + dead code → bilan net **+3 300 LOC**. Comparable à PR2 documents.

**Non-Functional Requirements clés** :
- NFR-EML-PERF-1 : resolver < 50ms P95 → contrainte = index couvrant la query
- NFR-EML-PERF-2 : tab Modèles < 800ms P95 → contrainte = batch-loader usage_count
- NFR-EML-PERF-3 : preview live < 100ms → contrainte = debounce + memoization
- NFR-EML-SEC-1 : 0 policy `USING (true)` dans le périmètre
- NFR-EML-REL-1 : resolver null ne crash jamais (graceful degradation)
- NFR-EML-MAINT-1 : 0 cast `any` (règle CLAUDE.md #1)

### Project Type Classification

**Brownfield refactoring** d'un module mature mais fragmenté. Code émail existe dans ~30+ fichiers répartis sur :
- `src/app/(dashboard)/admin/emails/page.tsx` (1 656 LOC monolithique)
- `src/components/emails/*.tsx` (3 composants — 1 dead code)
- `src/lib/services/email-queue.ts`, `batch-email-handler.ts`, `email-attachments-resolver.ts`
- `src/app/api/emails/*` (3 routes)
- `src/app/api/documents/send-*-batch-email/route.ts` (15+ routes batch)
- `src/app/api/invoices/process-reminders/route.ts` (cron)
- `src/app/api/crm/quotes/process-reminders/route.ts`, `sign-request/route.ts`
- `src/app/api/formations/automation-rules/run-cron/route.ts`

**Pas de greenfield component** — chaque morceau s'appuie sur l'existant (Tiptap RichTextEditor, InsertVariableButton, email_queue retry, Resend/Gmail providers, Supabase RLS, React Hook Form + Zod).

### Constraint Map

**Hard constraints** (non négociables) :
- Supabase RLS multi-tenant — `entity_id` scoped sur toutes les tables touchées
- Resend API rate limit (free tier 100/jour, plan starter $20/mois)
- Next.js 14 App Router (Server Components + Server Actions)
- TypeScript strict (CLAUDE.md règle #1)
- Tests Vitest baseline 550 → cible 580+ post-refonte
- Aucun appel Supabase inline dans les composants UI (CLAUDE.md règle #10)
- Tous les forms en React Hook Form + Zod (CLAUDE.md règle #6)
- Tous les composants UI via Shadcn/ui (CLAUDE.md règle #9)

**Soft constraints** (à arbitrer) :
- Bundle size Tiptap déjà payé (utilisé par /admin/documents) — pas un coût net
- React Query déjà installé — préférer à fetch direct
- Pas de Zustand/Redux installé — partage d'état complexe = React Context

---

## Starter Template Evaluation (Brownfield)

### Évaluation de la base existante

| Aspect | État | Décision |
|---|---|---|
| Service queue email | `email-queue.ts` mature avec retry/scheduled_for | **Conserver tel quel** |
| Retry mechanism | `email_history.retry_count + max_retries + next_retry_at` | **Conserver tel quel** |
| Composant éditeur | `RichTextEditor` (Tiptap) déjà utilisé par /admin/documents | **Réutiliser** |
| Variable picker | `InsertVariableButton` avec context filter | **Réutiliser** (filter `context="email"`) |
| Catalogue variables | `template-variables.ts` 83 vars cataloguées | **Conserver tel quel** |
| Resolver variables | `resolve-variables.ts` chemin unique | **Conserver tel quel** |
| Provider abstraction | Resend conditionnel + Gmail OAuth | **Conserver tel quel** |
| Schéma `email_templates` | Manque 10 colonnes (lifecycle/audit/key) | **Étendre** (Lot A.1) |
| Page `/admin/emails` | 1 656 LOC, dead code dedans | **Refondre** (Lot C) |
| RLS `crm_automation_rules` | Allow_all P0 | **Fix** (Lot A.4, hotfix) |
| Pattern email service par module | Pas de pattern (5 pipelines disparates) | **Créer** (`email-template-resolver.ts`) |

**Aucun outillage tiers nouveau** à installer. Refonte 100% in-stack — principe Fowler "boring technology for stability".

### Inventaire des patterns à inspirer

**Pattern `DocumentGenerationService`** (refonte documents, déjà livré) :
- Façade unique pour 11 doc_types
- Cache layer SHA-256
- Logs structurés `document_generated`
- Feature flag per doc_type
- → **Inspiration directe** pour le service resolver email, mais **simplifié** (pas de cache, pas de PDF rendering — juste lookup DB rapide)

**Pattern `OFFICIAL_TEMPLATES`** (refonte documents) :
- Templates système verrouillés en code, copie DB sur "Utiliser comme base"
- → **Volontairement écarté** ici : décision cadrage #6 "tout est custom" — Loris peut TOUT éditer. Seed initial DB-only, pas de code-level lock.

**Pattern `superpowers:writing-plans` + execution** (sous-chantier 2 /admin/documents) :
- Spec → Plan → Execute en patches successifs (V1, V2, V3)
- → **Différent du workflow BMAD** mais utilisable en mode "patch" si jamais on doit affiner après livraison V1

---

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation)** :

| ID | Décision | Justification | Trade-off |
|----|----------|---------------|-----------|
| **CD-EML-1** | Resolver pattern : lookup direct DB sans cache applicatif | Volumes faibles (~50 templates/entité), index unique partiel couvre 100% des queries en < 5ms, ajouter Redis serait premature optimization (Rule of Three pas atteinte) | Si volumes explosent (>1000 templates), ajouter cache LRU in-memory — non bloquant |
| **CD-EML-2** | Migration strategy : feature flag par route + seed pré-déploiement | Granularité fine (5 flags) permet rollback individuel ; alternative "1 flag global" = trop coarse, "git revert" = trop lent en cas d'incident OPCO ; le coût 5 flags est ~5 lignes de code par route | Surface d'erreur 5x supérieure à 1 flag — mitigé par documentation `docs/emails.md` listant tous les flags et leur état |
| **CD-EML-3** | RLS fix `crm_automation_rules` en **PR hotfix indépendant** avant Lot A complet | Vulnérabilité P0 cross-entity exposable aujourd'hui — pas acceptable d'attendre 1 semaine de Lot A. La PR est ~20 LOC SQL + tests, mergeable en 1h | Risque si on déploie le fix sans le Lot A complet : aucun (la policy entity-scoped est plus stricte, pas de régression fonctionnelle attendue puisque tous les vrais usages sont déjà entity-scoped applicatif) |
| **CD-EML-4** | Soft-archive (is_active=false) au lieu de hard DELETE | Réversibilité = principe Don Norman / décision cadrage #5 | Coût négligeable : 1 colonne BOOLEAN + filter dans les queries |
| **CD-EML-5** | Optimistic locking via comparaison `updated_at` au save | Détection de concurrent edit sans surcharge réseau ; alternative "BIGINT version" = complexité non justifiée pour 1 admin solo | Faux positif possible si l'horloge serveur shift — risque très faible avec NOW() côté DB |

**Important Decisions (Shape Architecture)** :

| ID | Décision | Trade-off |
|----|----------|-----------|
| **ID-EML-1** | Vue SQL `email_template_usage` plutôt que materialized view ou query agrégée à chaque load card | Vue simple = OK pour ≤ 100 templates ; si N templates × N rules dépasse 10 000 lignes, basculer en materialized view avec REFRESH on commit. Aujourd'hui : ~50 templates × ~30 rules = ~1500 lignes max → vue suffit largement |
| **ID-EML-2** | Split `page.tsx` 1656 LOC → 8+ sous-composants dans `_components/` avec **React Context** pour l'état partagé du dialog | Alternative "prop drilling" = trop verbeux ; alternative "Zustand" = nouvelle dépendance. Context = boring tech (Fowler), déjà utilisé ailleurs dans le projet |
| **ID-EML-3** | Preview live debounced à 200ms + memoization React.memo + useMemo sur le rendu HTML résolu | Sans debounce, re-render à chaque keystroke = perf P95 dégradée. Avec memo, on évite les re-renders inutiles du panel preview quand seul le panel meta change |
| **ID-EML-4** | Concurrent edit detection côté Server Action (compare `updated_at` du payload vs DB avant update) plutôt que côté DB (CHECK constraint) | Server Action retourne un status `409 Conflict` parsable par le client ; CHECK constraint = erreur PG opaque |
| **ID-EML-5** | Cross-entity dup via **Server Action explicite** avec check `user_role()='super_admin'` côté server, pas via RLS | RLS est entity-scoped donc bloquerait l'INSERT sur target_entity_id. La Server Action utilise `service_role` après vérification user_role — pattern déjà utilisé pour `resolveActiveEntityId` (cf. memory `project_super_admin_cross_entity`) |
| **ID-EML-6** | Variables résolution preview = **côté client**, pas Server Action | Le dataset session/apprenant choisi par Loris est petit (< 5 KB JSON). Pas de raison de faire un round-trip pour chaque keystroke. Préfetch du contexte au load du dialog |

**Deferred Decisions (Post-MVP V2)** :

| ID | Décision différée | Trigger pour la reconsidérer |
|----|-------------------|------------------------------|
| **DD-EML-1** | Versioning des templates (`email_template_versions` parent/child) | Si Loris demande "annule ma modif d'il y a 3 jours" ≥ 2 fois |
| **DD-EML-2** | Suggestions IA wording (Anthropic SDK + claude-sonnet) | Si Loris reste bloqué sur la formulation > 5 min en moyenne (mesure J5) |
| **DD-EML-3** | Multi-langue templates (FR/EN) | Si C3V signe un contrat avec un client multinational |
| **DD-EML-4** | Cache Redis pour resolver | Si NFR-EML-PERF-1 (< 50ms) dépasse régulièrement P95 |
| **DD-EML-5** | A/B testing | Si Loris demande "tester 2 versions d'un template" ≥ 2 fois |

### Data Architecture

**Tables modifiées** :

| Table | Action | Schéma simplifié |
|---|---|---|
| `email_templates` | **ALTER** (10 colonnes ajoutées) | `id, entity_id, name, subject, body, type, variables, attachment_doc_types, created_at, KEY, CATEGORY, IS_ACTIVE, CREATED_BY, UPDATED_AT, UPDATED_BY, SENDER_NAME, SENDER_EMAIL, RECIPIENT_TYPE, TRIGGER_CONFIG` (caps = nouveau) |
| `email_history` | **inchangée** | OK tel quel |
| `crm_automation_rules` | **RLS only** | DROP `allow_all` → CREATE `entity_scoped` |
| `email_template_usage` | **NEW VIEW** | `template_id, entity_id, usage_count, usages JSONB` |

**Index ajoutés** :
- `email_templates_entity_key_uniq` UNIQUE partial ON `(entity_id, key) WHERE key IS NOT NULL AND is_active = TRUE` — couvre 100% des queries du resolver
- `email_templates_category_active` ON `(entity_id, category, is_active)` — accélère le filtre UI

**Trigger ajouté** :
- `email_templates_set_updated_at` BEFORE UPDATE → NEW.updated_at = NOW()

**RLS policies finales** (objectif NFR-EML-SEC-1) :

| Table | Policy | Effet |
|---|---|---|
| `email_templates` | `email_templates_admin_all` (admin + entity) + `email_templates_trainer_read` (trainer + entity) | inchangé — déjà OK |
| `email_history` | `email_history_admin_all` (admin + entity) + `email_history_trainer_read` (trainer + entity) | inchangé — déjà OK |
| `crm_automation_rules` | **NEW** `crm_automation_rules_admin_entity` : `USING (entity_id = profiles.entity_id AND user_role() IN ('admin','super_admin'))` | ⚠️ **fix P0** |
| `formation_automation_rules` | `entity_isolation` | inchangé — déjà OK |
| `crm_campaigns` | `crm_campaigns_admin_all` | inchangé — déjà OK |
| `email_template_usage` (vue) | **hérite des policies des tables sous-jacentes** | OK natif |

**Migration script** : 1 fichier `supabase/migrations/2026_05_29_email_module_v1.sql` idempotent, avec section `-- ROLLBACK` commentée pour rappel du `down.sql`.

### Authentication & Security

- **Auth** : Supabase Auth (existant) — inchangé
- **RLS** : strict entity-scoped sur toutes les tables touchées (cf. tableau ci-dessus)
- **Service role usage** : limité aux Server Actions cross-entity dup (ID-EML-5) ; jamais exposé côté client
- **XSS prevention** : variables résolues HTML-escapées via `sanitizeHtml()` avant insertion dans `body` (NFR-EML-SEC-4)
- **Audit trail** : `created_by`, `updated_by`, `updated_at` sur `email_templates` ; `sent_by` déjà présent sur `email_history`
- **Concurrent edit** : optimistic locking ID-EML-4 (compare updated_at)

**Pattern Server Action duplication cross-entity** (proposition) :

```typescript
// src/app/(dashboard)/admin/emails/_actions/duplicate-to-entity.ts
"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveEntityId } from "@/lib/auth/resolve-active-entity";

const schema = z.object({
  templateId: z.string().uuid(),
  targetEntityId: z.string().uuid(),
});

export async function duplicateTemplateToEntity(input: z.infer<typeof schema>) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" } as const;

  // Server-side super_admin check (ID-EML-5)
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, entity_id")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "super_admin") {
    return { ok: false, error: "forbidden" } as const;
  }

  // Load source template (RLS auto-scope to user's entities)
  const { data: source } = await supabase
    .from("email_templates")
    .select("*")
    .eq("id", input.templateId)
    .single();
  if (!source) return { ok: false, error: "not_found" } as const;

  // INSERT into target entity (super_admin can write cross-entity via service role wrap)
  const { data: copy, error } = await supabase
    .from("email_templates")
    .insert({
      ...source,
      id: undefined,
      entity_id: input.targetEntityId,
      key: null, // reset key to avoid uniqueness collision on target
      created_by: user.id,
      created_at: undefined,
      updated_at: undefined,
      updated_by: user.id,
    })
    .select()
    .single();
  if (error) return { ok: false, error: error.message } as const;

  return { ok: true, data: copy } as const;
}
```

### API & Communication

**Pas de nouveaux endpoints REST** — tout passe par Server Actions Next.js 14 ou par les routes existantes refactorées.

**Routes refactorées (Lot B)** — signature inchangée, comportement interne refondu :

| Route | Avant | Après |
|---|---|---|
| `/api/invoices/process-reminders` | Constants `REMINDER_TEMPLATES` + fallback DB | `resolveEmailTemplate('reminder_invoice_<level>', entityId)` seul |
| `/api/crm/quotes/process-reminders` | Idem quotes | Idem |
| `/api/crm/quotes/sign-request` | Fallback hardcoded ligne 121 | Resolver seul |
| `/api/formations/automation-rules/run-cron` (branche OPCO) | Hardcoded inline | Resolver |
| `/api/documents/send-*-batch-email/*` (15+ routes) | `EMAIL_SUBJECT_LABELS` map | Resolver `batch_<docType>` |

**Server Actions nouvelles (Lot C/D)** :

| Action | Fichier | Sécurité |
|---|---|---|
| `saveTemplate(input)` | `_actions/save-template.ts` | RLS user_role admin + optimistic lock updated_at |
| `archiveTemplate(id)` | `_actions/archive-template.ts` | RLS + check usage_count = 0 (bloquant si > 0) |
| `restoreTemplate(id)` | `_actions/restore-template.ts` | RLS |
| `deleteTemplatePermanent(id, confirmText)` | `_actions/delete-template-permanent.ts` | RLS + check `confirmText='supprimer'` + check pas référencé par rules |
| `duplicateTemplateToEntity(input)` | `_actions/duplicate-to-entity.ts` | super_admin check server-side (cf. pattern ci-dessus) |
| `sendOneShotEmail(input)` | `_actions/send-one-shot.ts` | RLS admin |

**Response format** standardisé : `{ ok: true, data: T } | { ok: false, error: string }` — pattern Result<T,E> léger, parsable par le client.

### Frontend Architecture

**Architecture composants** (ID-EML-2) :

```
src/app/(dashboard)/admin/emails/
├── page.tsx                          (~400 LOC, orchestrateur)
├── _components/
│   ├── EmailsTabsNav.tsx             (sticky, calqué sur DocumentsTabsNav)
│   ├── TemplateListView.tsx          (Cards + Liste mode toggle, persist localStorage)
│   ├── TemplateCard.tsx              (card unitaire)
│   ├── TemplateRow.tsx               (ligne pour vue Liste)
│   ├── CategoryFilter.tsx            (chips multi-select, URL params)
│   ├── TemplateEditDialog/
│   │   ├── index.tsx                 (3-col layout + Provider)
│   │   ├── EditDialogContext.tsx     (React Context état partagé)
│   │   ├── MetaPanel.tsx             (gauche)
│   │   ├── EditorPanel.tsx           (centre, Tiptap)
│   │   ├── PreviewPanel.tsx          (droite, preview live)
│   │   └── UsagePopover.tsx          (popover détaillé sur badge usage)
│   ├── UsageBadge.tsx                (badge inline réutilisable)
│   ├── HistoryTab.tsx                (refonte avec Sheet slide-in)
│   ├── HistoryDetailSheet.tsx        (Sheet shadcn)
│   ├── ArchivedTab.tsx               (liste archivés + actions)
│   ├── AutomationsTab.tsx            (sous-tabs Relances/Formation/CRM)
│   ├── QuickActions.tsx              (2 cards header)
│   └── ChooseTemplateDialog.tsx      (réutilisable, à éventuellement extraire vers shared)
├── _actions/
│   ├── save-template.ts
│   ├── archive-template.ts
│   ├── restore-template.ts
│   ├── delete-template-permanent.ts
│   ├── duplicate-to-entity.ts
│   └── send-one-shot.ts
├── _hooks/
│   ├── useTemplates.ts               (React Query wrapper)
│   ├── useEmailHistory.ts
│   ├── useTemplateUsage.ts           (batch-loader vue SQL)
│   └── useViewMode.ts                (localStorage persistence)
└── _lib/
    ├── types.ts                      (EmailTemplate enrichi, CategoryEnum, etc.)
    ├── schemas.ts                    (Zod schemas)
    └── constants.ts                  (CATEGORY_LABELS, CATEGORY_COLORS, KEY_REGISTRY)
```

**Pattern React Context du dialog** :

```typescript
// _components/TemplateEditDialog/EditDialogContext.tsx
type EditDialogState = {
  formMethods: UseFormReturn<TemplateFormValues>; // RHF instance
  initialUpdatedAt: string;                       // for optimistic lock
  previewContext: PreviewContext;                 // session+learner choisis
  setPreviewContext: (c: PreviewContext) => void;
  usage: TemplateUsage | null;                    // batch-loaded
  isLoading: boolean;
};

const EditDialogContext = createContext<EditDialogState | null>(null);
export const useEditDialog = () => {
  const ctx = useContext(EditDialogContext);
  if (!ctx) throw new Error("useEditDialog must be inside <TemplateEditDialog>");
  return ctx;
};
```

**Pattern hook usage batch-loader** :

```typescript
// _hooks/useTemplateUsage.ts
export function useTemplateUsage(entityId: string) {
  return useQuery({
    queryKey: ["email_template_usage", entityId],
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("email_template_usage")
        .select("template_id, usage_count, usages")
        .eq("entity_id", entityId);
      // Returns Map<template_id, {usage_count, usages}> pour O(1) lookup côté UI
      return new Map((data ?? []).map(row => [row.template_id, row]));
    },
    staleTime: 30_000, // 30s — revalidate sur focus
  });
}
```

**Pattern preview live debounced + memoized** (ID-EML-3) :

```typescript
// _components/TemplateEditDialog/PreviewPanel.tsx
export function PreviewPanel() {
  const { formMethods, previewContext } = useEditDialog();
  const subject = formMethods.watch("subject");
  const body = formMethods.watch("body");

  // Debounce 200ms pour éviter recalc à chaque keystroke
  const debouncedSubject = useDebounce(subject, 200);
  const debouncedBody = useDebounce(body, 200);

  // Memoize le rendu HTML résolu — recalc seulement si déps changent
  const renderedSubject = useMemo(
    () => resolveVariablesForPreview(debouncedSubject, previewContext),
    [debouncedSubject, previewContext]
  );
  const renderedBody = useMemo(
    () => resolveVariablesForPreview(debouncedBody, previewContext),
    [debouncedBody, previewContext]
  );

  return (
    <div>
      <h3>Aperçu</h3>
      <div>Sujet : {renderedSubject}</div>
      <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(renderedBody) }} />
    </div>
  );
}
```

### Infrastructure & Deployment

- **Hosting** : Netlify (main=prod, develop=dev) — inchangé
- **DB** : Supabase Postgres — inchangé
- **Email provider** : Resend (default) + Gmail OAuth (trainer optional) — inchangé
- **Feature flags** : variables d'env `USE_TEMPLATE_RESOLVER_<route>` (boolean) — pattern simple, pas de feature flag SaaS
- **Migration SQL** : déployée via Supabase CLI ou Dashboard avant le déploiement Netlify de la PR consommatrice
- **Monitoring** : Netlify Logs + `logEvent()` structuré (déjà utilisé)
- **Alerting** : si `email_history.status='failed'` > 5% sur 1h → log CRITICAL → notification Wissam (cf. NFR-EML-OBS-2)

### Decision Impact Analysis

**Sequencing PRs** (cf. PRD §10.4 raffiné) :

```
┌──────────────┐
│ PR1 (HOTFIX) │  Fix RLS crm_automation_rules — déployable SEUL (CD-EML-3)
│  20 LOC + 80 LOC tests + audit callers
└──────┬───────┘
       │
       ├──────────────────────┐
       ▼                      ▼
┌──────────────┐    ┌──────────────┐
│ PR2 (INFRA)  │    │ PR3 (UI base)│  PR3 indépendant de PR2 (read-only UI patches)
│  Migration   │    │  Split page  │   peut commencer en parallèle
│  + Vue SQL   │    │  + EmailsTabsNav
│  + Seed      │    │  + QuickActions
│  + Resolver  │    │
└──────┬───────┘    └──────────────┘
       │
       ├────────────────────────────────────────┐
       ▼                                        ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ PR4 invoices │  │ PR5 quotes   │  │ PR6 OPCO     │  PR4-7 en parallèle (5 routes)
│  + flag      │  │  + flag      │  │  + flag      │
└──────────────┘  └──────────────┘  └──────────────┘
                        │
                        ▼
                  ┌──────────────┐
                  │ PR7 batch    │
                  └──────────────┘
                        │
                        ▼
                  ┌──────────────┐
                  │ PR8 cleanup  │  Suppression hardcoded + flags (T+1 sem stabilité)
                  └──────────────┘

       En parallèle de PR4-8 :
       ┌──────────────┐
       │ PR9-12 (UI)  │  TemplateEditDialog + ArchivedTab + AutomationsTab + UsagePopover
       └──────┬───────┘
              │
              ▼
       ┌──────────────┐
       │ PR13 (D)     │  Cross-entity dup super_admin
       └──────┬───────┘
              │
              ▼
       ┌──────────────┐
       │ PR14 (F)     │  Tests E2E + docs/emails.md + logs structurés
       └──────────────┘
```

**Cross-Component Dependencies** :
- PR1 = standalone, BLOQUE moralement le reste (sécurité P0)
- PR2 BLOQUE PR4-7 (resolver doit exister)
- PR3 BLOQUE PR9-13 (split + scaffolding UI base)
- PR8 attend stabilité 1 semaine de PR4-7 en flag ON
- PR14 cross-cut, peut commencer dès PR3

**Estimation effort par PR** :

| PR | LOC nouveau | LOC supprimé | Jours-homme |
|----|------------|--------------|-------------|
| PR1 hotfix | 100 | 5 | 0.5 |
| PR2 infra | 480 | 0 | 2 |
| PR3 UI base | 600 | 200 | 2 |
| PR4-7 (×4 routes) | 750 | 600 | 3 (≈ 0.75/route) |
| PR8 cleanup | 0 | 500 | 0.5 |
| PR9-12 (×4 UI) | 1 400 | 800 | 4 |
| PR13 cross-entity | 150 | 0 | 1 |
| PR14 hygiène | 500 | 0 | 1.5 |
| **Total** | **~3 980** | **~2 100** | **~14.5 jours-homme** |

PRD §1 estime 18-22 j-h → écart 4-7 j-h pour buffer (review, debug, tests qui pètent). Cohérent.

---

## Implementation Patterns & Consistency Rules

### Pattern 1 — Résolveur signature TypeScript

```typescript
// src/lib/services/email-template-resolver.ts
import { createClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/utils/log";
import type { EmailTemplate } from "@/lib/types/email";

/**
 * Récupère un template email pour une entité par sa clé sémantique.
 * Retourne null si non trouvé (jamais throw — graceful degradation).
 */
export async function resolveEmailTemplate(
  key: string,
  entityId: string,
): Promise<EmailTemplate | null> {
  const start = Date.now();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("email_templates")
    .select("*")
    .eq("entity_id", entityId)
    .eq("key", key)
    .eq("is_active", true)
    .maybeSingle();

  const latency_ms = Date.now() - start;

  if (error) {
    logEvent("email_template_resolved", { entity_id: entityId, key, latency_ms, status: "error", error: error.message });
    return null;
  }
  if (!data) {
    logEvent("email_template_missing", { entity_id: entityId, key, latency_ms }, "error");
    return null;
  }

  logEvent("email_template_resolved", { entity_id: entityId, key, template_id: data.id, latency_ms, status: "ok" });
  return data as EmailTemplate;
}

/**
 * Vérifie au boot d'un cron que tous les keys requis sont seedés pour l'entité.
 * Appelé par chaque route cron avant traitement.
 */
const REQUIRED_KEYS = [
  "reminder_invoice_first",
  "reminder_invoice_second",
  "reminder_invoice_final",
  "reminder_quote_first",
  "reminder_quote_second",
  "reminder_quote_final",
  "quote_sign_request",
  "opco_deposit",
  // batch_* keys ajoutés par génération à partir de DOCUMENT_TYPES
] as const;

export async function assertSeedComplete(entityId: string): Promise<{ ok: boolean; missing: string[] }> {
  const supabase = createClient();
  const { data } = await supabase
    .from("email_templates")
    .select("key")
    .eq("entity_id", entityId)
    .in("key", REQUIRED_KEYS as unknown as string[])
    .eq("is_active", true);

  const present = new Set((data ?? []).map(r => r.key));
  const missing = REQUIRED_KEYS.filter(k => !present.has(k));

  if (missing.length > 0) {
    logEvent("email_template_seed_incomplete", { entity_id: entityId, missing }, "critical");
  }
  return { ok: missing.length === 0, missing };
}
```

### Pattern 2 — Routes cron consommatrices

```typescript
// src/app/api/invoices/process-reminders/route.ts (post-refactor)
import { resolveEmailTemplate, assertSeedComplete } from "@/lib/services/email-template-resolver";

export async function POST(req: Request) {
  // ... auth + parsing ...

  const useResolver = process.env.USE_TEMPLATE_RESOLVER_INVOICES === "true";
  if (!useResolver) {
    return handleLegacyHardcoded(req); // ancien chemin, supprimé en PR8
  }

  const entityId = await resolveActiveEntityId(req);
  const seedCheck = await assertSeedComplete(entityId);
  if (!seedCheck.ok) {
    return Response.json({ ok: false, error: "seed_incomplete", missing: seedCheck.missing }, { status: 500 });
  }

  for (const invoice of overdueInvoices) {
    const tpl = await resolveEmailTemplate(`reminder_invoice_${invoice.reminderLevel}`, entityId);
    if (!tpl) continue; // log already emitted

    const subject = renderTemplate(tpl.subject, invoiceContext(invoice));
    const body = renderTemplate(tpl.body, invoiceContext(invoice));
    await enqueueEmail({ to: invoice.client.email, subject, body, template_id: tpl.id, /* ... */ });
  }
  return Response.json({ ok: true });
}
```

### Pattern 3 — Server Action save avec optimistic lock

```typescript
// _actions/save-template.ts
"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const schema = z.object({
  id: z.string().uuid(),
  initialUpdatedAt: z.string(),
  name: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  category: z.enum(["transactional", "automation", "reminder", "batch", "campaign", "custom"]),
  recipient_type: z.string().optional(),
  sender_name: z.string().optional(),
  sender_email: z.string().email().optional().or(z.literal("")),
  attachment_doc_types: z.array(z.string()).optional(),
});

export async function saveTemplate(input: z.infer<typeof schema>) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "validation_failed", issues: parsed.error.issues } as const;

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" } as const;

  // ID-EML-4 — Optimistic lock
  const { data: current } = await supabase
    .from("email_templates")
    .select("updated_at")
    .eq("id", parsed.data.id)
    .single();
  if (!current) return { ok: false, error: "not_found" } as const;
  if (current.updated_at !== parsed.data.initialUpdatedAt) {
    return { ok: false, error: "concurrent_edit", currentUpdatedAt: current.updated_at } as const;
  }

  const { id, initialUpdatedAt, ...payload } = parsed.data;
  const { error } = await supabase
    .from("email_templates")
    .update({ ...payload, updated_by: user.id })
    .eq("id", id);

  if (error) return { ok: false, error: error.message } as const;
  revalidatePath("/admin/emails");
  return { ok: true } as const;
}
```

### Pattern 4 — Logs structurés

```typescript
// Tous les events à logger :
logEvent("email_template_resolved",        { entity_id, key, template_id, latency_ms, status });
logEvent("email_template_missing",         { entity_id, key, latency_ms }, "error");
logEvent("email_template_seed_incomplete", { entity_id, missing },        "critical");
logEvent("email_sent",                     { entity_id, template_id, template_key, recipient_type, latency_ms });
logEvent("email_failed",                   { entity_id, template_id, error_message, retry_count }, "error");
logEvent("email_template_edit_completed",  { entity_id, template_id, duration_ms });
logEvent("email_template_archived",        { entity_id, template_id, archived_by });
logEvent("email_template_restored",        { entity_id, template_id, restored_by });
logEvent("email_template_duplicated_cross_entity", { source_entity_id, target_entity_id, template_id, duplicated_by });
logEvent("email_template_concurrent_edit_conflict", { entity_id, template_id }, "warn");
```

### Pattern 5 — Tests Vitest cibles

**Resolver** :
- `resolveEmailTemplate` happy path → retourne le template
- `resolveEmailTemplate` missing key → retourne null + log emitted
- `resolveEmailTemplate` is_active=false → ignoré
- `resolveEmailTemplate` cross-entity → RLS bloque (retourne null)
- `assertSeedComplete` toutes keys présentes → ok true
- `assertSeedComplete` 1 key manquante → ok false + log critical

**RLS** :
- User entité A tente lire `crm_automation_rules` entité B → 0 lignes
- User entité A tente INSERT `crm_automation_rules` entité B → throw
- super_admin lit rules cross-entity → OK

**Server Actions** :
- `saveTemplate` happy path → update + revalidate
- `saveTemplate` concurrent edit (`initialUpdatedAt` ne match plus) → `concurrent_edit`
- `archiveTemplate` avec usage_count > 0 → `error: in_use`
- `deleteTemplatePermanent` sans confirmText='supprimer' → bloqué
- `duplicateTemplateToEntity` user pas super_admin → forbidden

**Migration & Seed** :
- Migration appliquée puis re-appliquée → idempotente
- Seed re-exécuté → `ON CONFLICT DO NOTHING` (compte stable)
- Vue `email_template_usage` retourne count exact sur dataset test

### Pattern 6 — Naming registry templates

Fichier `_lib/constants.ts` :

```typescript
export const TEMPLATE_KEYS = {
  REMINDER: {
    INVOICE_FIRST: "reminder_invoice_first",
    INVOICE_SECOND: "reminder_invoice_second",
    INVOICE_FINAL: "reminder_invoice_final",
    QUOTE_FIRST: "reminder_quote_first",
    QUOTE_SECOND: "reminder_quote_second",
    QUOTE_FINAL: "reminder_quote_final",
  },
  AUTOMATION: {
    SESSION_START_MINUS_DAYS: "session_start_minus_days",
    SESSION_END_PLUS_DAYS: "session_end_plus_days",
    OPCO_DEPOSIT: "opco_deposit",
  },
  TRANSACTIONAL: {
    QUOTE_SIGN_REQUEST: "quote_sign_request",
  },
  BATCH: (docType: string) => `batch_${docType}`,
} as const;
```

Permet `TEMPLATE_KEYS.REMINDER.INVOICE_FIRST` au lieu de strings magiques. Auto-complete + refactor-safe.

---

## Project Structure & Boundaries

### Module boundaries (qui dépend de qui)

```
┌──────────────────────────────────────────────────────────┐
│  /admin/emails (UI, owns templates lifecycle)            │
│   └─ writes : email_templates                            │
└────────────────────┬─────────────────────────────────────┘
                     │ reads
                     ▼
┌──────────────────────────────────────────────────────────┐
│  email-template-resolver.ts (read-only consumer)         │
│   └─ reads : email_templates                             │
└────────────────────┬─────────────────────────────────────┘
                     │ used by
       ┌─────────────┼─────────────┬──────────────┬────────┐
       ▼             ▼             ▼              ▼        ▼
  invoices    crm/quotes   crm/quotes/    formations    batch-email-
  /process-   /process-    sign-request    /run-cron    handler
  reminders   reminders                    (OPCO)       (15+ routes)
       │             │             │              │        │
       └─────────────┴─────────────┴──────────────┴────────┘
                                 │
                                 ▼
                          email-queue.ts (enqueueEmail)
                                 │
                                 ▼
                          email_history (DB)
                                 │
                                 ▼
                       process-scheduled cron
                                 │
                                 ▼
                       Resend / Gmail OAuth
```

**Règles de boundary** :
- Seul `/admin/emails` peut écrire dans `email_templates` (autres consommateurs lisent uniquement)
- Le resolver est read-only, jamais d'écriture
- Les routes consommatrices ne touchent jamais à `email_templates` directement (toujours via resolver)
- `email-queue.ts` reste l'unique point d'enqueue (déjà le cas)

### File tree complet (cible post-livraison)

```
src/
├── app/
│   ├── (dashboard)/admin/emails/      [REFONDU]
│   │   ├── page.tsx                   (~400 LOC orchestrateur)
│   │   ├── _components/               (8+ composants ~2000 LOC total)
│   │   ├── _actions/                  (6 Server Actions)
│   │   ├── _hooks/                    (4 hooks)
│   │   └── _lib/                      (types, schemas, constants)
│   └── api/
│       ├── emails/
│       │   ├── send/route.ts          [INCHANGÉ — utilisé par UI]
│       │   ├── history/route.ts       [INCHANGÉ]
│       │   └── process-scheduled/route.ts  [INCHANGÉ]
│       ├── invoices/process-reminders/route.ts  [REFACTOR Lot B]
│       ├── crm/quotes/
│       │   ├── process-reminders/route.ts       [REFACTOR Lot B]
│       │   └── sign-request/route.ts            [REFACTOR Lot B]
│       ├── formations/automation-rules/
│       │   └── run-cron/route.ts                [REFACTOR Lot B — branche OPCO]
│       └── documents/send-*-batch-email/*       [REFACTOR Lot B via batch-handler]
├── components/
│   ├── emails/
│   │   ├── EmailPreviewDialog.tsx     [SUPPRIMÉ — dead code]
│   │   └── RelancesTab.tsx            [REFONDU / intégré dans AutomationsTab]
│   └── editor/
│       ├── RichTextEditor.tsx         [INCHANGÉ]
│       └── InsertVariableButton.tsx   [INCHANGÉ]
├── lib/
│   ├── services/
│   │   ├── email-template-resolver.ts [NEW Lot A.2]
│   │   ├── email-queue.ts             [INCHANGÉ]
│   │   ├── batch-email-handler.ts     [REFACTOR Lot B.5]
│   │   └── email-attachments-resolver.ts [INCHANGÉ]
│   ├── types/
│   │   └── email.ts                   [NEW — types centralisés]
│   ├── template-variables.ts          [INCHANGÉ]
│   └── utils/
│       ├── log.ts                     [INCHANGÉ ou enrichi]
│       └── resolve-variables.ts       [INCHANGÉ]
├── supabase/
│   └── migrations/
│       └── 2026_05_29_email_module_v1.sql  [NEW — ALTER + vue + RLS + seed]
└── tests/
    ├── unit/services/email-template-resolver.test.ts  [NEW]
    ├── unit/_actions/save-template.test.ts            [NEW]
    ├── unit/_actions/duplicate-to-entity.test.ts      [NEW]
    ├── integration/email-template-usage-view.test.ts  [NEW]
    ├── integration/rls-crm-automation-rules.test.ts   [NEW]
    └── e2e/admin-emails-loris-j1.spec.ts              [NEW Playwright]
```

### Conventions de code (renforcement)

- Tous les fichiers `_actions/*.ts` commencent par `"use server";` + Zod schema en top + un seul export named function
- Tous les fichiers `_components/*.tsx` sont des Server Components par défaut, "use client" uniquement si state/hook nécessaire
- Tous les types email sont importés depuis `@/lib/types/email` — pas de redéfinition locale
- Tous les `key` template sont importés depuis `TEMPLATE_KEYS` — pas de string magique
- Tous les logs structurés passent par `logEvent()` — `console.log` interdit en prod path

---

## Architecture Validation

### Validation contre FR-EML (couverture)

| FR-EML range | Architecture coverage | Statut |
|---|---|---|
| 1-5 (resolver) | Pattern 1 + assertSeedComplete + Pattern 4 logs | ✅ |
| 6-11 (schéma) | Section Data Architecture + script migration | ✅ |
| 12-15 (seed) | Migration `2026_05_29_email_module_v1.sql` + idempotence | ✅ |
| 16-19 (RLS) | CD-EML-3 hotfix + Pattern 5 tests RLS | ✅ |
| 20-26 (migration pipelines) | Pattern 2 + sequencing PR4-7 + Pattern 4 logs | ✅ |
| 27-46 (UI Lot C) | Section Frontend + file tree + Pattern 3 Server Actions | ✅ |
| 47-50 (cross-entity) | ID-EML-5 + Pattern Server Action duplicateTemplateToEntity | ✅ |
| 51-53 (vue usage) | ID-EML-1 + SQL `email_template_usage` + Pattern 5 tests | ✅ |
| 54-58 (hygiène) | Pattern 4 logs + Pattern 5 tests + structure tests | ✅ |
| 59-64 (V2) | Deferred Decisions DD-EML-1 à 5 | ✅ |

### Validation contre NFR-EML

| NFR | Cible | Architecture solution |
|---|---|---|
| PERF-1 | resolver < 50ms P95 | Index unique partiel + lookup direct |
| PERF-2 | tab Modèles < 800ms P95 | Batch-loader usage via vue + React Query staleTime 30s |
| PERF-3 | preview live < 100ms | Debounce 200ms + useMemo + Server-side rendering pré-fetch |
| PERF-4 | seed 100 INSERTs < 5s | Single transaction, ON CONFLICT DO NOTHING |
| SEC-1 | 0 USING(true) périmètre | Fix RLS PR1 |
| SEC-2 | audit fix RLS | Grep callers + Pattern 5 tests RLS |
| SEC-3 | pas de secrets en clair | Pas de stockage clé API dans templates (juste sender_email = domaine) |
| SEC-4 | XSS prevention | sanitizeHtml() avant insertion preview/render |
| SEC-5 | duplication super_admin server-side | Pattern Server Action duplicateTemplateToEntity |
| REL-1 | resolver null = pas crash | Graceful return null + log + skip send |
| REL-2 | rollback flag < 5min | Variables env + redéploiement Netlify ~3min |
| REL-3 | migration réversible | `down.sql` fourni + section ROLLBACK commentée dans migration |
| REL-4 | concurrent edit 100% | Pattern 3 optimistic lock |
| OBS-1 | logs structurés envois | Pattern 4 — 10 events typés |
| OBS-2 | alerte template_missing | Level error → Netlify Logs filter |
| OBS-3 | dashboard mensuel | Logs Posthog/équivalent (out of scope V1 instrumentation custom) |
| MAINT-1 | 0 cast any | TS strict + ESLint rule no-explicit-any |
| MAINT-2 | types centralisés | `src/lib/types/email.ts` |
| MAINT-3 | pas d'appel Supabase inline | _actions/ + _hooks/ wrappers |
| MAINT-4 | page.tsx ≤ 400 LOC | Split en 8+ sous-composants |
| COST-1 | pas de nouveau service | Resend + Gmail existants |
| COST-2 | run-rate Resend < 5€/mois | Free tier 100/jour suffit pour Loris ~50/sem |

### Risques techniques non couverts par le PRD

| Risque nouveau | Impact | Probabilité | Mitigation proposée |
|---|---|---|---|
| **Race condition seed** : 2 admins déploient simultanément + un cron tourne entre la migration ALTER et le seed | Élevé (resolver retourne null) | Faible | Seed dans la **même transaction** que la migration ALTER TABLE — atomic. Le cron ne peut pas tourner pendant que la transaction est ouverte (lock acquis sur la table). |
| **Crash si user supprime un template référencé par `crm_automation_rules.config.template_id`** | Moyen | Moyen | Constraint trigger PG `BEFORE DELETE ON email_templates` qui vérifie l'absence de référence (FR-EML-42 PRD couvre déjà via fonction PG — à expliciter en story dédiée) |
| **Variables résolution côté client preview leak** : un trainer ayant lecture sur `email_templates` mais pas sur la session de preview voit les données | Faible | Faible | Le preview context (session+learner) est chargé via supabase client respectant RLS → données filtrées naturellement. Aucune leakage possible. |
| **Cross-entity dup orphelins** : super_admin dup vers C3V, puis C3V est désactivée | Faible | Très faible | Hypothèse projet : entités jamais hard-deletées (cf. CLAUDE.md). Pas de mitigation supplémentaire requise. |
| **Test E2E cron Playwright complexe** : impossible de "déclencher" le cron Netlify scheduled function depuis Playwright | Moyen | Élevé | Tester via **POST direct** à `/api/.../run-cron` avec secret auth — pattern déjà utilisé pour les tests du module documents |
| **Bundle size dialog 3 colonnes responsive** : si Tiptap + preview + variables popover + usage popover montent à > 200KB | Faible | Moyen | Tiptap déjà bundlé (utilisé par /admin/documents). Lazy-load `TemplateEditDialog` via `next/dynamic` si bundle > seuil |
| **Conflit migration SQL avec une autre PR en cours** | Faible | Faible | Migration nommée avec date 2026_05_29 — convention déjà en place dans `supabase/migrations/`. Pas de conflit si pas de doublon de date |
| **Le seed initial diverge du wording hardcoded existant** | Moyen | Moyen | Test snapshot : extraire les hardcoded actuels en fixtures, comparer au seed via test Vitest avant déploiement |
| **Le toggle Mode Cards/Liste casse les a11y screen readers** | Faible | Faible | ARIA `aria-live="polite"` sur le container + test manuel VoiceOver |

### Open Questions techniques pour Wissam

1. **Migration SQL location** : `supabase/migrations/` (CLI Supabase) ou `migrations/` (script custom déjà existant) ? Suivre la convention du projet.
2. **`logEvent()` API** : Existe-t-il déjà un wrapper centralisé, ou faut-il l'écrire ? Le module documents l'utilise — à confirmer.
3. **Test E2E Playwright** : config Playwright déjà setup dans le projet ? Si non, est-ce qu'on veut l'introduire dans cette refonte ou faire un test "manual smoke" comme pour le sous-chantier /admin/documents ?
4. **Resend domains** : DNS verify pour `sender_email` per-entity (cf. PRD V1.5) — qui s'en occupe (Loris ou Wissam) ?
5. **Décision NFR-EML-COST-2** : passage plan Resend $20/mois à anticiper ? Loris approuve-t-il la dépense si dépassement free tier ?

---

**Fin de l'Architecture v1.0** — prêt pour validation Wissam et passage à `bmad-create-epics-and-stories` pour la création des epics + stories détaillées.
