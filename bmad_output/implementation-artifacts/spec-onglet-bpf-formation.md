---
title: 'Onglet BPF par-formation (lot Must) — voir, corriger, valider'
type: 'feature'
created: '2026-07-02'
status: 'done'
baseline_commit: 'b8a83642c732eabfc327c57341223ad066203986'
context:
  - '{project-root}/bmad_output/brainstorming/brainstorm-sous-onglet-bpf-formation-2026-07-02/brainstorm-intent.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Loris dépose le BPF « en aveugle » : le rapport global agrège tout sans qu'il voie ce que **chaque formation** injecte ni où sont ses erreurs. But : transparence pour rassurer avant dépôt, formation par formation.

**Approach:** Ajouter un onglet **BPF** dans le détail formation (`formations/[id]`, unité = session) qui affiche une **phrase-résumé** (stagiaires / heures / CA € pour l'année) + **pastille 🟢/🔴**, un **détail par cadre replié**, le **DataGapsPanel filtré sur la session** pour corriger inline, et un bouton **« Je valide cette formation pour le BPF »** (audit qui/quand) **bloqué tant qu'il reste une erreur**. Réutilise les calculateurs purs + le service BPF-2.3, filtrés sur une session, en **calculant comme le rapport global** pour que les chiffres réconcilient.

## Boundaries & Constraints

**Always:** unité = **session** (`[id]` = session_id) ; `entity_id` strict sur chaque requête/mutation ; zéro `any` ; logique de calcul dans `bpf-calculator.ts` (pure, testée) / requêtes dans `bpf-report-service.ts` (pas de Supabase inline dans le composant) ; **F-1 calculé comme le global** (stagiaires par `bpf_trainee_type`, heures = durée training × inscription non annulée) pour cohérence avec `/admin/reports/bpf` ; « pastille 🟢 » = `totalGaps` DataGapsPanel = 0 (mêmes 5 trous) ; validation **impossible si 🔴**.

**Ask First:** granularité de validation par **(session, année)** plutôt que par session (si une session à cheval sur 2 exercices doit être validée deux fois) — sinon validation au niveau session.

**Never:** ne pas recalculer F-1 via `computeSectionF1` (heures signées — divergerait du global) ; Should (barre de progression globale + auto-dé-validation) et Could (traçabilité clic→source) **hors scope** ; pas de nouvelle table (ALTER `sessions`) ; rester sur `main`, ne pas toucher les fichiers non liés déjà modifiés.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Résumé session | 4 inscrits non annulés, training 8h, 2 factures 1000€+500€ confirmées | résumé « 4 stagiaires · 32 h · 1 500 € HT (BPF {année}) » | — |
| Pastille verte | 0 trou (funding+dates OK, types+objectif+coûts remplis) | 🟢 « prêt à déclarer » ; bouton Valider **actif** | — |
| Pastille rouge | ≥1 trou (ex. 2 inscriptions sans type) | 🔴 « 2 à corriger » ; bouton Valider **désactivé** ; DataGapsPanel (session) listé | — |
| Valider | clic sur session 🟢 | `bpf_validated_at`=now, `bpf_validated_by`=user ; ligne « ✅ Validé le … par … » ; refetch | toast erreur, pas d'état validé |
| Validé puis redevient rouge | session validée, nouvelle donnée crée un trou | pastille 🔴 + « ✅ Validé le … (⚠️ N nouveaux points depuis) » ; PAS d'auto-annulation (Should) | — |
| Isolation | admin C3V ouvre une session C3V | données + validation strictement C3V (`entity_id`) | — |

</frozen-after-approval>

## Code Map

- `src/app/(dashboard)/admin/formations/[id]/page.tsx` -- tableau `tabs` (useMemo ~L145) + `<TabsContent>` : y brancher l'onglet BPF (`formation` = session, `fetchFormation` = onRefresh)
- `src/app/(dashboard)/admin/formations/[id]/_components/TabBpf.tsx` -- **créer** : le composant onglet (résumé + pastille + détail replié + DataGapsPanel + valider)
- `src/lib/services/bpf-report-service.ts` -- `fetchBPFData`/mutations existants ; **ajouter** `fetchBPFDataForSession` + `validateSessionBPF` + `unvalidateSessionBPF`
- `src/lib/bpf-calculator.ts` -- fonctions pures existantes ; **ajouter** `computeSessionBpfSummary` (compose les existantes pour une session)
- `src/components/bpf/DataGapsPanel.tsx` -- réutilisé tel quel, alimenté en données filtrées session + `entityId`
- `supabase/migrations/add_bpf_validation_to_sessions.sql` -- **créer** (idempotent) ; `src/lib/types/index.ts` -- champs sur `Session`

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/add_bpf_validation_to_sessions.sql` -- `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS bpf_validated_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS bpf_validated_by UUID REFERENCES profiles(id) ON DELETE SET NULL` + ajouter les 2 champs à l'interface `Session` (`src/lib/types/index.ts`) -- stockage validation, idempotent
- [x] `src/lib/bpf-calculator.ts` -- `computeSessionBpfSummary({invoices, enrollments, trainings, formationTrainers, signatures, isSubcontracted, durationHours})` → `{stagiaires, heures, sectionC: SectionCView, caTotal, caFiable, caAVerifier, aVerifierCount, f2, gaps, totalGaps}` en composant `computeSectionCFromInvoices`+`buildSectionCView`+`computeSectionF2`+`computeDataGaps` et F-1 durée-session -- garde la logique pure + testable
- [x] `src/lib/services/bpf-report-service.ts` -- `fetchBPFDataForSession(supabase, entityId, sessionId, year)` (mirroir de `fetchBPFData` filtré `.eq("session_id", sessionId)` + training par `training_id`, factures aussi filtrées année) ; `validateSessionBPF(supabase, entityId, sessionId, userId)` et `unvalidateSessionBPF(...)` (`.eq("entity_id", entityId).eq("id", sessionId)`) -- requêtes centralisées, entity_id strict
- [x] `src/app/(dashboard)/admin/formations/[id]/_components/TabBpf.tsx` -- composant client : fetch → `computeSessionBpfSummary` → rendre résumé+pastille, détail par cadre (Collapsible), `<DataGapsPanel>` (données session + `entityId`, `onRefresh`=refetch), bouton Valider (désactivé si `totalGaps>0`) + ligne d'audit ; `useEntity`, `useToast`, loading -- l'écran
- [x] `src/app/(dashboard)/admin/formations/[id]/page.tsx` -- ajouter `{value:"bpf", label:"BPF", icon:…}` au `useMemo` tabs + `<TabsContent value="bpf"><TabBpf formation={formation} onRefresh={fetchFormation}/></TabsContent>` -- branchement
- [x] `src/lib/__tests__/bpf-calculator.test.ts` -- tests `computeSessionBpfSummary` : résumé, `totalGaps`/pastille verte vs rouge, cohérence F-1 durée-session -- non-régression

**Acceptance Criteria:**
- Given une session sans trou, when j'ouvre l'onglet BPF, then je vois le résumé, une pastille 🟢, et le bouton « Je valide » est actif.
- Given une session avec des trous, when j'ouvre l'onglet BPF, then pastille 🔴 avec le nombre, le DataGapsPanel de CETTE session, et le bouton Valider désactivé ; corriger un trou met à jour la pastille.
- Given je valide une session 🟢, when la mutation réussit, then « Validé le … par … » s'affiche et l'info est persistée (`bpf_validated_at/by`), refetch.
- Given admin C3V, when j'ouvre/valide, then uniquement des données C3V (`entity_id` strict).

## Design Notes

Cohérence chiffres = priorité : le résumé de l'onglet doit **égaler** la contribution de cette session au rapport global → F-1 = même méthode que `BPFForm` (durée training × inscription non annulée, bucket `bpf_trainee_type`), **pas** `computeSectionF1` (heures signées). CA = `buildSectionCView(computeSectionCFromInvoices(facturesSession))`, total fiable+à-vérifier (modèle BPF-2.3).

Pastille : `totalGaps` = exactement les 5 trous du DataGapsPanel → « 🟢 » ⇔ panneau vide ⇔ validable. Vue session et vue globale dérivent des mêmes données (`computeDataGaps`, même DB) → pas de doublon de vérité, corriger ici rafraîchit les deux.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: 0 erreur
- `npx vitest run src/lib/__tests__/bpf-calculator.test.ts` -- expected: existants verts + `computeSessionBpfSummary` verts

**Manual checks (if no CLI):**
- Ouvrir une formation (compte C3V) → onglet BPF : résumé + pastille cohérents avec `/admin/reports/bpf` ; une session à trous montre le DataGapsPanel filtré ; corriger → pastille passe 🟢 ; « Je valide » persiste et affiche l'audit ; migration jouée avant de charger l'onglet.

## Suggested Review Order

**Le cœur — résumé + cohérence des chiffres**

- Point d'entrée : le composant onglet (fetch → summary → rendu résumé/pastille)
  [`TabBpf.tsx:74`](../../src/app/(dashboard)/admin/formations/[id]/_components/TabBpf.tsx#L74)
- Le calcul par-session (compose les calculateurs BPF-2.3 ; F-1 = méthode globale)
  [`bpf-calculator.ts:615`](../../src/lib/bpf-calculator.ts#L615)
- Fetch scopé session + **gating entité** (early-return si session hors entité)
  [`bpf-report-service.ts:299`](../../src/lib/services/bpf-report-service.ts#L299)

**Corriger + valider (règle du vert)**

- Pastille 🟢 ⇔ `totalGaps===0` ⇔ bouton Valider actif
  [`TabBpf.tsx:299`](../../src/app/(dashboard)/admin/formations/[id]/_components/TabBpf.tsx#L299)
- DataGapsPanel filtré sur la session (corriger inline)
  [`TabBpf.tsx:358`](../../src/app/(dashboard)/admin/formations/[id]/_components/TabBpf.tsx#L358)
- Mutation de validation (entity_id strict) + nom validateur via service
  [`bpf-report-service.ts:435`](../../src/lib/services/bpf-report-service.ts#L435)

**Garde-fous (patchs revue)**

- Garde session annulée / sans date (pas de validation possible)
  [`TabBpf.tsx:218`](../../src/app/(dashboard)/admin/formations/[id]/_components/TabBpf.tsx#L218)
- Prédicat `sessions_sans_cout` aligné sur le panneau (débloque la validation)
  [`bpf-calculator.ts:615`](../../src/lib/bpf-calculator.ts#L615)

**Branchement + support**

- Entrée d'onglet dans la page formation
  [`page.tsx:156`](../../src/app/(dashboard)/admin/formations/[id]/page.tsx#L156)
- Migration idempotente (champs de validation)
  [`add_bpf_validation_to_sessions.sql`](../../supabase/migrations/add_bpf_validation_to_sessions.sql)
- Tests `computeSessionBpfSummary` + garde coût formateur
  [`bpf-calculator.test.ts:580`](../../src/lib/__tests__/bpf-calculator.test.ts#L580)
