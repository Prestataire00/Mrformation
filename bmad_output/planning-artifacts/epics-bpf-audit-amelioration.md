---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
inputDocuments:
  - bmad_output/planning-artifacts/prd-bpf-audit-amelioration.md
  - bmad_output/planning-artifacts/architecture.md
---

# Audit & Amélioration Page BPF - Epic Breakdown

## Overview

Ce document décompose les requirements du PRD BPF en 3 epics et 17 stories implémentables pour fiabiliser et compléter la page BPF de la plateforme MR/C3V Formation.

## Requirements Inventory

### Functional Requirements

- FR1: Audit bout en bout de chaque pipeline (Supabase → calcul → affichage)
- FR2: Section C calculée automatiquement depuis devis acceptés, ventilés par bpf_funding_type
- FR3: Section D calculée depuis taux horaires formateurs × heures sessions
- FR4: Section E (formateurs internes/externes) depuis `trainers` et `formation_trainers`
- FR5: Section F1 (stagiaires par statut) depuis `learners.learner_type` avec dé-duplication
- FR6: Section F3 (objectifs BPF) depuis `trainings.bpf_objective` avec fallback `classification`
- FR7: Section F4 (spécialités NSF) depuis `trainings.nsf_code`
- FR8: Section F2 (sous-traitance) alimentée depuis section G
- FR9: Section A dynamique depuis table `entities`
- FR10: Section H (dirigeant) depuis `entities`
- FR11: Badge cohérence F1=F3=F4 avec détail écarts
- FR12: Filtre exercice comptable avec validation dateFrom ≤ dateTo
- FR13: Score complétude global (%) avec nombre d'actions correctives
- FR14: Lien direct vers page de correction pour chaque vérification
- FR15: Alertes quand données critiques manquent
- FR16: Rafraîchissement calculs après correction données sources
- FR17: Classification IA par lot pour apprenants sans `learner_type`
- FR18: Classification IA par lot pour formations sans `bpf_objective`
- FR19: Classification IA par lot pour formations sans `nsf_code`
- FR20: Revoir chaque suggestion IA individuellement
- FR21: Appliquer ou rejeter chaque suggestion IA indépendamment
- FR22: Export PDF conforme au Cerfa
- FR23: Export Excel toutes sections
- FR24: Indicateur chargement pendant exports
- FR25: Saisie manuelle section G
- FR26: KPI synthétiques calculés automatiquement
- FR27: Comparaison N-1 avec évolution en pourcentage
- FR28: Toast explicite pour chaque erreur Supabase ou API
- FR29: Message actionnable quand API classification IA indisponible

### NonFunctional Requirements

- NFR1: Chargement initial < 5 secondes
- NFR2: Rafraîchissement < 3 secondes
- NFR3: Classification IA par lot < 15 secondes
- NFR4: Export PDF/Excel < 10 secondes
- NFR5: 100% requêtes filtrent par entity_id
- NFR6: Accès restreint admin/super_admin (middleware + RLS)
- NFR7: Échappement anti-injection prompt pour API Claude
- NFR8: Clé API Anthropic côté serveur uniquement
- NFR9: Aucun catch vide — erreur loguée ET affichée
- NFR10: Calculs déterministes
- NFR11: Loading state pendant chaque requête async
- NFR12: Chaque pipeline couvert par test Vitest
- NFR13: Couverture test bpf-calculator.ts ≥ 90%
- NFR14: Règle cohérence F1=F3=F4 couverte par test dédié

### Additional Requirements

- Pas de starter template (brownfield)
- Architecture existante conservée (BPFForm.tsx + 11 sous-composants + bpf-calculator.ts)
- Migration DB légère si `entities` manque de colonnes (SIRET, NAF, dirigeant)
- Pas de refactoring massif

### UX Design Requirements

- Aucun document UX spécifique. Design existant shadcn/ui conservé.

### FR Coverage Map

| FR | Epic | Description |
|----|------|-------------|
| FR1 | Epic 1 | Audit bout en bout pipelines |
| FR2 | Epic 1 | Section C (produits financiers) |
| FR3 | Epic 1 | Section D (charges) |
| FR4 | Epic 1 | Section E (formateurs) |
| FR5 | Epic 1 | Section F1 (stagiaires par statut) |
| FR6 | Epic 1 | Section F3 (objectifs BPF) |
| FR7 | Epic 1 | Section F4 (spécialités NSF) |
| FR8 | Epic 1 | Section F2 (sous-traitance) |
| FR9 | Epic 2 | Section A dynamique |
| FR10 | Epic 2 | Section H (dirigeant) |
| FR11 | Epic 2 | Badge cohérence F1=F3=F4 |
| FR12 | Epic 2 | Filtre exercice comptable |
| FR13 | Epic 2 | Score complétude |
| FR14 | Epic 2 | Liens correctifs |
| FR15 | Epic 2 | Alertes données manquantes |
| FR16 | Epic 1 | Rafraîchissement après correction |
| FR17 | Epic 3 | Classification IA learner_type |
| FR18 | Epic 3 | Classification IA bpf_objective |
| FR19 | Epic 3 | Classification IA nsf_code |
| FR20 | Epic 3 | Review suggestions individuellement |
| FR21 | Epic 3 | Appliquer/rejeter individuellement |
| FR22 | Epic 3 | Export PDF |
| FR23 | Epic 3 | Export Excel |
| FR24 | Epic 3 | Loading export |
| FR25 | Epic 3 | Saisie section G |
| FR26 | Epic 3 | KPI synthétiques |
| FR27 | Epic 3 | Comparaison N-1 |
| FR28 | Epic 1 | Toasts erreurs explicites |
| FR29 | Epic 3 | Message IA indisponible |

## Epic List

### Epic 1 : Fiabilisation des pipelines de données BPF

L'admin peut voir des chiffres BPF corrects et vérifiés pour chaque section (C, D, E, F1, F2, F3, F4), avec gestion d'erreurs explicite sur chaque requête.

**FRs couverts :** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR16, FR28
**NFRs couverts :** NFR5, NFR9, NFR10, NFR12, NFR13, NFR14

### Epic 2 : Conformité Cerfa et guidage admin

L'admin dispose d'une page BPF conforme au Cerfa officiel (sections A-H complètes), avec un score de complétude, des liens correctifs actionnables, et un badge de cohérence F1=F3=F4.

**FRs couverts :** FR9, FR10, FR11, FR12, FR13, FR14, FR15
**NFRs couverts :** NFR6, NFR11

### Epic 3 : Classification IA améliorée et exports fiables

L'admin peut classifier les données manquantes via l'IA avec sélection individuelle des suggestions, puis exporter un BPF fiable en PDF/Excel avec KPI et comparaison N-1.

**FRs couverts :** FR17, FR18, FR19, FR20, FR21, FR22, FR23, FR24, FR25, FR26, FR27, FR29
**NFRs couverts :** NFR1, NFR2, NFR3, NFR4, NFR7, NFR8

---

## Epic 1 : Fiabilisation des pipelines de données BPF

L'admin peut voir des chiffres BPF corrects et vérifiés pour chaque section (C, D, E, F1, F2, F3, F4), avec gestion d'erreurs explicite sur chaque requête.

### Story 1.1 : Audit et fix du pipeline Section C (produits financiers)

As a admin,
I want voir les produits financiers calculés correctement depuis les devis acceptés,
So that les montants de la section C correspondent à ma comptabilité.

**Acceptance Criteria:**

**Given** des devis avec statut "accepted" existent pour l'entité active sur la période
**When** la page BPF charge
**Then** la section C affiche les montants ventilés par type de financement BPF (lignes 1-11)
**And** chaque requête filtre par `entity_id` et par période (dateFrom/dateTo)
**And** les montants sont en HT
**And** un test Vitest vérifie `computeSectionC()` avec un jeu de données de référence

### Story 1.2 : Audit et fix du pipeline Section D (charges)

As a admin,
I want voir les charges calculées correctement depuis les taux horaires formateurs,
So that la section D reflète les coûts réels de formation.

**Acceptance Criteria:**

**Given** des `formation_trainers` sont liés aux sessions de l'entité active
**When** la page BPF charge
**Then** la section D affiche total charges, salaires formateurs internes, achats prestations externes
**And** le calcul utilise `hourly_rate × duration_hours` par session
**And** un test Vitest vérifie `computeSectionD()` avec formateurs internes et externes

### Story 1.3 : Audit et fix du pipeline Section E (formateurs)

As a admin,
I want voir le nombre et les heures de mes formateurs internes et externes,
So that la section E du BPF est correcte.

**Acceptance Criteria:**

**Given** des formateurs internes et externes existent pour l'entité
**When** la page BPF charge
**Then** la section E affiche le nombre et heures pour chaque type
**And** le comptage des formateurs utilise la table `trainers` filtrée par `entity_id`
**And** les heures sont calculées depuis les sessions filtrées par date
**And** en cas d'erreur Supabase, un toast s'affiche (pas de catch vide)

### Story 1.4 : Audit et fix du pipeline Section F1 (stagiaires par statut)

As a admin,
I want voir la répartition de mes stagiaires par statut (salarié, apprenti, demandeur d'emploi, particulier, autre),
So that la section F1 est conforme au Cerfa.

**Acceptance Criteria:**

**Given** des enrollments existent pour les sessions de l'entité
**When** la page BPF charge
**Then** la section F1 affiche stagiaires et heures par catégorie
**And** les apprenants sont dé-dupliqués par `learner_id` (un apprenant multi-sessions = 1 seul comptage)
**And** le fallback fonctionne : si `learner_type` est null, salarié si `client_id` existe, particulier sinon
**And** la ligne "dont à distance" compte les apprenants en sessions distanciel/hybride
**And** un test Vitest vérifie la dé-duplication et le fallback

### Story 1.5 : Audit et fix du pipeline Section F3 (objectifs BPF)

As a admin,
I want voir la répartition par objectif BPF (RNCP, certifications, autres formations, bilans, VAE),
So that la section F3 est conforme au Cerfa.

**Acceptance Criteria:**

**Given** des formations avec `bpf_objective` renseigné existent
**When** la page BPF charge
**Then** la section F3 affiche stagiaires et heures par objectif avec sous-niveaux RNCP
**And** les sous-niveaux RNCP (6-8, 5, 4, 3, 2, CQP) s'agrègent dans la ligne parent (a)
**And** le fallback `classification → bpf_objective` fonctionne (certifiant→RNCP, réglementaire→RS, autre→autres formations)
**And** un test Vitest vérifie `getF3Index()` et l'agrégation RNCP

### Story 1.6 : Audit et fix du pipeline Section F4 (spécialités NSF)

As a admin,
I want voir les principales spécialités de formation par code NSF,
So that la section F4 est conforme au Cerfa.

**Acceptance Criteria:**

**Given** des formations avec `nsf_code` renseigné existent
**When** la page BPF charge
**Then** la section F4 affiche code NSF, libellé, stagiaires et heures
**And** les formations sans `nsf_code` affichent un empty state avec message explicatif
**And** en cas d'erreur, un toast s'affiche

### Story 1.7 : Gestion d'erreurs globale et rafraîchissement

As a admin,
I want recevoir un feedback explicite pour chaque erreur et pouvoir rafraîchir les données,
So that je comprends les problèmes et je peux les résoudre.

**Acceptance Criteria:**

**Given** une erreur Supabase ou réseau survient pendant le chargement BPF
**When** le fetch échoue sur n'importe quelle section
**Then** un toast avec le message d'erreur s'affiche (plus de catch vide)
**And** le `console.error` est conservé pour le debug
**And** le bouton "Filtrer" / rafraîchissement recharge toutes les données
**And** un loading state est affiché pendant le rechargement
**And** tous les catch vides existants dans `BPFForm.tsx` et `SectionE.tsx` sont remplacés

---

## Epic 2 : Conformité Cerfa et guidage admin

L'admin dispose d'une page BPF conforme au Cerfa officiel (sections A-H complètes), avec un score de complétude, des liens correctifs actionnables, et un badge de cohérence F1=F3=F4.

### Story 2.1 : Section A dynamique depuis table `entities`

As a admin,
I want voir les informations de mon organisme (raison sociale, SIRET, NAF, adresse) chargées automatiquement,
So that la section A n'est plus hardcodée et reflète les données réelles de mon entité.

**Acceptance Criteria:**

**Given** l'entité active a des données dans la table `entities`
**When** la page BPF charge
**Then** la section A affiche raison sociale, SIRET, code NAF, adresse depuis `entities`
**And** la requête filtre par `entity_id`
**And** si des colonnes manquent dans `entities` (SIRET, NAF, adresse), une migration légère les ajoute
**And** si les données sont vides, un message invite l'admin à compléter le profil entité
**And** en cas d'erreur, un toast s'affiche

### Story 2.2 : Section H — dirigeant

As a admin,
I want voir la section H (personne ayant qualité de dirigeant) sur la page BPF,
So that le formulaire Cerfa est complet (8/8 cadres).

**Acceptance Criteria:**

**Given** la table `entities` contient un champ représentant légal (ou équivalent)
**When** la page BPF charge
**Then** une section H s'affiche après la section G avec le nom du dirigeant
**And** si le champ dirigeant est vide, un message invite à le renseigner dans les paramètres entité
**And** le composant `SectionH.tsx` est créé et ajouté dans `src/components/bpf/`
**And** l'export dans `index.ts` est mis à jour

### Story 2.3 : Badge de cohérence F1=F3=F4

As a admin,
I want voir immédiatement si mes totaux F1, F3 et F4 sont cohérents,
So that je détecte les écarts avant d'exporter le BPF.

**Acceptance Criteria:**

**Given** les sections F1, F3 et F4 sont calculées
**When** la page BPF affiche les résultats
**Then** un badge vert s'affiche si `total_F1.stagiaires == total_F3.stagiaires == total_F4.stagiaires` ET `total_F1.heures == total_F3.heures == total_F4.heures`
**And** un badge rouge s'affiche si les totaux divergent, avec le détail : "F1 = X, F3 = Y, F4 = Z — écart de N"
**And** le badge est positionné avant les sections F pour être visible sans scroll
**And** un test Vitest vérifie les cas vert (égalité) et rouge (écart)

### Story 2.4 : Validation dates exercice comptable

As a admin,
I want que la sélection de la période d'exercice valide que la date de début précède la date de fin,
So that je ne génère pas un BPF sur une période incohérente.

**Acceptance Criteria:**

**Given** l'admin sélectionne des dates dans la section B
**When** dateFrom > dateTo
**Then** le bouton "Filtrer" est désactivé
**And** un message d'erreur s'affiche sous les champs de date : "La date de début doit précéder la date de fin"
**And** quand les dates sont corrigées, le message disparaît et le bouton se réactive

### Story 2.5 : Score de complétude et liens correctifs

As a admin,
I want voir un score de complétude global avec des liens pour corriger chaque donnée manquante,
So that je sais exactement quoi faire pour rendre mon BPF exportable.

**Acceptance Criteria:**

**Given** les vérifications de données sont calculées (sessions avec heures, formations avec objectif BPF, etc.)
**When** la page BPF affiche la section vérification
**Then** un score global s'affiche en haut : "X% prêt — N actions requises"
**And** chaque vérification en échec affiche un lien "Corriger →" pointant vers la page source (/admin/trainers, /admin/trainings, /admin/clients, /admin/crm)
**And** les liens s'ouvrent dans un nouvel onglet (target="_blank") pour que l'admin ne perde pas la page BPF
**And** les alertes contextuelles (0 stagiaire, 0 heure, 0 CA, pas de satisfaction) restent affichées avec icônes appropriées

---

## Epic 3 : Classification IA améliorée et exports fiables

L'admin peut classifier les données manquantes via l'IA avec sélection individuelle des suggestions, puis exporter un BPF fiable en PDF/Excel avec KPI et comparaison N-1.

### Story 3.1 : Sélection individuelle des suggestions IA

As a admin,
I want pouvoir accepter ou rejeter chaque suggestion IA individuellement,
So that je contrôle précisément quelles classifications sont appliquées à mes données.

**Acceptance Criteria:**

**Given** l'admin a lancé une classification IA et le dialog de suggestions s'affiche
**When** les suggestions sont listées
**Then** chaque suggestion a une checkbox ou un bouton accepter/rejeter individuel
**And** l'admin peut appliquer uniquement les suggestions sélectionnées (pas tout-ou-rien)
**And** les suggestions rejetées restent visibles mais marquées comme ignorées
**And** le compteur du bouton "Appliquer" reflète le nombre de suggestions sélectionnées
**And** après application, les données sont rafraîchies automatiquement

### Story 3.2 : Gestion erreurs classification IA

As a admin,
I want voir un message clair et actionnable quand la classification IA ne fonctionne pas,
So that je sais comment résoudre le problème ou classifier manuellement.

**Acceptance Criteria:**

**Given** l'admin clique sur "Classifier avec l'IA"
**When** l'API retourne une erreur 503 (clé manquante) ou 502 (erreur API Claude) ou réseau
**Then** un toast explicite s'affiche avec le type d'erreur et l'action à mener
**And** pour l'erreur 503 : "ANTHROPIC_API_KEY non configurée — contactez votre administrateur technique"
**And** pour l'erreur 502 : "Service IA temporairement indisponible — réessayez dans quelques minutes"
**And** le bouton "Classifier avec l'IA" revient à l'état normal (plus de spinner infini)
**And** quand tous les items sont déjà classifiés, un toast info s'affiche : "Toutes les données sont déjà renseignées"

### Story 3.3 : Loading state exports PDF et Excel

As a admin,
I want voir un indicateur de chargement pendant la génération des exports,
So that je sais que l'export est en cours et que je ne clique pas plusieurs fois.

**Acceptance Criteria:**

**Given** l'admin clique sur "Exporter PDF" ou "Exporter Excel"
**When** la génération est en cours
**Then** le bouton affiche un spinner et le texte "Génération en cours..."
**And** le bouton est désactivé pendant la génération (pas de double-clic)
**And** en cas d'erreur d'export, un toast s'affiche avec le message d'erreur
**And** après succès, le bouton revient à l'état normal

### Story 3.4 : Saisie et sauvegarde Section G

As a admin,
I want saisir et sauvegarder les données de formations sous-traitées (section G),
So that les formations confiées à d'autres organismes sont déclarées dans le BPF.

**Acceptance Criteria:**

**Given** l'admin est sur la page BPF
**When** il modifie les champs stagiaires et heures de la section G
**Then** les valeurs sont sauvegardées dans `bpf_financial_data` avec upsert (entity_id + fiscal_year)
**And** un toast de succès confirme la sauvegarde
**And** en cas d'erreur, un toast d'erreur s'affiche
**And** les valeurs sauvegardées sont rechargées correctement au prochain chargement de la page

### Story 3.5 : KPI synthétiques et comparaison N-1

As a admin,
I want voir les KPI de synthèse et pouvoir les comparer avec l'année précédente,
So that j'ai une vue d'ensemble de mon activité formation et de son évolution.

**Acceptance Criteria:**

**Given** les données BPF sont chargées pour l'exercice sélectionné
**When** la page BPF affiche les KPI
**Then** les 5 KPI (stagiaires, heures, actions, CA, satisfaction) sont calculés automatiquement
**And** le toggle "Comparer avec N-1" charge les données de l'exercice précédent
**And** l'évolution s'affiche en pourcentage avec indicateur visuel (▲ vert / ▼ rouge)
**And** si les données N-1 n'existent pas (0 sessions), le pourcentage ne s'affiche pas
**And** la satisfaction affiche "—" si aucun questionnaire n'est complété
**And** en cas d'erreur sur le chargement N-1, le toggle fonctionne quand même (données N-1 = null)
