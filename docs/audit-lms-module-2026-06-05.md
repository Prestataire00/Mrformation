# Synthèse Audit Module LMS — lms-platform

**Date :** 2026-06-05
**Branche :** feat/pedagogie-v2-epic-2-5-phase-A
**Périmètre :** 5 sous-systèmes (Sessions, Formations, Programmes, E-Learning, Questionnaires) + 3 angles transverses (sécurité multi-tenant, production-readiness, UX/complétude)

---

## 1. Score Global du Module LMS

### Pondération par sous-système

| Sous-système | Poids (importance métier) | Score complétude | Score pondéré |
|---|---|---|---|
| Sessions | 25% | 70% | 17.5 |
| Formations (hub 13 tabs) | 30% | 68% | 20.4 |
| Programmes | 15% | 82% | 12.3 |
| E-Learning | 20% | 72% | 14.4 |
| Questionnaires | 10% | 78% | 7.8 |
| **TOTAL** | **100%** | — | **72.4%** |

### Verdict global

**Score : 72/100 — has-gaps / major-concerns**

Le module LMS est **fonctionnellement opérationnel** mais présente **des failles multi-tenant critiques** (queries sans `entity_id`), **plusieurs goulots de production** (timeout 26s sur génération batch, BG function stub), et une **dette UX/technique importante** (composants 1000+ LOC, enum mismatches, casts `as any`). Le module n'est **pas prêt pour une montée en charge significative** (>500 cours/programmes par entité) ni pour un client multi-entités exigeant en sécurité.

---

## 2. Tableau récap par sous-système

| Sous-système | Score | Verdict | 🔴 Critical | 🟠 Major | Top-3 bugs |
|---|---|---|---|---|---|
| **Sessions** | 70% | has-gaps | 4 | 11 | 1. Filtres `entity_id` manquants sur fetch/update/delete admin/sessions/page.tsx (L183, 331, 414) — 2. Trainers query sans entity (L228) — 3. BG function bulk import est un **stub** |
| **Formations** | 68% | has-gaps | 4 | 11 | 1. `entity_id` manquant TabAbsences insert (L72) + TabDocsPartages insert (L109) — 2. Dropdown Duplicate/Delete **sans handler** page.tsx L318-324 — 3. TabConventionDocs 2219 LOC monolithe |
| **Programmes** | 82% | mostly-ok | 3 | 11 | 1. Enum mismatch `BpfFundingType`/`BpfObjective` Zod vs types.ts (validation passe, insert échoue) — 2. `entity_id` manquant `pedagogie-v2-snapshot.ts` L29-74 — 3. `renderMarkdown()` XSS possible via dangerouslySetInnerHTML |
| **E-Learning** | 72% | has-gaps | 3 | 12 | 1. Catalog learner sans `entity_id` learner/courses/page.tsx L128-145 (cross-tenant) — 2. Enroll route sans vérif learner.entity_id == course.entity_id — 3. Course type enum incohérent sur 3 couches |
| **Questionnaires** | 78% | mostly-ok | 0 | 8 | 1. Cron auto-send service_role sans entity guard — 2. Race condition dédup email_history (ilike pattern) — 3. Scoring fix non rétroactif sur réponses existantes |

---

## 3. Top-10 critique (à fixer en priorité absolue)

### 🔴 1. Catalog learner E-Learning sans filtrage `entity_id` (cross-tenant leak)
- **Où :** `src/app/(dashboard)/learner/courses/page.tsx:128-132, 142-145, 179-182`
- **Trouvé par :** Security audit, E-Learning audit
- **Impact :** Un apprenant de l'entité A peut **browser/accéder** aux cours et programmes publiés de l'entité B. Violation directe NFR-SEC-2 et CLAUDE.md règle absolue n°2.
- **Recommandation :** Ajouter `.eq('entity_id', entityId)` aux 3 queries (catalog courses, catalog programs, courseIds stitch). Vérifier RLS `elearning_courses`.
- **Effort :** S (3 lignes + test multi-tenant)

### 🔴 2. Enroll E-Learning sans vérification learner.entity_id == course.entity_id
- **Où :** `src/app/api/elearning/[courseId]/enroll/route.ts:102-147`
- **Trouvé par :** Security audit, E-Learning audit
- **Impact :** Un admin peut **enrôler un apprenant d'une entité différente** dans un cours. Pollution croisée durable.
- **Recommandation :** Fetch learners avec `.eq('entity_id', course.entity_id)` avant upsert. Renvoyer 403 si mismatch. Test : tentative cross-entity doit échouer.
- **Effort :** S

### 🔴 3. Admin /sessions — queries sans `entity_id` (fetch/update/delete/trainers)
- **Où :** `src/app/(dashboard)/admin/sessions/page.tsx:183, 228, 331, 414`
- **Trouvé par :** Sessions audit, Security audit
- **Impact :** Un admin peut lire **toutes les sessions cross-entité** (`fetchSessions` ligne 183), supprimer/modifier sessions d'autres entités par ID, fetcher trainers d'autres entités. RLS doit absolument être présent et stricte sinon faille majeure.
- **Recommandation :** Ajouter `.eq('entity_id', entityId)` sur 4 queries. Vérifier RLS `sessions` et `trainers` tables.
- **Effort :** S

### 🔴 4. Background Function bulk learner import = stub vide
- **Où :** `netlify/functions/learners-bulk-create-background.mts:112-136`, `src/app/api/sessions/[id]/learners/bulk/start/route.ts:84,252-273`
- **Trouvé par :** Production-readiness audit, Sessions audit
- **Impact :** Import >20 apprenants délégué au BG function **qui retourne 202 sans rien créer**. Données silencieusement perdues. Seuil inline 20 bloque les imports volumineux avec 400.
- **Recommandation :** Implémenter la logique réelle (createLearnerWithCredentials loop + enrollments + PDF) ou bloquer explicitement avec message FAQ. Monitoring si >50% des imports atteignent le seuil.
- **Effort :** L (Epic 2.6 dédié)

### 🔴 5. Cron service_role sans entity guard (auto-send + automation-rules)
- **Où :** `src/app/api/questionnaires/auto-send/route.ts:5-42, 49-52` ; `src/app/api/formations/automation-rules/run-cron/route.ts:32-42, 285-299`
- **Trouvé par :** Security audit, Questionnaires audit, Production audit
- **Impact :** Si `CRON_SECRET` est leaké, attaquant peut **énumérer + envoyer emails cross-entité**. Service_role bypasse RLS sans restriction d'entité explicite.
- **Recommandation :** Ajouter paramètre `entity_id` optionnel au body cron. Logger toutes les entités traitées. Scoper CRON_SECRET en prod.
- **Effort :** M

### 🔴 6. Dropdown Duplicate/Delete formation sans handler (UX cassée)
- **Où :** `src/app/(dashboard)/admin/formations/[id]/page.tsx:318-324`
- **Trouvé par :** UX audit, Formations audit
- **Impact :** Boutons cliquables qui ne font **rien**. Violation directe CLAUDE.md règle absolue n°4 ("jamais de bouton sans handler"). Confusion utilisateur sur le tab le plus utilisé.
- **Recommandation :** Implémenter handlers (duplicate copy formation + delete avec confirmation) OU désactiver avec tooltip.
- **Effort :** M

### 🔴 7. TabAbsences + TabDocsPartages — inserts/updates sans `entity_id` / session filter
- **Où :** `TabAbsences.tsx:72, 144-145` ; `TabDocsPartages.tsx:109, 145`
- **Trouvé par :** Formations audit, Security audit
- **Impact :** Insert/delete/update via ID seul, permettant modification cross-session/cross-entity si RLS absente ou faible. Aussi : `handleUpdateStatus` catch vide + pas de refetch (ligne 141-150).
- **Recommandation :** Chaîner `.eq('session_id', formation.id).eq('entity_id', formation.entity_id)` sur toutes mutations. Ajouter try/catch loggé + onRefresh().
- **Effort :** S

### 🔴 8. Enum mismatch Course Type (3 couches incohérentes)
- **Où :** `admin/elearning/create/page.tsx:36` (`'presentation'|'quiz'|'complete'`) vs `lib/validations/elearning.ts:69-74` (`'presentation_quiz'|'presentation_quiz_flashcard'|'quiz'|'flashcards'`) vs `api/elearning/route.ts:63`
- **Trouvé par :** E-Learning audit, UX audit
- **Impact :** Validation échoue silencieusement, mode 'presentation' ne génère pas d'exam final (apprenant n'est jamais évalué, pas de certificat). 3 sources de vérité divergentes = refactoring impossible.
- **Recommandation :** Unifier dans `types.ts` une seule source de vérité. Réutiliser dans Zod, SelectItem, API. Test round-trip create→fetch→edit.
- **Effort :** M

### 🔴 9. Enum mismatch BpfFundingType / BpfObjective (validation Zod vs types.ts)
- **Où :** `src/lib/validations/program.ts:99-131` vs `src/lib/types/index.ts:53-58`
- **Trouvé par :** Programmes audit, Security audit
- **Impact :** Zod accepte `['opco', 'entreprise', ...]` mais Postgres attend `['entreprise_privee', 'apprentissage', ...]`. Utilisateur sélectionne "Apprentissage" → validation passe → **insert échoue avec toast générique**. Toutes les formations BPF impactées.
- **Recommandation :** Aligner Zod sur enum exact via `satisfies BpfFundingType[]`. Centraliser dans types.ts. Générer SelectItems dynamiquement.
- **Effort :** S

### 🔴 10. Génération batch convocations risque timeout 26s Netlify
- **Où :** `src/app/api/documents/generate-convocations-batch/route.ts:62-150+`
- **Trouvé par :** Production-readiness audit
- **Impact :** Boucle sync sur N apprenants (ensureLearnerAccount + QR + PDF puppeteer). À 50 apprenants × ~500ms = **25s+** = timeout imminent. Déjà au bord du seuil.
- **Recommandation :** Convertir en background function (cf. `elearning-generate-pipeline-background`). Polling UI via `generation_progress` JSONB. Dispatch BG si N>10.
- **Effort :** M

---

## 4. Plan d'action priorisé en 3 vagues

### 🚨 Vague V1 — P0 bloquant prod (cette semaine, 1-2 sprints)

**Objectif :** Sécuriser le multi-tenant + débloquer la production.

| # | Ticket | Effort | Sous-système |
|---|---|---|---|
| V1.1 | Ajouter `entity_id` sur queries learner/courses (3 endroits) | S | E-Learning |
| V1.2 | Vérifier `learner.entity_id == course.entity_id` dans enroll route | S | E-Learning |
| V1.3 | Ajouter `entity_id` sur admin/sessions/page.tsx (4 queries) | S | Sessions |
| V1.4 | Implémenter handlers Duplicate/Delete formation OU les désactiver | M | Formations |
| V1.5 | Sécuriser TabAbsences + TabDocsPartages (inserts/updates avec entity + session filter) | S | Formations |
| V1.6 | Unifier enum CourseType (create page + Zod + API) | M | E-Learning |
| V1.7 | Aligner Zod BpfFundingType + BpfObjective sur types.ts | S | Programmes |
| V1.8 | Convertir generate-convocations-batch en BG function | M | Documents/Sessions |
| V1.9 | Scoper CRON_SECRET + entity guard sur cron auto-send + automation-rules | M | Cron/Auto |
| V1.10 | Bloquer ou compléter BG function bulk import learner (>20 → message clair OU implémentation Epic 2.6) | L | Sessions |
| V1.11 | Audit RLS complet (tables formation_absences, formation_documents, elearning_enrollments, programs, sessions, trainers) | M | DB/Sécu |
| V1.12 | Tests entity-isolation pour les 5 sous-systèmes | M | Tests |

**Estimation V1 :** ~3 semaines (un binôme dev + 1 QA).

---

### 🛠️ Vague V2 — P1 chantier court terme (2-4 semaines)

**Objectif :** Améliorer la UX, fiabiliser les flows critiques, payer la dette technique structurante.

#### Sécurité & intégrité
| # | Ticket | Effort | Source |
|---|---|---|---|
| V2.1 | Race condition dédup email_history → UNIQUE INDEX (questionnaire_id, learner_id, session_id) | M | Questionnaires |
| V2.2 | `pedagogie-v2-snapshot.ts` : ajouter entity_id en paramètre explicite | M | Programmes |
| V2.3 | Validation token public-submit : cross-check `entity_id` | M | Questionnaires |
| V2.4 | Migration re-scoring des réponses questionnaires historiques | M | Questionnaires |
| V2.5 | DOMPurify pour `renderMarkdown()` (XSS programmes) | M | Programmes |

#### UX critiques
| # | Ticket | Effort | Source |
|---|---|---|---|
| V2.6 | TabPlanning auto-fill : loading + spinner + disabled | M | Formations |
| V2.7 | TabFinances : remplacer setTimeout par Promise/callback pour dialogs | M | Formations |
| V2.8 | Empty states + loading skeletons (TabQuestionnaires, TabElearning, chapter list) | M | Cross-cutting |
| V2.9 | Confirmation dialogs batch operations (TabConventionDocs sign/send/generate) | M | Formations |
| V2.10 | Beforeunload warning + draft localStorage learner/questionnaires | M | Questionnaires |
| V2.11 | Mode 'presentation' E-Learning : ajouter quiz final OU documenter explicitement | M | E-Learning |
| V2.12 | Wizard create E-Learning : step indicator + breadcrumb détail cours | S | E-Learning |
| V2.13 | Empty/loading states + aria-labels boutons icon-only (audit a11y global) | M | Cross-cutting |

#### Performance & robustesse
| # | Ticket | Effort | Source |
|---|---|---|---|
| V2.14 | Pagination serveur hub programmes + hub elearning admin | M | Programmes, E-Learning |
| V2.15 | Cron cleanup questionnaire_tokens expirés (pg_cron ou Netlify) | S | Questionnaires |
| V2.16 | Retry exponential backoff email send (Resend 429/timeout) | M | Emails |
| V2.17 | Structured logging Resend + corrélation request_id | M | Emails/Obs |
| V2.18 | Cron process-scheduled-emails : alerting failures consécutives | S | Cron |
| V2.19 | Dashboard questionnaires : RPC/view server-side aggregation | M | Questionnaires |
| V2.20 | Idempotency guarantee bulk PDF upload (cleanup ou retry) | M | Sessions |

**Estimation V2 :** ~5 semaines, multi-équipes possible (Sécu, UX, Backend).

---

### 📚 Vague V3 — P2 dette long terme (epic BMAD dédié, 2-3 mois)

**Objectif :** Refactoring structurel, scalabilité, qualité TS.

#### Refactoring composants monolithes
| # | Ticket | LOC actuel | Cible | Source |
|---|---|---|---|---|
| V3.1 | TabConventionDocs split (DocumentMatrix, BatchPanel, SignatureWorkflow) | 2219 | <500 ea | Formations |
| V3.2 | TabFinances split (InvoiceFormDialog, AutoGeneratePanel, ChargesSection) + service | 1199 | <500 ea | Formations |
| V3.3 | TabPlanning split (Calendar, SlotEditor, ConflictPanel) | 936 | <500 ea | Formations |
| V3.4 | TabEmargements split | 807 | <500 ea | Formations |
| V3.5 | admin/elearning/page.tsx hub | 1468 | <500 | E-Learning |
| V3.6 | admin/elearning/create/page.tsx wizard | 1284 | <500 | E-Learning |
| V3.7 | learner/courses/[courseId]/page.tsx reader (extract GammaScreen/QuizScreen/FlashcardScreen) | 1523 | <500 | E-Learning |
| V3.8 | admin/programs/page.tsx hub | 1128 | <500 | Programmes |
| V3.9 | admin/programs/[id]/page.tsx détail | 1090 | <500 | Programmes |
| V3.10 | ProgramEnrollments component | 628 | <300 | Programmes |

#### Qualité TypeScript
| # | Ticket | Effort |
|---|---|---|
| V3.11 | Éradication de tous les `as unknown as X` et `as any` (programs, sessions, formations, questionnaires) → Zod parse en service layer | L |
| V3.12 | Définir interfaces strictes : Entity, Client, Invoice, SessionWithRelations, EnrollmentWithLearner | M |
| V3.13 | Codegen Supabase types ou type-safe wrapper | M |

#### Architecture
| # | Ticket | Effort |
|---|---|---|
| V3.14 | Service `automation-triggers.ts` centralisé (dédup fire-and-forget) | S |
| V3.15 | Service `invoice-management.ts` (extraire logique TabFinances) | M |
| V3.16 | Hook `usePrograms()` + `useFormations()` + `useElearning()` réutilisables | M |
| V3.17 | Event union typé pour SSE elearning-sse.ts | M |
| V3.18 | Activity log unifié (questionnaire_fill, distribute, batch ops) | M |
| V3.19 | Migration verification healthcheck CI/CD (retirer fallback queries) | S |
| V3.20 | Suite e2e Playwright sur les 5 sous-systèmes (CRUD + multi-tenant) | L |

#### Analytics & reporting (gap fonctionnel)
| # | Ticket | Effort |
|---|---|---|
| V3.21 | Dashboard E-Learning Analytics (completion %, score distribution, time per chapter) | L |
| V3.22 | KPI temps réel TabResume / hub formations (refetch on change) | M |

**Estimation V3 :** 2-3 mois en epic BMAD dédié type "tech-debt-reduction-q3".

---

## 5. Statistiques globales des findings

| Catégorie | 🔴 Critical | 🟠 Major | 🟡 Minor | Info | Total |
|---|---|---|---|---|---|
| security-multitenant | 8 | 8 | 0 | 3 | 19 |
| data-integrity | 5 | 9 | 2 | 0 | 16 |
| completeness-gap | 2 | 18 | 12 | 7 | 39 |
| ux-friction | 1 | 14 | 11 | 4 | 30 |
| ux-missing | 0 | 9 | 12 | 4 | 25 |
| tech-debt | 0 | 9 | 8 | 4 | 21 |
| performance | 0 | 4 | 1 | 0 | 5 |
| accessibility | 0 | 1 | 4 | 0 | 5 |
| **TOTAL (après dédup ~30%)** | **~14** | **~52** | **~45** | **~22** | **~133** |

> Note : ~30% des findings sont redondants entre les 3 angles transverses et les audits par sous-système. Les chiffres ci-dessus sont déjà dédupliqués.

---

## 6. Cartographie des risques par axe

### 🔐 Sécurité multi-tenant (CRITIQUE)
**État :** Failles systématiques sur queries Supabase côté client. RLS supposée mais **non vérifiée par tests**. CRON_SECRET en service_role bypasse tout. Helpers `client-portal-isolation.ts` n'existent pas dans la même logique pour admin/learner inter-entities.

**Priorité absolue :** V1.1-V1.5 + V1.9 + V1.11.

### 🏭 Production-readiness (CRITIQUE)
**État :** Plusieurs routes au bord du timeout 26s. BG function bulk import = stub. Pas de retry email. Pas de cleanup tokens. Pas d'alerting cron failures. Schéma de migration avec fallback queries témoignant d'un déploiement incomplet.

**Priorité absolue :** V1.8 + V1.10 + V2.15-V2.18.

### 🎨 UX & complétude (MAJEURE)
**État :** Boutons sans handlers (violation règle absolue n°4). Loading states manquants, empty states partiels, confirmations batch absentes, pas de breadcrumb. Course type 'presentation' incomplet (pas d'exam). Pagination client-only non scalable.

**Priorité :** V1.4 + V2.6-V2.13.

### 🏗️ Dette technique (MAJEURE)
**État :** 9 composants >1000 LOC. ~25 casts `as unknown as`/`as any`. Enums dupliqués/incohérents. Logique métier dans composants (au lieu de `lib/services/`). Pas de tests e2e.

**Priorité :** V3 epic dédié BMAD.

---

## 7. Conclusion honnête : le module LMS est-il complet ?

### Réponse directe : **Non, pas en l'état pour une production multi-client exigeante.**

#### Ce qui fonctionne (les bonnes nouvelles)
- L'architecture 3 couches (Hub / Cœur / Satellites) est saine et bien posée.
- Le tab system formations[id] avec 13 tabs couvre fonctionnellement le cycle de vie complet.
- Les services centralisés (`lib/services/`) existent pour la majorité des entités.
- La couverture fonctionnelle est large : sessions, planning, émargements, parcours, e-learning, questionnaires, conventions, finances, Qualiopi, automation.
- Les tests unitaires existent sur les services critiques (questionnaire-scoring, programs).
- Les RLS migrations existent (au moins partiellement) — cf. `aut-prog-b-fix-rls-programs.sql`.

#### Ce qui pose problème (les faits)
1. **Sécurité multi-tenant non garantie** : 8 critiques + 8 majeurs sur l'isolation entity_id. La CLAUDE.md règle absolue n°2 ("Jamais d'appel Supabase sans filtre entity_id") est **violée systématiquement** côté client. Si les RLS sont permissives (USING true) — ce que l'auto-memory indique comme un risque connu (`project_rls_state.md`: ~50 tables ont `allow_all USING(true)`) — la plateforme **fuit des données cross-tenant**.

2. **BG function bulk import = stub** : la fonction métier la plus critique de l'Epic 2.5/2.6 (import apprenants >20) **ne crée rien**. C'est un bloqueur déclaré.

3. **Boutons sans handlers** : violation de la règle absolue n°4 sur le tab le plus utilisé (`formations/[id]/page.tsx` L318-324).

4. **Enum mismatches** sur 2 endroits critiques (CourseType + BPF) → erreurs silencieuses à l'usage, toasts génériques, frustration utilisateur.

5. **Composants monolithes 1000-2200 LOC** : 9 composants concernés. Refactoring nécessaire pour tester, évoluer, et onboarder de nouveaux devs.

6. **Pas de tests e2e** sur les flows multi-tenant et CRUD critiques.

7. **Risques de timeout production** sur génération batch convocations.

#### Estimation pour atteindre "production-ready niveau MR Formation / C3V"

| Vague | Effort | Délai | Équipe |
|---|---|---|---|
| V1 (P0 bloquant) | ~12 tickets, 3 semaines | Cette semaine + 2 | 1 dev + 1 QA |
| V2 (P1 court terme) | ~20 tickets, 5 semaines | Sprint suivant ×2 | 2 devs + 1 QA + UX |
| V3 (P2 dette long terme) | ~22 tickets, 2-3 mois | Epic BMAD Q3 | Équipe étendue |

**Avant V1 fini : ne pas onboarder de nouveau client multi-entité sensible.**
**Après V1 + V2 : production stable pour 2-3 entités avec volumétrie modérée (<500 apprenants/entité, <100 cours/entité).**
**Après V3 : scalable, maintenable, testable.**

#### Recommandation finale

1. **Bloquer le merge de toute nouvelle feature** tant que V1.1-V1.5 (entity_id queries) ne sont pas mergés.
2. **Lancer immédiatement** un audit RLS Supabase exhaustif avec corrections en migration dédiée (en s'appuyant sur le skill `supabase-audit-rls`).
3. **Décider statut Epic 2.6** : soit on bloque les imports >20 explicitement avec UX claire, soit on finalise la BG function. Pas d'entre-deux silencieux.
4. **Créer un Epic BMAD V3 "tech-debt-reduction-lms-q3"** avec les 22 tickets de refactoring/qualité.
5. **Mettre en place CI/CD migration checks** + tests e2e Playwright sur les flows multi-tenant avant tout déploiement majeur.

---

**Score final consolidé : 72/100 — has-gaps avec major-concerns sur la sécurité multi-tenant et la production-readiness. Le module est utilisable en interne mais nécessite ~2 mois de travail prioritaire avant montée en charge ou onboarding client exigeant.**