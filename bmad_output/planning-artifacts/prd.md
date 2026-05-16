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
status: complete
completedAt: 2026-05-13
inputDocuments:
  - bmad_output/planning-artifacts/cadrage-module-formations.md
  - docs/TIMEZONE.md
  - CLAUDE.md
workflowType: 'prd'
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 0
  cadrage: 1
  projectDocs: 2
classification:
  projectType: saas_b2b
  domain: edtech
  domainVariant: "fr-qualiopi-bpf"
  complexity: high
  projectContext: brownfield
  scope: "Refonte de stabilisation + cohérence multi-entreprises du module Formations"
---

# Product Requirements Document — Refonte du module Formations (MR / C3V Formation)

**Author:** Wissam
**Date:** 2026-05-13
**Module concerné :** Formations (cœur produit MR / C3V Formation)
**Source :** Cadrage Business Analyst v1.1 (2026-05-13) — `cadrage-module-formations.md`

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Project Classification](#project-classification)
3. [Success Criteria](#success-criteria)
4. [Product Scope](#product-scope)
5. [User Journeys](#user-journeys)
6. [Domain-Specific Requirements](#domain-specific-requirements)
7. [SaaS B2B Specific Requirements](#saas-b2b-specific-requirements)
8. [Project Scoping & Phased Development](#project-scoping--phased-development)
9. [Functional Requirements](#functional-requirements) — FR1 à FR55, capability contract
10. [Non-Functional Requirements](#non-functional-requirements)
11. [Traceability Matrix](#traceability-matrix)

## Executive Summary

Le module **Formations** est le cœur produit de la plateforme MR / C3V Formation — un SaaS B2B EdTech opéré en France pour des organismes de formation soumis à la conformité Qualiopi et au reporting BPF. La plateforme dessert aujourd'hui 2 entités (MR Formation, C3V Formation) ; l'architecture multi-tenant (`entity_id` + RLS Supabase) est en place pour accueillir d'autres OFs comme tenants à horizon 6-12 mois.

Le module gère l'intégralité du cycle de vie d'une formation professionnelle : création de session, rattachement d'entreprises clientes, inscription d'apprenants, planification de créneaux, génération de documents légaux (convention de formation, feuille d'émargement signée, attestation), questionnaires d'évaluation et de satisfaction, facturation multi-destinataires (apprenant / entreprise / financeur OPCO/CPF), et reporting Qualiopi.

Le workflow **multi-entreprises** est central : environ **30-40 % des formations sont INTER** (plusieurs entreprises clientes sur une même session), faisant de ce cas d'usage un quotidien et non un cas marginal. Aujourd'hui, ce workflow est partiellement câblé — seuls 3 onglets sur 10 traitent correctement la pluralité d'entreprises, ce qui crée les incohérences que l'utilisateur principal (Loris, gérant) remonte régulièrement : *« Les données ne se mettent pas bien, c'est compliqué, rien n'est fluide. »*

Ce PRD couvre la **refonte de stabilisation** du module Formations : décommissionnement de la colonne legacy `sessions.client_id` au profit de `formation_companies`, unification des sources de vérité pour le prix et les heures, propagation cohérente du multi-entreprises sur tous les onglets, suppression du code mort (`TabEvaluation`, `TabSatisfaction`, champs `time_*` e-learning), et consolidation de 10 onglets en 7-8.

**Prérequis stratégique** : sans cette stabilisation, l'onboarding d'autres OFs comme tenants est bloqué — la dette technique actuelle se diffuserait à chaque nouveau client.

### What Makes This Special

**Insight produit** : les LMS internationaux (Moodle, TalentLMS, etc.) gèrent mal voire pas du tout les contraintes françaises de la formation professionnelle — Qualiopi, BPF, valeur légale des conventions et émargements, financement OPCO/CPF. Les concurrents français (Digiforma, Dendreo) traitent ces contraintes mais avec des workflows lourds et un multi-entreprises peu fluide. La promesse de MR/C3V Formation est de **traiter nativement le multi-entreprises INTRA/INTER avec la même fluidité d'usage**, tout en restant nativement conforme Qualiopi/BPF.

**Différenciateur après refonte** : Loris (et les futurs tenants) doit pouvoir gérer une formation INTER à 3 entreprises — création, 3 conventions, 3 feuilles d'émargement, 3 factures — en quelques minutes, avec un seul modèle mental, sans bascule de mode, sans onglet qui « casse » en multi-entreprises.

**Core value proposition** : *« Le seul LMS-CRM qui traite le multi-entreprises Qualiopi sans concession sur la fluidité d'usage. »* Cette proposition est à la fois le prérequis opérationnel pour Loris (sans Qualiopi, pas d'activité OF en France) et le futur argument commercial pour acquérir d'autres OFs comme clients SaaS.

## Project Classification

| Dimension | Valeur |
|---|---|
| **Project Type** | SaaS B2B (multi-tenant, RBAC à 5 rôles, RLS Supabase) |
| **Domain** | EdTech — variante française (Qualiopi + BPF + valeur légale conventions/émargements) |
| **Complexity** | High (multi-tenant strict, PDF légaux, multi-entreprises INTRA/INTER, intégrations Resend/Gmail OAuth, automation rules, conformité Qualiopi) |
| **Project Context** | Brownfield — système en production sur Netlify (~30 tables Supabase, 33 fichiers pour le module Formations), refonte de stabilisation |
| **Scope du PRD** | Refonte de stabilisation + cohérence multi-entreprises du module Formations, sur la base du cadrage validé v1.1 (2026-05-13) |

## Success Criteria

### User Success

L'utilisateur principal (Loris, gérant MR Formation) doit pouvoir :

1. **Créer et livrer une formation INTER à 3 entreprises (création de session → 3 conventions signées → 3 feuilles d'émargement → 3 factures envoyées) en moins de 10 minutes**, contre 30 à 45 minutes aujourd'hui. Mesure : chronométrage manuel sur 5 formations INTER post-livraison.
2. **Ne plus rencontrer de désynchronisation visible entre onglets** : un apprenant ajouté dans `ResumeLearners` doit apparaître immédiatement dans `TabEmargements`, `TabFinances`, et `TabConventionDocs` sans manipulation supplémentaire. Mesure : zéro ticket support type *« données pas cohérentes »* sur 1 mois glissant.
3. **Comprendre d'où vient chaque chiffre affiché** (prix, heures, montant par entreprise) : un badge visuel signale clairement « calculé » vs « saisi manuellement / override ». Mesure : test utilisabilité avec Loris — il sait expliquer chaque valeur du tableau de bord finances sans relire la doc.
4. **Distinguer visuellement INTRA et INTER dès l'arrivée sur la page formation** : un badge en tête de page + des comportements UI cohérents. Mesure : Loris identifie le type de formation en moins de 2 secondes lors d'un test usabilité.

### Business Success

1. **Onboarding du 3ème tenant SaaS débloqué** : la stabilisation est le verrou. Mesure : signature d'au moins 1 nouveau tenant client (au-delà de MR et C3V) dans les 6 mois post-livraison.
2. **Réduction du temps support de Loris** : moins de temps perdu à diagnostiquer « pourquoi ça marche pas » → plus de temps commercial. Mesure : interview Loris à J+30 sur sa perception du temps perdu hebdomadaire (cible : passer de ~5h/sem à <1h/sem).
3. **Vélocité de livraison de nouvelles fonctionnalités restaurée** : aujourd'hui chaque nouvelle feature creuse la dette. Mesure : à J+60 post-livraison, le ratio « lignes de code feature / lignes de code patch dette » doit s'inverser sur les commits du dossier `src/app/(dashboard)/admin/formations/`.

### Technical Success

1. **Zéro lecture de `sessions.client_id`** dans le code source. Mesure : `grep -r "sessions.client_id\|\.client_id" src/app src/lib | grep -v formation_companies` doit retourner 0 résultat (hors lignes commentées).
2. **Zéro duplication de prix / heures non documentée** : chaque source de vérité a un override explicite, chaque override est tracé en base avec timestamp. Mesure : revue de schéma + audit des mutations sur 100 sessions de test.
3. **Multi-entreprises cohérent sur 10 onglets sur 10** : tous les onglets qui itèrent sur des apprenants utilisent `getLearnersForCompany`. Mesure : grep du helper dans tous les `Tab*.tsx` impactés, plus tests manuels Loris.
4. **Conformité Qualiopi préservée** : aucune régression sur la génération de conventions, feuilles d'émargement, attestations, scores Qualiopi. Mesure : checklist Qualiopi 8 items passée sur 5 sessions de test pré-livraison.
5. **RLS multi-tenant intacte** : les données MR ne fuitent jamais vers C3V. Mesure : tests RLS automatisés (1 user MR + 1 user C3V) qui doivent rester verts.

### Measurable Outcomes (synthèse)

| Métrique | Baseline (avant) | Cible (après) | Fenêtre |
|---|---|---|---|
| Temps de livraison formation INTER 3-entreprises | 30-45 min | < 10 min | Mesuré à J+15 post-livraison |
| Tickets support « données incohérentes » | ~3-5 / semaine | 0 / mois | Mois glissant post-livraison |
| Lectures de `sessions.client_id` dans le code | > 10 occurrences | 0 | Audit code à J+30 |
| Onglets cassés en multi-entreprises | 7 sur 10 | 0 sur 10 | Audit + tests Loris à J+15 |
| Conformité Qualiopi 8 items (5 sessions test) | non vérifié | 8/8 sur 5/5 sessions | Avant livraison prod |
| Tenants SaaS signés | 2 (MR, C3V) | ≥ 3 | À 6 mois post-livraison |

## Product Scope

### MVP — Minimum Viable Product

**Objectif** : livrer une plateforme **stable** et **cohérente** sur le module Formations. Pas de nouvelle feature visible utilisateur — seulement la suppression de la friction.

Périmètre MVP (correspond aux lots **Story de tête + A + B** du cadrage v1.1) :

- **Story de tête — US-4** : décommissionnement de `sessions.client_id` (backfill + audit code + drop colonne en 2 releases).
- **Lot A (parallèle B)** :
  - **US-2** — Source de vérité unique pour le prix (cascade `trainings → sessions → enrollments → factures draft`, badges « modifié » sur overrides).
  - **US-3** — Heures sans surprise (`computed_hours` + `override_hours` distincts, UI claire).
- **Lot B (parallèle A)** :
  - **US-1** — Émargement multi-entreprises (filtre par `client_id` + export segmenté).
  - **US-5** — Programme commun en INTER, note inline (décision validée).
  - **US-6** — Auto-fill facture intelligent en INTER (modal de choix, lookup par ID).

**Sortie MVP = plateforme stable, prête à supporter l'onboarding de nouveaux tenants.**

### Growth Features (Post-MVP)

Correspond aux lots **C et D** du cadrage :

- **Lot C — nettoyage code mort et consolidation onglets** :
  - **US-7** — Suppression `TabEvaluation` et `TabSatisfaction` (`@deprecated`).
  - **US-8** — Refonte disposition des onglets (10 → 7-8 : fusions Planning+Parcours, Conventions+DocsPartagés+Programme, etc.).
  - **US-9** — Suppression champs `time_*` e-learning (décision validée).
- **Lot D — qualité & observabilité** :
  - **US-10** — Table dédiée `formation_qualiopi_audits` (au lieu de JSON dans `notes`).
  - Service layer : extraction des mutations Supabase de `ResumeCompanies` et `ResumeLearners` vers `src/lib/services/` (conformité à la règle absolue n°10 du `CLAUDE.md`).
  - Logging structuré sur les cascades de prix.

### Vision (Future)

Hors périmètre PRD courant, mais à anticiper :

- **Onboarding tenant en self-service** : interface d'admin global pour créer un nouvel OF (entity_id, logo, paramètres Qualiopi/BPF).
- **Génération BPF assistée** : à partir des données de la plateforme, pré-remplissage du Bilan Pédagogique et Financier annuel des OFs.
- **Marketplace de formations inter-OFs** : un OF pourrait proposer une formation, un autre OF y inscrire ses apprenants.
- **Module mobile companion** pour formateurs (saisie présence + photo en salle).
- **API publique** pour intégrations OPCO/CPF (envoi automatique des conventions et émargements).
- **Audit Qualiopi assisté par IA** : générer un rapport de conformité prêt pour l'auditeur tiers (le `TabQualiopi` actuel a un embryon de cette fonction).

## User Journeys

### Persona 1 — Loris, gérant d'organisme de formation (rôle `admin` / `super_admin`)

**Backstory.** Loris dirige MR Formation. Il porte le commercial, l'opérationnel et la conformité Qualiopi. Il vit dans la plateforme 4-5 heures par jour. Aujourd'hui il y entre avec une boule au ventre : il sait qu'à un moment dans la journée, *quelque chose ne va pas marcher* et il devra contourner ou pinger Wissam.

#### Journey 1 — Livrer une formation INTER à 3 entreprises (happy path après refonte)

- **Scène d'ouverture.** Lundi 9h. Loris a une formation « Sécurité Incendie » prévue dans 10 jours, vendue à 3 entreprises clientes : Acme, Béta, Gamma. 6 apprenants au total (2 par entreprise). Il ouvre la plateforme.
- **Étape 1 — Création.** Il crée une nouvelle session depuis le catalogue `trainings` → « Sécurité Incendie ». Le prix se pré-remplit automatiquement depuis le catalogue (12 000 € HT). Un badge `Catalogue` est affiché à côté du prix.
- **Étape 2 — Rattachement des 3 entreprises.** Dans `ResumeCompanies`, il ajoute Acme, Béta, Gamma. Pour chaque entreprise, le montant est suggéré (4 000 € chacun = pro-rata) avec possibilité de surcharger. Loris ajuste Acme à 4 500 € et Béta à 4 000 € et Gamma à 3 500 €. Un compteur affiche en bas : `Total réparti : 12 000 € — OK ✓`.
- **Étape 3 — Inscription des apprenants.** Pour chaque entreprise, il ajoute ses 2 apprenants. La sélection d'entreprise est obligatoire (3 entreprises rattachées). Aucun apprenant n'est orphelin.
- **Étape 4 — Planning.** Il crée 2 créneaux de 7h (vendredi puis lundi suivant). `sessions.computed_hours = 14h` automatiquement. Pas besoin de saisir.
- **Étape 5 — Conventions.** Il bascule sur l'onglet « Documents ». 3 conventions de formation sont pré-générées, une par entreprise. Chacune liste les 2 bons apprenants. Il les fige et les envoie en email. Les destinataires reçoivent un lien signature.
- **Étape 6 — Émargement (jour J).** Pendant la formation, Loris ouvre le mode « Émargement live ». Il choisit l'entreprise dans un filtre → la liste affiche 2 apprenants. Il projette le QR code. À la fin, il exporte **3 PDF d'émargement**, un par entreprise, propre pour chaque client.
- **Étape 7 — Facturation.** Il crée une facture. La plateforme demande : *« À quelle entreprise facturez-vous ? »*. Il choisit Acme dans la liste (par ID, pas par nom). Les lignes sont auto-remplies depuis le montant Acme (4 500 €). Il répète pour Béta et Gamma.
- **Climax.** Tout en moins de 10 minutes pour les étapes 1-4. Émargement 5 minutes. Facturation 3 minutes. **Total : ~15 minutes vs 45 minutes avant la refonte.**
- **Résolution.** Loris envoie un message à Wissam : *« Tout a marché du premier coup. »*

**Capacités révélées** : cascade automatique des prix avec override visible ; multi-entreprises uniforme dans tous les onglets ; validation cohérence apprenant ↔ entreprise (zéro orphelin) ; filtres / segmentation par entreprise dans émargement, factures, conventions ; notion `computed_hours` vs `override_hours` distincte et lisible.

#### Journey 2 — Reprendre une formation créée avant la migration (edge case)

- **Scène d'ouverture.** Loris ouvre une formation créée il y a 4 mois — du temps où la plateforme stockait l'entreprise dans `sessions.client_id` et non dans `formation_companies`.
- **Étape 1 — Découverte.** Il voit que l'entreprise rattachée est bien présente dans `ResumeCompanies`. Pas de bizarrerie visible.
- **Étape 2 — Vérification.** Il ajoute une 2ᵉ entreprise. La plateforme ne crashe pas, ne perd pas l'ancienne. Les 2 entreprises coexistent proprement.
- **Étape 3 — Émargement rétroactif.** Il exporte une feuille d'émargement pour la session passée (besoin Qualiopi audit). La feuille est segmentée par entreprise comme attendu.
- **Climax.** Le rétro-fitting des anciennes formations s'est passé silencieusement via la migration `backfill_formation_companies_from_legacy_client_id`.
- **Résolution.** Loris n'a rien à corriger manuellement. Pas de support requis.

**Capacités révélées** : migration de données sans rupture utilisateur ; backward compatibility transparente sur 100 % des formations historiques.

### Persona 2 — Karim, formateur (rôle `trainer`)

**Backstory.** Karim est formateur indépendant rattaché à MR Formation. Il anime 4-5 formations par mois. Il a besoin de voir son planning, signer ses émargements, et consulter les apprenants d'une session.

#### Journey 3 — Préparer et animer une session

- **Scène d'ouverture.** La veille de la formation, Karim ouvre la plateforme sur son téléphone.
- **Étape 1.** Il voit sa session « Sécurité Incendie » dans son planning.
- **Étape 2.** Il consulte la liste des apprenants. **Important** : même en formation INTER, la liste est unifiée pour lui — il n'a pas à choisir une entreprise. C'est Loris qui filtre côté admin, pas le formateur.
- **Étape 3.** Le jour J, il signe ses créneaux côté formateur (signature unique par formateur, indépendamment des entreprises).
- **Résolution.** Karim n'est pas impacté par la complexité multi-entreprises côté admin. Sa vue reste simple.

**Capacités révélées** : la complexité multi-entreprises reste **invisible** pour les rôles `trainer` et `learner` ; l'isolement par `entity_id` continue de filtrer correctement les sessions de Karim (il ne voit que MR, pas C3V).

### Persona 3 — Sophie, apprenante (rôle `learner`)

**Backstory.** Sophie est employée chez Acme. Sa RH l'a inscrite à la formation Sécurité Incendie via MR Formation. Elle ne sait même pas que la plateforme s'appelle MR Formation — pour elle, c'est juste un lien dans un email.

#### Journey 4 — Signer un émargement

- **Scène d'ouverture.** Pendant la formation, le formateur projette un QR code à l'écran.
- **Étape 1.** Sophie le scanne avec son téléphone. Page web simple : son nom, le créneau, un bouton « Signer ».
- **Étape 2.** Elle dessine sa signature, valide.
- **Étape 3.** Confirmation visuelle.
- **Résolution.** Aucune complexité multi-entreprises ne lui est exposée — elle est rattachée à Acme, point.

**Capacités révélées** : le `signing_token` doit être lié à l'apprenant ET au créneau ET au `client_id` (entreprise) pour que l'export segmenté côté Loris fonctionne.

### Persona 4 — Émilie, référente RH client (rôle `client`)

**Backstory.** Émilie est RH chez Acme. Elle a 2 collaborateurs inscrits à la formation Sécurité Incendie. Elle reçoit la convention pour signature, et veut suivre l'avancement.

#### Journey 5 — Consulter sa convention et l'avancement de ses apprenants

- **Scène d'ouverture.** Elle reçoit un email avec lien signature.
- **Étape 1.** Elle ouvre la convention — **seulement les 2 apprenants d'Acme** y figurent. Pas ceux de Béta ou Gamma (confidentialité commerciale).
- **Étape 2.** Elle signe électroniquement.
- **Étape 3.** Plus tard, elle se connecte à son portail client — elle voit la session, ses 2 apprenants, leur statut de présence (signé / non signé).
- **Climax / Capacité critique.** Émilie ne **doit jamais** voir les apprenants des autres entreprises. C'est un enjeu de confidentialité commerciale entre les 3 clients d'une formation INTER.
- **Résolution.** RLS Supabase + filtrage applicatif assurent cet isolement par `client_id`.

**Capacités révélées** : **sécurité critique** — isolement strict des données entre entreprises d'une même formation INTER (au-delà du multi-tenant déjà géré) ; portail client (existant, mais doit rester correct après la refonte).

### Persona 5 — Nathalie, auditrice Qualiopi externe (non-utilisatrice de la plateforme)

**Backstory.** Nathalie audite MR Formation tous les 3 ans pour renouveler la certification Qualiopi. Elle n'utilise pas la plateforme directement — elle reçoit des documents.

#### Journey 6 — Audit Qualiopi sur un échantillon de 5 formations

- **Scène d'ouverture.** Elle demande à Loris : *« Donnez-moi pour 5 sessions au hasard la convention signée, la feuille d'émargement, les évaluations, les attestations, et le bilan satisfaction. »*
- **Étape 1.** Loris exporte les documents depuis la plateforme. Pour les sessions INTER, il fournit 1 jeu de documents par entreprise.
- **Étape 2.** Nathalie vérifie : les conventions sont datées, signées, listent correctement les apprenants. Les feuilles d'émargement n'ont pas de mélange d'entreprises. Les évaluations couvrent bien tous les apprenants.
- **Résolution.** Audit passé sans réserve.

**Capacités révélées** : conformité Qualiopi 8 items présente et exportable pour chaque session ; aucune fuite inter-entreprises dans les documents légaux.

### Journey Requirements Summary

Synthèse des capacités produit révélées par les 6 journeys :

| Capacité | Journey(s) | Concerne le MVP ? |
|---|---|---|
| Cascade prix `trainings → sessions → enrollments → factures draft` avec overrides visibles | J1 (étapes 1-2, 7) | **Oui (US-2)** |
| Distinction `computed_hours` vs `override_hours` | J1 (étape 4) | **Oui (US-3)** |
| Multi-entreprises uniforme sur tous les onglets admin | J1 (toutes étapes), J2 | **Oui (US-1, US-4, US-5, US-6)** |
| Validation apprenant ↔ entreprise (zéro orphelin INTER) | J1 (étape 3) | **Oui (US-4 + helper)** |
| Export segmenté des émargements et conventions | J1 (étapes 5-6), J5, J6 | **Oui (US-1)** |
| Modal de choix destinataire facture INTER | J1 (étape 7) | **Oui (US-6)** |
| Migration silencieuse des données legacy | J2 | **Oui (story de tête US-4)** |
| Vue formateur unifiée (pas de filtre entreprise côté trainer) | J3 | Préservation (pas de régression) |
| `signing_token` lié à `client_id` pour l'export segmenté | J4 | **Oui (US-1)** |
| Isolement RLS apprenants entre entreprises d'une formation INTER (portail client) | J5 | Préservation + tests RLS |
| Conformité Qualiopi 8 items exportable | J6 | **Oui (success criterion technique)** |

**Constat** : tous les journeys du MVP convergent vers les **6 user stories de tête + lots A + B**. Aucun journey n'exige quelque chose qui ne serait pas dans le MVP. Bon signe de cohérence entre besoin et périmètre.

## Domain-Specific Requirements

### Compliance & Regulatory (France / formation professionnelle)

| Cadre | Impact direct sur le PRD |
|---|---|
| **Qualiopi** (loi Avenir Professionnel 2018, certification obligatoire des OFs depuis 2022 — 32 indicateurs sur 7 critères, audit tous les 18 mois) | Conventions, feuilles d'émargement, attestations, évaluations, satisfaction et programme pédagogique doivent être **générables, signés, archivables et exportables** pour chaque session — y compris rétroactivement pour l'échantillon d'audit. `TabQualiopi` doit refléter l'état réel sur les 8 items affichés. Aucune régression tolérée sur ce périmètre. |
| **BPF — Bilan Pédagogique et Financier** (déclaration annuelle à la DREETS) | Hors scope direct du PRD courant (couvert en Vision). Mais le **schéma de données doit rester exportable au format BPF** : volumes d'heures, nombre d'apprenants, chiffre d'affaires par catégorie de formation. La cohérence prix/heures (US-2, US-3) en est un prérequis. |
| **RGPD** | Apprenants = données personnelles (nom, email, parfois handicap). Conservation 10 ans pour les preuves d'activité OF. Droit à l'oubli à articuler avec l'obligation légale de conservation : **soft-delete obligatoire** pour les apprenants liés à une session passée (ne pas implémenter de hard-delete sur `learners` ayant une trace dans `enrollments`). `ResumeDangerZone` à revoir dans ce sens (lot D ou ultérieur). |
| **Article L6353-1 et suivants du Code du Travail** | Valeur légale des **conventions de formation** (mention obligatoire des objectifs, durée, modalités, prix) et des **feuilles d'émargement** (signature horodatée par demi-journée). La refonte de `TabEmargements` (US-1) doit conserver cette granularité : 1 signature par demi-journée (ou créneau), pas par jour. |
| **eIDAS** (signature électronique) | Niveau **simple** suffit pour les conventions B2B intra/inter-entreprises. Pour les conventions financées via OPCO/CPF, exigence variable selon financeur (souvent « simple » accepté). L'implémentation actuelle (`react-signature-canvas` + horodatage) est conforme niveau simple. Aucun changement requis dans le PRD. |

### Technical Constraints

| Contrainte | Conséquence sur le périmètre PRD |
|---|---|
| **Multi-tenant strict via `entity_id`** | Toutes les nouvelles requêtes Supabase introduites par la refonte doivent filtrer par `entity_id` (règle absolue n°2 du `CLAUDE.md`). RLS Supabase déjà en place sur les tables critiques du module — à préserver. |
| **Isolement inter-entreprises au sein d'une même formation INTER** | C'est un **niveau supplémentaire** au-dessus du multi-tenant. Émilie (Acme) ne doit pas voir les apprenants de Béta sur le portail client, même si tous sont dans la même `session`. Filtrage par `client_id` à appliquer côté lecture *en plus* de la RLS `entity_id`. |
| **Conservation 10 ans** | Aucun hard-delete sur `learners`, `enrollments`, `formation_invoices`, `signatures`, `formation_convention_documents` une fois liés à une session terminée. Soft-delete via `deleted_at` ou statut `archived`. |
| **Valeur probatoire des signatures électroniques** | Signatures horodatées (déjà via `signatures.created_at`), idéalement non répudiables (hash + log d'audit). Pas de modification rétroactive d'une signature confirmée. À tester dans US-1 (refonte émargement). |
| **Hébergement données UE** | Supabase configuré en région UE (Frankfurt ou Paris). À vérifier mais hors scope refonte applicative. |
| **Accessibilité** | WCAG AA non obligatoire en B2B privé, mais c'est un **indicateur Qualiopi indicateur 26** (« moyens permettant aux apprenants en situation de handicap »). À garder en tête sur les composants refondus, sans bloquer le MVP. |

### Integration Requirements (en place — pas de changement dans le PRD courant)

| Système | Statut | Impact PRD |
|---|---|---|
| **Resend** (envoi emails transactionnels) | En place | Préservation — conventions, factures, QR émargement passent par là. |
| **Gmail OAuth** (envoi emails OF via compte Loris) | En place | Préservation — relances financeurs notamment. |
| **OPCO / CPF / EDOF (API Mon Compte Formation)** | Non intégré | **Hors scope PRD courant.** Mentionné en Vision. La refonte ne doit pas dégrader la *possibilité* d'intégration future (modèle de données BPF-compatible). |
| **URSSAF / DREETS export** | Non intégré (export manuel via PDF / Excel actuellement) | Hors scope. |

### Risques domaine spécifiques & mitigations

| Risque | Probabilité | Impact | Mitigation dans le PRD |
|---|---|---|---|
| **Audit Qualiopi raté post-refonte** (régression sur génération de documents légaux) | Moyenne | **Critique** — perte de certification = perte d'activité OF | Success criterion technique : checklist Qualiopi 8 items passée sur 5 sessions de test pré-livraison. Tests manuels Loris sur les 6 types de documents (convention, émargement, attestation, programme, évaluation, satisfaction). |
| **Fuite de données inter-entreprises** (Émilie/Acme voit les apprenants de Béta) | Faible | Élevé — perte de confiance commerciale, contrat client | Filtrage `client_id` côté lecture + tests de portail client multi-entreprises. À cadrer explicitement dans les AC d'US-1 et US-6. |
| **Suppression accidentelle d'apprenant lié à une session terminée** | Moyenne | Élevé — perte de preuve Qualiopi | Soft-delete au lieu de hard-delete sur `ResumeDangerZone` et `ResumeLearners` (à intégrer au lot D ou plus tôt si simple). |
| **Migration `sessions.client_id → formation_companies` perd des associations** | Moyenne | Élevé — formations historiques cassées | Story de tête US-4 : dry-run de la migration sur un snapshot prod + monitoring 1 semaine avant `DROP COLUMN`. |
| **Désynchronisation horaires créneaux (timezone Paris vs UTC)** | Faible mais récurrente | Moyen — émargement à la mauvaise heure | `docs/TIMEZONE.md` documente la conversion `toUtcIsoFromParisTime`. Conserver cette utilité dans tous les composants refondus. |
| **Validation RGPD (droit à l'oubli) qui entrerait en conflit avec la conservation 10 ans** | Faible | Moyen | Hors scope direct mais à documenter pour le futur : anonymisation différée (remplacer nom/email par hash, garder ID + statistiques pour BPF). |

### Patterns du domaine à respecter

- **Une formation = un cycle administratif clos.** Une fois la session terminée et facturée, elle doit être **figée** sauf annulation explicite avec piste d'audit. Pas de réouverture silencieuse.
- **L'émargement précède la facturation.** On ne facture pas un OPCO/financeur sans feuille d'émargement signée. La plateforme doit refléter cet ordre (`TabFinances` peut alerter si pas d'émargement complet).
- **Les conventions sont contractuelles.** Modification après signature = avenant explicite, jamais édition directe.
- **Les coûts sont triplés** (apprenant / entreprise / financeur) et peuvent diverger. Un apprenant peut être financé partie OPCO + partie autofinancement. Modèle `formation_invoices.recipient_type` doit rester triple (déjà le cas).

### Points d'attention domaine souvent négligés

1. **Le rétroactif Qualiopi.** Un audit en 2026 peut porter sur les sessions de 2024. La refonte doit donc permettre d'exporter proprement des sessions créées **avant** la refonte (cf. Journey 2 / US-4).
2. **Le formateur sous-traitant.** Karim peut être indépendant ou société externe. Conséquence finance (notes de frais, factures fournisseur). Pas dans le MVP mais déjà préfiguré par `formation_trainers.is_subcontracted`.
3. **L'attestation de présence vs. attestation de fin de formation.** Deux documents différents juridiquement. La plateforme génère bien les deux ? À vérifier hors scope PRD si besoin.
4. **Le bordereau de paiement OPCO** (document de demande de paiement à l'OPCO après formation). Pas dans le scope mais à prévoir en Vision.

## SaaS B2B Specific Requirements

### Project-Type Overview

La plateforme MR / C3V Formation est un **SaaS B2B multi-tenant** opéré en mode dédié aujourd'hui (2 tenants : MR Formation et C3V Formation), avec une roadmap d'ouverture à d'autres organismes de formation (OFs) comme tenants payants à horizon 6-12 mois (cf. *Executive Summary* pour le rationnel stratégique de blocage du scale tant que la stabilisation n'est pas finie).

### Technical Architecture Considerations

#### Tenant Model — multi-tenant avec isolement strict via `entity_id`

| Aspect | Implémentation actuelle | Impact PRD |
|---|---|---|
| **Stratégie d'isolement** | Single-database / single-schema avec `entity_id` sur chaque table tenant-scoped + Row Level Security (RLS) Supabase | Préservation. Toute nouvelle requête introduite par la refonte filtre par `entity_id` (règle absolue n°2 du `CLAUDE.md`). |
| **Provisionnement tenant** | Manuel via insertion en base (table `entities` : MR FORMATION + C3V FORMATION) | Hors scope PRD courant. L'onboarding self-service est en Vision. |
| **Branding par tenant** | Couleur + nom dans `entities` (MR = `#374151`, C3V = `#2563EB`). Logo et templates documents par tenant. | Préservation — aucun changement requis dans la refonte. |
| **Fuites cross-tenant** | RLS sur ~30 tables (mais audit mémoire signale ~50 tables hors module Formations avec `allow_all USING(true)` — hors scope direct) | Le module Formations a une RLS saine (voir Domain). Tests de non-régression à inclure pré-livraison MVP. |
| **Migrations multi-tenant** | Migrations SQL globales, mais aucune n'est tenant-spécifique | La story de tête US-4 (backfill `formation_companies`) tournera sur l'ensemble des tenants en une seule passe. |

#### RBAC Matrix — 5 rôles, préservés

| Rôle | Périmètre | Touché par le PRD ? |
|---|---|---|
| `super_admin` | Accès total cross-entité (équipe interne plateforme) | Lectures de session globales préservées. |
| `admin` | Accès total dans son entité (rôle de Loris) | **Cible principale de la refonte.** Toutes les améliorations UX du module Formations s'adressent à ce rôle. |
| `trainer` | Ses sessions, ses documents, ses émargements | Préservation (Journey 3) — vue *unifiée*, non impactée par la complexité multi-entreprises côté admin. |
| `client` | Ses formations achetées (vue côté entreprise cliente) | Préservation + **renforcement de l'isolement inter-entreprises** (Journey 5 / Émilie). |
| `learner` | Ses cours, ses attestations | Préservation (Journey 4) — émargement, accès attestations. |

**Règles RBAC à respecter dans la refonte** :
- Chaque page admin du module Formations vérifie déjà le rôle via middleware et RLS Supabase.
- Aucune nouvelle route API introduite par la refonte ne doit court-circuiter cette double vérification (middleware côté Next.js + policy Supabase côté DB).
- Les helpers `user_role()` PostgreSQL sont en schéma `public` (et non `auth`), héritage de l'existant — hors scope mais à documenter.

### Subscription Tiers — N/A pour le PRD courant

Aujourd'hui, **pas de modèle d'abonnement formalisé**. MR et C3V sont des tenants de l'éditeur, pas des clients facturés. Le modèle commercial pour l'ouverture SaaS futur (forfait par OF, par apprenant, par session ?) sera défini séparément. Le PRD courant **ne crée pas de dépendance à un tier model**, mais doit préserver l'option : le modèle de données doit pouvoir être éventuellement étendu avec une table `subscriptions` plus tard sans casser la refonte.

### Integration List — préservation, aucun changement

| Intégration | Statut | Impact PRD |
|---|---|---|
| **Supabase** (PostgreSQL + Auth + Storage + Realtime) | Provider unique de la couche backend | Préservation. La refonte n'introduit aucune nouvelle dépendance backend. |
| **Resend** | Envoi emails transactionnels (conventions, factures, QR émargement) | Préservation. |
| **Gmail OAuth** | Envoi emails côté OF via compte Loris (relances financeurs, etc.) | Préservation. |
| **jsPDF + html2canvas** | Génération PDF côté client (conventions, factures, émargements) | Préservation. La refonte de `TabEmargements` (US-1) doit conserver l'export PDF segmenté par entreprise. |
| **react-signature-canvas** | Capture signature électronique (eIDAS niveau simple) | Préservation. |
| **Netlify** | Hébergement / déploiement (branches `main` = prod, `develop` = dev) | Préservation. Aucun changement dans le pipeline. |

**Pas d'intégration nouvelle introduite par le MVP du PRD.** OPCO/CPF/EDOF mentionnés en Vision uniquement.

### Compliance Requirements

Couvertes en détail dans la section **Domain-Specific Requirements** (Qualiopi, BPF, RGPD, Code du Travail L6353-1, eIDAS). À retenir pour la couche SaaS B2B :

- **Conservation 10 ans** des documents légaux → soft-delete only sur les tables liées aux sessions.
- **Isolement double niveau** : `entity_id` (multi-tenant) + `client_id` (multi-entreprise au sein d'une formation INTER).
- **Audit Qualiopi** doit pouvoir s'appuyer sur la plateforme pour **chaque** tenant (donc les exports doivent être propres et tenant-scoped).

### Implementation Considerations

| Sujet | Décision pour le PRD |
|---|---|
| **Stratégie de release** | 2 phases pour la story de tête US-4 (release 1 = backfill + arrêt de lire `sessions.client_id` ; release 2 = `DROP COLUMN` une semaine plus tard). Lots A et B en parallèle après US-4 livrée. |
| **Feature flags** | Pas de feature flag introduit dans le MVP. Les changements sont des refactors/migrations, pas des features cachables. Si nécessaire pour US-7 (suppression `TabEvaluation` / `TabSatisfaction`), un flag de masquage UI pendant 1 sprint avant suppression dure peut être ajouté. |
| **Backward compatibility** | La migration `backfill_formation_companies_from_legacy_client_id` doit être idempotente et réversible (sauvegarde de l'état initial avant `DROP COLUMN`). |
| **Tests de non-régression** | Tests manuels Loris sur 5 sessions de test couvrant : INTRA mono-entreprise, INTER 2-entreprises, INTER 3-entreprises, session passée legacy, session avec sous-traitance formateur. Checklist Qualiopi 8 items sur chacune. |
| **Observabilité** | Logging structuré sur les cascades de prix (lot D). Pas de monitoring nouveau introduit dans le MVP. |
| **Performance** | Le `mega-fetch` de la page formation (~13 relations imbriquées) est conservé en l'état dans le MVP. Optimisation laissée à un PRD ultérieur si Loris remonte une lenteur après la refonte. |
| **Documentation dev** | Mise à jour de `CLAUDE.md` post-refonte : retirer toute mention de `sessions.client_id`, ajouter mention du double-isolement (`entity_id` + `client_id`). |

## Project Scoping & Phased Development

> **Note d'articulation** : la section *Product Scope* (Success Criteria) liste déjà les périmètres MVP, Growth et Vision. Cette section les complète avec la stratégie MVP, les besoins en ressources et la mitigation des risques transverses. Pour le détail des features par phase, se référer à *Product Scope*.

### MVP Strategy & Philosophy

**Type de MVP** : **Stabilization MVP** (cas brownfield) — pas un MVP de découverte produit, pas un MVP de revenue. L'objectif n'est pas de prouver une hypothèse de valeur (déjà prouvée — Loris utilise la plateforme tous les jours et 2 entités tournent en production) mais de **rendre fluide ce qui existe pour débloquer le scale**.

**Philosophie** :
- **Zéro nouvelle feature visible utilisateur dans le MVP.** Seulement de la suppression de friction et de la mise en cohérence.
- **Tout changement doit être invisible quand il marche, et visible quand il améliore.** Exemples : la migration `sessions.client_id → formation_companies` doit être invisible (les anciennes formations marchent toujours). À l'inverse, le badge « Calculé / Modifié » sur le prix doit être visible (il explique enfin pourquoi le chiffre est ce qu'il est).
- **Garder l'option ouverte pour le scale SaaS.** Tout choix de refonte doit préserver ou améliorer la capacité d'onboarder un 3ᵉ tenant. Aucun changement ne doit créer de dépendance MR-spécifique ou C3V-spécifique.
- **Préserver Qualiopi à chaque instant.** Aucun test pré-livraison ne peut être validé si la checklist Qualiopi 8 items régresse.

**Critère de sortie du MVP** : Loris confirme par écrit, après 2 semaines d'usage post-livraison, que les 4 critères User Success (cf. Success Criteria) sont atteints en pratique sur ses formations réelles, ET la checklist Qualiopi 8 items est verte sur 5 sessions de test.

### Resource Requirements

| Rôle | Engagement |
|---|---|
| **Développeur principal (full-stack TypeScript / Next.js / Supabase)** | 1 ETP à 80 % sur 4-5 semaines. Doit maîtriser le module Formations existant et les migrations SQL Supabase. Wissam est ce profil. |
| **Développeur secondaire (optionnel)** | 0.5 ETP — utile si on veut compresser le calendaire (lots A et B vraiment en parallèle). Si absent, 1 seul dev fait A puis B en séquence ; calendaire allongé de ~1 semaine. |
| **Product Owner / Validation utilisateur** | Loris, 1h / sprint pour validation AC + tests manuels sur 5 sessions de test pré-livraison. |
| **QA manuel** | Loris + 1 jour de QA structuré sur la checklist Qualiopi (peut être Loris ou Wissam selon disponibilités). |
| **Outils** | Aucun nouvel outil requis. Stack existante suffit. |

**Compétences critiques** : Next.js 14 App Router · Supabase (SQL + RLS) · React Hook Form + Zod · jsPDF · TypeScript strict (règle absolue n°1 : pas de `any`).

### Risk Mitigation Strategy

#### Risques techniques

| Risque | Mitigation MVP |
|---|---|
| Migration `backfill_formation_companies_from_legacy_client_id` perd des associations | **Dry-run obligatoire** sur snapshot prod. Sauvegarde de l'état avant `DROP COLUMN`. Release en 2 phases (R1 = backfill + arrêt de lire ; R2 = drop après 1 semaine monitoring). |
| Trigger SQL `trg_recompute_planned_hours` toujours actif quelque part | **Audit triggers prod** en sprint 1 (Story de tête). Documenter la nouvelle séparation `computed_hours` / `override_hours` dans le commentaire de la migration. |
| Cascade prix sur factures non envoyées (status `draft`) — débat juridique sur les factures émises | **Cascade limitée aux drafts.** Si une facture est `sent` ou `paid`, elle ne suit plus le prix. Documenté dans US-2 AC. |
| Suppression `TabEvaluation` / `TabSatisfaction` casse un workflow non identifié | **Feature flag de masquage** pendant 1 sprint avant suppression dure (proposé dans le cadrage). Permet rollback rapide. |
| Régression d'isolement inter-entreprises sur portail client (Émilie / Acme) | **Tests RLS multi-tenant ET multi-entreprise** scriptés avant chaque release. Vérifier qu'un user `client` rattaché à Acme ne voit aucun apprenant de Béta ou Gamma. |

#### Risques marché / produit

| Risque | Mitigation |
|---|---|
| Loris veut entre-temps une nouvelle feature → tentation de la glisser dans le MVP | **Discipline de scope.** Toute demande nouvelle pendant la refonte est mise en backlog v2. Wissam et Loris s'engagent à ne rien insérer dans le MVP. |
| L'onboarding du 3ᵉ tenant prend plus de 6 mois post-livraison (KPI business raté) | Le PRD ne couvre pas l'effort commercial. La stabilisation lève le verrou technique, pas le verrou commercial. KPI à suivre mais sans culpabiliser le PRD. |
| Loris ne perçoit pas l'amélioration parce qu'elle est trop technique (« je ne vois pas ce qui a changé ») | **Communication ciblée à J+0 et J+15** : démo du workflow INTER 3-entreprises chronométrée, comparaison avant/après. Inclure dans le journal de release. |

#### Risques ressources

| Risque | Mitigation |
|---|---|
| Wissam est interrompu par d'autres priorités (support Loris, autres modules) | Loris s'engage à filtrer les interruptions « bloquantes vraies » vs. « gênantes » pendant les 4-5 semaines de refonte. Les gênantes attendent la fin du MVP. |
| Wissam tombe malade ou indisponible | Le cadrage v1.1, le PRD et les stories produites par la suite permettent à un autre dev sénior de reprendre. Estimation prudente : +2 semaines de ramp-up. |
| Le périmètre s'étend silencieusement (scope creep) | Revue de scope hebdomadaire (15 min) : « est-ce qu'on est toujours sur les 6 stories du MVP ? ». Toute extension nécessite décision explicite. |

### Single-release vs phased — confirmation explicite

Le cadrage v1.1 a explicitement choisi un **mode phasé** :
- **Phase 1 (MVP — 4-5 semaines)** : Story de tête US-4 + Lots A + B = 6 user stories.
- **Phase 2 (Growth — ~3 semaines)** : Lot C = 3 user stories.
- **Phase 3 (Quality — ~3 semaines)** : Lot D = 1 user story + service layer + logging.
- **Phase 4 (Vision — hors PRD courant)** : onboarding self-service, BPF assisté, marketplace, mobile, API publique, audit Qualiopi IA.

Aucune user story du cadrage n'a été silencieusement déférée. Aucune phase n'a été inventée — toutes correspondent au découpage validé par l'utilisateur.

## Functional Requirements

> **Périmètre** : ces FRs couvrent le module Formations (création de session, multi-entreprises, apprenants, planning, documents, émargement, questionnaires, e-learning, facturation, Qualiopi, automation) **après refonte**. Les capacités d'autres modules (catalogue de trainings, CRM clients, gestion globale des cours e-learning, profils utilisateurs) sont hors scope du présent PRD et ne sont pas listées ici sauf interaction directe.
>
> Acteurs utilisés : **Admin** (Loris, rôle `admin` ou `super_admin`) · **Trainer** (Karim, rôle `trainer`) · **Learner** (Sophie, rôle `learner`) · **Client** (Émilie, rôle `client`) · **System** (logique automatique du backend / triggers / cascades).
>
> Capacités refondues / nouvelles marquées **🔧**. Capacités préservées (existantes, non régressables) marquées **·**.

### Création & sources de vérité (prix, heures, formateurs)

- **·  FR1** : Admin can create a new session from the `trainings` catalogue and the session inherits the catalogue price as its default.
- **🔧 FR2** : Admin can see, for the price of a session, whether the value is the catalogue default, a per-session override, or a per-company override, with a visible badge differentiating each case.
- **🔧 FR3** : System can cascade a session price change to all draft (unsent) invoices linked to that session, without affecting sent or paid invoices.
- **🔧 FR4** : System can compute the planned hours of a session from its `formation_time_slots` and expose the result as `computed_hours`.
- **🔧 FR5** : Admin can override the computed hours of a session with an explicit `override_hours` value, and the UI displays which value is currently authoritative.
- **·  FR6** : Admin can attach one or more trainers to a session, set their daily rate and hourly rate, and mark them as subcontracted.
- **·  FR7** : System can compute the hours actually delivered by a trainer from the signatures linked to the trainer and the corresponding `formation_time_slots`.

### Multi-entreprises (INTRA / INTER) & isolement

- **🔧 FR8** : Admin can attach one or more companies (clients) to a session via `formation_companies` as the sole canonical source — the legacy `sessions.client_id` is no longer read.
- **🔧 FR9** : Admin can specify a per-company amount on a session, with a suggested pro-rata default and a visible total reconciliation against the session price.
- **🔧 FR10** : System can guarantee that every enrollment in an INTER session is linked to one of the session's attached companies (no orphan learners).
- **🔧 FR11** : System can detect that a session attached to two or more companies behaves as INTER everywhere — without requiring an explicit toggle.
- **🔧 FR12** : Admin can distinguish at a glance whether a session is INTRA or INTER from a single visible indicator at the top of the formation page.
- **🔧 FR13** : Client (Émilie) can see, on her client-side portal, only the learners and documents of her own company within an INTER session — never those of other companies attending the same session.
- **·  FR14** : System enforces tenant isolation via `entity_id` Row Level Security on every table involved in a session, regardless of company context.

### Apprenants & inscriptions

- **·  FR15** : Admin can add an existing learner to a session, or create a new learner and enroll them in one operation.
- **🔧 FR16** : Admin can choose which company a learner belongs to within a session when two or more companies are attached, with the company selection required (not optional).
- **🔧 FR17** : Admin sees the list of learners updated immediately across all tabs (Émargement, Finances, ConventionDocs, DocsPartagés) after adding or removing a learner — no manual refresh required.
- **·  FR18** : Admin can export the list of enrolled learners as CSV.
- **·  FR19** : Admin can send the access link to all enrolled learners in a single action.
- **🔧 FR20** : System can prevent hard-deletion of a learner whose record is linked to a closed session (preserving evidence for the 10-year retention obligation), implementing soft-deletion or status change instead.

### Planning & émargement

- **·  FR21** : Admin can create time slots for a session in bulk over a date range, with optional lunch break exclusion and weekly recurrence.
- **·  FR22** : Admin can record the pedagogical content (module title, objectives) of each time slot.
- **·  FR23** : Admin can generate signing tokens (QR codes) for a session that allow learners to sign attendance from their device.
- **🔧 FR24** : System can link each signing token (and resulting signature) to the learner's company via `client_id` so that segmented exports can be generated downstream.
- **🔧 FR25** : Admin can filter the attendance view of an INTER session by company to see only the learners of one company at a time.
- **🔧 FR26** : Admin can export an attendance sheet PDF segmented by company (one PDF per company, or one combined PDF with a section per company) for an INTER session.
- **·  FR27** : Admin can record manual absences (justified / unjustified) for a learner on a given time slot.
- **·  FR28** : Trainer can view his own sessions in his planning and sign the time slots he delivered.
- **·  FR29** : Learner can scan a QR code projected by the trainer and submit a handwritten signature for the time slot.

### Documents légaux & génération PDF

- **🔧 FR30** : Admin can generate one formation convention per attached company in an INTER session, each listing only the learners of that company.
- **·  FR31** : Admin can freeze (mark as confirmed) a generated document, after which its content can no longer be modified silently.
- **·  FR32** : Admin can send a generated document by email to its recipient (learner, company representative, or trainer) and track the signature status.
- **·  FR33** : Client (Émilie) can sign a convention electronically via a public link, with the signature timestamped and stored.
- **·  FR34** : Admin can attach a single pedagogical program to a session; the program is shared by all attached companies in INTER (no per-company differentiation), and the UI displays a note stating this.
- **·  FR35** : Admin can generate attendance attestations and end-of-formation attestations once the session is marked completed.
- **·  FR36** : Admin can upload and share documents in defined categories (learner-specific, trainer-specific, program-related, common, private).

### Évaluation, satisfaction, questionnaires & e-learning

- **·  FR37** : Admin can assign evaluation questionnaires and satisfaction questionnaires to learners, trainers, companies, financiers and manager across four timeline stages (before / during / after / J+30 days), with secure per-recipient access tokens.
- **·  FR38** : Admin can view the response rate per session, per questionnaire stage and per target type, and export the aggregated responses.
- **·  FR39** : Admin can record questionnaire responses on behalf of an absent recipient (admin-fill mode), for cases such as paper-based satisfaction collected in the room and entered manually afterwards.
- **·  FR40** : Admin can assign published e-learning courses to enrolled learners of a session, and view per learner the progress made (course completion status and signed time within the session).

### Facturation & financement

- **·  FR41** : Admin can create an invoice for a session targeting a learner, a company, or a financier (OPCO/CPF).
- **🔧 FR42** : System can, when an INTER session has two or more attached companies, prompt the admin to explicitly choose the recipient company by ID (not by name) before auto-filling invoice lines.
- **·  FR43** : System can auto-fill invoice lines from the recipient's context: per-learner lines for INTER (one line per learner), single bulk line for INTRA.
- **·  FR44** : Admin can issue a credit note (avoir) linked to a parent invoice, with consistent VAT calculation between the original invoice and the credit note.
- **·  FR45** : Admin can mark an invoice as sent or paid, and once sent or paid the invoice no longer follows session price changes.
- **·  FR46** : Admin can import an external invoice PDF, have the relevant fields auto-extracted via an AI parser, then validate and persist.
- **·  FR47** : Admin can attach one or more financiers (OPCO, CPF, employer, self-funded) to a session, specify the amount taken in charge by each financier, track each financier's validation status (pending / approved / refused / paid), and link the dedicated financial documents per financier.

### Conformité Qualiopi & rétroactif

- **·  FR48** : Admin can view the Qualiopi 8-items dashboard for a session and see which items are met, partially met, or missing.
- **·  FR49** : Admin can export, for any historical session (including sessions created before the refonte), all six legal document types (convention, attendance sheet, programme, attestation, evaluation, satisfaction) in a state compliant for a Qualiopi audit.
- **🔧 FR50** : System can serve historical formations that originally used `sessions.client_id` without user-visible breakage, thanks to the backfill migration to `formation_companies`.

### Multi-tenant, RBAC & administration

- **·  FR51** : Super-admin can view sessions across all tenants (entities); admin can view only sessions of his own tenant; trainer, learner, and client can view only the sessions and data they are explicitly linked to.
- **·  FR52** : Admin can configure formation-level automation rules (e.g., auto-send a reminder email 7 days before start) and view their trigger timeline.
- **·  FR53** : Admin can send a manual email to learners, companies, trainers, financiers, or manager from a unified messaging tab, optionally using saved templates.
- **·  FR54** : Admin can duplicate an existing session to seed a new one with the same parameters.
- **·  FR55** : Admin can delete a session via an explicit danger-zone confirmation, with cascading delete behavior preserving evidence rules (no hard-delete of records linked to a closed and audited session — see FR20).

### Capacités explicitement HORS contrat

Pour clarté, les capacités suivantes n'existeront pas dans le produit livré, par décision explicite :
- ❌ Onglets `TabEvaluation` et `TabSatisfaction` séparés (US-7) — remplacés par les capacités FR37-FR39 portées par le tab unifié `TabQuestionnaires`.
- ❌ Différenciation du programme pédagogique par entreprise dans une formation INTER (US-5, décision : programme commun).
- ❌ Champs `time_modules`, `time_evals`, `time_other`, `time_virtual` sur `formation_elearning_assignments` (US-9, décision : suppression).
- ❌ Onboarding tenant en self-service (Vision).
- ❌ Intégration directe avec API OPCO / CPF / EDOF (Vision).

## Non-Functional Requirements

> **Compliance & règlementaire** : se référer à la section *Domain-Specific Requirements* (Qualiopi, BPF, RGPD, Code du Travail L6353-1, eIDAS) — non répétés ici pour éviter la duplication.

### Performance

Les objectifs ci-dessous concernent le module Formations sur un poste utilisateur standard (Loris : MacBook Pro M1, fibre 100 Mbps) avec une session de complexité représentative (1 formation INTER, 3 entreprises, 6 apprenants, 4 créneaux, 2 formateurs).

- **NFR-PERF-1** : Le chargement complet de la page formation `/admin/formations/[id]` doit s'effectuer en **moins de 2 secondes** (TTI mesuré via Lighthouse) en P95.
- **NFR-PERF-2** : Toute mutation utilisateur (ajout d'apprenant, ajout d'entreprise, mise à jour de prix, etc.) doit s'afficher comme appliquée — y compris dans les autres onglets impactés — en **moins de 1 seconde** (perception). Si la cascade backend prend plus de temps, un état optimiste local est acceptable.
- **NFR-PERF-3** : La génération d'un PDF d'émargement segmenté pour 1 entreprise (jusqu'à 10 apprenants × 8 créneaux) doit prendre **moins de 5 secondes** côté client (jsPDF + html2canvas).
- **NFR-PERF-4** : L'export CSV de la liste des apprenants doit être quasi-instantané (< 500 ms) jusqu'à 200 apprenants.
- **NFR-PERF-5** : Le `mega-fetch` initial de la page formation (~13 relations) est explicitement **conservé en l'état dans le MVP** — l'optimisation est hors scope. Si NFR-PERF-1 n'est pas atteint en pratique, un PRD ultérieur traitera l'optimisation (pagination, fetch fractionné, react-query, etc.).

### Security

- **NFR-SEC-1** : **Isolement multi-tenant strict** — aucune requête côté serveur ne doit pouvoir retourner des données d'une `entity_id` à laquelle l'utilisateur authentifié n'appartient pas. Vérifié par tests RLS automatisés (1 user MR + 1 user C3V) qui doivent rester verts en CI et avant chaque release.
- **NFR-SEC-2** : **Isolement inter-entreprises au sein d'une formation INTER** — un utilisateur de rôle `client` rattaché à l'entreprise Acme ne peut accéder à aucune donnée (apprenant, document, signature) d'une autre entreprise (Béta, Gamma) d'une même session. Vérifié par tests applicatifs scriptés.
- **NFR-SEC-3** : **Conservation 10 ans** des documents légaux (conventions, feuilles d'émargement, attestations, factures) — soft-delete via statut/`deleted_at` pour toute donnée liée à une session terminée. Aucune route applicative n'expose de hard-delete sur ces tables.
- **NFR-SEC-4** : **Valeur probatoire des signatures** — chaque signature est horodatée côté serveur (timestamp Postgres), liée à l'IP du signataire et au `signing_token` consommé. Aucune modification rétroactive d'une signature confirmée n'est possible via l'UI.
- **NFR-SEC-5** : **Données personnelles RGPD** — pas d'export de données apprenant hors de l'écosystème authentifié sauf via les exports légaux (PDF/CSV générés à la demande de l'admin). Pas de tracking tiers (analytics externe) sur les pages contenant des données apprenant.
- **NFR-SEC-6** : **Tokens d'accès** (signing_token, learner_access_token, questionnaire_token) — expiration automatique configurable (par défaut 90 jours pour les tokens learner / questionnaire ; 14 jours pour les tokens de signature après la fin de la session).
- **NFR-SEC-7** : **Aucun secret côté client** — clés Supabase publiques uniquement, jamais de `service_role` ni de connection string PostgreSQL dans le bundle Next.js (vérifiable par audit automatisé).

### Scalability

Cibles à 12 mois post-livraison du MVP, alignées avec la stratégie d'ouverture SaaS :

- **NFR-SCAL-1** : Supporter **jusqu'à 5 tenants** (entities) actifs simultanément sans changement applicatif. Mesuré par : le 3ᵉ tenant onboardé en moins de 1 journée de provisioning, sans modification de code.
- **NFR-SCAL-2** : Supporter, par tenant, **jusqu'à 200 sessions actives simultanées** et **2 000 apprenants** cumulés sur 12 mois. Mesuré par : la page formation, le dashboard admin, les listes globales restent dans les cibles NFR-PERF-1 à ce volume.
- **NFR-SCAL-3** : Le modèle de données doit pouvoir être étendu avec une table `subscriptions` (par tenant) plus tard sans rupture migrationnelle.
- **NFR-SCAL-4** : Aucune dépendance MR-spécifique ou C3V-spécifique ne doit être introduite par la refonte (vérifié par revue de code à chaque PR : tout code conditionné par `entity.slug === 'mr-formation'` ou similaire est interdit, sauf branding/affichage).

### Reliability & Availability

- **NFR-REL-1** : **Uptime cible** : 99,5 % mensuel (~3h36 d'indisponibilité tolérée par mois). Hébergement Netlify + Supabase managed, SLA fournisseur respecté. Pas d'engagement contractuel formel pour le MVP, mais à surveiller via uptime monitoring (UptimeRobot ou équivalent — à ajouter en lot D si pas déjà en place).
- **NFR-REL-2** : **Récupération sur erreur Supabase** — toute mutation qui échoue côté backend déclenche un toast d'erreur explicite côté UI (pas de "silent fail"). Conforme à la règle absolue n°5 du `CLAUDE.md`. Vérifié par audit code lors de la refonte (aucun `catch` silencieux toléré sur les mutations métier).
- **NFR-REL-3** : **Idempotence des migrations** — toute migration SQL livrée par le PRD (notamment `backfill_formation_companies_from_legacy_client_id`) doit être idempotente (ré-exécution = no-op) pour permettre les rollbacks et les corrections.
- **NFR-REL-4** : **Pas de perte de données silencieuse** — la migration `DROP COLUMN sessions.client_id` est exécutée seulement après 1 semaine de monitoring confirmant que plus aucune lecture applicative n'utilise la colonne, avec sauvegarde préalable de l'état.
- **NFR-REL-5** : **Récupération facile** — un dump Supabase journalier permet de restaurer l'état d'une formation supprimée par erreur dans les 24h (assuré par la rétention Supabase + procédure interne).

### Accessibility (baseline — non bloquant MVP)

- **NFR-A11Y-1** : Les pages publiques utilisées par les apprenants (signature QR, accès apprenant, signature convention) doivent être **utilisables au clavier** seul, sans souris.
- **NFR-A11Y-2** : Les composants Shadcn/ui utilisés sont **conformes WCAG AA par défaut** (Radix sous-jacent) — préserver cette propriété en évitant de surcharger les couleurs ou les contrastes.
- **NFR-A11Y-3** : Les écrans admin du module Formations restent **lisibles à un zoom 200 %** sans rupture de mise en page (test rapide sur 2-3 onglets critiques avant livraison MVP).
- **NFR-A11Y-4** : **WCAG AA complet** est un objectif post-MVP (lot D ou ultérieur) — pas un critère bloquant pour la livraison MVP. Indicateur Qualiopi 26 documenté comme « accessibilité raisonnable », pas certifiée.

## Traceability Matrix

> **Lecture** : chaque ligne lie un critère de succès utilisateur (`User Success` ou `Technical Success`) à au moins un journey, à un ou plusieurs FRs, et à la phase de livraison correspondante. Cette traçabilité permet à l'étape suivante (création des epics / stories) de garantir que chaque story livrée contribue à un critère de succès du PRD.

### Mapping User Success → Journeys → FRs → Phase

| Critère de succès utilisateur (Success Criteria) | Journey(s) | FR(s) couvrant la capacité | Phase | User Story du cadrage |
|---|---|---|---|---|
| 1. Livrer une formation INTER 3 entreprises en < 10 min | J1 | FR1-FR5, FR8-FR13, FR16-FR17, FR25-FR26, FR30, FR42-FR43 | MVP | US-1, US-2, US-3, US-4, US-6 |
| 2. Pas de désynchronisation visible entre onglets | J1 (toutes étapes) | FR17 + cascade FR3 | MVP | US-2, US-4 |
| 3. Comprendre d'où vient chaque chiffre (badges override) | J1 (étapes 1-2, 4) | FR2, FR5 | MVP | US-2, US-3 |
| 4. Distinguer INTRA vs INTER au premier regard | J1 (toutes étapes) | FR12 | MVP | US-1 (sous-jacent) |

### Mapping Technical Success → FRs → Phase

| Critère de succès technique | FR(s) | NFR(s) | Phase | User Story |
|---|---|---|---|---|
| 1. Zéro lecture de `sessions.client_id` dans le code | FR8, FR50 | NFR-REL-4 | MVP (story de tête) | US-4 |
| 2. Zéro duplication prix / heures non documentée | FR2, FR3, FR4, FR5 | NFR-SEC-3 (indirect) | MVP | US-2, US-3 |
| 3. Multi-entreprises cohérent sur 10/10 onglets | FR8-FR13, FR16-FR17, FR24-FR26, FR30, FR42 | NFR-SEC-2 | MVP | US-1, US-4, US-5, US-6 |
| 4. Conformité Qualiopi 8 items préservée | FR30-FR36, FR48-FR49 | (compliance Domain) | MVP + tests | (transverse) |
| 5. RLS multi-tenant intacte | FR14, FR51 | NFR-SEC-1 | MVP | (transverse) |

### Mapping Business Success → conditions → Phase

| Critère de succès business | Conditions nécessaires (depuis le PRD) | Phase |
|---|---|---|
| Onboarding 3ᵉ tenant SaaS sous 6 mois | NFR-SCAL-1, NFR-SCAL-4, story de tête US-4 livrée | MVP livré (verrou levé) + effort commercial (hors PRD) |
| Réduction temps support Loris ~5h/sem → <1h/sem | User Success 1 + 2 + 3 atteints, démos comparées | À J+30 post-MVP |
| Vélocité features restaurée (ratio commits) | Lots A, B livrés + Lot D (service layer) | À J+60 post-MVP |

### Mapping Journey → Capacités révélées → FRs

| Journey | Persona | Capacités révélées | FRs principaux | Phase |
|---|---|---|---|---|
| J1 — INTER 3 entreprises (happy path) | Loris (admin) | Cascade prix, multi-entreprises uniforme, validation apprenant ↔ entreprise, export segmenté, modal facture | FR1-FR5, FR8-FR13, FR16-FR17, FR25-FR26, FR30, FR42-FR43 | MVP |
| J2 — Reprendre formation legacy | Loris (admin) | Migration silencieuse, backward compat | FR50, FR49 | MVP |
| J3 — Préparer et animer une session | Karim (trainer) | Vue formateur unifiée, isolement `entity_id` | FR28, FR14 | Préservation (pas de régression) |
| J4 — Signer un émargement (QR) | Sophie (learner) | `signing_token` lié à `client_id` | FR24, FR29 | MVP |
| J5 — Consulter sa convention et le suivi | Émilie (client) | Isolement inter-entreprises sur portail client | FR13, FR33 | Préservation + tests RLS (NFR-SEC-2) |
| J6 — Audit Qualiopi rétroactif | Nathalie (auditrice externe) | Conformité Qualiopi 8 items, export rétroactif | FR48, FR49 | Préservation |

### Mapping Phases → User Stories → FRs principaux

| Phase | User Stories du cadrage | FRs principaux livrés | Effort estimé |
|---|---|---|---|
| **Story de tête (MVP)** | US-4 | FR8, FR50 (et conditions FR10, FR16) | ~1.5 j-h |
| **Lot A (MVP, parallèle B)** | US-2, US-3 | FR2, FR3, FR4, FR5 | ~3.5 j-h |
| **Lot B (MVP, parallèle A)** | US-1, US-5, US-6 | FR13, FR24, FR25, FR26, FR30, FR34, FR42 | ~4 j-h |
| **Lot C (Growth)** | US-7, US-8, US-9 | (Suppressions — pas de nouveau FR ; consolidation UI cf. section *Hors contrat*) | ~2.5 j-h |
| **Lot D (Quality)** | US-10 + service layer + logging | FR20 (renforcé), NFR-REL-2, NFR-REL-5 | ~2.5 j-h |

### Coverage check final

- ✅ **Tous les FRs du contrat sont rattachés à au moins une phase.** Les FRs préservés (·) ne génèrent pas de story nouvelle mais sont soumis à des tests de non-régression.
- ✅ **Toutes les user stories du cadrage v1.1 sont rattachées à au moins un FR.**
- ✅ **Tous les critères de succès (User, Business, Technical) sont rattachés à au moins un FR ou un NFR.**
- ✅ **Toutes les capacités explicitement hors contrat sont rattachées à une décision validée** (cf. fin de section *Functional Requirements*).

Cette matrice est le pont vers l'étape suivante : transformation du PRD en epics + user stories implémentables.
