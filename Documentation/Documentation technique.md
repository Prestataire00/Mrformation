# Documentation technique — Plateforme LMS MR FORMATION

> Version du document : Mars 2026
> Projet : Plateforme LMS + CRM pour organismes de formation
> Entités : **MR FORMATION** (slug: `mr-formation`) · **C3V FORMATION** (slug: `c3v-formation`)

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture technique](#2-architecture-technique)
3. [Technologies et dépendances](#3-technologies-et-dépendances)
4. [Rôles utilisateurs et accès](#4-rôles-utilisateurs-et-accès)
5. [Modules Admin](#5-modules-admin)
6. [Portails utilisateurs](#6-portails-utilisateurs)
7. [Routes API](#7-routes-api)
8. [Base de données](#8-base-de-données)
9. [Intégrations externes](#9-intégrations-externes)
10. [Configuration et déploiement](#10-configuration-et-déploiement)

---

## 1. Vue d'ensemble

La plateforme est un **LMS (Learning Management System)** complet combinant :

- Gestion des formations, sessions et apprenants
- Module CRM commercial (pipeline prospects, devis, campagnes)
- E-learning avec génération de contenu par IA
- Reporting et conformité Qualiopi
- Gestion documentaire (templates, signatures électroniques)
- Multi-entités avec isolation complète des données

### Entités supportées

| Entité | Slug | Couleur thème |
|--------|------|---------------|
| MR FORMATION | `mr-formation` | `#2563EB` (bleu) |
| C3V FORMATION | `c3v-formation` | `#7C3AED` (violet) |

### Accès

- Authentification via Supabase Auth (email + mot de passe)
- Sélection d'entité après connexion (`/select-entity`)
- Sélection du rôle si multi-rôles (`/select-role`)
- 4 portails dédiés selon le rôle

---

## 2. Architecture technique

### Stack principal

```
Next.js 14 (App Router)
├── React 18 + TypeScript 5
├── TailwindCSS 3 + Radix UI (composants)
├── Supabase (Auth + PostgreSQL + RLS)
└── Middleware RBAC (src/middleware.ts)
```

### Structure des dossiers

```
lms-platform/
├── src/
│   ├── app/
│   │   ├── (auth)/                  # Routes publiques
│   │   │   ├── login/
│   │   │   ├── inscription/
│   │   │   ├── reset-password/
│   │   │   ├── select-entity/
│   │   │   └── select-role/
│   │   ├── (dashboard)/             # Routes protégées
│   │   │   ├── admin/               # Portail administrateur (40+ pages)
│   │   │   ├── trainer/             # Portail formateur
│   │   │   ├── client/              # Portail client
│   │   │   └── learner/             # Portail apprenant
│   │   ├── api/                     # Routes API REST (50+ endpoints)
│   │   └── present/[courseId]/      # Mode présentation e-learning
│   ├── components/
│   │   ├── ui/                      # Primitives UI (Button, Dialog, etc.)
│   │   ├── layout/                  # Header, Sidebar, NotificationPanel
│   │   ├── editor/                  # RichTextEditor (Tiptap)
│   │   ├── crm/                     # CompanySearch, TagManager
│   │   ├── signatures/              # SignaturePad
│   │   └── elearning/               # FileUploadZone, GenerationProgress
│   ├── contexts/
│   │   └── EntityContext.tsx        # Contexte multi-entités
│   ├── lib/
│   │   ├── supabase/                # Clients DB (server.ts + client.ts)
│   │   ├── services/                # Intégrations externes (OpenAI, Gamma, Pappers...)
│   │   ├── types/                   # Définitions TypeScript
│   │   ├── utils/                   # Helpers (resolve-variables, utils)
│   │   ├── pdf-export.ts            # Génération PDF
│   │   ├── devis-pdf.ts             # PDF devis/quotes
│   │   └── export-xlsx.ts           # Export Excel
│   └── middleware.ts                # Protection des routes + RBAC
├── supabase/
│   ├── schema.sql                   # Schéma complet (44 tables)
│   ├── seed.sql                     # Données de démonstration
│   └── migrations/                  # Historique des migrations
├── public/                          # Assets statiques
├── next.config.mjs
├── tailwind.config.ts
├── tsconfig.json
└── .env.local                       # Variables d'environnement
```

### Sécurité et contrôle d'accès

- **Middleware RBAC** (`src/middleware.ts`) : vérifie le rôle à chaque requête de page
- **Row Level Security (RLS)** : activé sur toutes les tables Supabase — chaque ligne est filtrée par `entity_id` et le rôle de l'utilisateur connecté
- **Routes protégées** : `/admin`, `/trainer`, `/client`, `/learner` → redirection vers `/login` si non authentifié
- **Flag `has_crm_access`** : accès CRM granulaire par utilisateur (indépendant du rôle)

---

## 3. Technologies et dépendances

### Framework et runtime

| Technologie | Version | Rôle |
|-------------|---------|------|
| Next.js | ^14.2.35 | Framework fullstack (App Router SSR/CSR) |
| React | ^18.3.1 | Librairie UI |
| TypeScript | ^5 | Typage statique |
| Node.js | 18.x | Runtime serveur |

### Base de données et authentification

| Technologie | Version | Rôle |
|-------------|---------|------|
| @supabase/supabase-js | ^2.78.0 | Client Supabase (DB + Auth) |
| @supabase/ssr | ^0.8.0 | Authentification côté serveur (SSR) |
| pg | ^8.19.0 | Client PostgreSQL natif |

### Interface utilisateur

| Technologie | Version | Rôle |
|-------------|---------|------|
| tailwindcss | ^3.4.19 | Framework CSS utilitaire |
| @radix-ui/react-* | ^1.x / ^2.x | Primitives UI accessibles (Dialog, Select, Tabs, etc.) |
| lucide-react | ^0.575.0 | Bibliothèque d'icônes |
| class-variance-authority | ^0.7.1 | Variantes de composants |
| clsx | ^2.1.1 | Classes CSS conditionnelles |
| tailwind-merge | ^3.5.0 | Fusion de classes TailwindCSS |

### Formulaires et validation

| Technologie | Version | Rôle |
|-------------|---------|------|
| react-hook-form | ^7.71.1 | Gestion d'état des formulaires |
| @hookform/resolvers | ^5.2.2 | Adaptateurs de validation |
| zod | ^4.3.6 | Schémas de validation TypeScript |

### Éditeur de texte riche

| Technologie | Version | Rôle |
|-------------|---------|------|
| @tiptap/react | ^3.20.1 | Éditeur rich text (base) |
| @tiptap/starter-kit | ^3.20.1 | Extensions de base |
| @tiptap/extension-* | ^3.20.1 | Extensions : couleur, alignement, table, image, souligné, surlignage |
| dompurify | ^3.3.3 | Sanitisation HTML |

### Génération de documents

| Technologie | Version | Rôle |
|-------------|---------|------|
| jspdf | ^4.2.0 | Génération de fichiers PDF |
| html2canvas | ^1.4.1 | Capture HTML vers canvas (pour PDF) |
| pptxgenjs | ^4.0.1 | Génération de fichiers PowerPoint |
| xlsx | ^0.18.5 | Lecture/écriture de fichiers Excel |

### Extraction de documents

| Technologie | Version | Rôle |
|-------------|---------|------|
| mammoth | ^1.11.0 | Extraction de contenu depuis DOCX |
| pdf-parse | ^1.1.1 | Extraction de texte depuis PDF |
| officeparser | ^6.0.4 | Parsing de documents Office (PPT, DOC...) |

### Email

| Technologie | Version | Rôle |
|-------------|---------|------|
| resend | ^6.4.2 | Envoi d'emails transactionnels |

### Graphiques et données

| Technologie | Version | Rôle |
|-------------|---------|------|
| recharts | ^3.7.0 | Graphiques (bar, line, area) |
| @tanstack/react-table | ^8.21.3 | Tables de données avancées |

### Signature électronique

| Technologie | Version | Rôle |
|-------------|---------|------|
| react-signature-canvas | ^1.1.0-alpha.2 | Pad de signature SVG/canvas |

### Utilitaires

| Technologie | Version | Rôle |
|-------------|---------|------|
| date-fns | ^4.1.0 | Manipulation de dates |
| react-day-picker | ^9.13.2 | Sélecteur de dates |

---

## 4. Rôles utilisateurs et accès

### Tableau des accès par rôle

| Module | Admin | Trainer | Client | Learner |
|--------|-------|---------|--------|---------|
| Dashboard admin | ✅ | ❌ | ❌ | ❌ |
| Gestion clients | ✅ | ❌ | ❌ | ❌ |
| Gestion formateurs | ✅ | ❌ | ❌ | ❌ |
| Catalogue formations | ✅ | ❌ | ❌ | ❌ |
| Sessions | ✅ | Ses propres | ❌ | ❌ |
| Programmes | ✅ | ❌ | ❌ | ❌ |
| Questionnaires | ✅ | ❌ | ❌ | Répondre |
| Documents | ✅ | ❌ | ❌ | ❌ |
| Emails | ✅ | ❌ | ❌ | ❌ |
| Signatures | ✅ | Ses sessions | ❌ | Ses sessions |
| Rapports | ✅ | ❌ | ❌ | ❌ |
| CRM | ✅ (+ has_crm_access) | ❌ | ❌ | ❌ |
| E-Learning admin | ✅ | ❌ | ❌ | ❌ |
| Cours e-learning | ❌ | ❌ | ❌ | ✅ |
| Portail client | ❌ | ❌ | ✅ | ❌ |
| Portail formateur | ❌ | ✅ | ❌ | ❌ |

---

## 5. Modules Admin

### 5.1 Dashboard `/admin`

**Tableau de bord principal** avec personnalisation complète.

**Fonctionnalités :**
- **8 KPIs configurables** : clients actifs, nouveaux apprenants, sessions en cours, sessions terminées, CA réalisé, CA prévisionnel, taux de complétion, nombre de réponses questionnaires
- **Graphique mensuel** : inscriptions vs complétions sur l'année (Recharts AreaChart)
- **Calendrier triple vue** : Mois / Semaine / Jour avec navigation (affichage des sessions)
- **Alertes** : sessions sans compte-rendu, tâches CRM en retard
- **Activités récentes** : flux des dernières actions
- **Accès rapide** : boutons vers tous les modules
- **Widgets personnalisables** : 7 widgets activables/désactivables et réordonnables (persisté en localStorage)
- **Config KPIs** : sélection et ordre des KPIs persistés par entité (localStorage)

---

### 5.2 Clients `/admin/clients`

**Répertoire complet des entreprises clientes.**

**Fonctionnalités :**
- Liste avec recherche, filtres par statut (actif/inactif/prospect), pagination
- Création/modification/suppression (CRUD complet)
- **Intégration Pappers API** : auto-remplissage SIRET → nom, adresse, secteur
- **Fiche 360°** (`/admin/clients/[id]`) : infos entreprise, contacts, apprenants liés, sessions, documents contractuels, données financières
- **Gestion des contacts** : contacts multiples par client (is_primary)
- **Gestion des apprenants** par client

**Sous-modules :**

| Route | Description |
|-------|-------------|
| `/admin/clients/financeurs` | Financeurs OPCO/CPF/entreprise avec export Excel |
| `/admin/clients/apprenants` | Liste globale des apprenants avec recherche |
| `/admin/clients/apprenants/[id]` | Profil détaillé apprenant + inscriptions |
| `/admin/clients/apprenants/liste` | Vue liste complète |

---

### 5.3 Formateurs `/admin/trainers`

**Gestion de l'équipe pédagogique.**

**Fonctionnalités :**
- CRUD complet (formateurs internes et externes)
- **Matrice de compétences** : ajout/suppression avec niveau (débutant/intermédiaire/expert)
- Filtre par type et compétence
- Taux horaire et notes de disponibilité
- **CVthèque** (`/admin/trainers/cvtheque`) : upload et gestion des CVs

---

### 5.4 Formations `/admin/trainings`

**Catalogue des formations.**

**Fonctionnalités :**
- CRUD complet du catalogue
- **Catégories dynamiques** : créer, renommer, supprimer, réordonner, choisir une couleur — stocké en base Supabase (table `training_categories`)
- Classification : réglementaire / certifiant / qualifiant
- Mode : présentiel / distanciel / hybride
- Codes NSF (codes de spécialité formation)
- Certification / habilitation
- Prix par personne, durée, capacité max, prérequis
- Activé/désactivé
- Lien direct vers la gestion des sessions

**Sous-modules :**

| Route | Description |
|-------|-------------|
| `/admin/trainings/[id]` | Détail et édition d'une formation |
| `/admin/trainings/parcours` | Parcours de formation multi-étapes |
| `/admin/trainings/automation` | Automatisation de la gestion des formations |

---

### 5.5 Sessions `/admin/sessions`

**Planification et suivi des sessions de formation.**

**Fonctionnalités :**
- Création de sessions liées à une formation du catalogue
- Dates/heures, lieu, formateur, capacité
- Mode : présentiel / distanciel (lien Zoom) / hybride
- **Statuts** : À venir / En cours / Terminée / Annulée
- Gestion des inscriptions par session
- Statut d'inscription par apprenant : inscrit / confirmé / annulé / terminé
- Taux de complétion par apprenant
- **Auto-envoi de questionnaires** : quand une session passe à "Terminée", les questionnaires liés avec `auto_send_on_completion = true` sont envoyés automatiquement aux apprenants inscrits

---

### 5.6 Programmes pédagogiques `/admin/programs`

**Bibliothèque de programmes structurés.**

**Fonctionnalités :**
- CRUD complet des programmes (titre, objectifs, description, contenu JSON)
- **Versioning** : chaque modification crée une version (table `program_versions`) avec historique
- Éditeur de contenu riche (RichTextEditor Tiptap)
- Actif/inactif
- **Import PDF** (`/admin/programs/import`) : extraction automatique depuis un PDF pour créer un programme
- **Génération IA** via OpenAI API : génération automatique de programme à partir d'un titre/objectif

**Sous-modules :**

| Route | Description |
|-------|-------------|
| `/admin/programs/[id]` | Édition du programme |
| `/admin/programs/catalogue` | Catalogue des programmes |
| `/admin/programs/import` | Import depuis PDF |

---

### 5.7 Questionnaires `/admin/questionnaires`

**Création et gestion des enquêtes de satisfaction et d'évaluation.**

**Fonctionnalités :**
- Création de questionnaires avec types : satisfaction / évaluation / enquête
- **Types d'indicateurs Qualiopi** : pré-formation, pendant, post-formation, auto-évaluation, satisfaction, financeur, formateur, manager
- **Types de questions** : notation (1-5), texte libre, choix multiples, oui/non
- Réordonnancement des questions (drag & drop)
- Publication / brouillon
- **Distribution** : lier un questionnaire à une session ou une formation
- **Auto-envoi** : toggle "Envoyer automatiquement à la fin de la session" (stocké dans `questionnaire_sessions.auto_send_on_completion`)
- **Onglet Résultats** : voir les réponses par questionnaire + export CSV (UTF-8) + export PDF
- **Génération IA** de questions (`/api/ai/generate-survey`)
- Portail apprenant pour répondre : `/learner/questionnaires/[id]`

**Dashboard résultats** (`/admin/questionnaires/dashboard`) :
- KPIs globaux : total questionnaires, total réponses, taux moyen, score moyen
- Graphique barres des 10 questionnaires les plus actifs
- **Grille de couverture Qualiopi** : 12 indicateurs (vert = couvert, rouge = manquant)
- Tableau détaillé par questionnaire avec filtres (type, période)
- Export XLSX de toutes les statistiques

---

### 5.8 Documents `/admin/documents`

**Gestion des templates et génération de documents.**

**Fonctionnalités :**
- Création de templates avec éditeur Tiptap
- Types : convention / certificat / attestation / facture / autre
- **Variables dynamiques** : `{{learner.first_name}}`, `{{session.start_date}}`, `{{client.company_name}}`, etc. — résolution automatique depuis la base
- Génération à la volée pour une session/un apprenant/un client
- Stockage des documents générés (table `generated_documents` avec `file_url`)
- Téléchargement PDF

---

### 5.9 Emails `/admin/emails`

**Templates et historique des envois.**

**Fonctionnalités :**
- Bibliothèque de templates email (HTML + texte)
- Variables dynamiques identiques aux documents
- Types : convocation, confirmation, attestation, relance, autre
- Envoi via **Resend API**
- Envoi individuel ou par session (lot)
- **Historique complet** : destinataire, sujet, statut (envoyé/échoué/en attente), date, message d'erreur
- Envoi direct depuis la fiche prospect CRM

---

### 5.10 Signatures `/admin/signatures`

**Émargement électronique.**

**Fonctionnalités :**
- Pad de signature SVG dans le navigateur (react-signature-canvas)
- Signature par les **apprenants** (`/learner/sessions/[id]/sign`)
- Signature par les **formateurs** (`/trainer/sessions/[id]/sign`)
- Horodatage automatique
- Stockage base64 SVG en base (table `signatures`)
- Liaison signature ↔ document généré (`document_id`)
- Type de signataire : learner / trainer

---

### 5.11 Rapports `/admin/reports`

**Module de reporting complet et conformité.**

| Sous-module | Route | Description |
|-------------|-------|-------------|
| BPF | `/admin/reports/bpf` | Bilan Pédagogique et Financier complet (Sections A→G), export PDF professionnel |
| BPF E-learning | `/admin/reports/bpf-elearning` | BPF spécifique aux formations en ligne |
| Qualité Qualiopi | `/admin/reports/qualite` | Indicateurs des 7 critères Qualiopi |
| Commercial | `/admin/reports/commercial` | CA réalisé, taux de conversion, analyse par client |
| Absences | `/admin/reports/absences` | Suivi des absences par session et apprenant |
| Incidents | `/admin/reports/incidents` | Documentation et suivi des incidents de formation |
| Amélioration continue | `/admin/reports/amelioration` | Plans d'action et amélioration |

Tous les rapports supportent un **export XLSX**.

---

### 5.12 CRM `/admin/crm`

**Module de relation commerciale complet.**

#### Prospects — Kanban `/admin/crm/prospects`

- **Board Kanban** avec 7 colonnes par défaut : Lead / Contacté / Qualifié / Proposition / Gagné / Refus / Dormant
- **Drag & drop** des fiches entre colonnes
- Personnalisation des colonnes : renommer, changer la couleur, réordonner
- Ajout rapide depuis n'importe quelle colonne
- Filtres : recherche texte, tags, plage de dates
- **Intégration Pappers** : auto-remplissage depuis le SIRET
- Tags de catégorisation colorés
- **Assignation** à un commercial (`assigned_to`)

**Fiche prospect** (`/admin/crm/prospects/[id]`) :
- Informations complètes + notes
- Historique des actions
- Emails envoyés (`/admin/crm/prospects/[id]/email`)
- Devis liés

**Vue Portefeuille** (`/admin/crm/prospects/portfolio`) :
- Résumé global (nb commerciaux actifs, total prospects, valeur pipeline)
- **Cartes par commercial** : avatar initiales, répartition par statut, valeur pipeline (devis liés), taux de conversion, tâches en cours
- Section "Non assignés"
- Filtre par période (mois / trimestre / année)
- Clic → filtre le kanban sur ce commercial

#### Tâches `/admin/crm/tasks`

- Création/modification/suppression de tâches
- Priorité : haute / moyenne / basse
- Statut : en attente / en cours / terminée / annulée
- Date d'échéance avec alertes retard
- Assignation à un membre de l'équipe
- Lien avec un prospect ou client

#### Devis `/admin/crm/quotes`

- Création de devis numérotés
- Statuts : brouillon / envoyé / accepté / refusé / expiré
- Association prospect ou client
- Montant HT + date de validité
- **Export PDF professionnel** du devis

#### Campagnes `/admin/crm/campaigns`

- Création de campagnes email
- Cibles : tous les clients / tous les prospects / segment personnalisé
- **Segmentation avancée** : filtres par statut prospect, source, score, participation formation, secteur client, ville, tags, plage de dates
- **Aperçu du segment** : affichage du nombre de destinataires ciblés avant envoi
- Statuts : brouillon / planifié / envoyé / annulé
- **Planification** : possibilité de programmer l'envoi à une date future
- Compteur d'envois et suivi des métriques

#### Différence entre Campagnes CRM et module Emails

Le module **Emails** (`/admin/emails`) et les **Campagnes CRM** (`/admin/crm/campaigns`) gèrent tous les deux des envois d'emails, mais leur usage est fondamentalement différent :

- **Emails** = communication **opérationnelle** (1-to-1), déclenchée par une action métier (convocation à une session, confirmation d'inscription, relance, attestation…)
- **Campagnes CRM** = communication **marketing** (1-to-many), initiée par l'équipe commerciale pour de la prospection ou de la communication de masse

| | **Emails** (`/admin/emails`) | **Campagnes CRM** (`/admin/crm/campaigns`) |
|---|---|---|
| **Objectif** | Communication opérationnelle | Marketing / prospection |
| **Cible** | 1 destinataire à la fois | Groupe segmenté (clients, prospects, segment custom) |
| **Déclencheur** | Action métier (session, formation…) | Initiative commerciale |
| **Templates** | Oui, avec variables dynamiques (`{{learner_name}}`, `{{session_date}}`…) | Sujet + corps libre |
| **Planification** | Non (envoi immédiat) | Oui (date programmable) |
| **Types** | Convocation, confirmation, relance, attestation, autre | Campagne unique avec ciblage |
| **Historique** | Suivi par email (envoyé/échoué/en attente) | Suivi par campagne (compteur d'envois, statut) |
| **Intégration** | Envoi via Gmail (OAuth) ou Resend (fallback) | Envoi groupé via le système d'emails |

---

### 5.13 E-Learning `/admin/elearning`

**Plateforme de formation en ligne avec génération IA.**

#### Création de cours (`/admin/elearning/create`)

1. **Upload** d'un document source (PDF, DOCX, PPT/PPTX)
2. **Extraction automatique** du texte
3. **Génération IA** (OpenAI) : titre, description, objectifs, chapitres, contenu HTML, quiz, flashcards
4. Suivi de la progression en temps réel (GenerationProgress)

#### Structure d'un cours

- **Chapitres** ordonnés avec contenu HTML riche
- **Quiz par chapitre** : questions choix multiples / vrai-faux / réponse courte, score de passage
- **Flashcards** par chapitre et globales au cours
- **Examen final** : banque de questions avec difficulté, score de passage configurable
- **Spécifications de slides** pour présentation

#### Fonctionnalités avancées

| Fonctionnalité | Description |
|----------------|-------------|
| Statuts de génération | pending / extracting / generating / completed / failed |
| Intégration Gamma | Génération de présentations thématiques via Gamma API |
| Export PowerPoint | Export PPTX du cours complet (`/api/elearning/[courseId]/export-pptx`) |
| Mode présentation | Slideshow interactif (`/present/[courseId]`) |
| Sessions live | Mode présentateur en direct avec synchronisation des slides |
| Inscriptions | Les apprenants s'inscrivent aux cours (auto ou par admin) |
| Suivi progression | Avancement par chapitre, score quiz, score examen final |

#### Sous-modules

| Route | Description |
|-------|-------------|
| `/admin/elearning` | Dashboard et liste des cours |
| `/admin/elearning/create` | Création d'un cours depuis un document |
| `/admin/elearning/courses/[courseId]` | Édition et gestion d'un cours |
| `/admin/elearning/lms` | Connexion à un LMS externe |

---

### 5.14 Modules complémentaires

| Module | Route | Description |
|--------|-------|-------------|
| Planning | `/admin/planning` | Outil de planification avancé |
| Lieux | `/admin/lieux` | Gestion des salles et lieux de formation |
| Affacturage | `/admin/affacturage` | Factoring et gestion des factures |
| Parrainage | `/admin/parrainage` | Programme de parrainage/référencement |
| Veille | `/admin/veille` | Veille concurrentielle et sectorielle |
| Support - Appels | `/admin/support/appel` | Gestion des appels entrants/sortants |
| Support - Démos | `/admin/support/demo` | Planification et suivi des démos produit |
| Journal d'activité | `/admin/activity` | Audit trail complet de toutes les actions |
| Notifications | `/admin/notifications` | Centre de notifications et alertes |
| Migration | `/admin/migration` | Import de données depuis systèmes tiers |
| Utilisateurs | `/admin/users` | Gestion des comptes et rôles |
| Profil | `/admin/profile` | Paramètres du compte administrateur |

---

## 6. Portails utilisateurs

### 6.1 Portail Formateur `/trainer`

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/trainer` | KPIs (sessions, heures), planning de la semaine, prochaines sessions, compétences |
| Planning | `/trainer/planning` | Vue calendrier des sessions assignées |
| Sessions | `/trainer/sessions` | Liste des sessions avec filtres par statut |
| Signature session | `/trainer/sessions/[id]/sign` | Pad de signature pour émargement |
| Contrats | `/trainer/contracts` | Consultation et gestion des contrats |
| Profil | `/trainer/profile` | Mise à jour des informations personnelles et compétences |

---

### 6.2 Portail Client `/client`

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/client` | Vue d'ensemble : apprenants actifs, sessions, statistiques de complétion |
| Formations | `/client/formations` | Sessions disponibles et inscriptions |
| Apprenants | `/client/learners` | Gestion des apprenants de l'entreprise |
| Profil | `/client/profile` | Informations du compte client |

---

### 6.3 Portail Apprenant `/learner`

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/learner` | Formations en cours, à venir, terminées · Attestations · Progression |
| Cours | `/learner/courses` | Catalogue des cours e-learning disponibles |
| Cours détail | `/learner/courses/[courseId]` | Progression, chapitres, quiz, flashcards, examen final |
| Sessions | `/learner/sessions` | Planning des sessions de formation |
| Signature | `/learner/sessions/[id]/sign` | Émargement électronique |
| Questionnaires | `/learner/questionnaires` | Liste des enquêtes disponibles |
| Répondre | `/learner/questionnaires/[id]` | Formulaire de réponse |
| Profil | `/learner/profile` | Informations personnelles |

---

## 7. Routes API

### Authentification & Utilisateurs

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/auth/register-referral` | Inscription via lien de parrainage |
| GET | `/api/admin/users` | Liste des utilisateurs de l'entité |
| POST | `/api/admin/change-password` | Modification du mot de passe |

### Clients

| Méthode | Route | Description |
|---------|-------|-------------|
| GET / POST | `/api/clients` | Lister / créer des clients |
| GET / PUT / DELETE | `/api/clients/[id]` | Lire / modifier / supprimer un client |

### Formations & Sessions

| Méthode | Route | Description |
|---------|-------|-------------|
| GET / POST | `/api/trainings` | Catalogue formations |
| GET / POST | `/api/sessions` | Sessions |
| GET / PUT / DELETE | `/api/sessions/[id]` | Gestion d'une session |
| GET / POST | `/api/enrollments` | Inscriptions |
| POST | `/api/enrollments/self-enroll` | Auto-inscription apprenant |

### Formateurs

| Méthode | Route | Description |
|---------|-------|-------------|
| GET / POST | `/api/trainers` | Liste / création |
| GET / PUT / DELETE | `/api/trainers/[id]` | CRUD formateur |
| POST | `/api/trainers/[id]/cv` | Upload CV |

### Programmes

| Méthode | Route | Description |
|---------|-------|-------------|
| GET / POST | `/api/programs` | Programmes pédagogiques |
| POST | `/api/programs/import-pdf` | Import depuis PDF |

### E-Learning

| Méthode | Route | Description |
|---------|-------|-------------|
| GET / POST | `/api/elearning` | Courses |
| GET / PUT / DELETE | `/api/elearning/[courseId]` | CRUD cours |
| POST | `/api/elearning/[courseId]/extract` | Extraction du document source |
| POST | `/api/elearning/[courseId]/generate` | Génération IA du contenu |
| POST | `/api/elearning/[courseId]/publish` | Publier le cours |
| GET / POST | `/api/elearning/[courseId]/chapters/[chapterId]` | Chapitres |
| GET | `/api/elearning/[courseId]/export-pptx` | Export PowerPoint |
| POST | `/api/elearning/[courseId]/gamma` | Intégration Gamma |
| GET | `/api/elearning/[courseId]/slides` | Spécifications slides |
| POST | `/api/elearning/[courseId]/live-session` | Session live |
| GET | `/api/elearning/[courseId]/global-flashcards` | Flashcards globales |
| GET / POST | `/api/elearning/[courseId]/enroll` | Inscription |
| GET | `/api/elearning/progress` | Progression apprenants |
| GET | `/api/elearning/scores` | Scores |
| GET / POST | `/api/elearning/final-exam/[courseId]` | Examen final |
| POST | `/api/elearning/final-exam/[courseId]/submit` | Soumettre examen |
| GET / POST | `/api/elearning/quiz/[chapterId]/submit` | Soumettre quiz |
| POST | `/api/elearning/extract-url` | Extraire contenu d'une URL |
| GET | `/api/elearning/gamma-themes` | Thèmes Gamma disponibles |

### IA

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/ai/generate-program` | Générer un programme avec OpenAI |
| POST | `/api/ai/generate-survey` | Générer des questions de questionnaire |

### Documents & Emails

| Méthode | Route | Description |
|---------|-------|-------------|
| GET / POST | `/api/documents` | Gestion des documents |
| GET / POST | `/api/signatures` | Gestion des signatures |
| POST | `/api/emails/send` | Envoi d'email via Resend |

### CRM

| Méthode | Route | Description |
|---------|-------|-------------|
| GET / POST | `/api/crm/prospects` | Prospects |
| GET / POST | `/api/crm/tasks` | Tâches |
| GET / POST | `/api/crm/quotes` | Devis |
| GET / POST | `/api/crm/campaigns` | Campagnes email |
| GET / POST | `/api/crm/tags` | Tags |
| GET / POST | `/api/crm/notifications/generate` | Génération des notifications CRM |

### APIs externes (proxy)

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/pappers/search` | Recherche d'entreprise (Pappers) |
| GET | `/api/pappers/company` | Détail d'une entreprise (Pappers) |
| GET | `/api/infogreffe/search` | Recherche Infogreffe |

---

## 8. Base de données

**44 tables** — PostgreSQL via Supabase avec RLS activé sur toutes les tables.

### Entités et organisation

| Table | Description | Clés principales |
|-------|-------------|-----------------|
| `entities` | Organisations (MR/C3V FORMATION) | id, name, slug, theme_color |
| `profiles` | Profils utilisateurs (étend auth.users) | id, entity_id, role, full_name, email, has_crm_access |
| `activity_log` | Journal d'audit complet | id, entity_id, user_id, action, resource_type, details |
| `referrals` | Programme de parrainage | id, referral_code, referrer_user_id, referred_user_id |

### Clients et contacts

| Table | Description | Clés principales |
|-------|-------------|-----------------|
| `clients` | Entreprises clientes | id, entity_id, company_name, siret, status |
| `contacts` | Contacts au sein des clients | id, client_id, email, is_primary |
| `client_documents` | Documents contractuels | id, client_id, name, type, file_url |

### Apprenants et formateurs

| Table | Description | Clés principales |
|-------|-------------|-----------------|
| `learners` | Stagiaires/apprenants | id, entity_id, client_id, learner_type |
| `trainers` | Formateurs | id, entity_id, type (internal/external), hourly_rate |
| `trainer_competencies` | Compétences des formateurs | id, trainer_id, competency, level |

### Formations et sessions

| Table | Description | Clés principales |
|-------|-------------|-----------------|
| `trainings` | Catalogue des formations | id, entity_id, title, classification, nsf_code, price |
| `training_categories` | Catégories dynamiques | id, entity_id, name, color, order_index |
| `sessions` | Sessions de formation | id, training_id, entity_id, status, mode, trainer_id |
| `enrollments` | Inscriptions aux sessions | id, session_id, learner_id, status, completion_rate |

### Programmes et contenu

| Table | Description | Clés principales |
|-------|-------------|-----------------|
| `programs` | Programmes pédagogiques | id, entity_id, title, content (JSONB), version |
| `program_versions` | Historique des versions | id, program_id, version, content, created_by |

### E-Learning

| Table | Description | Clés principales |
|-------|-------------|-----------------|
| `elearning_courses` | Cours en ligne | id, entity_id, title, status, generation_status |
| `elearning_chapters` | Chapitres | id, course_id, content_html, order_index, gamma_deck_id |
| `elearning_quizzes` | Quiz par chapitre | id, chapter_id, passing_score |
| `elearning_quiz_questions` | Questions de quiz | id, quiz_id, question_type, options (JSONB) |
| `elearning_flashcards` | Flashcards par chapitre | id, chapter_id, front_text, back_text |
| `elearning_global_flashcards` | Flashcards globales | id, course_id, front_text, back_text |
| `elearning_final_exam_questions` | Banque de questions examen | id, course_id, difficulty, topic |
| `elearning_enrollments` | Inscriptions aux cours | id, course_id, learner_id, status, completion_rate |
| `elearning_chapter_progress` | Progression par chapitre | id, enrollment_id, chapter_id, quiz_score, is_completed |
| `elearning_final_exam_progress` | Progression examen final | id, enrollment_id, score, passed, attempts |
| `elearning_slide_specs` | Spécifications slides | id, course_id, slide_spec (JSONB) |
| `elearning_live_sessions` | Sessions live | id, course_id, presenter_id, current_slide_index |

### Questionnaires

| Table | Description | Clés principales |
|-------|-------------|-----------------|
| `questionnaires` | Templates de questionnaires | id, entity_id, type, quality_indicator_type, is_active |
| `questions` | Questions | id, questionnaire_id, type, options (JSONB), order_index |
| `questionnaire_sessions` | Liaison questionnaire ↔ session | questionnaire_id, session_id, auto_send_on_completion |
| `questionnaire_responses` | Réponses soumises | id, questionnaire_id, learner_id, responses (JSONB) |

### Documents, Emails et Signatures

| Table | Description | Clés principales |
|-------|-------------|-----------------|
| `document_templates` | Templates de documents | id, entity_id, name, type, content, variables (JSONB) |
| `generated_documents` | Documents générés | id, template_id, session_id, learner_id, file_url |
| `email_templates` | Templates d'emails | id, entity_id, name, subject, body, type |
| `email_history` | Historique des envois | id, entity_id, recipient_email, status, error_message |
| `signatures` | Signatures électroniques | id, session_id, signer_id, signer_type, signature_data |

### CRM

| Table | Description | Clés principales |
|-------|-------------|-----------------|
| `crm_prospects` | Prospects commerciaux | id, entity_id, status, assigned_to, converted_client_id |
| `crm_tasks` | Tâches CRM | id, entity_id, status, priority, due_date, assigned_to |
| `crm_quotes` | Devis | id, entity_id, reference, amount, status, valid_until |
| `crm_campaigns` | Campagnes email | id, entity_id, name, status, target_type, sent_count |
| `crm_notifications` | Notifications CRM | id, entity_id, type, message, related_prospect_id |
| `crm_tags` | Tags de catégorisation | id, entity_id, name, color |

### Financier

| Table | Description | Clés principales |
|-------|-------------|-----------------|
| `bpf_financial_data` | Données financières BPF | id, entity_id, fiscal_year, section_c/d/g (JSONB) |

---

## 9. Intégrations externes

| Service | Clé d'env | Usage |
|---------|-----------|-------|
| **Supabase** | `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` | Base de données PostgreSQL + Authentification + Stockage |
| **Resend** | `RESEND_API_KEY` | Envoi d'emails transactionnels (convocations, attestations, questionnaires auto) |
| **OpenAI** | `OPENAI_API_KEY` | Génération IA : programmes pédagogiques, questionnaires, contenu e-learning |
| **Pappers** | `PAPPERS_API_KEY` | Recherche et enrichissement de données entreprises (SIRET, adresse, secteur) |
| **Infogreffe** | `INFOGREFFE_API_KEY` | Données légales d'entreprises françaises |
| **Gamma** | `GAMMA_API_KEY` | Génération de présentations thématiques pour les cours e-learning |

---

## 10. Configuration et déploiement

### Variables d'environnement (`.env.local`)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://[project-ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[anon JWT]
SUPABASE_SERVICE_ROLE_KEY=[service-role JWT]

# Application
NEXT_PUBLIC_APP_URL=https://votre-domaine.com

# Email
RESEND_API_KEY=re_[...]

# Intelligence artificielle
OPENAI_API_KEY=sk-proj-[...]

# Données entreprises
PAPPERS_API_KEY=[...]
INFOGREFFE_API_KEY=[...]

# Présentation
GAMMA_API_KEY=sk-gamma-[...]
```

### Commandes de développement

```bash
# Démarrer le serveur de développement
npm run dev

# Build de production
npm run build

# Démarrer en mode production
npm run start

# Linting
npm run lint
```

### Déploiement recommandé

| Composant | Service recommandé |
|-----------|-------------------|
| Application Next.js | **Vercel** (déploiement automatique depuis GitHub) |
| Base de données | **Supabase Cloud** (PostgreSQL hébergé) |
| Stockage fichiers | **Supabase Storage** (CV, documents générés, images) |
| Emails | **Resend** (transactionnel) |

### Fichiers de configuration

| Fichier | Description |
|---------|-------------|
| `next.config.mjs` | Optimisation images (domaines Supabase autorisés), headers de sécurité |
| `tailwind.config.ts` | Thème ShadCN avec variables CSS, couleurs personnalisées |
| `tsconfig.json` | Strict mode, alias `@/*` → `./src/*` |
| `postcss.config.mjs` | TailwindCSS + Autoprefixer |
| `eslint.config.mjs` | Configuration ESLint Next.js |

---

*Documentation générée en Mars 2026 — Plateforme LMS MR FORMATION v1.0*
