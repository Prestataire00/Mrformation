---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation-skipped
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
releaseMode: phased
status: complete-post-discovery-patched
completedAt: 2026-06-06
lastPatchedAt: 2026-06-06
postDiscoveryPatch:
  date: 2026-06-06
  oqsResolved: [OQ-4, OQ-5, OQ-5bis]
  oqsReformulated: [OQ-1]
  oqsAdded: [OQ-8, OQ-9]
  sectionsPatched:
    - FR-C-01 (effort M→S, scope simplifié, 1 fichier au lieu de 4)
    - FR-C-02 (effort S-M→L, scope élargi 3 tables × 2 colonnes × 29 valeurs)
    - Open Questions (verdicts résolus 06/06)
    - Statut migrations Epic 2.5 (nouvelle section)
    - Changelog post-discovery (nouvelle section)
    - Critères go/no-go (colonne statut 06/06)
  hallucinationsCount: 4
  hallucinationsDetail:
    - audit RLS initial 8 tables CRM inventées (matin 06/06)
    - colonne entity_id inventée sur elearning_global_flashcards (matin 06/06)
    - Workflow patch a inventé 4 noms migrations granulaires Phase A (soir 06/06)
    - Workflow patch a oublié crm_quotes comme 3ème table BPF (soir 06/06)
adversarialReviews:
  - angle: Completeness Mary (BA) — PRD v2
    verdict: minor-tweaks
    issues: 16
  - angle: Executability dev solo — PRD v2
    verdict: major-rework
    issues: 15
    blockersResolved: 4
    blockersToOpenQuestions: 4
  - angle: Anti-hallucination patch post-discovery
    verdict: minor-tweaks (post-correction solo)
    issues: 8
    criticalsFixed: 1
    majorsFixed: 3
inputDocuments:
  - bmad_output/planning-artifacts/2026-06-06-product-brief-resolution-ux-articulation-lms.md
  - docs/audit-lms-module-2026-06-05.md
  - docs/audit-lms-module-2026-06-05-raw.json
  - docs/audit-rls-2026-06-05.md
  - docs/audit-rls-2026-06-05-codebypass.md
workflowType: 'prd'
documentCounts:
  productBriefs: 1
  research: 0
  brainstorming: 0
  audits: 4
classification:
  projectType: web-saas-multitenant
  domain: education-lms-vocational-training
  complexity: high
  projectContext: brownfield
  detectionSignals:
    - Next.js 14 App Router (web SaaS)
    - Supabase + RLS strict (multi-tenant entity_id)
    - 2 entités cohabitantes (MR FORMATION + C3V FORMATION)
    - 5 rôles (super_admin, admin, trainer, client, learner)
    - Qualiopi compliance (BPF, indicateurs, audit trail)
    - 100+ tables Supabase, ~30 routes API, 13 tabs fiche formation
  typicalConcerns:
    - Isolation multi-tenant via RLS + entity_id côté code
    - Conformité Qualiopi/BPF (traçabilité, signatures émargement)
    - Volumes apprenants par session (100-500 selon INTER/INTRA)
    - Génération PDF (convocations, conventions, certificats) sous timeout Netlify
  complianceRequirements:
    - Qualiopi (organisme de formation certifié)
    - BPF (Bilan Pédagogique et Financier annuel)
    - RGPD (données apprenants, learner.profile_id, audit log)
date: 2026-06-06
project: lms-platform
chantier: resolution-ux-articulation-lms
---

# Product Requirements Document — Résolution zones d'ombre UX/articulation module LMS

**Auteur :** Wissam (Prestataire00)
**Date :** 2026-06-06
**Facilitateur BMAD :** Mary (Business Analyst)
**Source primaire :** Product Brief v2 du 2026-06-06
**Statut :** Final v2 (post-reviews adversariales — completeness Mary + executability dev)
**Type de projet :** Brownfield (LMS multi-tenant existant)

---

## Goals

Cf. Brief §5 — Vision et objectifs de l'epic UX. Goals mesurables et alignés sur la stratégie d'éradication par archétype.

- **G1.** Résoudre les 6 findings archétype C (promesses cassées : enums incohérentes, dropdowns inertes, mutations sans refetch, scoring non rétroactif) en ~3 semaines (Epic 1), réduisant les tickets support "bouton inerte" de ≥50% en 60 jours post-déploiement [Brief §5, §7 KPI#1].
- **G2.** Opérationnaliser l'import bulk >20 apprenants (Epic 2, archétype A) via Background Function réelle et idempotente, atteignant 100% de réussite avec feedback visible (count créé/erreur) en <2 min sur 100 apprenants [Brief §4.A, §7 KPI#2].
- **G3.** Éliminer les 5 findings archétype A (signaux de fin absents : loading states, dialogs async, step indicators) sur les parcours admin/learner/trainer en 3-4 semaines (Epic 2), vérifiant 100% des actions async >200ms avec feedback en <200ms [Brief §5, §7 KPI#6].
- **G4.** Serveuriser la pagination Hub E-Learning et Programmes (Epic 3, archétype B) et ajouter confirmations aux batch ops en 1-2 semaines, validant pas de freeze UX sur dataset 200+ entrées [Brief §5, §7 KPI#7].
- **G5.** Atteindre zéro findings de type "enums applicatifs désalignées" (test unitaire `enums-consistency.test.ts`, **à créer dans Epic 1**) et zéro boutons/dropdowns sans `onClick` via CI automatisé pré-merge [Brief §7 KPI#4-5].

---

## Background

Cf. Brief §2 — Problématique et audit complet du module LMS.

L'audit complet du module LMS conduit le **2026-06-05** a inventorié **78 findings dédupliqués** sur 5 sous-systèmes (Sessions, Formations, E-Learning, Programmes, Questionnaires), plaçant le score global de qualité à **72/100** [Brief §2]. Trois archétypes UX récurrents ont été identifiés et validés par cross-check code :

- **Archétype C — Promesses cassées (6 items)** : enums incohérentes (TS ↔ Zod ↔ DB), dropdowns cliquables sans action, mutations sans refresh.
- **Archétype A — Signaux de fin absents (5 items)** : imports silencieux, dialogs timing-dépendants (`setTimeout`), spinners manquants, step indicators absents.
- **Archétype B — Limites silencieuses (3 items)** : pagination client-only causant freeze, batch ops sans scope warning [Brief §4].

Le **cost of inaction** justifie une action immédiate : estimation baseline ~3-5 tickets support/mois ("bouton ne fait rien", "aucun retour"), usage parallèle Excel pour contourner l'absence de bulk import opérationnel, perte de réponses questionnaire non quantifiée mais signalée informellement. L'onboarding nouveaux clients prévu Q3 2026 (volumes 2-3x actuels) amplifierait cette escalade attendue à 10-15 tickets/mois + risque réputationnel [Brief §2].

La fenêtre est opportune : aucun incident urgent, audit frais, et la branche RLS P0 vient d'être clôturée (PR #201/#202, commits `5705656`, `61bd374`, `f8c95af`, `864c8fb`). Le cadrage par Mary (BA BMAD) propose un découpage en **3 epics séquencés** [Brief §10].

Le périmètre UX est **totalement découplé** de l'epic RLS V2/V3 (items sécurité V1.1, V1.2, V1.3, V1.8, V1.9, V1.11, V1.12 transférés au backlog séparé) : aucune route API UX ne dépend d'un fix RLS préalable [Brief §Status of RLS Work].

---

## Non-Goals (Out of Scope)

Cf. Brief §6 — Périmètre exclu et justifications.

| Item | Raison | Risque résiduel |
|---|---|---|
| Course type 'presentation' : flow exam final | 0 cours actif de ce type en prod | Dette anticipée — à reprendre si usage réel apparaît |
| Refactoring composants >1000 LOC (3 pages : 1468, 1284, 1087 LOC) | Wissam : "tant que ça marche". Aucun des 14 items Scope IN n'est bloqué par la taille. **Risque mitigé via DoR renforcée (cf. R-6).** | Régression +5-10% sur modifications futures. À monitorer ; refactor planifié sprint code-health post-epic |
| Items sécurité V1.1, V1.2, V1.3, V1.8, V1.9, V1.11, V1.12 | Transférés à epic RLS V2/V3 (séparé, parallèle) | Aucun — découplage code/RLS confirmé par cross-check |
| Markdown XSS sanitization (Programmes) | Chantier sécurité dédié, hors scope UX | Bas, isolé à 1 surface non-critique |
| Tests e2e Programmes / Questionnaires | Chantier QA séparé | Moyen — à planifier post-epic UX |
| Analytics dashboard e-learning completion | Feature additionnelle, pas une zone d'ombre UX | Aucun |
| Optimistic updates généralisés | V1 : refetch simple ; optimistic V2+ si latence problématique | Bas, UX patience ~150-500ms |
| Architecture queue externe (RabbitMQ/SQS) | Netlify BG function 15 min suffit pour ≤100 learners (sous réserve OQ-1) | Escalade si prod > 100/batch régulier |

---

## User Stories

Cf. Brief §3 — Personas et parcours utilisateur. Stories regroupées par persona, chacune liée à un FR de la section 5.

### Persona : Admin (MR FORMATION + C3V FORMATION)

| ID | Story | FR | Archétype |
|---|---|---|---|
| US-ADMIN-01 | En tant qu'admin, je veux importer >20 apprenants en bulk avec confirmation du nombre créé + erreurs en <2 min | FR-A-01 | A |
| US-ADMIN-02 | En tant qu'admin, je veux dupliquer une formation existante depuis le dropdown action avec confirmation et toast success | FR-C-03 | C |
| US-ADMIN-03 | En tant qu'admin, je veux supprimer une formation avec dialog de confirmation affichant le contenu impacté (cascade) | FR-C-03 | C |
| US-ADMIN-04 | En tant qu'admin, je veux valider l'absence d'un apprenant dans TabAbsences et voir l'UI rafraîchie immédiatement | FR-C-04 | C |
| US-ADMIN-05 | En tant qu'admin, je veux partager un document via TabDocsPartages et voir la table se mettre à jour sans rechargement | FR-C-04 | C |
| US-ADMIN-06 | En tant qu'admin, je veux lancer l'auto-fill du planning et voir un spinner pendant le calcul async | FR-A-03 | A |
| US-ADMIN-07 | En tant qu'admin, je veux ouvrir les dialogs de facturation de manière fiable sans timing aléatoire | FR-A-04 | A |
| US-ADMIN-08 | En tant qu'admin, je veux exécuter des batch ops sur conventions avec confirmation du scope (N apprenants, N formations) | FR-B-03 | B |
| US-ADMIN-09 | En tant qu'admin, je veux créer un cours E-Learning avec enum CourseType cohérent entre UI, Zod et API | FR-C-01 | C |
| US-ADMIN-10 | En tant qu'admin, je veux sélectionner "Apprentissage" comme type BPF et que l'insert réussisse | FR-C-02 | C |
| US-ADMIN-11 | En tant qu'admin, je veux que le hub E-Learning soit paginé serveur pour éviter le freeze >100 cours | FR-B-01 | B |
| US-ADMIN-12 | En tant qu'admin, je veux que le hub Programmes soit paginé serveur pour navigation fluide >100 programmes | FR-B-02 | B |
| US-ADMIN-13 | En tant qu'admin, je veux un step indicator visible dans le wizard E-Learning (7 étapes) | FR-A-06 | A |
| US-ADMIN-14 | En tant qu'admin, je veux que les corrections de scoring questionnaire s'appliquent rétroactivement | FR-C-05 | C |

### Persona : Trainer (Formateur)

| ID | Story | FR | Archétype |
|---|---|---|---|
| US-TRAINER-01 | En tant que formateur, je veux que les actions du planning affichent un spinner pendant le calcul | FR-A-03 | A |
| US-TRAINER-02 | En tant que formateur, je veux valider les émargements et voir l'UI se mettre à jour immédiatement | FR-C-04 | C |
| US-TRAINER-03 | En tant que formateur, je veux que les dialogs Finances s'affichent sans délai imprévisible | FR-A-04 | A |

### Persona : Learner (Apprenant)

| ID | Story | FR | Archétype |
|---|---|---|---|
| US-LEARNER-01 | En tant qu'apprenant, je veux que mes réponses questionnaire soient sauvegardées auto en draft localStorage | FR-A-07 | A |
| US-LEARNER-02 | En tant qu'apprenant, je veux que le lecteur E-Learning affiche un spinner lors du changement de chapitre | FR-A-05 | A |
| US-LEARNER-03 | En tant qu'apprenant, je veux que `beforeunload` me préviennent si je quitte avec des réponses non soumises | FR-A-07 | A |
| US-LEARNER-04 | En tant qu'apprenant, je veux voir mon score mis à jour rétroactivement si le correcteur change le scoring d'une question | FR-C-05 | C |

---

## Functional Requirements

Cf. Brief §4 — Findings groupés par archétype. Chaque FR référence chemin:lignes vérifiable.

### Epic 1 — Promesses cassées (archétype C, ~3 semaines)

#### FR-C-01 : Course type enum unification

> **Mise à jour post-discovery 2026-06-06** : OQ-5bis résolue en prod. Les facts ci-dessous sont VÉRIFIÉS (queries Supabase + lecture source code) :
> - DB CHECK `elearning_courses.course_type` = **3 valeurs autorisées : `['presentation', 'quiz', 'complete']`** (source de vérité).
> - Cours actifs en prod : `complete` ×12, `quiz` ×4, **`presentation` ×0** → ZÉRO migration data nécessaire.
> - `src/app/(dashboard)/admin/elearning/create/page.tsx:36` : `type CourseType = "presentation" | "quiz" | "complete"` → **DÉJÀ ALIGNÉ avec DB**.
> - `src/lib/validations/elearning.ts:69-74` : `z.enum(["presentation_quiz", "presentation_quiz_flashcard", "quiz", "flashcards"])` → **SEUL fichier désaligné** (4 valeurs hallucinées, aucune commune avec DB sauf `'quiz'`).

- **Description** : Aligner l'enum Zod `elearningCourseTypeEnum` sur les 3 valeurs DB (source de vérité), et faire en sorte que tous les consommateurs (UI, API) importent un type partagé dérivé via `z.infer`. Aucune migration data, aucun changement DB.

- **Avant/Après** :
  - Avant : create/page.tsx aligné DB mais type LOCAL hardcodé ; Zod elearning.ts désaligné des 2 ; chaque consommateur peut diverger en silence.
  - Après : Zod = source de vérité (3 valeurs DB), type TS exporté via `z.infer`, create/page.tsx importe ce type au lieu de le redéfinir.

- **Fichiers à modifier** :
  - `src/lib/validations/elearning.ts:69-74` — remplacer `z.enum(["presentation_quiz", "presentation_quiz_flashcard", "quiz", "flashcards"])` par `z.enum(["presentation", "quiz", "complete"] as const)`.
  - `src/lib/types/elearning.ts` (créer si absent) — `export type CourseType = z.infer<typeof elearningCourseTypeEnum>` + `export const COURSE_TYPE_OPTIONS: Array<{value: CourseType; label: string}>` avec labels FR.
  - `src/app/(dashboard)/admin/elearning/create/page.tsx:36` — remplacer `type CourseType = "presentation" | "quiz" | "complete"` par `import type { CourseType } from "@/lib/types/elearning"`.
  - Vérification grep : aucune autre déclaration locale `CourseType = ...` dans le repo.

- **Critères d'acceptation** :
  1. `elearningCourseTypeEnum` contient EXACTEMENT 3 valeurs : `"presentation"`, `"quiz"`, `"complete"` (ordre alphabétique acceptable).
  2. `export type CourseType` dérivé via `z.infer` et exporté depuis `src/lib/types/elearning.ts`.
  3. `create/page.tsx:36` importe `CourseType` plutôt que le redéfinit (test grep CI : `grep -r "type CourseType ="` retourne uniquement `types/elearning.ts`).
  4. Test `src/lib/__tests__/enums-consistency.test.ts` (à créer en Epic 1) : assert que les valeurs Zod égalent un tableau hardcodé `["presentation", "quiz", "complete"]` (la CHECK constraint DB n'est pas accessible runtime depuis tests ; le test garantit l'invariant côté code, l'audit OQ-5bis du 06/06 garantit l'invariant côté DB).
  5. Round-trip OK : créer un cours via UI avec chaque valeur (`presentation`, `quiz`, `complete`) → fetch → edit affiche la même valeur sans cast.

- **Effort** : **S** (réduit de M depuis le PRD v2 — la complexité était surévaluée car la DB est déjà la valeur cible et 0 migration data).
- **Risk** : **Bas** (16 cours actifs sont tous `quiz` ou `complete`, aucun migration data nécessaire).

#### FR-C-02 : BpfFundingType + BpfObjective enum unification (3 tables, 2 colonnes, 29 valeurs)

> **Mise à jour post-discovery 2026-06-06** : OQ-5 résolue en prod, périmètre ÉLARGI vs PRD v2. Facts VÉRIFIÉS (queries `pg_constraint` + lecture source `validations/program.ts`) :
> - DB CHECK `bpf_funding_type` : **3 tables alignées** (`programs`, `trainings`, **`crm_quotes`** — non mentionnée dans le PRD v2) avec **18 valeurs identiques** : `entreprise_privee, apprentissage, professionnalisation, reconversion_alternance, conge_transition, cpf, dispositif_chomeurs, non_salaries, plan_developpement, pouvoir_public_agents, instances_europeennes, etat, conseil_regional, pole_emploi, autres_publics, individuel, organisme_formation, autre`.
> - DB CHECK `bpf_objective` : sur `programs` + `trainings` (à confirmer pour `crm_quotes`), **11 valeurs** : `rncp_6_8, rncp_5, rncp_4, rncp_3, rncp_2, rncp_cqp, certification_rs, cqp_non_enregistre, autre_pro, bilan_competences, vae`.
> - Zod `src/lib/validations/program.ts:99-131` :
>   - `bpf_funding_type` : 9 valeurs `[opco, entreprise, particulier, pole_emploi, cpf, region, etat, fne, autre]` — **intersection avec DB = 4** (`pole_emploi`, `cpf`, `etat`, `autre`).
>   - `bpf_objective` : 10 valeurs `[professionnalisation, qualification, validation_acquis, bilan_competences, creation_entreprise, perfectionnement, actualisation, adaptation_poste, remise_a_niveau, decouverte]` — **intersection avec DB = 1** (`bilan_competences`).
> - **Aucune migration data**, car la CHECK rejetait déjà tout insert utilisant les valeurs Zod hallucinées → aucune donnée legacy à migrer (à confirmer par `SELECT DISTINCT bpf_funding_type, bpf_objective FROM programs WHERE bpf_funding_type IS NOT NULL`).

- **Description** : Aligner Zod sur les CHECK DB (source de vérité). Élargir le scope à 3 tables (programs + trainings + crm_quotes) et 2 colonnes (funding_type + objective). Décision produit requise sur les labels FR pour SelectItem (valeurs techniques DB ↔ libellés métier).

- **Avant/Après** :
  - Avant : Admin choisit "OPCO" dans UI → Zod valide → insert Postgres CHECK refuse → toast générique, expérience cassée. 13/18 valeurs DB inaccessibles depuis UI. Pour `bpf_objective` c'est encore pire (10/11 valeurs DB inaccessibles).
  - Après : Zod = liste DB exhaustive, types TS exportés, SelectItem générés depuis une seule source. Toutes les valeurs DB accessibles via UI.

- **Fichiers à modifier** :
  - `src/lib/types/index.ts` (ou créer `src/lib/types/bpf.ts`) — exporter `BpfFundingType` (18 valeurs) et `BpfObjective` (11 valeurs) en `as const` tuples.
  - `src/lib/validations/program.ts:99-131` — remplacer les 2 `z.enum(...)` actuels par les listes DB intégrales.
  - **Vérifier** existence d'un Zod schema pour `trainings` (audit grep `validations/training*.ts`) — si présent et concerne BPF : aligner. Si absent : documenter (les API trainings utilisent peut-être Zod inline ou pas du tout pour BPF).
  - **Vérifier** existence d'un Zod schema pour `crm_quotes` (audit grep `validations/crm-quote*.ts` ou `validations/quote*.ts`) — si présent : aligner. Sinon : note dans tech debt.
  - `src/lib/utils/bpf-labels.ts` (créer) — table de mapping `value → labelFr` pour SelectItem :
    ```ts
    export const BPF_FUNDING_TYPE_LABELS: Record<BpfFundingType, string> = {
      entreprise_privee: "Entreprise privée (plan de développement employeur)",
      apprentissage: "Apprentissage",
      // ... 16 autres mappings à valider produit
    };
    ```
  - Pré-impl : audit `SELECT DISTINCT bpf_funding_type, bpf_objective FROM programs / trainings / crm_quotes` pour confirmer 0 migration data.

- **Critères d'acceptation** :
  1. Types TS `BpfFundingType` (18 valeurs) et `BpfObjective` (11 valeurs) exportés depuis `types/bpf.ts` (ou équivalent).
  2. Zod `program.ts:99-131` aligné EXACTEMENT sur les valeurs DB (test : `expect(Object.values(bpfFundingTypeEnum.Values)).toEqual(BPF_FUNDING_TYPE_DB_VALUES)`).
  3. Idem pour `bpf_objective`.
  4. Si Zod trainings/crm_quotes existent : aligner. Sinon : décision dans le sprint (créer ou laisser inline).
  5. `BPF_FUNDING_TYPE_LABELS` et `BPF_OBJECTIVE_LABELS` exportés avec libellés FR validés produit.
  6. UI SelectItem (page programmes, formations, devis CRM) consomment ces constantes — fini les littéraux hardcodés.
  7. Test `enums-consistency.test.ts` couvre les 18 + 11 valeurs (29 cas) avec snapshot.
  8. Audit pré-impl confirme 0 donnée legacy en DB → 0 migration data.

- **Open Decision produit** : 4 valeurs Zod n'ont aucun équivalent direct DB (`opco`, `entreprise`, `particulier`, `region` pour funding ; toutes les 9 autres pour objective sauf bilan_competences). Mapping recommandé proposé (à valider par toi en sprint Epic 1) :
  | Ancienne valeur Zod | Nouvelle valeur DB recommandée |
  |---|---|
  | opco | `plan_developpement` (OPCO finance le plan de développement) |
  | entreprise | `entreprise_privee` |
  | particulier | `individuel` |
  | region | `conseil_regional` |
  | fne | `etat` (FNE = Fond National de l'Emploi, géré par l'État) |
  | qualification | `rncp_5` (par défaut, sinon `rncp_4`) |
  | validation_acquis | `vae` |
  | creation_entreprise | `autre_pro` |
  | perfectionnement / actualisation / adaptation_poste / remise_a_niveau / decouverte | `autre_pro` |

- **Effort** : **L** (élargi de S-M depuis le PRD v2 — 3 tables × 2 colonnes × 29 valeurs + labels FR + mapping produit + audit data).
- **Risk** : **Moyen** (mapping produit ambigu, à valider en début de sprint Epic 1).

#### FR-C-03 : Dropdown Duplicate/Delete formation : handlers + confirmation + service layer
- **Description** : Implémenter handlers `onClick` pour Duplicate et Delete dans le dropdown formations, accompagnés des helpers service-layer nécessaires (cascade delete sur 13 tabs).
- **Avant/Après** : Avant : `DropdownMenuItem` sans `onClick` (inertes). Après : Duplicate copie formation + suffix + refetch ; Delete `ConfirmDialog` avec count cascade.
- **Fichiers** :
  - `src/app/(dashboard)/admin/formations/[id]/page.tsx:318-324`
  - `src/lib/services/formations.ts` (étendre ou créer) : 3 helpers à implémenter
    - `duplicateFormation(sessionId, entityId) → newSessionId`
    - `getFormationCascadeImpact(sessionId, entityId) → { enrollments_count, documents_count, signatures_count, ... }`
    - `deleteFormationWithCascade(sessionId, entityId) → void` (transactionnel)
- **Critères d'acceptation** :
  1. "Dupliquer" : copie formation avec suffixe `" (Copie)"`, conserve `entity_id`, refetch UI.
  2. "Supprimer" : `ConfirmDialog` affiche nom + count cascade par table impactée (apprenants, docs, signatures, absences, finances).
  3. Toutes requêtes `.eq('entity_id', formation.entity_id)` ; pas de service_role bypass.
  4. Transaction RPC Supabase ou suite de deletes avec rollback explicite si échec partiel.
  5. Toast success/error après action ; refetch confirme état.
  6. Test : duplicate crée entrée vérifiable ; delete refetch confirme absence + cascade.
- **Effort** : M-L (revu depuis M suite review 2) | **Risk** : Cascade FK constraints — audit pré-impl obligatoire

#### FR-C-04 : TabAbsences / TabDocsPartages — refetch après mutation + error logging
- **Description** : Ajouter refetch après mutation et remplacer les `catch` vides par error logging + toast.
- **Avant/Après** : Avant : toast success → UI ne change pas ; catch vide. Après : refetch + log structuré.
- **Fichiers** :
  - `src/app/(dashboard)/admin/formations/[id]/tabs/TabAbsences.tsx:72,141-150`
  - `src/app/(dashboard)/admin/formations/[id]/tabs/TabDocsPartages.tsx:109,145`
- **Pattern obligatoire** :
  ```ts
  if (error) {
    console.error("[TabAbsences] action failed:", error);
    toast({ title: "Erreur", description: error.message, variant: "destructive" });
    return;
  }
  await refetch();
  ```
- **Critères d'acceptation** :
  1. Mutation absence/doc → refetch ; table mise à jour sans rechargement page.
  2. Refetch passe filters actuels (session, learner).
  3. `catch` vide éliminés ; log structuré présent sur chaque mutation.
  4. Test : insertion/suppression visible immédiatement.
- **Effort** : S | **Risk** : Bas

#### FR-C-05 : Historical scoring rétroactif sur corrections questionnaire
- **Description** : Appliquer automatiquement les corrections de scoring aux réponses historiques, avec transaction et verrouillage.
- **Fichiers** :
  - `src/lib/services/questionnaire-scoring.ts`
  - `src/app/api/questionnaires/[id]/correct/route.ts` (à confirmer pré-impl ; sinon créer)
- **Critères d'acceptation** :
  1. Admin modifie scoring d'une question → trigger recalcul `questionnaire_answers` existants.
  2. Transaction PostgreSQL avec `SELECT … FOR UPDATE` par `questionnaire_id` (pas de concurrent recalcul).
  3. Learner dashboard affiche score corrigé (déclenche US-LEARNER-04).
  4. Audit trail : table `audit_logs` (Epic 2.5 TASK 9 existante) log `{questionnaire_id, corrector_id, timestamp, answers_affected_count}`.
  5. Test : réponse score=50 → admin re-pondère question → score recalculé = 60.
  6. Test concurrent : 2 admins corrigent simultanément → ordre déterministe, pas de corruption.
- **Effort** : M | **Risk** : Moyen (race condition, cf. R-12)

---

### Epic 2 — Signaux de fin (archétype A, ~3-4 semaines)

#### FR-A-01 : Bulk import >20 apprenants opérationnel
- **Description** : Implémenter la Background Function avec idempotence, feedback et observabilité. Cf. section "Architecture Overview" pour design complet.
- **Seuil retenu V1** : `INLINE_THRESHOLD = 20` (synchrone), `BG_MAX = 100` (background) — **figé pour V1**. Commentaires code obsolètes (50) à supprimer. Si OQ-1 révèle volumes prod >100/batch régulier → escalade architecture V1.1.
- **Fichiers** :
  - `netlify/functions/learners-bulk-create-background.mts:112-136` (refactor complet du STUB)
  - `src/app/api/sessions/[id]/learners/bulk/start/route.ts:84,252-273` (retirer `BG_NOT_READY_V1`, harmoniser seuil)
  - `src/app/api/sessions/[id]/learners/bulk/status/route.ts` (nouveau, polling endpoint)
  - `src/lib/services/learner-bulk-create-backend.ts` (nouveau, helper partagé inline/BG)
  - `src/app/(dashboard)/admin/sessions/[id]/bulk-import-learners/page.tsx` (UI polling + progress bar)
- **Dispatch BG** : route `/start` appelle `fetch('/.netlify/functions/learners-bulk-create-background', { method: 'POST', headers: { Authorization: 'Bearer ${CRON_SECRET}' }, body: JSON.stringify({ jobId }) })`. Erreur fetch (5xx/network) → job reste `queued` ; UI affiche état + bouton "Relancer". Pas de retry auto V1 (cron purge V2).
- **Critères d'acceptation** :
  1. BG function crée apprenants + accounts Supabase + enrollments (idempotent via `(entity_id, idempotency_key)` UNIQUE).
  2. Notification admin avec count créés + erreurs détaillées.
  3. UI progress bar polling 2s ; lien résultats détaillés post-completion.
  4. Timeout 26s respecté route `/start` ; BG ≤15 min pour 100 learners.
  5. Logs JSON structurés `{ job_id, step, duration_ms, created_count, error_count, timestamp }`.
  6. Test : import 50 apprenants CSV → tous en DB + enrollments + PDF credentials.
  7. Test idempotence : relancer même `idempotency_key` → retour job existant, pas de doublon.
- **Effort** : L | **Risk** : Haut (cf. R-1, dépend OQ-1 et OQ-4)

#### FR-A-03 : TabPlanning auto-fill — loading state + spinner
- **Description** : Loading state + spinner pendant `handleAutoFillModules` (TabPlanning.tsx:324).
- **Fichiers** : `src/app/(dashboard)/admin/formations/[id]/tabs/TabPlanning.tsx` (lecture complète obligatoire pré-impl, cf. R-6).
- **Pattern requis** :
  ```ts
  const [autoFillLoading, setAutoFillLoading] = useState(false);
  const handleAutoFillModules = async () => {
    setAutoFillLoading(true);
    try {
      await distributeModulesToSlots(...);
      await refetchPlanning();
      toast({ title: "Planning rempli" });
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setAutoFillLoading(false);
    }
  };
  <Button disabled={autoFillLoading}>
    {autoFillLoading ? <Loader2 className="animate-spin" /> : null} Remplir auto
  </Button>
  ```
- **Critères d'acceptation** :
  1. Bouton disabled pendant calcul.
  2. Spinner visible (`Loader2` Shadcn).
  3. Refetch planning après completion.
  4. Erreur → toast + bouton réactivé.
- **Effort** : S | **Risk** : Bas

#### FR-A-04 : TabFinances dialogs — remplacer setTimeout par Promise/callback
- **Description** : Éliminer `setTimeout(50ms)` (lignes 170 et 389) pour orchestrer ouverture séquentielle des dialogs.
- **Fichiers** : `src/app/(dashboard)/admin/formations/[id]/tabs/TabFinances.tsx:170,389`
- **Flow attendu** (à confirmer par lecture complète pré-impl) :
  ```
  User clicks "Type: Société" 
    → setCompanyPickerOpen(true)
    → User selects company
    → setCompanyPickerOpen(false) + setSelectedClientId(clientId)
    → useEffect([selectedClientId]) déclenche prefillInvoiceLines("company", clientId)
    → setInvoiceDialogOpen(true)
  ```
- **Critères d'acceptation** :
  1. Aucun `setTimeout` résiduel dans le fichier (grep).
  2. Dialogs ouvrent dans l'ordre déterministe (state-driven, pas timing-driven).
  3. Si dialog 1 annulé, dialog 2 n'ouvre pas.
  4. Test manuel : sequence 3+ dialogs stable (non-flaky sur 10 répétitions).
  5. Screenshots avant/après joints à la PR (R-5).
- **Effort** : M | **Risk** : Moyen (régression timing — cf. R-5)

#### FR-A-05 : E-Learning reader — loading state changement chapitre
- **Description** : Spinner/skeleton lors du changement de chapitre.
- **Fichiers** : `src/app/(dashboard)/learner/courses/[courseId]/page.tsx` (~1500 LOC, refactor hors scope, cf. R-6 DoR).
- **Critères d'acceptation** :
  1. Navigation chapitre déclenche `isLoadingChapter=true`.
  2. Skeleton affiché pendant fetch.
  3. Fetch terminé → contenu rendu, loading=false.
  4. Erreur fetch → toast + bouton "Recharger".
  5. Visual diff screenshots joints (cf. DoR composants >1000 LOC).
- **Effort** : M | **Risk** : Moyen (composant >1500 LOC)

#### FR-A-06 : E-Learning wizard create — step indicator (7 étapes)
- **Description** : Step indicator visible dans le wizard de création e-learning.
- **Fichiers** : `src/app/(dashboard)/admin/elearning/create/page.tsx:135-250` (~1284 LOC, R-6 DoR).
- **Critères d'acceptation** :
  1. 7 étapes nommées (Type, Métadonnées, Modules, Contenu, Quiz, Aperçu, Publication).
  2. Indicateur affiche étape courante + nombre total (composant Shadcn `Stepper` ou équivalent).
  3. Navigation Prev/Next avec validation Zod par étape.
  4. Dernière étape : bouton "Publier".
- **Dépendance** : FR-C-01 mergé (CourseType enum) — wizard consomme le type.
- **Effort** : S-M | **Risk** : Moyen (composant >1000 LOC)

#### FR-A-07 : Questionnaire learner — draft auto-save + beforeunload
- **Description** : Auto-save localStorage + warning `beforeunload`.
- **Fichiers** : `src/app/(dashboard)/learner/questionnaires/[id]/page.tsx` (à confirmer pré-impl).
- **Logique conflit 2-onglets V1** :
  - Clé localStorage : `questionnaire_${questionnaireId}_draft_${profileId}`.
  - Au mount : si localStorage existe ET API ne montre pas de submission ultérieure → restore + toast "Brouillon restauré".
  - Au mount : si API montre submission ultérieure (autre onglet a soumis) → discard localStorage + toast "Réponse soumise via un autre onglet".
  - `beforeunload` warning uniquement si `form.formState.isDirty && !submitted`.
- **Critères d'acceptation** :
  1. Réponses persistées en localStorage (debounce 500ms sur changement).
  2. Rechargement page → brouillon restauré + toast.
  3. `beforeunload` warning si modifications non soumises.
  4. Submission réussie → localStorage vidé pour ce `(questionnaire_id, profile_id)`.
  5. Test scénario 2 onglets : last-write-wins documenté (le dernier `submit()` API gagne ; brouillons restants ignorés).
  6. Test plan : (a) remplir 5/10 questions → fermer → rouvrir → vérifier restauration ; (b) finir + submit → rouvrir → vérifier draft vidé ; (c) 2 onglets, submit dans l'un → autre onglet refresh → toast affiché.
- **Effort** : M | **Risk** : Bas

---

### Epic 3 — Limites silencieuses (archétype B, ~1-2 semaines)

#### FR-B-01 : Hub E-Learning pagination serveur
- **Description** : Remplacer pagination client-only (`.slice()` lignes 365-366) par pagination Supabase `.limit().range()`.
- **Fichiers** : `src/app/(dashboard)/admin/elearning/page.tsx:224-227,365-366` (~1468 LOC, R-6 DoR).
- **Pré-requis index DB** (cf. R-3 + audit pré-Epic 3) : index composite `(entity_id, status, created_at DESC)` sur `elearning_courses`.
- **Critères d'acceptation** :
  1. Requête fetch 50 cours par page + `count: 'exact'` pour `totalCount`.
  2. Filters appliqués côté serveur (recherche `ilike`, status, course_type).
  3. Pagination "Prev/Next" ou "Load More" sans page reload.
  4. Cible perf : Lighthouse Performance ≥ 80, scroll 60 fps, TTI < 2s sur seed 200 cours.
  5. `EXPLAIN ANALYZE` montre usage index (pas de seq scan).
- **Effort** : M | **Risk** : Moyen (indexes DB)

#### FR-B-02 : Hub Programmes pagination serveur
- **Description** : Pattern identique à FR-B-01 sur table `programs`.
- **Fichiers** : `src/app/(dashboard)/admin/programs/page.tsx:224-227`.
- **Pré-requis index DB** : `(entity_id, status, created_at DESC)` sur `programs`.
- **Critères d'acceptation** : idem FR-B-01.
- **Effort** : M | **Risk** : Bas

#### FR-B-03 : TabConventionDocs batch ops — dialog confirmation avec scope
- **Description** : Dialog de confirmation pour batch ops affichant scope + politique de mode d'échec.
- **Fichiers** : `src/app/(dashboard)/admin/formations/[id]/tabs/TabConventionDocs.tsx:850-900` (~2200 LOC, R-6 DoR).
- **Batch ops à couvrir** (à énumérer pré-impl) :
  - Génération PDF en masse → preconditions : `status='draft'`, partial success OK.
  - Envoi email en masse → preconditions : `email destinataire valide`, partial success OK (log par destinataire).
  - Lancement signature en masse → preconditions : `status='ready_to_sign'`, all-or-nothing recommandé (atomic).
- **Critères d'acceptation** :
  1. Batch op déclenche dialog modale.
  2. Dialog affiche : count documents, formations impactées, action, mode d'échec (partial/atomic).
  3. Confirmé → exécute ; Annulé → ferme sans changement.
  4. Toast result avec count succès/échec post-op.
  5. Pour partial : table résultats listant erreurs par item.
- **Effort** : M | **Risk** : Bas

---

## Non-Functional Requirements

Cf. Brief §8 — Contraintes transverses.

### NFR-1 : Performance

| Item | Cible | Mesure |
|---|---|---|
| Pagination Hub E-Learning + Programmes | Lighthouse Perf ≥ 80, 60 fps scroll, TTI < 2s sur 500 entrées | Lighthouse audit + DevTools |
| Génération PDF bulk (convocations/conventions/credentials) | ≤ 26s synchrone (Netlify Pro), >26s en BG | Logs Netlify |
| Loading feedback async >200ms | Spinner/skeleton/disabled en <200ms | Instrumentation React DevTools |
| Bulk import 100 apprenants | ≤ 2 min wall-clock via BG function | Logs BG (`duration_ms`) |
| Refetch mutations TabAbsences/Docs/Planning/Finances | < 1s après succès | Instrumentation client |

### NFR-2 : Sécurité

- **Règle CLAUDE.md** : chaque query Supabase DOIT filtrer par `entity_id` (multi-tenant MR / C3V).
- **Bulk import** : création via `service_role` validée par `requireRole([admin, super_admin])` + `resolveActiveEntityId()` + cross-check `session.entity_id === activeEntityId` (application-level guard explicite — admin client bypass RLS).
- **BG function** : Bearer `CRON_SECRET` strict ; fallback dev = `.env.local` (jamais commit) ; rotation trimestrielle minimum ; alerte si leak suspecté → rotate immédiat + redeploy.
- **Passwords bulk import** : jamais persistés DB, jamais dans `results` JSONB. RAM uniquement lors PDF gen ; PDF stocké chiffré côté Supabase Storage avec signed URL 24h.

### NFR-3 : Accessibility

| Élément | Exigence |
|---|---|
| Dialogs / Modals | Focus trap + Escape to close (Shadcn standard) |
| Loading states | `aria-live="polite"` + `role="status"` sur spinners |
| Boutons icon-only | `aria-label` obligatoire |
| Pagination | `role="region" aria-live="polite" aria-label="Results pagination"` |
| Step indicator wizard | `aria-current="step"` sur l'étape active |

### NFR-4 : Compatibility

- **Navigateurs** : Chrome 120+, Firefox 115+, Safari 17+.
- **Mobile** : responsive 375px+ (iPhone SE) — admin desktop-first acceptable V1.
- **PDF** : jsPDF + html2canvas, pas de SSR V1.

### NFR-5 : Observability

- **BG function** : logs JSON `{ job_id, learners_count, status, duration_ms, step, created_count, error_count }`.
- **Audit log** : learner création + password_reset → table `audit_logs`.
- **Erreurs BG** : 2 échecs consécutifs → alerte Slack/email (V2, documenté Risks).
- **Draft auto-save** : pas de log persisté V1.

### NFR-6 : Definition of Ready (composants >1000 LOC)

Pour TOUTE PR touchant un composant >1000 LOC (FR-A-05, FR-A-06, FR-B-01, FR-B-03, et `bulk-import-learners` UI) :

1. **Visual diff screenshots** : avant/après sur 3 viewports (mobile 375px, tablet 768px, desktop 1440px).
2. **State machine walkthrough** : lister tous les `useState` impactés et tracer les chemins de transition (présent dans la PR description).
3. **Manual regression checklist** : tester les 3 user flows les plus critiques du composant (à définir par composant).
4. **Pas de refactor implicite** : changements limités au scope du FR ; tout refactor opportuniste = PR séparée.

---

## Architecture Overview — Bulk Import Background Function (FR-A-01)

Cf. Brief §8.A — Decision gate architecture. Seul item du scope nécessitant un design dédié.

### Flux orchestration end-to-end

```
┌─ Admin UI (formations/[id]/learners/bulk-import-learners/page.tsx)
│
├─ POST /api/sessions/[id]/learners/bulk/start
│  ├─ (1) Auth : requireRole([admin, super_admin])
│  ├─ (2) CSRF : isCsrfMismatch(request)
│  ├─ (3) Zod validation : learners[], idempotencyKey, entitySlug
│  ├─ (4) Entity : resolveActiveEntityId(profile)
│  ├─ (5) Session guard : session.entity_id === activeEntityId
│  ├─ (6) Replay-protection : SELECT learner_bulk_import_jobs
│  │       WHERE (entity_id, idempotency_key) → retour job existant si trouvé
│  ├─ (7) INSERT job : status=queued, payload_count=N
│  │
│  ├─ BRANCHEMENT ROUTAGE (seuil V1 figé) :
│  │
│  ├─ Si N ≤ 20 (INLINE_THRESHOLD) :
│  │    ├─ UPDATE status=running
│  │    ├─ FOR each learner :
│  │    │    ├─ createLearnerWithCredentials(admin, {...})
│  │    │    ├─ INSERT enrollment
│  │    │    └─ erreur → results.learners[].errorMessage
│  │    ├─ generateLearnerCredentialsPDF + upload → signedUrl 24h TTL
│  │    └─ UPDATE status=completed|failed, results JSONB
│  │    → RESPONSE 200 {ok, jobId, status, results, pdfSignedUrl}
│  │
│  └─ Si 20 < N ≤ 100 (BG_MAX) :
│       ├─ await fetch('/.netlify/functions/learners-bulk-create-background',
│       │           { Authorization: 'Bearer ${CRON_SECRET}', body: { jobId } })
│       ├─ Si fetch échoue (5xx/network) → log + job reste 'queued' (UI bouton retry)
│       └─ RESPONSE 200 {ok, jobId, status=queued, pollUrl}
│           │
│           └─► POST /.netlify/functions/learners-bulk-create-background
│               ├─ Auth : Bearer CRON_SECRET (strict, 401 si manquant)
│               ├─ Idempotency : if status ∈ [completed, failed] → skip
│               ├─ UPDATE status=running
│               ├─ FOR each learner : createLearner + enroll + accumulate PDF row
│               ├─ generatePDF + upload signed URL
│               └─ UPDATE status=completed, results
│  │
│  Si N > 100 → 400 "Volume > 100, contacter support" (sera levé en V1.1 si OQ-1 le justifie)
│
├─ Polling GET /api/sessions/[id]/learners/bulk/status?jobId=X
│  └─ SELECT job → RESPONSE {status, results, pdfSignedUrl}
│
└─ Affichage résultats UI
   ├─ completed : tableau learners, count, lien PDF
   ├─ running : spinner + "X apprenants en cours..."
   ├─ queued (>10s) : bouton "Relancer" (dispatch BG retry manuel)
   └─ failed : message erreur + résultats partiels
```

### Propriétés critiques

| Propriété | Réalisation |
|---|---|
| **Idempotency** | Unique `(entity_id, idempotency_key)`. BG vérifie status ∈ [completed, failed] → skip |
| **Resilience** | Partial success : si 1 learner échoue, accumule erreur, continue. status=completed avec error_count > 0 |
| **Observability** | Logs JSON `{ timestamp, job_id, step, duration_ms, created_count, error_count }` |
| **Retry** | 1 retry auto sur 5xx Supabase Auth (backoff 2s). Pas de retry BG trigger auto (UI manual retry V1) |
| **Cleanup stale** | Job `queued` > 15 min → mark failed (cron V2 hors scope) |
| **Confidentialité** | Passwords jamais en DB, jamais dans `results` JSONB. Uniquement RAM lors PDF gen |
| **Seuil V1 figé** | INLINE_THRESHOLD = 20, BG_MAX = 100. Tout commentaire/constante "50" à supprimer du code |

### Schéma DB — `learner_bulk_import_jobs`

```sql
CREATE TABLE learner_bulk_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL, -- nullable pour audit post-suppression
  idempotency_key VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
    -- queued → running → completed | failed
  payload JSONB NOT NULL,
  payload_count INT NOT NULL,
  results JSONB,
  pdf_path VARCHAR(255),
  pdf_signed_url TEXT,
  pdf_signed_url_expires_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE (entity_id, idempotency_key),
  CHECK (payload_count >= 1 AND payload_count <= 100)
);

CREATE INDEX idx_bulk_jobs_entity_status ON learner_bulk_import_jobs(entity_id, status, created_at DESC);

CREATE POLICY "bulk_import_jobs_isolation" ON learner_bulk_import_jobs
  USING (entity_id = (SELECT active_entity_id FROM profiles WHERE id = auth.uid()));
```

### Composants impactés

| Fichier | Changement | Statut |
|---|---|---|
| `netlify/functions/learners-bulk-create-background.mts:112-136` | Refactor complet : boucle, PDF, partial success | STUB V1 → impl Epic 2 |
| `src/app/api/sessions/[id]/learners/bulk/start/route.ts:84,252-273` | Retirer flag `BG_NOT_READY_V1`, harmoniser seuil 20/100, dispatch BG | Flag actif → removed Epic 2 |
| `src/app/api/sessions/[id]/learners/bulk/status/route.ts` | Nouveau endpoint polling | À créer Epic 2 |
| `src/app/(dashboard)/admin/sessions/[id]/bulk-import-learners/page.tsx` | Retirer toast "bulk_too_large_v1", polling UI | Epic 2 |
| `src/lib/services/learner-bulk-create-backend.ts` (nouveau) | Helper `processBulkCreateJob` partagé inline/BG | À créer Epic 2 |
| Migration `add_learner_bulk_import_jobs_table.sql` | Vérifier existence prod (OQ-4) ; appliquer si absente | OQ-4 |

---

## Success Metrics

Cf. Brief §7 — KPIs mesurables. Fenêtre baseline/cible 60 jours (cohorte restreinte admin ~5-10 actifs).

| # | KPI | Baseline | Cible (post-déploiement 60j) | Méthode | Owner |
|---|---|---|---|---|---|
| KPI-1 | Tickets support "bouton inerte / silence" | Audit Zendesk 60j (regex `bouton\|click\|rien ne se passe\|aucun retour` AND `formation\|planning\|finances\|questionnaire\|elearning`) | ≤ baseline ÷ 2 | Tag Zendesk `LMS-UX-FIX` + comptage hebdo | Wissam |
| KPI-2 | Imports admin >20 apprenants réussis | 0% (stub V1 explicite) | 100% en <2 min, count visible | Logs BG function + Netlify | Wissam |
| KPI-3 | Pertes réponses questionnaire signalées | À mesurer (informel) | 0 signalement learner sur 60j | Instrumentation `beforeunload` + canal support | Wissam |
| KPI-4 | Boutons & dropdowns sans `onClick` | Audit code : ≥3 confirmés | 0 (script grep pré-merge) | CI : grep `<DropdownMenuItem\|<Button` sans `onClick=` | CI/CD |
| KPI-5 | Enums applicatifs alignés (Zod ↔ TS ↔ DB) | 2 mismatches confirmés (CourseType, BpfFundingType) | 0 mismatch | Test `enums-consistency.test.ts` (à créer dans Epic 1) | Wissam |
| KPI-6 | Loading state sur actions async >200ms | ≥4 confirmés absents | 100% async user-facing avec feedback <200ms | Checklist PR + grep `useState.*loading` | Wissam |
| KPI-7 | Pagination serveur Hub E-Learning + Programmes | Client-only (`.slice()`) freeze >100 | Lighthouse Perf ≥ 80, 60 fps scroll, TTI <2s sur 200 entrées seed | Test e2e seed 200 + Lighthouse | Wissam |
| KPI-8 | Time-to-first-feedback actions admin async | Inconnu (timing-dépendant) | ≤500ms (counter/toast observable) | Instrumentation React DevTools | Wissam |
| KPI-9 | Satisfaction trainer planning (post-déploiement) | Non mesuré | ≥80% positif (sondage 1 question) | Sondage interne S+8 | Wissam |

**Note méthode** : cohorte restreinte (~5-10 admins actifs) → baseline mesurée sur **60 jours pré-déploiement** (vs 30 standards) pour fiabilité statistique, fenêtre post-déploiement 60 jours avant verdict définitif.

---

## Risks & Mitigations

Cf. Brief §9 — Risques identifiés. Mise à jour suite reviews adversariales.

| # | Risque | Probabilité | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| R-1 | Netlify BG function timeout 15 min insuffisant pour >100 learners | Basse | Haut | Seuil V1 figé à 100. Si OQ-1 révèle volumes prod >100/batch régulier → escalade queue externe V1.1+. | Wissam (pré-Epic 2) |
| R-2 | Migration enum `course_type` casse cours existants | Moyenne | Haut | OQ-5bis audit BD pré-deploy. Script migration data si écart. Test sur clone. | Wissam |
| R-3 | Pagination serveur sans index DB : freeze sur 200+ entrées | Moyenne | Moyen | Audit indexes pré-Epic 3 (`SELECT indexname FROM pg_indexes WHERE tablename IN ('elearning_courses','programs')`). Migration ajoute index composite si absent. `EXPLAIN ANALYZE` obligatoire. | Wissam |
| R-4 | Draft auto-save : conflits 2 onglets | Basse | Moyen | Logique `last-write-wins` documentée (cf. FR-A-07). V2 si remontée. | Wissam |
| R-5 | Removal `setTimeout` TabFinances : régression overlap/timing | Moyenne | Moyen | Sequence diagram joint à la PR. Test manuel 10 répétitions. Screenshots avant/après. | Wissam |
| R-6 | Composants >1000 LOC : régression visuelle lors mutations | Moyenne (rev. depuis Basse) | Moyen | NFR-6 DoR composants >1000 LOC : visual diff 3 viewports + state machine walkthrough + manual regression checklist. | Wissam |
| R-7 | Solo dev (Wissam) : vacances bloquent sprint 2-3 sem | Basse | Très haut | (1) Identifier dates vacances pré-kickoff ; resequence epics si conflit. (2) Lock vacances pendant S0-S2 (Epic 1 kickoff). (3) HANDOFF.md (PR review checklist + edge cases + next tasks) avant tout congé >1 sem. | Wissam + Org |
| R-8 | Enum unification découvre couplage caché | Basse | Moyen | Grep `course_type\|bpf_funding_type` codebase. SQL cross-table check. | Wissam |
| R-9 | Refetch sans optimistic : latence perceptible >500ms | Basse | Bas | Doc décision design (refetch V1 / optimistic V2 si latence problématique). | Wissam |
| R-10 | BG function error logging insuffisant → support aveugle | Moyenne | Moyen | Logs JSON structurés. Persister logs en table `bg_function_logs` si volumes. Slack webhook V2. | Wissam |
| R-11 | Scope creep : MINOR findings remontent MAJOR pendant exec | Haute | Moyen | Gate PRD strict : 14 items lock. Post-audit MAJOR → Epic 2 backlog. Hebdo sync scope vs actuals. | Wissam + Mary |
| R-12 | Race condition scoring rétroactif (FR-C-05) | Moyenne | Moyen | Transaction `SELECT … FOR UPDATE` par `questionnaire_id`. Test concurrent mutations. | Wissam |
| R-13 | CRON_SECRET leak ou absence config Netlify | Basse | Haut | Rotation trimestrielle. `.env.local` jamais commit. Alerte si leak suspecté → rotate + redeploy immédiat. | Wissam |
| R-14 | Service helpers `formations.ts` absents (FR-C-03) → effort sous-estimé | Haute (confirmé review 2) | Moyen | Effort revu M→M-L. Pré-impl : audit FK cascade + draft signatures helpers avant kickoff sprint Epic 1. | Wissam |

---

## Open Questions / Decisions Pending

Cf. Brief §8.A — Decision gates pré-PRD bloquants. Mise à jour post-reviews adversariales puis **post-discovery 2026-06-06** (queries Supabase prod exécutées par Wissam + cross-check direct code source).

### OQ résolues (verrouillées par discovery 2026-06-06)

| # | Question | Statut | Verdict |
|---|---|---|---|
| OQ-4 | Table `learner_bulk_import_jobs` en prod ? | ✅ **RÉSOLUE 2026-06-06** | Table absente initialement → migration `add_learner_bulk_import_jobs.sql` appliquée par Wissam le 2026-06-06. Vérification post-application en attente (query confirmation à exécuter en début Epic 2). |
| OQ-5 | Type DB `bpf_funding_type` ? Valeurs ? | ✅ **RÉSOLUE 2026-06-06** | TEXT + CHECK constraint. **3 tables** alignées (`programs`, `trainings`, `crm_quotes`) avec **18 valeurs identiques** (cf. FR-C-02 réécrit). BONUS découvert : `bpf_objective` aussi mismatché (10 Zod vs 11 DB). |
| OQ-5bis | Cours legacy avec `course_type` incompatibles ? | ✅ **RÉSOLUE 2026-06-06** | DB CHECK = 3 valeurs `['presentation', 'quiz', 'complete']`. 16 cours actifs : `complete`×12, `quiz`×4, `presentation`×0. **0 migration data**. `create/page.tsx:36` déjà aligné DB ; **SEUL fichier désaligné = `validations/elearning.ts:69-74`** (cf. FR-C-01 réécrit). |

### OQ résiduelles

| # | Question | Impact si non tranchée | Owner | Deadline |
|---|---|---|---|---|
| OQ-1 | Volume max bulk import en prod — **reformulée post-OQ-4** : à mesurer 4-6 sem après mise en service Epic 2 (la table jobs vient d'être créée, pas encore d'historique exploitable). Si max <50 régulier → seuil V1 100 OK ; si >100 → escalade queue externe V1.1+ | Risque arch sous-dimensionnée si volumes >>100/batch | Wissam (query DB ~M2 post-Epic 2) | Post-Epic 2 (S+4 à S+8) |
| OQ-2 | Volumes prod profiles/learners ±50% — `SELECT role, entity_id, COUNT(*) FROM profiles GROUP BY 1,2` + count learners et enrollments par session | FR-B-01 / FR-B-02 mal calibrés | Wissam (query Supabase prod) | Avant kickoff Epic 3 (S6-7) |
| OQ-3 | Timing exact epic RLS V2/V3 : ownership + démarrage. Si retardé >2 mois, items sécurité V1.1-V1.12 risquent d'oxyder | Items sécurité tombent du backlog ; risque Qualiopi | Wissam + Mary | Avant fin Epic 1 (S2) |
| OQ-6 | Audit indexes DB existants pour pagination : `SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('elearning_courses', 'programs')`. Si index composite `(entity_id, status, created_at)` absent → migration à inclure dans Epic 3 | FR-B-01 / FR-B-02 risquent freeze sans index | Wissam | Avant kickoff Epic 3 (S6-7) |
| OQ-7 | Dates vacances Wissam sur fenêtre 8 semaines : resequencing nécessaire si conflit avec Epic 1 ou Epic 2 (cf. R-7) | Risque blocage sprint complet | Wissam | Avant kickoff Epic 1 (S0) |
| OQ-8 (nouveau) | **Mapping produit valeurs Zod legacy → DB pour BPF** : 4 valeurs `bpf_funding_type` Zod (`opco`, `entreprise`, `particulier`, `region`, `fne`) et 9 valeurs `bpf_objective` Zod sans équivalent direct DB. Tableau de correspondance proposé dans FR-C-02 (à valider/amender) | Mapping ambigu peut nécessiter UI tooltip + doc utilisateur ; impact UX faible mais à trancher avant impl | Wissam (décision produit) | Début sprint Epic 1 |
| OQ-9 (nouveau) | **Existence Zod schemas pour `trainings` et `crm_quotes`** : `validations/training.ts` et `validations/crm-quote.ts` (ou équivalents) existent-ils ? Auditent-ils BPF ? Si oui : aligner. Si non : décider (créer ou laisser API inline) | FR-C-02 sous-spécifié sur tables 2 et 3 (programs OK) | Wissam (audit code 30 min) | Début sprint Epic 1 |

---

## Reviews adversariales

### Verdicts

| Review | Angle | Verdict |
|---|---|---|
| Review 1 — Completeness (Mary, BA) | Cohérence PRD ↔ Brief, traçabilité, KPIs | **minor-tweaks** (4 majors, 11 minors/nits) |
| Review 2 — Executability (dev) | Faisabilité solo dev sur 7-8 sem, vérification code | **major-rework** (4 blockers, 7 majors, 4 minors) |

### Items résolus dans cette version (v2)

| Source | Item | Résolution dans PRD v2 |
|---|---|---|
| R1-major / R2-blocker | BpfFundingType mismatch précis (17-18 vs 9 valeurs) | FR-C-02 réécrit ; DB = source de vérité ; OQ-5 reformulée (ENUM vs TEXT+CHECK) |
| R1-major / R2-blocker | CourseType enum spec incomplète | FR-C-01 réécrit : Zod = source, type dérivé `z.infer`, `COURSE_TYPE_OPTIONS` constante ; OQ-5bis ajoutée pour audit data legacy |
| R1-major / R2-blocker | Inline/BG threshold contradictoire (20 vs 50) | Architecture Overview : seuil V1 figé 20 inline / 100 BG. Commentaires code obsolètes "50" à supprimer (FR-A-01 critère #1 implicite) |
| R2-blocker | Table `learner_bulk_import_jobs` existence prod | OQ-4 promue **⚠ blocker**, deadline pré-Epic 2 |
| R1-major / R2-major | TabPlanning auto-fill spec floue | FR-A-03 enrichi : pattern code complet `useState + try/finally + Loader2` |
| R1-major / R2-major | TabFinances setTimeout flow ambigu | FR-A-04 enrichi : flow diagram pseudocode + state vars + grep no-setTimeout |
| R2-major | Composants >1000 LOC risque sous-estimé | R-6 promu Basse→Moyenne ; NFR-6 (DoR composants >1000 LOC) ajoutée : visual diff 3 viewports + state machine walkthrough + manual checklist |
| R2-major | Pagination indexes DB | OQ-6 ajoutée (audit indexes pré-Epic 3) ; FR-B-01/B-02 explicitent index requis ; `EXPLAIN ANALYZE` obligatoire |
| R2-major | Service helpers `formations.ts` absents | FR-C-03 ré-évalué M→M-L ; 3 helpers explicitement listés (`duplicateFormation`, `getFormationCascadeImpact`, `deleteFormationWithCascade`) ; R-14 ajouté |
| R2-major | BG dispatch orchestration sous-spécifiée | Architecture Overview précise : `fetch('/.netlify/functions/...', { Authorization: Bearer CRON_SECRET, body: { jobId } })` ; comportement si fetch échoue (queued + retry manuel) |
| R1-major / R2-major | Sequencing Epic 1 → Epic 2 dépendance ambiguë | Epic Breakdown clarifié : FR-A-06 dépend FR-C-01 mergé ; FR-A-01 reste isolable mais solo dev = séquentiel |
| R2-major | Test `enums-consistency.test.ts` non spécifié | FR-C-01 et FR-C-02 critères #5 incluent test ; pattern documenté dans KPI-5 |
| R1-minor | CRON_SECRET management | NFR-2 enrichi : rotation trimestrielle, `.env.local` jamais commit, alerte sur leak ; R-13 ajouté |
| R1-minor | KPI-7 perf cible quantifiée | Lighthouse Perf ≥ 80, 60 fps, TTI < 2s |
| R1-minor | FK `created_by` orphelins | Schéma DB révisé : `created_by UUID REFERENCES profiles(id) ON DELETE SET NULL` (nullable pour audit) |
| R1-minor | FR-A-07 conflit 2-onglets vague | FR-A-07 spec enrichi : clé localStorage avec `profileId`, logique restore vs discard, beforeunload conditionnel, test plan détaillé |
| R1-minor | US-LEARNER-04 manquant pour FR-C-05 | Ajouté à la table user stories Persona Learner |
| R1-nit | KPI-9 trainer satisfaction | Ajouté table Success Metrics |
| R1-nit | Cleanup jobs orphelins post-suppression session | `ON DELETE CASCADE` sur `session_id` ; cron purge V2 documenté en NFR-5 |
| R2-minor | R-7 mitigation vague | R-7 renforcée : identifier dates vacances, resequencing, HANDOFF.md, lock S0-S2 ; OQ-7 ajoutée |
| R2-minor | TabConventionDocs batch ops sous-spécifiés | FR-B-03 enrichi : 3 batch ops énumérées, preconditions, mode d'échec (partial vs atomic) |
| R2-nit | OQ-2 seuil de décision absent | OQ-2 reformulée avec seuil "si volumes >500, +1 sem search/filter" |
| R2-nit | FR-C-04 pattern catch vide | FR-C-04 inclut pattern code complet `if (error) { console.error + toast + return }` |

### Items reportés à Open Questions

Tous les **blockers** identifiés par la review 2 ont été transformés en **Open Questions explicitement étiquetées ⚠ blocker review adversariale** avec deadline avant kickoff de l'epic concerné :

- OQ-1 (volumes prod bulk import) → ~~pré-Epic 2~~ → **reformulée post-Epic 2** suite à OQ-4 résolu (cf. discovery 2026-06-06)
- OQ-4 (table `learner_bulk_import_jobs` en prod) → ~~pré-Epic 2~~ → ✅ **RÉSOLUE 2026-06-06** (migration appliquée par Wissam)
- OQ-5 (type DB `bpf_funding_type`) → ~~pré-Epic 1~~ → ✅ **RÉSOLUE 2026-06-06** (TEXT+CHECK, 18 valeurs, 3 tables alignées)
- OQ-5bis (audit cours legacy `course_type`) → ~~pré-Epic 1~~ → ✅ **RÉSOLUE 2026-06-06** (DB = 3 valeurs, 16 cours actifs, 0 migration data)

Aucun blocker ne reste implicite : chaque question a une query Supabase exacte, un owner (Wissam), et une deadline rattachée à un gate go/no-go d'epic. **3 sur 4 blockers verrouillés par discovery 2026-06-06.**

---

## Statut migrations Epic 2.5 en prod (vérifié 2026-06-06)

> Cross-check direct Supabase prod sur le projet **lms-mr-formation** (project ID `zttstemfpybkjurmcxhs`) le 2026-06-06. Cette section certifie l'état des migrations qui sous-tendent les Functional Requirements de ce PRD.

| Phase | Fichier migration (réel dans `supabase/migrations/`) | État en prod | Impact si non appliquée |
|---|---|---|---|
| **A** | `add_learner_username_credentials.sql` | ✅ Appliquée | Couvre learners.username + password_must_change + RPC `resolve_learner_email_by_username` + trigger `tg_learners_autogen_username` (vérifiés en prod le 06/06) |
| **A** | `backfill_learner_usernames.sql` | ✅ Implicite (username remplie via trigger) | Backfill automatique sur insert/update via trigger |
| **B** | `add_learner_credentials_bucket.sql` | ✅ Appliquée | Bucket `learner-credentials` + 4 policies storage (vérifiés le 06/06) |
| **B** | `add_learner_bulk_import_jobs.sql` | ✅ **Appliquée le 2026-06-06 par Wissam** | Table jobs + RLS admin + trigger updated_at — débloque FR-A-01 |
| **C** | Code (TS/React) | ✅ Mergé sur main | LoginForm switch, middleware password_must_change, regenerate-credentials, page bulk-import-learners |
| **RLS** | `audit_rls_fix_2026_06_05.sql` | ✅ Appliquée v3 (06/06) | `generated_documents` durcie + `elearning_global_flashcards` skipped (table sans `entity_id` → TODO V1.2) |

**Verdict** : toutes les migrations sous-jacentes au PRD sont en prod. Aucun blocage infra pour démarrer Epic 1.

**TODO V1.2 hors scope PRD** : `elearning_global_flashcards` en prod existe sans colonne `entity_id` (audit avait halluciné cette colonne dans la migration initiale). À investiguer dans une session future :
- Vérifier les colonnes réelles de la table : `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='elearning_global_flashcards'`.
- Décider stratégie d'isolation (FK indirecte ? `chapter_id → course_id → entity_id` ? Ou pas d'isolation car contenu global partagé ?).

---

## Changelog post-discovery 2026-06-06

Documents les changements apportés au PRD v2 suite aux queries Supabase prod exécutées le 2026-06-06 (post-merge PR #201/#202 RLS + audit RLS v3 + queries OQ).

| # | Section | Avant (PRD v2) | Après (PRD post-discovery) | Raison |
|---|---|---|---|---|
| 1 | FR-C-01 | Spec basée sur hypothèse Zod = source ; effort M ; risk migration data | Spec basée sur **DB = source** (3 valeurs vérifiées) ; effort réduit **S** ; 0 migration data (16 cours actifs en `quiz`/`complete`) | Discovery DB CHECK + cross-check source code |
| 2 | FR-C-02 | Spec 2 tables (programs + trainings), 18 valeurs funding only ; effort S-M | Spec **3 tables** (+ `crm_quotes` découverte) + **2 colonnes** (funding 18 + objective 11) + mapping produit pour 4-9 valeurs Zod legacy ; effort **L** | Discovery `pg_constraint` (3ème table) + audit `program.ts` (objective Zod aussi désaligné, intersection avec DB = 1 valeur) |
| 3 | OQ-4 | Blocker pré-Epic 2 | ✅ Résolue 2026-06-06 (migration `add_learner_bulk_import_jobs.sql` appliquée) | Wissam |
| 4 | OQ-5 | Blocker pré-Epic 1 | ✅ Résolue 2026-06-06 (TEXT+CHECK, 18 valeurs, 3 tables) | Query `pg_constraint` |
| 5 | OQ-5bis | Blocker pré-Epic 1 | ✅ Résolue 2026-06-06 (3 valeurs DB, 16 cours, 0 migration data) | Query `course_type` + cross-check `create/page.tsx` |
| 6 | OQ-1 | Blocker pré-Epic 2 | Reformulée → post-Epic 2 (S+4 à S+8, après quelques semaines de prod active) | Pas d'historique dans `learner_bulk_import_jobs` (table fraîchement créée) |
| 7 | OQ-8, OQ-9 (nouveaux) | — | OQ-8 mapping Zod legacy → DB BPF ; OQ-9 audit Zod trainings/crm_quotes | Discovery 2026-06-06 |
| 8 | Statut migrations | Implicite dans Background | Section dédiée verbatim avec table 6 migrations + verdict | Anti-hallucination — état infra certifié post-discovery |

**Anti-hallucination tracking** : sur ce dossier PRD, **4 hallucinations** des agents Workflow ont été détectées et corrigées :
1. (06/06 matin) 8 tables CRM/Finance/Infra inventées dans audit RLS initial → corrigées via migration safe + détection grep schema.
2. (06/06 matin) Colonne `entity_id` inventée sur `elearning_global_flashcards` → migration RLS v3 ajoute check `information_schema.columns`.
3. (06/06 soir) Workflow patch PRD post-discovery a inventé 4 noms de migrations granulaires Phase A (`add_learner_username_col.sql`, etc.) qui n'existent pas → revue adversariale a détecté, patch FINAL écrit en solo avec sources vérifiées.
4. (06/06 soir) Même Workflow a oublié `crm_quotes` comme 3ème table BPF → revue adversariale a signalé, query Supabase a confirmé, FR-C-02 élargi à 3 tables.

**Leçon** : les agents BMAD sont précieux pour cadrer/écrire/dédupliquer, mais **les noms d'objets nommés (tables, colonnes, fichiers) DOIVENT être sourcés d'une recherche déterministe** (queries `information_schema` + grep code source), **jamais inférés** par un agent. Memory `audit-methodology-source-of-truth` mise à jour en conséquence.

---

## Epic Breakdown & Sequencing

Cf. Brief §10 — Cadrage Mary (BA BMAD).

### Recommandation séquence : Epic 1 → Epic 2 → Epic 3

**Justification** : Epic 1 a l'impact confiance utilisateur le plus immédiat et coûte le moins (items localisés, pas d'architecture). Epic 2 inclut le seul item architecturalement complexe (FR-A-01) + items A2-A7 nécessitant validation BG function. Epic 3 le plus petit, naturellement en clôture car FR-B-01 utilise les filters status de FR-C-01.

### Récap exécutif

| Epic | Archétype | Items | Durée | FRs | Dépendances | Risques majeurs |
|---|---|---|---|---|---|---|
| **Epic 1 — Promesses cassées** | C | 5 (FR-C-01 à FR-C-05) | ~3 sem | FR-C-01, FR-C-02, FR-C-03, FR-C-04, FR-C-05 | OQ-5, OQ-5bis (enums DB) ; OQ-3 (RLS timing) | R-2 (migration enum), R-12 (race scoring), R-14 (helpers absents) |
| **Epic 2 — Signaux de fin** | A | 6 (FR-A-01, A-03 à A-07) | ~3-4 sem | FR-A-01, FR-A-03, FR-A-04, FR-A-05, FR-A-06, FR-A-07 | OQ-1, OQ-4 (volumes + table) ; FR-C-01 mergé (pour FR-A-06) | R-1 (timeout BG), R-5 (régression dialogs), R-6 (LOC), R-13 (CRON_SECRET) |
| **Epic 3 — Limites silencieuses** | B | 3 (FR-B-01 à FR-B-03) | ~1-2 sem | FR-B-01, FR-B-02, FR-B-03 | Epic 1 complet (enums filters) ; OQ-6 (indexes DB) | R-3 (indexes) |

### Séquence détaillée (timeline indicative semaines)

| Semaine | Epic | Tâches majeures | Gates |
|---|---|---|---|
| S-1 (pré-PRD) | Setup | Trancher OQ-5, OQ-5bis, OQ-7. Audit BD enums + cours legacy + vacances. | Kickoff Epic 1 |
| S0-S2 | Epic 1 | FR-C-01 + FR-C-02 (enums + test `enums-consistency.test.ts`) → FR-C-03 (helpers formations.ts + dropdowns) → FR-C-04 (refetch) → FR-C-05 (scoring rétroactif) | KPI-5 = 0 mismatch |
| S2-S3 | Pré-Epic 2 | Trancher OQ-1, OQ-4. Setup logging BG function. Vérifier `CRON_SECRET` Netlify. | Kickoff Epic 2 |
| S3-S6 | Epic 2 | FR-A-03/04/06 en parallèle (UI locales, FR-A-06 attend FR-C-01) → FR-A-05 + FR-A-07 (learner-facing) → FR-A-01 en clôture (architecture + BG function) | KPI-2 = 100%, KPI-6 = 100% |
| S6-S7 | Epic 3 | OQ-6 audit indexes + migration si besoin → FR-B-01 + FR-B-02 (pagination pattern partagé) → FR-B-03 (dialog batch) | KPI-7 (200+ entrées Lighthouse ≥80) |
| S7-S8 | Stabilisation | Bug fixes, test e2e cross-epic, sondage KPI-9 trainers, mesure KPI-1 à 30j | Verdict succès / itération |

### Dépendances inter-epics

- **Epic 1 → Epic 2** : FR-C-01 (CourseType) DOIT être mergé avant FR-A-06 (wizard create) — dépendance dure.
- **Epic 1 → Epic 3** : FR-C-01 / FR-C-02 (enums alignés) requis avant FR-B-01 / FR-B-02 (filters status/type côté serveur).
- **Epic 2 partiellement indépendant** : FR-A-01 (bulk import) isolé du reste d'Epic 2, mais solo dev = séquentiel (R-7).
- **Aucune dépendance bloquante avec RLS V2/V3** [Brief §Status of RLS Work].

### Critères go/no-go par epic

| Epic | Go (kickoff) | No-go (escalade) | Statut go/no-go au 2026-06-06 |
|---|---|---|---|
| Epic 1 | OQ-5 + OQ-5bis tranchées ; R-2 mitigation validée ; OQ-7 vacances connues ; **OQ-8 mapping BPF tranché** ; **OQ-9 Zod trainings/crm_quotes audité** | Migration enum bloquante (>10% cours legacy incompatibles) | ✅ **OQ-5/5bis résolues (discovery 06/06)** • ⏳ OQ-7 + OQ-8 + OQ-9 à trancher avant S0 |
| Epic 2 | OQ-4 résolue + table prod confirmée ; CRON_SECRET Netlify configuré ; vérification post-migration `learner_bulk_import_jobs` | OQ-1 reformulée : ne bloque PLUS kickoff (mesure post-déploiement S+4 à S+8) | ✅ **OQ-4 résolue (migration appliquée 06/06)** • ⏳ vérif post-migration query (1 min, début Epic 2) • ⏳ CRON_SECRET à confirmer |
| Epic 3 | Epic 1 mergé ; OQ-6 (indexes DB) validée ou migration prête ; OQ-2 (volumes pagination) tranchée | Indexes manquants ET non-créables sans downtime | ⏳ Dépend complétion Epic 1 • OQ-6 + OQ-2 à trancher avant S6 |