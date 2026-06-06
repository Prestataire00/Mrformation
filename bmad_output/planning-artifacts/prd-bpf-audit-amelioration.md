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
status: complete
completedAt: 2026-06-06
releaseMode: phased
classification:
  projectType: saas_b2b
  domain: edtech
  complexity: high
  projectContext: brownfield
inputDocuments:
  - bmad_output/planning-artifacts/prd.md
  - bmad_output/planning-artifacts/2026-06-06-prd-resolution-ux-articulation-lms.md
  - bmad_output/planning-artifacts/epics-stories.md
  - src/components/BPFForm.tsx
  - src/components/bpf/types.ts
  - src/lib/bpf-calculator.ts
  - src/app/api/bpf/ai-classify/route.ts
workflowType: 'prd'
documentCounts:
  briefs: 1
  research: 0
  brainstorming: 0
  projectDocs: 6
---

# Product Requirements Document — Audit & Amélioration Page BPF

**Auteur :** Wissam
**Date :** 2026-06-06

## Executive Summary

La page BPF (Bilan Pédagogique et Financier) de la plateforme MR/C3V Formation permet aux admin d'organismes de formation de générer leur déclaration annuelle obligatoire à la DREETS. La page existe avec la structure visuelle complète (sections A à G, KPI, exports PDF/Excel, classification IA) mais souffre de trois problèmes critiques :

1. **Branchements données non fiables** — Les pipelines de données (Supabase → calcul → UI) n'ont jamais été audités systématiquement. Les calculs affichent potentiellement des valeurs incorrectes ou nulles.
2. **Fonctionnalités manquantes vs Cerfa officiel** — Il manque la section H (dirigeant), la vérification de cohérence croisée (F1=F3=F4), et un workflow guidé.
3. **Données sources introuvables** — L'admin voit une alerte pour une donnée manquante mais n'a pas de chemin direct pour la corriger à la source.

**Objectif :** Transformer cette page en un **assistant de déclaration BPF fiable** — branchements vérifiés, calculs exacts, données manquantes identifiées et corrigeables en un clic, conformité totale au Cerfa.

### Ce Qui Rend Ça Spécial

La plateforme possède déjà 80% des données nécessaires au BPF. Aucun concurrent LMS français ne propose un BPF qui se **pré-remplit automatiquement** depuis les données plateforme, avec **classification IA** (Claude Haiku) pour les champs complexes et **vérification de cohérence intégrée** entre sections.

## Project Classification

- **Type :** SaaS B2B multi-tenant (2 entités MR/C3V Formation)
- **Domaine :** EdTech — formation professionnelle française, conformité Qualiopi/BPF/DREETS
- **Complexité :** Haute (overlay réglementaire BPF + multi-tenant entity_id + calculs financiers)
- **Contexte :** Brownfield — page existante avec 11 sous-composants, ~1000 lignes, à auditer et améliorer

## Success Criteria

### User Success

- L'admin voit immédiatement un **score de complétude** (ex: "72% prêt — 4 actions requises") avec actions listées par priorité.
- Chaque donnée manquante est accompagnée d'un **lien direct** vers la fiche à corriger.
- Après correction, un **rafraîchissement** met à jour les calculs en temps réel.
- La **vérification de cohérence F1=F3=F4** affiche un badge vert/rouge avec détail des écarts.
- L'admin exporte un BPF complet et fiable en **< 15 minutes**.

### Business Success

- **100% des sections Cerfa couvertes** (A à H).
- **0 erreur de calcul** signalée sur un exercice fiscal complet.
- **Adoption** : les 2 entités utilisent la page BPF pour leur déclaration 2026.

### Technical Success

- Chaque pipeline de données (DB → calcul → UI) est **couvert par un test**.
- Aucun `catch` vide — toute erreur remonte un toast.
- Filtre `entity_id` sur **100% des requêtes**.
- Requêtes Supabase avec `.select()` et colonnes explicites.

### Measurable Outcomes

| Métrique | Cible | Mesure |
|----------|-------|--------|
| Score complétude moyen | > 90% à la première ouverture | Calcul auto |
| Temps pour BPF exportable | < 15 min | Test utilisateur |
| Erreurs cohérence F1/F3/F4 | 0 après corrections | Badge auto |
| Couverture sections Cerfa | 8/8 (A-H) | Audit |
| Tests pipelines données | 100% sections couvertes | Vitest |

## User Journeys

### Journey 1 — Sophie, admin MR Formation : Déclaration BPF annuelle (happy path)

Sophie est administrative chez MR Formation. C'est fin avril, elle doit déposer le BPF avant le 31 mai.

**Opening :** Sophie ouvre `/admin/reports/bpf`. Score de complétude : "68% prêt — 5 actions requises". KPI : 127 stagiaires, 4 320 heures, 187 000 EUR CA. Bandeau cohérence F1/F3/F4 orange : "F1 = 127, F3 = 119 — écart de 8".

**Rising action :** Elle clique "12 apprenants sans type → Corriger", arrive sur la liste filtrée, corrige les types. Retour au BPF, rafraîchissement. Score passe à 78%. Elle lance la classification IA pour les objectifs BPF manquants, valide les suggestions.

**Climax :** Après 10 minutes, score à 100%. Badge F1=F3=F4 vert. Montants section C conformes à la comptabilité.

**Resolution :** Export PDF, recopie sur Mon Activité Formation. Déclaration déposée en 15 minutes au lieu de 3 heures.

### Journey 2 — Sophie, admin : Données absentes (edge case)

**Opening :** Première ouverture de l'année. Score : "12% prêt". Aucune formation n'a de `bpf_objective`, `nsf_code` renseigné. F3 et F4 vides.

**Rising action :** Alerte rouge : "38 formations sans objectif BPF". Clic "Classifier avec l'IA" → erreur 503 : "ANTHROPIC_API_KEY non configurée". Toast explicite avec action à mener.

**Climax :** Clé ajoutée par l'admin technique. Classification IA : 38 formations classifiées en 2 minutes.

**Resolution :** En 30 minutes, score passe de 12% à 95%. Les 5% restants : section G manuelle.

### Journey 3 — Karim, super_admin : Vérification cross-entité

**Opening :** Karim supervise MR + C3V. BPF MR exporté. Switch vers C3V.

**Rising action :** Section C à 0 EUR. Check "Devis acceptés : 0/0" en rouge.

**Climax :** Navigation CRM → devis en "draft" passés en "accepted". Retour BPF → montants corrects.

**Resolution :** 2 BPF exportés et déposés le même jour.

### Journey Requirements Summary

| Journey | Capacités révélées |
|---------|-------------------|
| Sophie happy path | Score complétude, liens correctifs, rafraîchissement, badge F1=F3=F4, export fiable |
| Sophie edge case | Gestion erreurs (toast), classification IA robuste, section G manuelle |
| Karim cross-entité | Filtre entity_id strict, switch entité, vérification 0-data, liens vers CRM |

## Domain-Specific Requirements

### Conformité & Réglementaire

- **BPF Cerfa n°12156*06** — Couverture des 8 cadres (A à H) avec libellés exacts du Cerfa.
- **Règle de cohérence DREETS** — `total_F1 == total_F3 == total_F4` (stagiaires et heures-stagiaires).
- **Exercice comptable clos** — Le BPF porte sur le dernier exercice clos, pas l'année civile courante.
- **Montants HT** — Données financières (sections C et D) déclarées hors taxes.
- **Déclaration obligatoire** — Même sans activité (article L6352-11). La page gère le cas "0 session".
- **Date limite** — Dépôt avant le 31 mai sur Mon Activité Formation.

### Contraintes Techniques

- **Multi-tenant strict** — Chaque requête Supabase filtre par `entity_id`. Aucune fuite cross-entité.
- **Calculs déterministes** — Un même jeu de données produit toujours les mêmes chiffres BPF.
- **Dé-duplication apprenants** — Comptage par `learner_id` unique, pas par `enrollment`.
- **Fallback classification** — Quand `bpf_objective` est null, fallback sur `classification` (à valider).

### Risques & Mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| `bpf_objective` massivement vides | F3/F4 vides → BPF inutilisable | Classification IA batch + liens correctifs |
| Erreur calcul financier non détectée | Déclaration fausse à la DREETS | Tests unitaires par section |
| entity_id manquant sur une requête | Fuite données cross-entité | Audit code + test RLS |
| API Claude indisponible | Classification IA bloquée | Fallback manuel |

## SaaS B2B Specific Requirements

### Tenant Model

- Chaque entité a son propre `entity_id` UUID. La page affiche **uniquement** les données de l'entité active (`useEntity()`).
- Les requêtes `enrollments` filtrent par `session_id IN (sessions de l'entité)` — à vérifier pour les sessions INTER partagées.
- La table `entities` fournit les données des sections A et H.

### RBAC Matrix

| Action | super_admin | admin | trainer | client | learner |
|--------|-------------|-------|---------|--------|---------|
| Voir page BPF | oui | oui | non | non | non |
| Exporter PDF/Excel | oui | oui | non | non | non |
| Lancer classification IA | oui | oui | non | non | non |
| Modifier section G | oui | oui | non | non | non |
| Voir BPF cross-entité | oui | non | non | non | non |

### Integration List

| Source | Table(s) | Section BPF | Pipeline |
|--------|----------|-------------|----------|
| Sessions + Trainings | `sessions`, `trainings` | E, F1, F3, F4 | Filtre entity_id + date → jointure trainings (heures/objectif/NSF) |
| Enrollments + Learners | `enrollments`, `learners` | F1, F3, F4 | Enrollments des sessions → learner_type, dé-duplication learner_id |
| Trainers | `trainers`, `formation_trainers` | E, D | Comptage internes/externes, calcul heures et coûts |
| Devis | `crm_quotes`, `clients`, `programs` | C | Devis acceptés → ventilation par bpf_funding_type |
| Satisfaction | `questionnaire_responses` | KPI | Moyenne ratings 1-5 |
| Entité | `entities` | A, H | SIRET, NAF, adresse, dirigeant |
| Données manuelles | `bpf_financial_data` | G | Formations sous-traitées (stagiaires, heures) |

### Implementation Considerations

- **Pas de refactoring massif** — Architecture existante conservée (BPFForm.tsx + 11 sous-composants + bpf-calculator.ts). Correction des branchements uniquement.
- **Tests section par section** — Chaque pipeline couvert dans `src/lib/__tests__/bpf-calculator.test.ts`.
- **Migration DB légère si nécessaire** — Uniquement si `entities` manque de colonnes (SIRET, NAF, adresse, dirigeant).

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**Approche :** Problem-solving — fiabiliser les branchements existants et combler les lacunes Cerfa pour la déclaration 2026.
**Ressources :** 1 dev solo (avec IA), ~2-3 semaines.

### MVP Feature Set (Phase 1)

**Journeys supportés :** Journey 1 intégralement, Journey 2 partiellement (erreurs + fallback IA), Journey 3 (entity_id).

| # | Capacité | Justification |
|---|----------|---------------|
| M1 | Audit + fix pipelines données (C, D, E, F1, F3, F4) | Sans ça, les chiffres sont faux |
| M2 | Vérification cohérence F1=F3=F4 avec badge | Règle obligatoire DREETS |
| M3 | Section A dynamique (depuis `entities`) | Plus de données hardcodées |
| M4 | Section H (dirigeant) | Section Cerfa manquante |
| M5 | Liens correctifs actionnables | Corriger les données manquantes |
| M6 | Gestion erreurs (toasts, pas de catch vides) | Comprendre les erreurs |
| M7 | Score de complétude global | Savoir où on en est |

### Phase 2 (Growth)

- Workflow guidé pas-à-pas avec progression
- Historique BPF annuels (sauvegarde + comparaison)
- Classification IA étendue (bpf_funding_type)
- Export format DREETS (importable sur Mon Activité Formation)

### Phase 3 (Vision)

- Déclaration automatique via API Mon Activité Formation
- Tableau de bord Qualiopi intégré
- Multi-exercice (exercice décalé)

### Risk Mitigation

- **Technical :** Audit systématique section par section avec tests Vitest avant modification. Risque #1 = pipelines non testés.
- **Market :** Faible — BPF = obligation légale. Risque = ne pas être prêt pour le 31 mai.
- **Resource :** Prioriser M1 + M2 en premier (débloquent tout le reste).

## Functional Requirements

### Fiabilité des Données (Pipelines)

- **FR1 :** Chaque pipeline (requête Supabase → calcul → affichage) est vérifié par un audit bout en bout garantissant la correspondance avec les données réelles en base.
- **FR2 :** L'admin peut voir les produits financiers (section C) calculés automatiquement depuis les devis acceptés, ventilés par type de financement BPF.
- **FR3 :** L'admin peut voir les charges (section D) calculées depuis les taux horaires formateurs × heures sessions.
- **FR4 :** L'admin peut voir le nombre et heures des formateurs internes/externes (section E) depuis `trainers` et `formation_trainers`.
- **FR5 :** L'admin peut voir la répartition stagiaires par statut (section F1) depuis `learners.learner_type` avec dé-duplication par `learner_id`.
- **FR6 :** L'admin peut voir la répartition par objectif BPF (section F3) depuis `trainings.bpf_objective` avec fallback sur `classification`.
- **FR7 :** L'admin peut voir les spécialités NSF (section F4) depuis `trainings.nsf_code`.
- **FR8 :** L'admin peut voir les formations sous-traitées (section F2) alimentées depuis section G.

### Conformité Cerfa

- **FR9 :** L'admin peut voir l'identification organisme (section A) depuis la table `entities` (raison sociale, SIRET, NAF, adresse).
- **FR10 :** L'admin peut voir la section dirigeant (section H) avec le représentant légal depuis `entities`.
- **FR11 :** L'admin peut voir un badge de cohérence F1=F3=F4 avec détail des écarts.
- **FR12 :** L'admin peut filtrer par période d'exercice comptable (section B) avec validation dateFrom ≤ dateTo.

### Complétude & Guidage

- **FR13 :** L'admin peut voir un score de complétude global (%) avec nombre d'actions correctives.
- **FR14 :** L'admin peut voir pour chaque vérification un lien direct vers la page de correction.
- **FR15 :** L'admin peut voir des alertes quand des données critiques manquent (0 stagiaire, 0 heure, 0 CA).
- **FR16 :** L'admin peut rafraîchir les calculs BPF après correction de données sources.

### Classification IA

- **FR17 :** L'admin peut lancer une classification IA par lot pour les apprenants sans `learner_type`.
- **FR18 :** L'admin peut lancer une classification IA par lot pour les formations sans `bpf_objective`.
- **FR19 :** L'admin peut lancer une classification IA par lot pour les formations sans `nsf_code`.
- **FR20 :** L'admin peut revoir chaque suggestion IA individuellement avant application.
- **FR21 :** L'admin peut appliquer ou rejeter chaque suggestion IA indépendamment.

### Exports

- **FR22 :** L'admin peut exporter le BPF en PDF avec structure conforme au Cerfa.
- **FR23 :** L'admin peut exporter le BPF en Excel avec toutes les sections.
- **FR24 :** L'admin peut voir un indicateur de chargement pendant la génération des exports.

### Saisie Manuelle

- **FR25 :** L'admin peut saisir et sauvegarder les données section G (formations sous-traitées).

### KPI & Comparaison

- **FR26 :** L'admin peut voir les KPI synthétiques (stagiaires, heures, actions, CA, satisfaction) calculés automatiquement.
- **FR27 :** L'admin peut activer une comparaison N-1 avec évolution en pourcentage.

### Gestion d'Erreurs

- **FR28 :** L'admin reçoit un toast explicite pour chaque erreur Supabase ou API.
- **FR29 :** L'admin peut voir un message actionnable quand l'API de classification IA est indisponible.

## Non-Functional Requirements

### Performance

- **NFR1 :** Chargement initial page BPF < 5 secondes (inclut 8+ requêtes Supabase).
- **NFR2 :** Rafraîchissement après correction < 3 secondes.
- **NFR3 :** Classification IA par lot (≤ 30 items) < 15 secondes.
- **NFR4 :** Export PDF/Excel < 10 secondes.

### Sécurité

- **NFR5 :** 100% des requêtes Supabase filtrent par `entity_id`.
- **NFR6 :** Accès page BPF restreint aux rôles `admin` et `super_admin` (middleware + RLS).
- **NFR7 :** Données envoyées à l'API Claude échappées contre injection de prompt (`escapeForPrompt` + `PROMPT_INJECTION_GUARDRAIL`).
- **NFR8 :** Clé API Anthropic côté serveur uniquement (variable d'environnement).

### Fiabilité

- **NFR9 :** Aucun `catch` vide — toute erreur loguée ET affichée (toast).
- **NFR10 :** Calculs déterministes — même données = mêmes résultats.
- **NFR11 :** État de chargement (skeleton/spinner) pendant chaque requête async.

### Testabilité

- **NFR12 :** Chaque pipeline (C, D, E, F1, F3, F4) couvert par un test Vitest.
- **NFR13 :** Couverture test `bpf-calculator.ts` ≥ 90%.
- **NFR14 :** Règle cohérence F1=F3=F4 couverte par test dédié.
