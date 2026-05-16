---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
status: complete
completedAt: 2026-05-13
inputDocuments:
  - bmad_output/planning-artifacts/prd.md
  - bmad_output/planning-artifacts/cadrage-module-formations.md
  - CLAUDE.md
---

# Refonte du module Formations (MR / C3V Formation) — Epic Breakdown

## Overview

Ce document décompose en epics et stories implémentables les requirements du PRD (`prd.md`) et du cadrage Business Analyst (`cadrage-module-formations.md`) pour la refonte de stabilisation du module Formations.

**Contexte clé** :
- Projet **brownfield** de stabilisation — pas de nouveau produit.
- **Mode de livraison phasé** : Story de tête → Lots A + B (parallèle) → Lot C → Lot D.
- **MVP = 6 user stories** (Story de tête US-4 + Lot A US-2, US-3 + Lot B US-1, US-5, US-6). Effort ~14.75 j-h dev + ~3 j-h QA.
- **Décisions validées** : US-5 programme commun, US-9 suppression `time_*` e-learning, lots A+B en parallèle.

## Requirements Inventory

### Functional Requirements

Issus du PRD, section *Functional Requirements*. 55 FRs sur 9 capability areas. Légende : 🔧 = refondu/nouveau · = préservé (non régressable).

**Création & sources de vérité (prix, heures, formateurs)**
- · FR1 : Admin can create a new session from the `trainings` catalogue and the session inherits the catalogue price as its default.
- 🔧 FR2 : Admin can see, for the price of a session, whether the value is the catalogue default, a per-session override, or a per-company override, with a visible badge differentiating each case.
- 🔧 FR3 : System can cascade a session price change to all draft (unsent) invoices linked to that session, without affecting sent or paid invoices.
- 🔧 FR4 : System can compute the planned hours of a session from its `formation_time_slots` and expose the result as `computed_hours`.
- 🔧 FR5 : Admin can override the computed hours of a session with an explicit `override_hours` value, and the UI displays which value is currently authoritative.
- · FR6 : Admin can attach one or more trainers to a session, set their daily rate and hourly rate, and mark them as subcontracted.
- · FR7 : System can compute the hours actually delivered by a trainer from the signatures linked to the trainer and the corresponding `formation_time_slots`.

**Multi-entreprises (INTRA / INTER) & isolement**
- 🔧 FR8 : Admin can attach one or more companies (clients) to a session via `formation_companies` as the sole canonical source — the legacy `sessions.client_id` is no longer read.
- 🔧 FR9 : Admin can specify a per-company amount on a session, with a suggested pro-rata default and a visible total reconciliation against the session price.
- 🔧 FR10 : System can guarantee that every enrollment in an INTER session is linked to one of the session's attached companies (no orphan learners).
- 🔧 FR11 : System can detect that a session attached to two or more companies behaves as INTER everywhere — without requiring an explicit toggle.
- 🔧 FR12 : Admin can distinguish at a glance whether a session is INTRA or INTER from a single visible indicator at the top of the formation page.
- 🔧 FR13 : Client (Émilie) can see, on her client-side portal, only the learners and documents of her own company within an INTER session — never those of other companies attending the same session.
- · FR14 : System enforces tenant isolation via `entity_id` Row Level Security on every table involved in a session, regardless of company context.

**Apprenants & inscriptions**
- · FR15 : Admin can add an existing learner to a session, or create a new learner and enroll them in one operation.
- 🔧 FR16 : Admin can choose which company a learner belongs to within a session when two or more companies are attached, with the company selection required (not optional).
- 🔧 FR17 : Admin sees the list of learners updated immediately across all tabs (Émargement, Finances, ConventionDocs, DocsPartagés) after adding or removing a learner — no manual refresh required.
- · FR18 : Admin can export the list of enrolled learners as CSV.
- · FR19 : Admin can send the access link to all enrolled learners in a single action.
- 🔧 FR20 : System can prevent hard-deletion of a learner whose record is linked to a closed session (preserving evidence for the 10-year retention obligation), implementing soft-deletion or status change instead.

**Planning & émargement**
- · FR21 : Admin can create time slots for a session in bulk over a date range, with optional lunch break exclusion and weekly recurrence.
- · FR22 : Admin can record the pedagogical content (module title, objectives) of each time slot.
- · FR23 : Admin can generate signing tokens (QR codes) for a session that allow learners to sign attendance from their device.
- 🔧 FR24 : System can link each signing token (and resulting signature) to the learner's company via `client_id` so that segmented exports can be generated downstream.
- 🔧 FR25 : Admin can filter the attendance view of an INTER session by company to see only the learners of one company at a time.
- 🔧 FR26 : Admin can export an attendance sheet PDF segmented by company (one PDF per company, or one combined PDF with a section per company) for an INTER session.
- · FR27 : Admin can record manual absences (justified / unjustified) for a learner on a given time slot.
- · FR28 : Trainer can view his own sessions in his planning and sign the time slots he delivered.
- · FR29 : Learner can scan a QR code projected by the trainer and submit a handwritten signature for the time slot.

**Documents légaux & génération PDF**
- 🔧 FR30 : Admin can generate one formation convention per attached company in an INTER session, each listing only the learners of that company.
- · FR31 : Admin can freeze (mark as confirmed) a generated document, after which its content can no longer be modified silently.
- · FR32 : Admin can send a generated document by email to its recipient (learner, company representative, or trainer) and track the signature status.
- · FR33 : Client (Émilie) can sign a convention electronically via a public link, with the signature timestamped and stored.
- · FR34 : Admin can attach a single pedagogical program to a session; the program is shared by all attached companies in INTER (no per-company differentiation), and the UI displays a note stating this.
- · FR35 : Admin can generate attendance attestations and end-of-formation attestations once the session is marked completed.
- · FR36 : Admin can upload and share documents in defined categories (learner-specific, trainer-specific, program-related, common, private).

**Évaluation, satisfaction, questionnaires & e-learning**
- · FR37 : Admin can assign evaluation and satisfaction questionnaires to learners, trainers, companies, financiers and manager across four timeline stages (before / during / after / J+30), with secure per-recipient access tokens.
- · FR38 : Admin can view the response rate per session, per questionnaire stage and per target type, and export the aggregated responses.
- · FR39 : Admin can record questionnaire responses on behalf of an absent recipient (admin-fill mode).
- · FR40 : Admin can assign published e-learning courses to enrolled learners of a session, and view per learner the progress made.

**Facturation & financement**
- · FR41 : Admin can create an invoice for a session targeting a learner, a company, or a financier (OPCO/CPF).
- 🔧 FR42 : System can, when an INTER session has two or more attached companies, prompt the admin to explicitly choose the recipient company by ID (not by name) before auto-filling invoice lines.
- · FR43 : System can auto-fill invoice lines from the recipient's context: per-learner lines for INTER, single bulk line for INTRA.
- · FR44 : Admin can issue a credit note (avoir) linked to a parent invoice, with consistent VAT calculation.
- · FR45 : Admin can mark an invoice as sent or paid, and once sent or paid the invoice no longer follows session price changes.
- · FR46 : Admin can import an external invoice PDF, have the relevant fields auto-extracted via an AI parser.
- · FR47 : Admin can attach one or more financiers (OPCO, CPF, employer, self-funded) to a session, specify the amount per financier, track validation status, link financial documents.

**Conformité Qualiopi & rétroactif**
- · FR48 : Admin can view the Qualiopi 8-items dashboard for a session.
- · FR49 : Admin can export, for any historical session, all six legal document types in a state compliant for a Qualiopi audit.
- 🔧 FR50 : System can serve historical formations that originally used `sessions.client_id` without user-visible breakage, thanks to the backfill migration to `formation_companies`.

**Multi-tenant, RBAC & administration**
- · FR51 : Super-admin can view sessions across all tenants ; admin only his own ; trainer/learner/client only what they are linked to.
- · FR52 : Admin can configure formation-level automation rules and view their trigger timeline.
- · FR53 : Admin can send a manual email to learners/companies/trainers/financiers/manager from a unified messaging tab.
- · FR54 : Admin can duplicate an existing session to seed a new one.
- · FR55 : Admin can delete a session via an explicit danger-zone confirmation, preserving evidence rules.

### NonFunctional Requirements

Issus du PRD, section *Non-Functional Requirements*. Catégories incluses : Performance, Security, Scalability, Reliability, Accessibility baseline. Compliance/régulatoire : voir section Domain du PRD.

**Performance**
- NFR-PERF-1 : Chargement page formation `/admin/formations/[id]` < 2s P95 (TTI Lighthouse).
- NFR-PERF-2 : Mutation utilisateur visible < 1s (perception) y compris dans les autres onglets ; état optimiste local acceptable.
- NFR-PERF-3 : Génération PDF émargement segmenté (10 apprenants × 8 créneaux) < 5s côté client.
- NFR-PERF-4 : Export CSV apprenants < 500 ms jusqu'à 200 apprenants.
- NFR-PERF-5 : Le `mega-fetch` initial est conservé en l'état dans le MVP ; optimisation hors scope.

**Security**
- NFR-SEC-1 : Isolement multi-tenant strict via `entity_id` ; tests RLS verts en CI avant chaque release.
- NFR-SEC-2 : Isolement inter-entreprises au sein d'une formation INTER (`client_id`) ; user `client` Acme n'accède à aucune donnée Béta/Gamma.
- NFR-SEC-3 : Conservation 10 ans des documents légaux ; soft-delete only sur tables liées aux sessions.
- NFR-SEC-4 : Valeur probatoire des signatures ; horodatage Postgres + IP + `signing_token` ; pas de modification rétroactive.
- NFR-SEC-5 : Données personnelles RGPD ; pas d'export hors écosystème authentifié sauf exports légaux ; pas de tracking tiers.
- NFR-SEC-6 : Tokens d'accès avec expiration configurable (90 j learner/questionnaire, 14 j signature post-session).
- NFR-SEC-7 : Aucun secret côté client (pas de `service_role`, pas de connection string dans le bundle).

**Scalability**
- NFR-SCAL-1 : Supporter jusqu'à 5 tenants actifs sans changement applicatif ; 3ᵉ tenant onboardé < 1 jour de provisioning.
- NFR-SCAL-2 : Par tenant : 200 sessions actives simultanées et 2 000 apprenants cumulés / 12 mois sans dégradation NFR-PERF-1.
- NFR-SCAL-3 : Modèle de données extensible avec une table `subscriptions` ultérieure sans rupture.
- NFR-SCAL-4 : Aucune dépendance MR-spécifique ou C3V-spécifique introduite ; pas de `entity.slug === 'mr-formation'` conditionnel hors branding.

**Reliability & Availability**
- NFR-REL-1 : Uptime cible 99,5 % mensuel (Netlify + Supabase managed) ; uptime monitoring à mettre en place lot D.
- NFR-REL-2 : Toute mutation échouée déclenche un toast d'erreur explicite ; pas de silent catch (règle absolue n°5 CLAUDE.md).
- NFR-REL-3 : Toute migration SQL idempotente (ré-exécution = no-op).
- NFR-REL-4 : `DROP COLUMN sessions.client_id` exécuté seulement après 1 semaine de monitoring confirmant aucun lecteur applicatif ; sauvegarde préalable.
- NFR-REL-5 : Dump Supabase journalier ; restauration possible d'une formation supprimée par erreur dans les 24h.

**Accessibility (baseline — non bloquant MVP)**
- NFR-A11Y-1 : Pages publiques apprenants (signature QR, accès apprenant, signature convention) utilisables au clavier seul.
- NFR-A11Y-2 : Composants Shadcn/ui restent conformes WCAG AA par défaut (pas de surcharge couleurs/contrastes).
- NFR-A11Y-3 : Écrans admin module Formations lisibles à zoom 200 % sans rupture.
- NFR-A11Y-4 : WCAG AA complet = objectif post-MVP, non bloquant MVP.

### Additional Requirements

Issus du cadrage v1.1 (`cadrage-module-formations.md`) et de `CLAUDE.md`. Couvrent : plan de migration, séquencement de release, contraintes projet, conventions de code.

**Plan de migration & séquencement de release**
- AR1 : Story de tête US-4 (drop `sessions.client_id`) doit être livrée AVANT le démarrage des lots A et B. C'est la condition de cohérence multi-entreprises sur tous les autres onglets.
- AR2 : US-4 livrée en 2 releases atomiques : R1 = migration `backfill_formation_companies_from_legacy_client_id.sql` + arrêt de toute lecture de `sessions.client_id` dans le code ; R2 = `DROP COLUMN sessions.client_id` après 1 semaine de monitoring R1.
- AR3 : Lots A et B sont livrables en parallèle après US-4 (pas de dépendance fonctionnelle entre eux). Si 1 seul développeur, alterner story par story (calendaire allongé de ~1 semaine).
- AR4 : Lot C (cleanup) peut démarrer dès que le MVP (US-4 + A + B) est livré.
- AR5 : Lot D (qualité & observabilité) démarre après le lot C ou en parallèle si ressource disponible.

**Migrations SQL à créer (numérotées chronologiquement)**
- AR6 : `backfill_formation_companies_from_legacy_client_id.sql` (US-4 R1) — pour toute session avec `sessions.client_id` non null, créer la ligne `formation_companies` correspondante si absente. Idempotent. Dry-run obligatoire sur snapshot prod.
- AR7 : `drop_sessions_client_id.sql` (US-4 R2) — `DROP COLUMN`. Sauvegarde préalable de l'état (export `(session_id, client_id)` dans un fichier d'archive).
- AR8 : `add_session_override_hours.sql` (US-3) — ajoute `sessions.override_hours` (nullable). Migration du trigger existant `trg_recompute_planned_hours` pour alimenter `computed_hours` au lieu d'écraser `planned_hours` (renommage de colonne ou ajout d'une colonne dédiée — choix à faire en design technique de la story).
- AR9 : `add_formation_companies_amount_warning.sql` (US-2) — vue ou helper SQL signalant `sum(formation_companies.amount) > sessions.total_price` sur une session. Pas de CHECK bloquant. UI affiche un warning soft.
- AR10 : `drop_elearning_time_fields.sql` (Lot C, US-9) — `DROP COLUMN` des champs `time_modules`, `time_evals`, `time_other`, `time_virtual` de `formation_elearning_assignments`. Vérifier au préalable qu'aucune lecture applicative ne subsiste.
- AR11 : `add_formation_qualiopi_audits_table.sql` (Lot D, US-10) — créer table dédiée `formation_qualiopi_audits` (`session_id`, `score`, `details_json`, `audited_at`, `audited_by`) ; migrer les données existantes stockées en JSON dans `sessions.notes`.

**Conventions de code (règles absolues du `CLAUDE.md`)**
- AR12 : TypeScript strict obligatoire — aucun type `any` toléré dans le code livré (règle absolue n°1).
- AR13 : Toute requête Supabase doit filtrer par `entity_id` (règle absolue n°2).
- AR14 : Toute table introduite doit avoir une RLS policy (règle absolue n°3) — `formation_qualiopi_audits` notamment.
- AR15 : Tout bouton, lien, élément interactif doit avoir un handler implémenté (règle absolue n°4).
- AR16 : Toute action async doit avoir un try/catch avec toast utilisateur — pas de silent catch (règle absolue n°5).
- AR17 : Tout formulaire utilise React Hook Form + Zod ; pas de validation manuelle (règle absolue n°6).
- AR18 : Toute modification de schéma se fait via fichier de migration SQL séparé dans `supabase/migrations/` (règle absolue n°7).
- AR19 : Toujours utiliser les composants Shadcn/ui ; pas de HTML natif pour les éléments UI (règle absolue n°9).
- AR20 : Toute logique Supabase passe par `src/lib/services/` ; pas d'appels inline dans les composants (règle absolue n°10).

**Service layer (Lot D)**
- AR21 : Extraire les mutations Supabase actuellement inline dans `ResumeCompanies.tsx` vers `src/lib/services/formation-companies.ts`.
- AR22 : Extraire les mutations Supabase actuellement inline dans `ResumeLearners.tsx` vers `src/lib/services/enrollments.ts`.
- AR23 : Toute nouvelle mutation introduite par les lots A et B doit être placée directement dans le service layer (pas dans le composant).

**Tests & validation**
- AR24 : Avant livraison prod du MVP, exécuter la checklist Qualiopi 8 items sur 5 sessions de test couvrant : 1 INTRA mono-entreprise, 1 INTER 2-entreprises, 1 INTER 3-entreprises, 1 session passée legacy (rétro-fit), 1 session avec formateur sous-traitant.
- AR25 : Tests RLS automatisés : 1 user MR + 1 user C3V doivent rester verts en CI (NFR-SEC-1).
- AR26 : Test scripté : 1 user `client` rattaché à Acme ne peut pas accéder aux apprenants Béta/Gamma sur le portail client (NFR-SEC-2).
- AR27 : Audit code post-livraison : `grep -r "sessions.client_id\|\.client_id" src/app src/lib | grep -v formation_companies` doit retourner 0 résultat hors commentaires.

**Documentation post-livraison**
- AR28 : Mise à jour `CLAUDE.md` post-MVP : retirer toute mention de `sessions.client_id`, ajouter mention du double isolement (`entity_id` + `client_id`), documenter `computed_hours` vs `override_hours`.
- AR29 : Note inline dans `TabProgramme` (ou successeur fusionné) : « Le programme pédagogique est commun à toutes les entreprises de la formation. » (US-5 validé).
- AR30 : Démo chronométrée du workflow INTER 3-entreprises avant/après livraison MVP, à inclure dans le journal de release pour communication à Loris.

### UX Design Requirements

Aucun UX Design.md formel n'a été produit pour ce PRD (décision validée). Les besoins UX du MVP sont peu nombreux et descriptibles directement dans les AC des stories concernées :
- Badge « Catalogue / Modifié / Override par entreprise » sur le prix dans `ResumePriceHours` (US-2).
- Badge « Calculé / Surchargé » sur les heures dans `ResumePriceHours` (US-3).
- Indicateur visible INTRA / INTER en tête de page formation (US-1, lié à FR12).
- Filtre dropdown par entreprise dans `TabEmargements` mode live (US-1).
- Compteur de réconciliation des montants par entreprise dans `ResumeCompanies` (US-2 / FR9).
- Modal de choix d'entreprise destinataire dans `TabFinances` lors de la création d'une facture en INTER (US-6).
- Note inline programme commun dans `TabProgramme` (US-5).

Si un UX Design.md formel devient nécessaire ultérieurement (post-MVP ou pour les lots C/D), invoquer `bmad-create-ux-design`.

### FR Coverage Map

Mapping de chaque FR vers l'epic responsable de sa livraison ou de sa préservation (tests de non-régression). Cette map garantit qu'aucun FR n'est silencieusement ignoré.

| FR | Epic | Statut | Note |
|---|---|---|---|
| FR1 | Epic 2 | Touché | Inheritance catalogue → session, lié à la cascade prix. |
| FR2 | Epic 2 | 🔧 Refondu | Badge Catalogue / Modifié / Override entreprise. |
| FR3 | Epic 2 | 🔧 Refondu | Cascade prix vers drafts. |
| FR4 | Epic 2 | 🔧 Refondu | `computed_hours` distinct. |
| FR5 | Epic 2 | 🔧 Refondu | `override_hours` explicite. |
| FR6 | Epic 3 (préservation) | · Préservé | `formation_trainers` cohabite avec multi-entreprises. |
| FR7 | Epic 3 (préservation) | · Préservé | Calcul heures trainer via signatures. |
| FR8 | Epic 1 | 🔧 Refondu | `formation_companies` = source canonique, drop legacy. |
| FR9 | Epic 3 | 🔧 Refondu | Montant par entreprise + réconciliation. |
| FR10 | Epic 1 + Epic 3 | 🔧 Refondu | Validation no orphan (préfiguré par Epic 1, finalisé Epic 3). |
| FR11 | Epic 3 | 🔧 Refondu | Détection auto INTER (>= 2 entreprises). |
| FR12 | Epic 3 | 🔧 Refondu | Badge INTRA/INTER en tête de page. |
| FR13 | Epic 3 | 🔧 Refondu | Isolement Émilie/Acme sur portail client. |
| FR14 | Epic 5 (préservation + tests) | · Préservé | RLS `entity_id` ; tests automatisés Lot D. |
| FR15 | Epic 3 (préservation) | · Préservé | Touché par US-1/US-6 via `ResumeLearners`. |
| FR16 | Epic 3 | 🔧 Refondu | Sélection entreprise obligatoire si >= 2. |
| FR17 | Epic 2 + Epic 3 | 🔧 Refondu | Cohérence cross-onglets via refetch global. |
| FR18 | Préservation transverse | · Préservé | Export CSV apprenants. |
| FR19 | Préservation transverse | · Préservé | Envoi mass access link. |
| FR20 | Epic 5 | 🔧 Refondu | Soft-delete renforcé sur learners session-linked. |
| FR21 | Préservation transverse | · Préservé | Bulk slot creation. |
| FR22 | Préservation transverse | · Préservé | Module title / objectives par slot. |
| FR23 | Epic 3 (préservation) | · Préservé | QR codes — étendus par FR24. |
| FR24 | Epic 3 | 🔧 Refondu | `signing_token` lié à `client_id`. |
| FR25 | Epic 3 | 🔧 Refondu | Filtre attendance par entreprise. |
| FR26 | Epic 3 | 🔧 Refondu | Export PDF émargement segmenté. |
| FR27 | Préservation transverse | · Préservé | Absences manuelles. |
| FR28 | Préservation transverse | · Préservé | Vue trainer planning. |
| FR29 | Epic 3 (préservation) | · Préservé | Signature learner — chaîne FR24. |
| FR30 | Epic 3 | 🔧 Refondu | 1 convention / entreprise INTER. |
| FR31 | Préservation transverse | · Préservé | Freeze documents. |
| FR32 | Préservation transverse | · Préservé | Envoi email + tracking signature. |
| FR33 | Préservation transverse | · Préservé | Signature Émilie convention. |
| FR34 | Epic 3 | · Préservé + note | Programme commun + note inline (US-5). |
| FR35 | Préservation transverse | · Préservé | Attestations. |
| FR36 | Préservation transverse | · Préservé | Docs partagés catégorisés. |
| FR37 | Préservation transverse | · Préservé | Questionnaires assign (TabQuestionnaires). |
| FR38 | Préservation transverse | · Préservé | Dashboard réponses. |
| FR39 | Préservation transverse | · Préservé | Admin-fill questionnaires. |
| FR40 | Epic 4 (préservation) | · Préservé | E-learning assign — `time_*` supprimés US-9. |
| FR41 | Préservation transverse | · Préservé | Création facture. |
| FR42 | Epic 3 | 🔧 Refondu | Modal choix destinataire INTER. |
| FR43 | Epic 3 | 🔧 Refondu | Auto-fill invoice lines per-recipient. |
| FR44 | Préservation transverse | · Préservé | Credit note (avoir). |
| FR45 | Epic 2 | · Préservé + cascade | Sent/paid bloque la cascade FR3. |
| FR46 | Préservation transverse | · Préservé | Import invoice PDF AI. |
| FR47 | Préservation transverse | · Préservé | Financiers OPCO/CPF. |
| FR48 | Epic 5 | 🔧 Refondu | Migration vers `formation_qualiopi_audits`. |
| FR49 | Préservation transverse | · Préservé | Export Qualiopi rétroactif. |
| FR50 | Epic 1 | 🔧 Refondu | Migration silencieuse legacy. |
| FR51 | Epic 5 (préservation + tests) | · Préservé | RBAC matrix ; tests automatisés Lot D. |
| FR52 | Préservation transverse | · Préservé | Automation rules. |
| FR53 | Préservation transverse | · Préservé | Unified messaging. |
| FR54 | Préservation transverse | · Préservé | Duplicate session. |
| FR55 | Epic 5 | · Préservé + soft-delete | Danger zone aligné soft-delete FR20. |

**Coverage check final** : 55/55 FRs rattachés. 18 refondus (🔧) répartis sur Epics 1, 2, 3, 5. 37 préservés (·) avec tests de non-régression intégrés au QA pré-livraison (AR24).

## Epic List

### Epic 1: Décommissionnement de la colonne legacy `sessions.client_id`

**Story de tête — prérequis de tous les autres epics du MVP.**

À l'issue de cet epic, la colonne `sessions.client_id` n'est plus lue par le code applicatif puis est supprimée du schéma. `formation_companies` devient la source canonique unique de la liaison session ↔ entreprise(s). Toutes les formations historiques continuent de s'afficher correctement (cf. Journey 2 du PRD).

**Livraison en 2 releases atomiques** (AR2) :
- R1 = migration `backfill_formation_companies_from_legacy_client_id.sql` + audit + arrêt de toute lecture applicative.
- R2 = `DROP COLUMN sessions.client_id` après 1 semaine de monitoring de R1.

**FRs couverts :** FR8, FR50 (primaires) — préfiguration FR10, FR16
**ARs structurants :** AR1, AR2, AR6, AR7, AR27, AR28
**User Story du cadrage v1.1 :** US-4
**Phase :** MVP (Story de tête)
**Effort estimé :** ~1.5 j-h dev + 0.25 j-h QA

---

### Epic 2: Sources de vérité unique pour le prix et les heures

À l'issue de cet epic, l'admin a une vision claire et non ambiguë du prix et des heures d'une session : il sait toujours d'où vient un chiffre (catalogue, surcharge session, surcharge entreprise), et toute modification du prix se propage automatiquement aux factures encore en brouillon. Les heures distinguent `computed_hours` (auto depuis créneaux) et `override_hours` (saisie explicite).

**FRs couverts :** FR1, FR2, FR3, FR4, FR5, FR17 (partiel), FR45
**ARs structurants :** AR8, AR9
**User Stories du cadrage v1.1 :** US-2, US-3
**Phase :** MVP — Lot A (livrable en parallèle de l'Epic 3 après l'Epic 1, AR3)
**Effort estimé :** ~3.5 j-h dev + 0.75 j-h QA

---

### Epic 3: Multi-entreprises uniforme sur tous les onglets

À l'issue de cet epic, le workflow INTER fonctionne de la même façon sur tous les onglets : émargements filtrables et exports segmentés par entreprise, factures avec choix explicite de l'entreprise destinataire en INTER, programme commun avec note inline, validation apprenant ↔ entreprise empêchant les orphelins. C'est l'epic qui livre la promesse centrale du PRD (« 30-40 % de formations INTER deviennent enfin fluides »).

**FRs couverts :** FR9, FR10, FR11, FR12, FR13, FR16, FR17 (partiel), FR24, FR25, FR26, FR30, FR34, FR42, FR43
**Préservation transverse dans le scope de l'epic :** FR15, FR23, FR29
**ARs structurants :** AR29 (note inline programme commun)
**User Stories du cadrage v1.1 :** US-1, US-5, US-6
**Phase :** MVP — Lot B (livrable en parallèle de l'Epic 2 après l'Epic 1, AR3)
**Effort estimé :** ~4 j-h dev + 1 j-h QA

---

### Epic 4: Nettoyage code mort et consolidation des onglets

À l'issue de cet epic, le module Formations passe de 10 onglets à 7-8 (consolidations Planning+Parcours, Conventions+DocsPartagés+Programme, etc.), les onglets `TabEvaluation` et `TabSatisfaction` marqués `@deprecated` sont supprimés, et les champs `time_*` jamais utilisés de e-learning sont droppés. Réduction visible de la complexité perçue par Loris.

**FRs couverts :** consolidation UI (cf. *Capacités hors contrat* du PRD pour les suppressions explicites) — préservation de FR37, FR38, FR39, FR40 via leur tab actuel
**ARs structurants :** AR10
**User Stories du cadrage v1.1 :** US-7, US-8, US-9
**Phase :** Growth (Lot C) — démarre après MVP livré (AR4)
**Effort estimé :** ~2.5 j-h dev + 0.5 j-h QA

---

### Epic 5: Qualité, observabilité et conformité durable

À l'issue de cet epic, la plateforme est durcie pour le scale SaaS : score Qualiopi migré dans une table dédiée (`formation_qualiopi_audits`), mutations Supabase de `ResumeCompanies` et `ResumeLearners` extraites vers le service layer (conformité règle absolue n°10), logging structuré sur les cascades de prix, soft-delete renforcé sur les apprenants liés à une session terminée (FR20), tests RLS multi-tenant et multi-entreprise scriptés.

**FRs couverts :** FR20 (renforcé), FR48 (migration vers table dédiée), FR55 (soft-delete aligné)
**Préservation + tests :** FR14, FR51 (tests RLS automatisés Lot D)
**NFRs adressés :** NFR-REL-2, NFR-REL-5, NFR-SEC-1 (renforcé via tests), NFR-SEC-2 (renforcé via tests)
**ARs structurants :** AR11, AR21, AR22, AR23, AR25, AR26
**User Stories du cadrage v1.1 :** US-10 + service layer + logging
**Phase :** Quality (Lot D) — démarre après Epic 4 ou en parallèle si ressource disponible (AR5)
**Effort estimé :** ~2.5 j-h dev + 0.5 j-h QA

---

**Récapitulatif effort total** : ~14 j-h dev + 3 j-h QA = **17 j-h** (aligné avec l'estimation du cadrage v1.1 §8).

## Epic 1: Décommissionnement de la colonne legacy `sessions.client_id`

**Goal :** À l'issue de cet epic, la colonne `sessions.client_id` n'est plus lue par le code applicatif puis est supprimée du schéma. `formation_companies` devient la source canonique unique de la liaison session ↔ entreprise(s). Toutes les formations historiques continuent de s'afficher correctement.

### Story 1.1: Backfill `formation_companies` et arrêt de toute lecture de `sessions.client_id`

As an Admin (Loris),
I want the platform to no longer rely on the legacy `sessions.client_id` column,
So that the multi-entreprises behavior becomes consistent across all tabs and historical formations continue to work without manual intervention.

**Acceptance Criteria:**

**Given** la base prod contient des sessions historiques où `sessions.client_id` est non null et où `formation_companies` est soit vide soit divergent,
**When** la migration `backfill_formation_companies_from_legacy_client_id.sql` est préparée,
**Then** un dry-run préalable sur un snapshot prod est exécuté avec un rapport synthétique (count créés, count déjà cohérents, count divergents à arbitrer) inclus dans le commit-message ou commentaire de PR,
**And** le rapport est validé par Wissam avant exécution en prod.

**Given** la migration est exécutée en prod,
**When** elle s'applique,
**Then** pour chaque session où `sessions.client_id` est non null et où aucune ligne `formation_companies` correspondante n'existe, une ligne `formation_companies (session_id, client_id, amount)` est créée (avec `amount` = `sessions.total_price` pour les INTRA mono-entreprise, NULL sinon),
**And** la migration est idempotente — sa ré-exécution est un no-op (clause `ON CONFLICT DO NOTHING` ou équivalent),
**And** la migration logue le nombre de lignes créées dans un commentaire SQL ou une table d'audit.

**Given** la migration est livrée en prod,
**When** on exécute la commande `grep -rE "sessions\.client_id|\.client_id" src/app src/lib | grep -v formation_companies | grep -v "^[^:]*://"` (hors lignes commentées),
**Then** le résultat est 0 occurrence,
**And** toute lecture précédente de `sessions.client_id` a été remplacée par une lecture via `formation_companies` (soit via la prop `formation.formation_companies` du mega-fetch, soit via un helper dans `src/lib/services/`),
**And** aucune nouvelle requête Supabase inline n'est introduite dans un composant (conformité AR20 / règle absolue n°10 du `CLAUDE.md`).

**Given** la release R1 (backfill + arrêt de lecture) est livrée en prod,
**When** Loris ouvre une session historique créée avant la refonte (`created_at < date_de_R1`),
**Then** l'entreprise rattachée s'affiche correctement dans `ResumeCompanies` sans message d'erreur ni état vide,
**And** Loris peut ajouter une 2ᵉ entreprise à cette session sans perdre la première,
**And** il peut générer/exporter la convention et la feuille d'émargement de la session historique sans erreur,
**And** Journey 2 du PRD est validé manuellement par Loris sur au moins 1 session test historique (AR24 — session passée legacy).

**Notes techniques (hors AC) :**
- Lié à FR8, FR50, FR10 (préfiguration), AR1, AR2, AR6, AR27.
- Effort estimé : ~1 j-h dev + 0.25 j-h dry-run + validation Loris.
- Cette story ne touche pas encore au schéma (pas de `DROP COLUMN`). Le `DROP` est Story 1.2.

### Story 1.2: Suppression définitive de la colonne `sessions.client_id`

As a developer,
I want to drop the `sessions.client_id` column from the schema definitively,
So that the legacy column cannot be silently reintroduced and the schema documents the final canonical source.

**Acceptance Criteria:**

**Given** la Story 1.1 (release R1) tourne en prod depuis au moins 7 jours,
**And** Sentry ne remonte aucune erreur applicative liée à `client_id` sur cette fenêtre de 7 jours,
**And** un grep statique dans le code source confirme toujours 0 occurrence résiduelle (cf. Story 1.1 AC),
**When** la migration `drop_sessions_client_id.sql` est préparée,
**Then** la migration commence par exporter `(session_id, client_id, created_at)` de toutes les sessions où `client_id` est non null dans un fichier d'archive committé au repo sous `supabase/archives/sessions_client_id_dropped_<YYYYMMDD>.sql` (snapshot non-applicatif, pour audit a posteriori),
**And** la migration utilise `ALTER TABLE sessions DROP COLUMN IF EXISTS client_id` (idempotence — NFR-REL-3).

**Given** des RLS policies sur `sessions` ou des tables liées référencent encore `sessions.client_id`,
**When** la migration est appliquée,
**Then** chaque policy concernée est préalablement modifiée ou supprimée dans le même fichier de migration (`DROP POLICY` / `CREATE POLICY` ordonnés correctement),
**And** la migration est testée sur un environnement de staging ou snapshot avant prod.

**Given** la migration est livrée en prod,
**When** Loris crée une nouvelle session et y ajoute 2 entreprises,
**Then** la création réussit sans erreur SQL ou applicative,
**And** une session historique (créée avant la refonte) reste consultable et éditable sans rupture,
**And** un test manuel rapide est exécuté sur 3 sessions de natures différentes (INTRA, INTER, historique).

**Given** la migration est livrée,
**When** le `CLAUDE.md` est mis à jour,
**Then** toute mention de `sessions.client_id` est retirée,
**And** la convention de double isolement (`entity_id` au niveau tenant + `client_id` au niveau entreprise dans une formation INTER) est documentée explicitement (AR28),
**And** `formation_companies` est documentée comme source canonique unique de la liaison session ↔ entreprise(s).

**Notes techniques (hors AC) :**
- Lié à FR8, FR50, AR2, AR7, AR28, NFR-REL-3, NFR-REL-4.
- Effort estimé : ~0.5 j-h dev + déploiement après fenêtre de 7 jours.
- Cette story dépend strictement de la Story 1.1 livrée en prod depuis ≥ 7 jours et d'une absence d'erreur Sentry liée à `client_id` sur la fenêtre.

## Epic 2: Sources de vérité unique pour le prix et les heures

**Goal :** À l'issue de cet epic, l'admin a une vision claire et non ambiguë du prix et des heures d'une session : il sait toujours d'où vient un chiffre (catalogue, surcharge session, surcharge entreprise), et toute modification du prix se propage automatiquement aux factures encore en brouillon. Les heures distinguent `computed_hours` (auto depuis créneaux) et `override_hours` (saisie explicite).

### Story 2.1: Auto-fill du prix de session depuis le catalogue avec badge d'origine

As an Admin (Loris),
I want the session price to be auto-filled from the trainings catalogue at creation, with a visible badge showing whether the displayed price is the catalogue default or a manual override,
So that I always know where each price comes from and don't waste time re-saisissant le prix.

**Acceptance Criteria:**

**Given** Loris crée une nouvelle session depuis le catalogue `trainings`,
**When** la session est créée,
**Then** `sessions.total_price` est automatiquement initialisé à `trainings.price_per_person` du training sélectionné,
**And** dans `ResumePriceHours`, un badge `Catalogue` est affiché à côté du champ prix.

**Given** Loris modifie manuellement le prix d'une session dans `ResumePriceHours`,
**When** la modification est sauvegardée,
**Then** le badge à côté du prix devient `Modifié` (ou équivalent visuel),
**And** la valeur du prix de catalogue reste accessible (tooltip ou bouton « revenir au prix catalogue »),
**And** la base persiste la valeur surchargée dans `sessions.total_price` sans toucher `trainings.price_per_person`.

**Given** Loris revient sur une session dont le prix a été surchargé,
**When** il consulte `ResumePriceHours`,
**Then** le badge `Modifié` est immédiatement visible (pas besoin de cliquer pour découvrir l'override),
**And** la valeur catalogue d'origine est accessible en un clic pour comparaison.

**Given** le composant est refondu,
**When** on inspecte `src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumePriceHours.tsx`,
**Then** les dépendances `useEffect` qui gèrent les calculs auxiliaires (`autoComputedHours` notamment) incluent toutes les dépendances pertinentes (`formation.formation_companies` notamment, qui manquait avant — cf. audit Mary Step 1 L102),
**And** aucune mutation Supabase n'est inline dans le composant : passage par `src/lib/services/sessions.ts` (AR20).

**Notes techniques (hors AC) :**
- Lié à FR1, FR2, AR12, AR13, AR20.
- Effort estimé : ~1 j-h dev.

### Story 2.2: Cascade du prix de session vers les factures encore en brouillon

As an Admin (Loris),
I want any change to the session price to automatically propagate to the invoices still in draft status linked to that session, but never to invoices already sent or paid,
So that I don't end up with stale prices on unsent invoices, and I don't break the integrity of legally-issued invoices.

**Acceptance Criteria:**

**Given** une session existe avec des factures liées dans différents statuts (`draft`, `sent`, `paid`),
**When** Loris modifie `sessions.total_price`,
**Then** toutes les factures `draft` liées à cette session sont mises à jour automatiquement (montant + lignes recalculées),
**And** les factures `sent` ou `paid` ne sont **pas** modifiées,
**And** un toast utilisateur informe Loris du nombre de factures `draft` impactées par la cascade.

**Given** la cascade est exécutée,
**When** une facture `draft` impactée est ré-ouverte dans `TabFinances`,
**Then** ses lignes reflètent le nouveau prix (per-learner pour INTER, single bulk line pour INTRA selon FR43),
**And** un horodatage ou flag indique que la facture a été automatiquement re-synchronisée (auditabilité).

**Given** une facture `sent` ou `paid` existe pour une session,
**When** Loris modifie le prix de la session,
**Then** un toast d'information rappelle à Loris que les factures déjà envoyées ne suivront pas la mise à jour (pas de blocage — Loris doit pouvoir modifier le prix en restant maître de sa décision ; il fera un avoir manuellement via FR44 si correction commerciale est requise).

**Given** la cascade échoue partiellement (ex. 1 facture draft sur 3 ne peut pas être mise à jour pour une raison Supabase),
**When** l'erreur survient,
**Then** un toast d'erreur explicite est affiché à Loris (conforme NFR-REL-2 / AR16),
**And** aucune mise à jour partielle silencieuse n'est conservée (transaction ou rollback applicatif sur la facture en erreur uniquement),
**And** les autres factures `draft` qui se sont mises à jour avec succès restent à jour.

**Notes techniques (hors AC) :**
- Lié à FR3, FR45, NFR-REL-2, AR16, AR20.
- Cascade implémentée dans `src/lib/services/formation-companies.ts` ou `src/lib/services/invoices.ts` (à arbitrer en design technique).
- Effort estimé : ~1 j-h dev.

### Story 2.3: Séparation `computed_hours` (auto) et `override_hours` (manuelle) pour les heures de session

As an Admin (Loris),
I want to clearly distinguish between hours computed automatically from the time slots and hours I've explicitly overridden, with a visible toggle in the UI,
So that I no longer lose time entering a value that disappears silently when the trigger recalculates.

**Acceptance Criteria:**

**Given** le schéma Supabase doit accueillir 2 sources d'information distinctes pour les heures,
**When** la migration `add_session_override_hours.sql` est appliquée,
**Then** une **nouvelle colonne nullable** `sessions.computed_hours` est ajoutée (la colonne existante `sessions.planned_hours` est **conservée en l'état** pour ne pas casser les lecteurs applicatifs existants — son renommage propre est différé au Lot C),
**And** une **nouvelle colonne nullable** `sessions.override_hours` est ajoutée,
**And** le trigger existant `trg_recompute_planned_hours` est adapté pour écrire **simultanément** dans `planned_hours` (legacy, à retirer en Lot C) et `computed_hours` (nouvelle source canonique), le temps de la migration progressive,
**And** la migration est idempotente (NFR-REL-3) et inclut le `CREATE OR REPLACE FUNCTION` du trigger.

**Given** une session a uniquement des créneaux planifiés (pas d'override),
**When** Loris ouvre `ResumePriceHours`,
**Then** le champ « Heures planifiées » affiche `computed_hours` (ex. 14h),
**And** un badge `Calculé depuis créneaux` est visible.

**Given** Loris saisit manuellement une valeur d'heures (ex. 16h) qui diffère de `computed_hours`,
**When** la modification est sauvegardée,
**Then** la valeur est persistée dans `sessions.override_hours`,
**And** le champ affiché bascule sur `override_hours`,
**And** le badge devient `Saisi manuellement (16h) — calculé : 14h`,
**And** un bouton « revenir au calculé » permet de remettre `override_hours = NULL`.

**Given** Loris a déjà un override actif et il modifie les créneaux (ajout d'un slot par ex.),
**When** le trigger se redéclenche,
**Then** `computed_hours` est recalculé,
**And** `override_hours` n'est **pas** affecté,
**And** l'UI signale visuellement à Loris que `computed_hours` a changé alors qu'un override est actif (ex. badge `Override actif (16h) — calculé a évolué : ancien 14h, nouveau 21h`), pour qu'il puisse décider de garder ou retirer l'override.

**Given** la story est livrée,
**When** la documentation `CLAUDE.md` est mise à jour,
**Then** la distinction `computed_hours` / `override_hours` est documentée explicitement avec le comportement du trigger (AR28),
**And** une note rappelle que `planned_hours` est conservée en legacy temporaire jusqu'au Lot C.

**Notes techniques (hors AC) :**
- Lié à FR4, FR5, AR8, NFR-REL-3, AR28.
- Choix de design : nouvelle colonne `computed_hours` (option safe) plutôt que renommage de `planned_hours` (option breaking). Le renommage propre sera traité en Lot C.
- Trigger existant `trg_recompute_planned_hours` doit écrire dans les 2 colonnes pendant la transition. Audit triggers prod en sprint 1 (cadrage §7 Lot A étape 1).
- Effort estimé : ~1.5 j-h dev.

## Epic 3: Multi-entreprises uniforme sur tous les onglets

**Goal :** À l'issue de cet epic, le workflow INTER fonctionne de la même façon sur tous les onglets : émargements filtrables et exports segmentés par entreprise, factures avec choix explicite de l'entreprise destinataire, programme commun avec note inline, validation apprenant ↔ entreprise empêchant les orphelins. C'est l'epic qui livre la promesse centrale du PRD (« 30-40 % de formations INTER deviennent enfin fluides »).

### Story 3.1: Note « programme commun » inline + badge INTRA/INTER en tête de page formation

As an Admin (Loris),
I want to distinguish at a glance whether a session is INTRA or INTER, and to be reminded clearly that the pedagogical program is shared across all companies in an INTER session,
So that I don't search for a per-company program differentiation that doesn't exist, and I don't confuse myself when switching between session types.

**Acceptance Criteria:**

**Given** une session est rattachée à exactement 1 entreprise dans `formation_companies`,
**When** Loris ouvre la page formation `/admin/formations/[id]`,
**Then** un badge `INTRA` est visible en tête de page (à côté du titre de la session), avec couleur/style cohérent avec les badges Shadcn/ui existants,
**And** le badge est aussi répliqué dans `TabResume`.

**Given** une session est rattachée à 2 entreprises ou plus dans `formation_companies`,
**When** Loris ouvre la page formation,
**Then** un badge `INTER` est visible en tête de page,
**And** la détection est automatique (basée sur `formation_companies.length >= 2`) — pas de toggle manuel à activer.

**Given** Loris bascule sur l'onglet `TabProgramme` (ou son successeur fusionné en Lot C) d'une formation INTER,
**When** la vue s'affiche,
**Then** une note inline visible (encart `Alert` Shadcn/ui ou équivalent) indique : « Le programme pédagogique est commun à toutes les entreprises de la formation. » (AR29),
**And** la note s'affiche uniquement pour les formations INTER (pas pour INTRA),
**And** la note ne bloque rien — elle informe seulement.

**Given** Loris passe une formation d'INTRA à INTER (en ajoutant une 2ᵉ entreprise) alors qu'un programme est déjà attribué,
**When** la 2ᵉ entreprise est ajoutée,
**Then** le programme reste attribué (pas d'effet de bord),
**And** la note inline apparaît automatiquement dans `TabProgramme` au prochain affichage.

**Notes techniques (hors AC) :**
- Lié à FR11, FR12, FR34, AR29, US-5 du cadrage.
- Pas de migration SQL nécessaire.
- Effort estimé : ~0.5 j-h dev.

### Story 3.2: Réconciliation des montants par entreprise dans `ResumeCompanies`

As an Admin (Loris),
I want to see, when attaching multiple companies to a session, a live reconciliation of the per-company amounts against the session total price, with a clear visual signal when they diverge,
So that I can spot immediately if I've forgotten an entreprise ou saisi un mauvais montant.

**Acceptance Criteria:**

**Given** une session INTER avec N entreprises rattachées via `formation_companies`,
**When** Loris ouvre `ResumeCompanies`,
**Then** un compteur en bas de la section affiche : `Total réparti : <sum(formation_companies.amount)> € / <sessions.total_price> €`,
**And** si la somme est égale au total : badge vert `OK ✓`,
**And** si la somme est inférieure au total : badge orange `Reste à attribuer : <delta> €`,
**And** si la somme est supérieure au total : badge rouge soft `Dépassement : +<delta> €` (warning, pas blocage — soit Loris ajuste, soit il valide sciemment).

**Given** Loris ajoute une nouvelle entreprise via le formulaire d'ajout,
**When** il sélectionne le client,
**Then** le champ « Montant » se pré-remplit avec une suggestion pro-rata (`total_price / (N+1)`),
**And** Loris peut modifier la suggestion librement avant de valider.

**Given** Loris modifie un montant par entreprise,
**When** la modification est sauvegardée,
**Then** le compteur en bas est mis à jour en temps réel,
**And** la mutation passe par `src/lib/services/formation-companies.ts` (AR21, anticipé en Lot D mais introduit dès cette story pour ce qui est créé ici).

**Given** une migration SQL est requise pour matérialiser la vérification de cohérence côté base,
**When** la migration `add_formation_companies_amount_warning.sql` est livrée (optionnelle si la vérification est faite côté front uniquement, à arbitrer en design),
**Then** elle crée une vue ou un helper SQL retournant pour chaque session le delta `sum(amounts) - total_price`,
**And** la vue est lue uniquement à des fins d'affichage / audit ; aucun CHECK bloquant n'est introduit.

**Notes techniques (hors AC) :**
- Lié à FR9, AR9, partiellement service layer AR21.
- Effort estimé : ~0.5 j-h dev.

### Story 3.3: Sélection entreprise obligatoire pour chaque apprenant + validation no-orphan

As an Admin (Loris),
I want the platform to require, when I add a learner to a session with 2 or more attached companies, that I explicitly choose which company that learner belongs to, and to prevent any orphan enrollment,
So that my downstream documents (convention, attestation, facture) are always correctly attributed to the right company.

**Acceptance Criteria:**

**Given** une session a 2 entreprises ou plus rattachées via `formation_companies`,
**When** Loris ajoute un apprenant via `ResumeLearners` (que ce soit un learner existant ou un learner nouveau créé à la volée),
**Then** un champ obligatoire « Entreprise » s'affiche dans le formulaire d'ajout,
**And** le champ propose uniquement les entreprises présentes dans `formation_companies` de la session (filtrage côté client),
**And** la validation Zod côté front rejette le submit si l'entreprise n'est pas sélectionnée,
**And** l'enrollment créé persiste `enrollments.client_id = <choisi>`.

**Given** une session a exactement 1 entreprise rattachée (INTRA),
**When** Loris ajoute un apprenant,
**Then** le champ « Entreprise » est auto-rempli avec l'unique entreprise (pas de sélection demandée),
**And** l'enrollment créé persiste `enrollments.client_id = <unique>`.

**Given** une session n'a aucune entreprise rattachée (cas dégradé),
**When** Loris tente d'ajouter un apprenant,
**Then** un message d'avertissement bloque l'action (ou redirige vers `ResumeCompanies` pour rattacher au moins 1 entreprise d'abord) — choix de l'UX à arbitrer en design,
**And** aucun enrollment orphelin (`enrollments.client_id = NULL`) n'est créé via cette voie.

**Given** la liste d'apprenants est mise à jour (ajout ou retrait),
**When** la mutation est confirmée,
**Then** `ResumeLearners` re-fetch la liste locale (`useEffect` dependency complétée avec `formation.enrollments` — cf. audit Mary Step 1 L71-74),
**And** les autres onglets (`TabEmargements`, `TabFinances`, `TabConventionDocs`, `TabDocsPartages`) reflètent immédiatement le changement via le `onRefresh()` global de la page formation (NFR-PERF-2).

**Given** des enrollments orphelins (`client_id = NULL` en INTER) existent en base après migration legacy (Story 1.1),
**When** la migration `backfill_formation_companies_from_legacy_client_id.sql` ou un complément applicatif est exécuté,
**Then** un audit liste les enrollments orphelins et propose à Loris une remédiation manuelle (UI dans `ResumeLearners` ou rapport CSV),
**And** la story est livrée seulement quand 100 % des enrollments des sessions actives sont rattachés à une entreprise (en INTRA implicite ou en INTER explicite).

**Notes techniques (hors AC) :**
- Lié à FR10, FR16, FR17, NFR-PERF-2, AR17, AR20.
- Mutation passe par `src/lib/services/enrollments.ts` (AR22, anticipé en Lot D mais introduit dès cette story).
- Effort estimé : ~0.75 j-h dev.

### Story 3.4: Émargement multi-entreprises — `signing_tokens.client_id`, filtre live, export PDF segmenté

As an Admin (Loris),
I want the attendance workflow of an INTER session to be filterable and exportable per company, with signing tokens unambiguously linked to the learner's company,
So that I can generate clean attendance sheets per client and never mix learners of different companies on the same paper.

**Acceptance Criteria:**

**Given** la table `signing_tokens` n'a pas encore de colonne `client_id`,
**When** la migration `add_signing_tokens_client_id.sql` est livrée,
**Then** une nouvelle colonne `signing_tokens.client_id` (FK vers `clients.id`, nullable pour la rétro-compatibilité legacy) est ajoutée,
**And** la migration backfille la colonne pour les tokens existants à partir de `enrollments.client_id` du learner associé (best-effort, via jointure),
**And** la migration est idempotente (NFR-REL-3).

**Given** un apprenant a un `enrollments.client_id` non null (Story 3.3 vérifiée),
**When** un `signing_token` est généré pour cet apprenant via l'API `/api/emargement/slots`,
**Then** le token persiste `signing_tokens.client_id = enrollments.client_id`,
**And** la signature résultante porte également une trace de `client_id` (soit colonne dédiée sur `signatures` via migration séparée, soit via le token consommé — choix de design à arbitrer en story).

**Given** une session INTER avec 2 entreprises ou plus,
**When** Loris ouvre `TabEmargements` mode live,
**Then** un dropdown / sélecteur d'entreprise est disponible en haut de la vue,
**And** quand une entreprise est sélectionnée, la liste des apprenants affichée se filtre côté front pour n'afficher que ceux rattachés (via `enrollments.client_id`),
**And** la valeur par défaut du sélecteur est `Toutes les entreprises` (visible état initial complet),
**And** le QR code projeté peut être généré pour la sélection en cours.

**Given** une session INTER avec 3 entreprises,
**When** Loris clique sur « Exporter la feuille d'émargement signée »,
**Then** le mode par défaut est **1 PDF par entreprise** (3 PDF générés, chacun listant uniquement les apprenants de l'entreprise correspondante × les créneaux signés),
**And** un mode alternatif « 1 PDF combiné avec section par entreprise » est accessible via un menu secondaire ou checkbox,
**And** la génération PDF côté client respecte NFR-PERF-3 (< 5s par PDF pour 10 apprenants × 8 créneaux).

**Given** un apprenant signe son émargement via QR code (Sophie / Journey 4),
**When** la signature est persistée,
**Then** la signature porte trace de l'apprenant ET du créneau ET du `client_id` de l'apprenant,
**And** l'export segmenté côté Loris peut s'appuyer sur cette traçabilité pour générer la feuille du bon client.

**Given** la mise à jour de `TabEmargements`,
**When** on inspecte le composant,
**Then** la propagation multi-entreprises n'est plus ignorée (cf. audit Mary Step 1 — L215-218, L478-480 actuellement cassés),
**And** l'API `/api/emargement/slots` accepte le contexte `client_id` pour générer les tokens segmentés,
**And** aucune nouvelle requête Supabase inline n'est introduite dans le composant (AR20).

**Notes techniques (hors AC) :**
- Lié à FR24, FR25, FR26, NFR-PERF-3, NFR-SEC-2, AR20, US-1 du cadrage (cœur).
- Migration SQL : `add_signing_tokens_client_id.sql` (nouvelle colonne — décision validée par Wissam : colonne dédiée, pas jointure).
- Effort estimé : ~1.25 j-h dev (story principale de l'epic).

### Story 3.5: Validation et hardening des conventions de formation segmentées par entreprise

As an Admin (Loris),
I want the convention de formation generation to remain robust per company in INTER sessions, even after the refonte multi-entreprises,
So that I keep delivering 1 convention par entreprise (avec uniquement les bons apprenants) sans régression.

**Acceptance Criteria:**

**Given** une session INTER a 3 entreprises rattachées via `formation_companies`,
**When** Loris ouvre `TabConventionDocs`,
**Then** 3 conventions de formation sont pré-générées (1 par entreprise) — comportement déjà partiellement présent dans le code, à valider et hardener,
**And** chaque convention liste uniquement les apprenants de son entreprise (via `getLearnersForCompany`),
**And** chaque convention porte le montant `formation_companies.amount` de son entreprise (et non pas `sessions.total_price` divisé).

**Given** un apprenant est ajouté à l'entreprise Acme via Story 3.3,
**When** Loris retourne sur `TabConventionDocs`,
**Then** la convention Acme est automatiquement re-initialisée pour inclure le nouvel apprenant (si elle n'est pas figée),
**And** si la convention Acme est déjà figée (FR31), un message visuel signale que le nouvel apprenant « n'est pas couvert par la convention figée » et invite Loris à émettre un avenant manuellement (pas de génération auto d'avenant — hors scope MVP).

**Given** la story est livrée,
**When** la checklist Qualiopi 8 items est exécutée sur 5 sessions de test (AR24) incluant 1 INTER 3 entreprises,
**Then** les 3 conventions générées de la session INTER 3-entreprises passent toutes les vérifications Qualiopi (mentions obligatoires, signataires, dates, prix, listing des apprenants),
**And** aucune fuite inter-entreprises n'est constatée dans les PDF générés (validation Émilie / Acme ne voit pas les apprenants de Béta).

**Given** la mise à jour de `TabConventionDocs`,
**When** on inspecte les chemins de génération PDF (audit Mary Step 1 — 2 chemins : HTML client vs API serveur),
**Then** la cohérence entre les deux chemins est validée (les 2 produisent le même contenu pour la même entreprise),
**And** la validation `canExportCompanyDoc` continue de bloquer correctement l'export si un apprenant a `client_id = NULL` ou si le montant entreprise est NULL.

**Notes techniques (hors AC) :**
- Lié à FR30, NFR-SEC-2, AR24, US-1 du cadrage (partie convention).
- Story essentiellement de hardening + tests car le multi-entreprises est déjà partiellement câblé dans `TabConventionDocs` (cf. audit Mary).
- Effort estimé : ~0.5 j-h dev + 0.25 j-h QA.

### Story 3.6: Modal de choix du destinataire de facture en INTER (`TabFinances`)

As an Admin (Loris),
I want the platform to ask me explicitly, when I create an invoice on an INTER session, which company I am billing — and to look up that company by ID rather than by name,
So that I never create an invoice automatically attributed to the wrong client and never confuse two clients with similar names.

**Acceptance Criteria:**

**Given** une session est INTRA (1 entreprise rattachée),
**When** Loris clique sur « Créer une facture » dans `TabFinances`,
**Then** le destinataire est auto-rempli avec l'unique entreprise (`recipient_type = company`, `recipient_id = formation_companies[0].client_id`),
**And** aucun modal de choix n'est affiché (workflow inchangé pour INTRA).

**Given** une session est INTER (2 entreprises ou plus rattachées),
**When** Loris clique sur « Créer une facture »,
**Then** un modal Shadcn/ui s'affiche avec la question : « À quelle entreprise facturez-vous ? »,
**And** le modal liste les entreprises de la session par leur `client_id` (FK propre, pas par `name` qui peut être ambigu — cf. audit Mary Step 1 L343-349),
**And** Loris doit faire un choix avant de pouvoir continuer (pas de valeur par défaut implicite).

**Given** Loris a choisi une entreprise,
**When** le formulaire de facture s'ouvre,
**Then** les lignes de facture sont auto-remplies depuis le contexte du destinataire (FR43) : `formation_companies.amount` de l'entreprise choisie pour INTRA ; lignes per-learner pour INTER si destinataire = entreprise spécifique avec ses apprenants ; selon helper `buildInvoiceLinesForCompany` existant,
**And** Loris peut modifier les lignes avant de valider.

**Given** la mise à jour de `TabFinances`,
**When** on inspecte le composant (cf. audit Mary Step 1 L296-306 actuellement choix arbitraire `formation_companies[0]`),
**Then** le choix arbitraire `formation_companies[0]` est supprimé,
**And** le lookup par `name` (L343-349) est remplacé par un lookup par `client_id`,
**And** aucune mutation Supabase inline n'est ajoutée (AR20).

**Notes techniques (hors AC) :**
- Lié à FR42, FR43, AR20, US-6 du cadrage.
- Effort estimé : ~0.5 j-h dev.

### Story 3.7: Isolement strict du portail client (Émilie / Acme ne voit pas Béta ou Gamma)

As Émilie (rôle `client`, RH chez Acme),
I want to access, on my client-side portal, only the learners, signatures, documents and financial data of my own company within an INTER session,
So that I never accidentally see commercial data of other client companies attending the same session.

**Acceptance Criteria:**

**Given** une session INTER avec 3 entreprises (Acme, Béta, Gamma) et 6 apprenants (2 par entreprise),
**And** un utilisateur de rôle `client` rattaché à Acme,
**When** cet utilisateur accède au portail client de la session,
**Then** il voit uniquement les 2 apprenants d'Acme,
**And** il voit uniquement les documents (convention, attestation) destinés à Acme,
**And** il voit uniquement les signatures de présence des apprenants d'Acme,
**And** il ne voit aucune trace (compte total, nom, email, montant) des apprenants Béta ou Gamma.

**Given** la sécurité doit être garantie côté backend (RLS + filtrage applicatif),
**When** un test scripté est exécuté avec 2 comptes `client` (1 rattaché Acme, 1 rattaché Béta) sur la même session INTER,
**Then** chaque compte renvoie strictement les données de son entreprise,
**And** aucune fuite n'est constatée (test scripté commité en CI ou exécuté manuellement avant chaque release MVP — AR26).

**Given** la story est livrée,
**When** on inspecte les requêtes Supabase côté portail client,
**Then** chaque requête sur des tables session-scoped (`enrollments`, `formation_convention_documents`, `signatures`, etc.) inclut un filtre `client_id = <client de l'utilisateur>` en plus de la RLS `entity_id` (double isolement — NFR-SEC-1 + NFR-SEC-2),
**And** les RLS policies Supabase concernées sont auditées et complétées si nécessaire pour garantir l'isolement même en cas de bypass applicatif.

**Given** l'audit Qualiopi rétroactif (Journey 6),
**When** Loris exporte les documents pour Nathalie,
**Then** les exports segmentés par entreprise (Stories 3.4, 3.5) ne révèlent aucune donnée d'une autre entreprise dans un PDF destiné à un client donné.

**Notes techniques (hors AC) :**
- Lié à FR13, NFR-SEC-2, AR26, US-1 du cadrage (partie portail client).
- Story essentiellement de hardening + tests : audit Mary Step 1 indique que la logique d'isolement existe partiellement mais doit être renforcée côté portail client.
- Effort estimé : ~0.5 j-h dev + 0.25 j-h tests scriptés.

## Epic 4: Nettoyage code mort et consolidation des onglets

**Goal :** À l'issue de cet epic, le module Formations passe de 10 onglets à 8 (consolidations Planning+Parcours et Conventions+DocsPartagés+Programme), les onglets `TabEvaluation` et `TabSatisfaction` marqués `@deprecated` sont supprimés, et les champs `time_*` jamais utilisés de e-learning sont droppés. Réduction visible de la complexité perçue par Loris.

### Story 4.1: Suppression définitive de `TabEvaluation` et `TabSatisfaction` (déjà `@deprecated`)

As a developer (et indirectement Loris),
I want to remove the deprecated `TabEvaluation.tsx` and `TabSatisfaction.tsx` components and all their references,
So that the codebase has one canonical questionnaires flow (`TabQuestionnaires`) and Loris doesn't accidentally use the old deprecated tabs that produce inconsistent results.

**Acceptance Criteria:**

**Given** les fichiers `TabEvaluation.tsx` et `TabSatisfaction.tsx` portent un commentaire `@deprecated` en lignes 2-4 chacun,
**And** `TabQuestionnaires.tsx` est le tab actif et fonctionnel qui les remplace,
**When** la story démarre,
**Then** un audit code (`grep -rE "TabEvaluation|TabSatisfaction" src/`) liste toutes les références aux 2 composants avant suppression.

**Given** une stratégie de masquage temporaire est souhaitée (cadrage §9 — mitigation « Suppression `TabEvaluation` / `TabSatisfaction` casse un workflow non identifié »),
**When** la première release de cette story est livrée,
**Then** les 2 tabs sont **masqués de l'UI** dans la page formation (commentés out dans le tabs config ou flag conditionnel), mais les fichiers restent dans le code,
**And** la release tourne en prod 1 sprint complet (~2 semaines),
**And** aucun ticket support ou remontée de Loris ne signale un workflow cassé sur ce périmètre.

**Given** la fenêtre de masquage est passée sans incident,
**When** la deuxième release de cette story est livrée,
**Then** les fichiers `TabEvaluation.tsx` et `TabSatisfaction.tsx` sont supprimés,
**And** toute référence dans `page.tsx`, `tabs config`, imports, etc. est nettoyée,
**And** un `grep -rE "TabEvaluation|TabSatisfaction" src/` retourne 0 occurrence.

**Given** la suppression est livrée,
**When** Loris ouvre une formation et envoie une évaluation puis une satisfaction,
**Then** le workflow via `TabQuestionnaires` fonctionne intégralement (FR37, FR38, FR39 testés manuellement),
**And** aucun lien orphelin / aucune route 404 / aucune erreur console n'apparaît.

**Notes techniques (hors AC) :**
- Lié à US-7 du cadrage, capacité hors contrat du PRD (suppression validée).
- Livraison en 2 phases (masquage UI puis suppression dure) — conforme cadrage §9 (mitigation feature flag), fenêtre validée à 1 sprint (~2 semaines).
- Effort estimé : ~0.5 j-h dev (suppression simple).

### Story 4.2: Suppression des champs `time_*` jamais utilisés sur `formation_elearning_assignments`

As a developer,
I want to drop the unused `time_modules`, `time_evals`, `time_other`, `time_virtual` columns from `formation_elearning_assignments` and clean up the corresponding computation in `TabElearning.tsx`,
So that the schema doesn't carry dead columns and the UI doesn't display computed values based on always-zero fields.

**Acceptance Criteria:**

**Given** les 4 champs `time_modules`, `time_evals`, `time_other`, `time_virtual` de `formation_elearning_assignments` ne sont jamais populés (cf. audit Mary Step 1 — `TabElearning.tsx` L258-263),
**When** un grep `grep -rE "time_modules|time_evals|time_other|time_virtual" src/` est exécuté avant la migration,
**Then** toutes les références sont listées,
**And** un commit applicatif retire d'abord toutes les lectures de ces champs côté code (`TabElearning.tsx` notamment, simplification du calcul de temps total à `signedTime` uniquement).

**Given** le code applicatif ne lit plus les 4 champs,
**When** la migration `drop_elearning_time_fields.sql` est livrée,
**Then** elle exécute `ALTER TABLE formation_elearning_assignments DROP COLUMN IF EXISTS time_modules, DROP COLUMN IF EXISTS time_evals, DROP COLUMN IF EXISTS time_other, DROP COLUMN IF EXISTS time_virtual` (idempotence — NFR-REL-3),
**And** la migration est testée sur staging ou snapshot prod avant prod.

**Given** la migration est livrée,
**When** Loris ouvre `TabElearning` d'une session avec apprenants ayant des assignations e-learning,
**Then** le temps affiché par apprenant correspond uniquement au temps signé dans la session (`signatures` × `formation_time_slots`),
**And** le tab n'affiche plus de chiffres confus issus de champs jamais alimentés,
**And** Loris valide manuellement le rendu sur au moins 1 session test.

**Notes techniques (hors AC) :**
- Lié à US-9 du cadrage, capacité hors contrat du PRD (suppression validée).
- Migration en 2 étapes : (1) cleanup code, (2) DROP COLUMN. La séparation évite les bugs si le code lit encore les champs au moment du DROP.
- Effort estimé : ~0.5 j-h dev.

### Story 4.3: Consolidation de la disposition des onglets (10 → 8)

As an Admin (Loris),
I want the formation page to have fewer, better-organized tabs that reflect natural task groupings,
So that I don't waste time hunting for where a feature lives, et la sensation « c'est compliqué » disparaisse.

**Acceptance Criteria:**

**Given** la page formation contient actuellement 10 onglets actifs (cf. cadrage §5.3 et audit Mary Step 1),
**When** la story est livrée,
**Then** la page formation contient **8 onglets** (2 fusions seulement, décision Wissam : Planning+Parcours et Conventions+DocsPartagés+Programme — TabEmargements, TabAbsences, TabQualiopi, TabAutomation restent séparés),
**And** chaque fusion préserve l'intégralité des fonctionnalités existantes (pas de feature drop, juste réorganisation).

**Given** la fusion « Planning » :
**When** on ouvre le nouvel onglet `Planning`,
**Then** il contient les fonctionnalités de l'ancien `TabPlanning` (calendrier, création créneaux bulk) ET celles de l'ancien `TabParcours` (module title, objectives par créneau),
**And** la navigation interne au tab utilise des sous-sections / vues groupées (par ex. tabs internes ou accordéon) plutôt que 2 onglets distincts au niveau page formation,
**And** le bouton « Marquer terminée » (TabParcours actuel) reste accessible dans cette vue consolidée.

**Given** la fusion « Documents » :
**When** on ouvre le nouvel onglet `Documents`,
**Then** il contient les fonctionnalités de l'ancien `TabConventionDocs` (conventions, attestations, signature), de l'ancien `TabDocsPartages` (upload/download docs catégorisés), et de l'ancien `TabProgramme` (attribution programme + note inline programme commun Story 3.1),
**And** la note inline « programme commun en INTER » (Story 3.1) reste affichée dans la sous-section programme,
**And** la navigation interne utilise des sous-sections claires (Conventions / Programme / Docs partagés).

**Given** TabEmargements, TabAbsences, TabQualiopi, TabAutomation restent séparés (décision Wissam),
**When** Loris navigue entre ces onglets,
**Then** leur comportement est inchangé par rapport à l'avant-consolidation,
**And** seul leur ordre dans la barre de tabs peut évoluer pour respecter le workflow naturel.

**Given** la consolidation est livrée,
**When** Loris ouvre une formation et exécute les 4 workflows critiques du PRD (W1 création INTRA, W2 gestion INTER, W3 émargement, W4 facturation),
**Then** chaque workflow reste fluide ou s'améliore (pas de régression de temps de complétion),
**And** Loris confirme par retour qualitatif que les nouveaux onglets sont plus clairs que les anciens.

**Given** la consolidation est livrée,
**When** la barre de navigation tab est inspectée,
**Then** chaque tab a un titre court et compréhensible sans contexte,
**And** l'ordre des tabs suit le workflow naturel d'une formation (création → préparation → émargement → documents → questionnaires → e-learning → finances → conformité → automation).

**Notes techniques (hors AC) :**
- Lié à US-8 du cadrage, *Product Scope > Growth* du PRD.
- Story la plus impactante de l'Epic 4 — peut être split en 2 sous-stories au moment de l'exécution (1 fusion par sous-story) si la charge est trop grosse pour un seul dev en 1.5 j-h.
- Pas de migration SQL.
- Effort estimé : ~1.5 j-h dev.

## Epic 5: Qualité, observabilité et conformité durable

**Goal :** À l'issue de cet epic, la plateforme est durcie pour le scale SaaS : score Qualiopi migré dans une table dédiée (`formation_qualiopi_audits`), mutations Supabase de `ResumeCompanies` et `ResumeLearners` extraites vers le service layer (conformité règle absolue n°10), logging structuré sur les cascades de prix, soft-delete renforcé sur les apprenants liés à une session terminée (FR20), tests RLS multi-tenant et multi-entreprise scriptés.

### Story 5.1: Migration du score Qualiopi vers une table dédiée `formation_qualiopi_audits`

As an Admin (Loris),
I want Qualiopi audit data to be stored in a dedicated, properly schema'd table rather than as JSON inside `sessions.notes`,
So that I can trace successive audits over time, run reliable BPF/Qualiopi reports, and stop bumping into JSON parsing fragility.

**Acceptance Criteria:**

**Given** le score Qualiopi est actuellement stocké en JSON dans `sessions.notes` (cf. audit Mary Step 1 — `TabQualiopi.tsx` L47-64),
**When** la migration `add_formation_qualiopi_audits_table.sql` est livrée,
**Then** une nouvelle table `formation_qualiopi_audits` est créée avec colonnes : `id`, `session_id` (FK), `entity_id` (multi-tenant), `score` (numeric), `details_json` (JSONB pour les détails par item Qualiopi), `audited_at` (timestamp), `audited_by` (FK profiles, optionnel),
**And** la table a une RLS policy par `entity_id` (règle absolue n°3 du `CLAUDE.md` / AR14),
**And** la migration est idempotente (NFR-REL-3).

**Given** des sessions existantes ont un score Qualiopi stocké en JSON dans `sessions.notes`,
**When** la migration de données est exécutée,
**Then** chaque score existant est extrait du JSON et inséré dans `formation_qualiopi_audits` avec `audited_at = sessions.updated_at` (ou la date la plus pertinente disponible),
**And** un dry-run préalable sur snapshot prod liste le nombre de sessions migrées et les éventuels parsing errors (commenté dans le commit-message ou la PR),
**And** la migration laisse `sessions.notes` en l'état pour ne pas casser d'éventuels lecteurs résiduels (cleanup `notes` différé à un PRD ultérieur si besoin).

**Given** la nouvelle table est en place,
**When** Loris ouvre `TabQualiopi` d'une session,
**Then** le score affiché est lu depuis `formation_qualiopi_audits` (dernier audit en date),
**And** la mise à jour du score (Loris modifie l'audit manuel) crée une nouvelle ligne dans `formation_qualiopi_audits` (historisation) plutôt qu'un UPDATE sur la même ligne — choix de design à arbitrer entre append-only et single-row update,
**And** la mutation passe par `src/lib/services/qualiopi.ts` (nouveau service, conformité AR20).

**Given** la story est livrée,
**When** un audit Qualiopi rétroactif est demandé (Journey 6),
**Then** l'historique des scores d'une session est consultable (au moins via la base, voire via UI dans un PRD ultérieur),
**And** la conformité Qualiopi 8 items continue de fonctionner sur les sessions de test (AR24).

**Notes techniques (hors AC) :**
- Lié à FR48 (refondu), AR11, AR14, AR20, US-10 du cadrage.
- Choix de design append-only vs single-row à arbitrer en début de story (préférence : append-only pour traçabilité audit).
- Effort estimé : ~1 j-h dev.

### Story 5.2: Extraction des mutations Supabase de `ResumeCompanies` et `ResumeLearners` vers le service layer

As a developer,
I want all Supabase mutations currently inline in `ResumeCompanies.tsx` and `ResumeLearners.tsx` to be extracted into the service layer (`src/lib/services/`),
So that the code conforms to absolute rule n°10 of `CLAUDE.md`, mutations are testable in isolation, and future stories don't have to refactor inline code first.

**Acceptance Criteria:**

**Given** `ResumeCompanies.tsx` contient actuellement des mutations Supabase inline (`formation_companies.insert()`, `enrollments.insert()`, `formation_companies.delete()` — cf. audit Mary Step 1 L138, L167, L205),
**When** l'extraction est livrée,
**Then** ces mutations sont déplacées dans `src/lib/services/formation-companies.ts` (créé pour l'occasion s'il n'existe pas),
**And** chaque fonction du service expose une signature claire (paramètres typés, retour typé, gestion d'erreur uniforme),
**And** `ResumeCompanies.tsx` n'importe plus de `createClient` Supabase pour des mutations métier (lectures conservées dans le composant si elles passent par les props ou par un fetch local sans logique métier).

**Given** `ResumeLearners.tsx` contient actuellement des mutations Supabase inline (`enrollments.insert()`, `learners.insert()`, `enrollments.delete()` — cf. audit Mary Step 1 L84-89, L110-130, L154),
**When** l'extraction est livrée,
**Then** ces mutations sont déplacées dans `src/lib/services/enrollments.ts` et `src/lib/services/learners.ts`,
**And** le composant `ResumeLearners.tsx` ne contient plus de `supabase.from('...').insert/update/delete()` direct sur ces tables.

**Given** les services sont en place,
**When** un audit `grep -rE "supabase\.from\(.{0,50}(formation_companies|enrollments|learners)" src/app/` est exécuté,
**Then** aucun résultat n'est trouvé dans `src/app/` (les mutations sont toutes dans `src/lib/services/`),
**And** seuls les fichiers de service sous `src/lib/services/` contiennent les calls Supabase de ces tables.

**Given** les services sont introduits,
**When** une mutation échoue côté Supabase,
**Then** le service relance une erreur typée que le composant catch et transforme en toast utilisateur explicite (NFR-REL-2, AR16),
**And** aucun silent catch n'est introduit (audit code lors de la PR).

**Given** la story est livrée,
**When** un dev externe rejoint l'équipe et veut ajouter une mutation sur `formation_companies`,
**Then** il sait où la mettre : directement dans `src/lib/services/formation-companies.ts` sans toucher les composants,
**And** le `CLAUDE.md` est mis à jour pour signaler ces services comme exemples canoniques.

**Notes techniques (hors AC) :**
- Lié à AR21, AR22, AR23, NFR-REL-2, AR16, règle absolue n°10 du `CLAUDE.md`.
- Refactor pur — aucune nouvelle fonctionnalité utilisateur introduite. Pas de migration SQL.
- Effort estimé : ~0.75 j-h dev.

### Story 5.3: Logging structuré sur les cascades de prix et les mutations critiques

As a developer (et indirectement Loris en cas de support),
I want structured logs emitted on critical mutations (price cascades, multi-company changes, soft-deletes), with consistent format and key fields (session_id, entity_id, action, before/after, user_id),
So that when something breaks in prod we can diagnose without re-running through user steps.

**Acceptance Criteria:**

**Given** une mutation déclenche une cascade de prix (FR3, Story 2.2),
**When** la cascade est exécutée côté service (`src/lib/services/`),
**Then** un log structuré est émis avec a minima : `event = "session_price_cascade"`, `session_id`, `entity_id`, `old_price`, `new_price`, `affected_invoices_count`, `failed_invoices_count`, `triggered_by_user_id`,
**And** le log est émis via `console.log(JSON.stringify({...}))` ou via un helper de logging existant (à confirmer en design — pas d'introduction d'une nouvelle lib de logging dans le MVP).

**Given** un apprenant est rattaché à une entreprise différente de celle de son inscription précédente (mutation `enrollments.client_id` modifiée), un signing_token est généré ou révoqué, ou un soft-delete est appliqué,
**When** ces événements surviennent côté service,
**Then** un log structuré est émis avec le contexte minimal (session_id, entity_id, table affectée, action, user_id),
**And** les logs sont consultables dans Netlify Logs (production) et Sentry capture les erreurs avec leur context.

**Given** les logs structurés sont en place,
**When** Loris remonte un bug type « j'ai modifié le prix et 2 factures n'ont pas suivi »,
**Then** Wissam peut retrouver dans Netlify Logs l'événement `session_price_cascade` correspondant et lire `affected_invoices_count` et `failed_invoices_count` pour diagnostiquer en < 5 min,
**And** aucun log ne contient de données personnelles non nécessaires (emails learners par exemple — seulement les IDs et compteurs).

**Given** la story est livrée,
**When** un audit code est exécuté,
**Then** les `console.error` silencieux sont remplacés par des `console.error(JSON.stringify({...context}))` structurés sur les services critiques (formation-companies, enrollments, qualiopi, invoices),
**And** aucun `catch` ne reste muet sans au moins un log + un toast (NFR-REL-2 / AR16 — alignement avec la branche `fix/resolve-variables-multi-companies` actuelle).

**Notes techniques (hors AC) :**
- Lié à NFR-REL-2, AR16, cadrage §7 Lot D « Logging structuré sur les cascades de prix ».
- Pas de nouvelle lib introduite — réutilisation de `console.log/error` avec `JSON.stringify`. Une éventuelle migration vers `pino` / `winston` reste hors scope MVP.
- Effort estimé : ~0.5 j-h dev.

### Story 5.4: Soft-delete renforcé sur les apprenants liés à une session terminée + tests RLS automatisés

As a developer (et indirectement Loris pour la conformité Qualiopi rétroactive),
I want the system to refuse hard-deletion of any learner enrolled in a closed session, and to have automated RLS tests covering both multi-tenant (`entity_id`) and multi-company (`client_id`) isolation,
So that evidence for the 10-year Qualiopi retention obligation is never accidentally lost, and isolation regressions are caught in CI before reaching prod.

**Acceptance Criteria:**

**Given** un apprenant a au moins un `enrollment` sur une session dont le statut est `completed`, `archived` ou équivalent,
**When** un admin tente de hard-delete cet apprenant via `ResumeDangerZone` ou tout autre point d'entrée,
**Then** l'action est bloquée côté applicatif avec un message explicite (« cet apprenant est lié à une formation terminée, suppression impossible — utilisez l'archivage »),
**And** le hard-delete est également bloqué côté base via un trigger ou une contrainte (défense en profondeur),
**And** une voie alternative est proposée : statut `archived` ou champ `deleted_at` (soft-delete) qui masque l'apprenant dans les listes courantes mais conserve la donnée pour Qualiopi.

**Given** un apprenant n'a aucun `enrollment` ou uniquement des enrollments sur des sessions non terminées,
**When** un admin tente de le supprimer,
**Then** la suppression dure est permise (cas standard, RGPD compatible),
**And** une confirmation explicite est demandée (`ResumeDangerZone` existant).

**Given** des tests RLS automatisés doivent couvrir le double isolement,
**When** une suite de tests est mise en place (Vitest, Playwright ou approche manuelle scriptée — à arbitrer),
**Then** les tests vérifient au minimum :
- un user `admin` de MR ne peut lire aucune ligne dont `entity_id` = C3V (NFR-SEC-1),
- un user `client` rattaché à Acme ne peut lire aucune ligne dont `client_id` = Béta sur une session INTER partagée (NFR-SEC-2),
- un user `trainer` ne voit que ses sessions (FR51),
**And** les tests tournent automatiquement en CI ou sont exécutés manuellement avant chaque release MVP (AR25, AR26).

**Given** la story est livrée,
**When** Loris exécute la procédure de danger zone sur un apprenant historique lié à une session Qualiopi auditée,
**Then** l'action est bloquée avec un message clair,
**And** Loris peut archiver l'apprenant proprement sans perdre la trace pour audit.

**Given** la story est livrée,
**When** un audit code est exécuté,
**Then** la règle absolue n°10 (`CLAUDE.md`) est respectée pour les mutations introduites (passage par services),
**And** le `CLAUDE.md` est complété pour documenter la règle « pas de hard-delete sur learners session-linked ».

**Notes techniques (hors AC) :**
- Lié à FR20 (renforcé), FR55, NFR-SEC-1, NFR-SEC-2, NFR-SEC-3, AR25, AR26.
- Tests RLS : choix outillage à arbitrer (Vitest avec client Supabase de test, ou Playwright e2e, ou scripts SQL côté Supabase — préférence : scripts SQL idempotents lancés manuellement pré-release pour rester léger).
- Effort estimé : ~0.5 j-h dev + 0.25 j-h tests scriptés.

## Récapitulatif global

| Epic | Stories | Effort dev | Effort QA | Phase |
|---|---|---|---|---|
| Epic 1 — Décommissionnement `sessions.client_id` | 2 | ~1.5 j-h | ~0.25 j-h | MVP (story de tête) |
| Epic 2 — Sources de vérité prix/heures | 3 | ~3.5 j-h | ~0.75 j-h | MVP (Lot A) |
| Epic 3 — Multi-entreprises uniforme | 7 | ~4.25 j-h | ~1 j-h | MVP (Lot B) |
| Epic 4 — Cleanup et consolidation | 3 | ~2.5 j-h | ~0.5 j-h | Growth (Lot C) |
| Epic 5 — Qualité & observabilité | 4 | ~2.75 j-h | ~0.5 j-h | Quality (Lot D) |
| **Total** | **19 stories** | **~14.5 j-h** | **~3 j-h** | **~17.5 j-h total** |

Aligné avec l'estimation du cadrage v1.1 §8 (17 j-h).
