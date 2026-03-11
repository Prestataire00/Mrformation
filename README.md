# LMS MR FORMATION - Plateforme de Formation

Une plateforme de gestion de formations professionnelles complète, construite avec Next.js 14 et Supabase. Elle permet de gérer l'intégralité du cycle de vie de la formation : de la prospection CRM à la signature électronique des feuilles d'émargement, en passant par la gestion des clients, formateurs, sessions et documents.

La plateforme supporte deux entités indépendantes : **MR FORMATION** et **C3V FORMATION**, chacune avec ses propres données, utilisateurs et personnalisation.

---

## Table des matières

- [Stack Technologique](#stack-technologique)
- [Fonctionnalités](#fonctionnalités)
- [Rôles Utilisateurs](#rôles-utilisateurs)
- [Entités](#entités)
- [Installation](#installation)
- [Variables d'Environnement](#variables-denvironnement)
- [Configuration Supabase](#configuration-supabase)
- [Structure du Projet](#structure-du-projet)
- [Déploiement](#déploiement)

---

## Stack Technologique

| Technologie | Version | Usage |
|---|---|---|
| [Next.js](https://nextjs.org) | 14.x | Framework React (App Router, Server Actions) |
| [React](https://react.dev) | 18.x | Bibliothèque UI |
| [TypeScript](https://typescriptlang.org) | 5.x | Typage statique |
| [Supabase](https://supabase.com) | 2.x | Base de données PostgreSQL + Auth + Storage |
| [Tailwind CSS](https://tailwindcss.com) | 3.x | Styles utilitaires |
| [shadcn/ui](https://ui.shadcn.com) | - | Composants UI (Radix UI + Tailwind) |
| [React Hook Form](https://react-hook-form.com) | 7.x | Gestion des formulaires |
| [Zod](https://zod.dev) | 4.x | Validation des schémas |
| [TanStack Table](https://tanstack.com/table) | 8.x | Tableaux de données avancés |
| [Recharts](https://recharts.org) | 3.x | Graphiques et visualisations |
| [date-fns](https://date-fns.org) | 4.x | Manipulation des dates |
| [Lucide React](https://lucide.dev) | - | Icônes |
| [react-signature-canvas](https://github.com/agilgur5/react-signature-canvas) | - | Signatures électroniques |

---

## Fonctionnalités

### Dashboard
- Vue d'ensemble avec statistiques clés (sessions, clients, formateurs, taux de satisfaction)
- Graphiques de progression et d'activité
- Prochaines sessions et alertes

### Clients
- Gestion des entreprises clientes (SIRET, adresse, secteur)
- Contacts multiples par entreprise (contact principal, DRH, RH, etc.)
- Historique des formations commandées
- Statuts : actif, inactif, prospect

### Formateurs
- Répertoire des formateurs internes et externes
- Compétences et niveaux (débutant, intermédiaire, expert)
- Disponibilités et taux horaire
- Biographie et documents associés

### Formations
- Catalogue de formations avec objectifs pédagogiques
- Durée, prix par personne, nombre max de participants
- Catégories, certifications et prérequis
- Activation/désactivation des formations

### Sessions
- Planification des sessions (dates, lieu, mode : présentiel / distanciel / hybride)
- Association formateur - formation
- Gestion des inscriptions par session
- Statuts : à venir, en cours, terminée, annulée

### Programmes
- Programmes pédagogiques structurés (contenu JSONB)
- Versionnement des programmes
- Liaison avec les sessions de formation

### Questionnaires
- Création de questionnaires de satisfaction, d'évaluation ou de sondage
- Types de questions : note, texte, choix multiple, oui/non
- Collecte et analyse des réponses par session

### Documents
- Modèles de documents avec variables dynamiques (convention, attestation, feuille d'émargement, facture)
- Génération de documents par session / client / apprenant
- Stockage des fichiers générés (URL Supabase Storage)

### Emails
- Bibliothèque de modèles d'emails avec variables
- Historique des envois (destinataire, statut, date)
- Types d'emails : confirmation, rappel, attestation, etc.

### Signatures
- Signature électronique pour les apprenants et les formateurs
- Association signature - session - document
- Stockage sécurisé des données de signature (base64)

### Rapports
- Rapports d'activité par période et par entité
- Statistiques sur les sessions, clients, apprenants
- Taux de satisfaction agrégé et par formation
- Chiffre d'affaires et indicateurs financiers

### CRM
- Gestion des prospects (pipeline de vente)
- Statuts prospects : nouveau, contacté, qualifié, proposition, gagné, perdu
- Tâches et relances avec priorités et échéances
- Devis (référence, montant, statut, date de validité)
- Campagnes email (cible, planification, suivi d'envoi)
- Conversion prospect -> client

---

## Rôles Utilisateurs

| Rôle | Description | Accès |
|---|---|---|
| **Admin** | Administrateur de la plateforme | Accès complet à tous les modules de son entité |
| **Formateur** | Formateur interne ou externe | Ses sessions, ses apprenants, ses documents |
| **Client** | Responsable formation d'une entreprise | Ses sessions commandées, ses apprenants, ses documents |
| **Apprenant** | Participant aux formations | Ses formations, ses attestations, ses questionnaires |

Les rôles sont gérés via la table `profiles` liée à `auth.users` de Supabase. Chaque utilisateur appartient à une entité et ne peut voir que les données de son entité (Row Level Security).

---

## Entités

La plateforme héberge deux entités de formation totalement indépendantes :

| Entité | Slug | Couleur |
|---|---|---|
| **MR FORMATION** | `mr-formation` | Bleu (`#2563EB`) |
| **C3V FORMATION** | `c3v-formation` | Violet (`#7C3AED`) |

Chaque entité possède ses propres clients, formateurs, formations, sessions, documents et utilisateurs. Les données ne se croisent pas grâce au champ `entity_id` présent sur toutes les tables et aux politiques RLS de Supabase.

---

## Installation

### Prérequis

- Node.js >= 18.x
- npm >= 9.x
- Un compte [Supabase](https://supabase.com) (gratuit)
- (Optionnel) Un compte [Vercel](https://vercel.com) pour le déploiement

### Etapes

**1. Cloner le dépôt**

```bash
git clone https://github.com/votre-organisation/lms-platform.git
cd lms-platform
```

**2. Installer les dépendances**

```bash
npm install
```

**3. Configurer les variables d'environnement**

Copiez le fichier d'exemple et renseignez vos valeurs :

```bash
cp .env.local.example .env.local
```

Puis ouvrez `.env.local` et renseignez les valeurs (voir section [Variables d'Environnement](#variables-denvironnement)).

**4. Configurer Supabase**

Créez votre projet Supabase et initialisez la base de données (voir section [Configuration Supabase](#configuration-supabase)).

**5. Lancer le serveur de développement**

```bash
npm run dev
```

Ouvrez [http://localhost:3000](http://localhost:3000) dans votre navigateur.

---

## Variables d'Environnement

Créez un fichier `.env.local` à la racine du projet avec les variables suivantes :

```env
# Supabase - Disponible dans Settings > API de votre projet Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Optionnel: Service Role Key (pour les opérations admin côté serveur uniquement)
# SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Optionnel: URL de base de l'application (utile pour les callbacks auth en prod)
# NEXT_PUBLIC_APP_URL=https://votre-domaine.vercel.app
```

> **Important** : Ne committez jamais votre `.env.local` dans git. Il est déjà dans le `.gitignore`.

---

## Configuration Supabase

### 1. Créer un projet Supabase

1. Rendez-vous sur [supabase.com](https://supabase.com) et créez un compte
2. Cliquez sur **New Project**
3. Choisissez un nom, un mot de passe fort pour la base de données, et une région proche de vos utilisateurs (ex: `eu-west-1` pour la France)
4. Attendez que le projet soit initialisé (~2 minutes)

### 2. Récupérer les clés API

Dans votre projet Supabase :
- Allez dans **Settings** > **API**
- Copiez **Project URL** -> `NEXT_PUBLIC_SUPABASE_URL`
- Copiez **anon public** key -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 3. Initialiser le schéma de base de données

1. Dans le menu de gauche, cliquez sur **SQL Editor**
2. Cliquez sur **New query**
3. Copiez-collez le contenu complet du fichier `supabase/schema.sql`
4. Cliquez sur **Run** (ou Ctrl+Entrée)

Ce script crée toutes les tables, les triggers, les politiques RLS et insère les deux entités (MR FORMATION et C3V FORMATION).

### 4. Créer le premier utilisateur admin

1. Allez dans **Authentication** > **Users** dans Supabase
2. Cliquez sur **Add user** > **Create new user**
3. Renseignez un email et un mot de passe
4. Allez dans **Table Editor** > table `profiles`
5. Trouvez le profil créé automatiquement (via le trigger) et mettez à jour :
   - `role` -> `admin`
   - `entity_id` -> l'UUID de l'entité souhaitée (MR FORMATION ou C3V FORMATION)
   - `first_name`, `last_name` -> vos informations

### 5. (Optionnel) Charger les données de démonstration

Pour charger des données de démonstration :

1. Assurez-vous qu'au moins un utilisateur auth existe dans votre projet
2. Dans **SQL Editor**, créez une nouvelle requête
3. Copiez-collez le contenu de `supabase/seed.sql`
4. Cliquez sur **Run**

### 6. Configurer le Storage (optionnel)

Pour activer le stockage de fichiers (documents générés, avatars) :

1. Allez dans **Storage** dans Supabase
2. Créez un bucket `documents` (privé)
3. Créez un bucket `avatars` (public)

---

## Structure du Projet

```
lms-platform/
├── public/                         # Fichiers statiques publics
├── src/
│   ├── app/                        # App Router Next.js 14
│   │   ├── (auth)/                 # Groupe de routes : authentification
│   │   │   ├── login/              # Page de connexion
│   │   │   └── register/           # Page d'inscription
│   │   ├── (dashboard)/            # Groupe de routes : tableau de bord
│   │   │   └── admin/              # Routes admin
│   │   │       ├── page.tsx        # Dashboard principal
│   │   │       ├── clients/        # Module clients
│   │   │       ├── trainers/       # Module formateurs
│   │   │       ├── trainings/      # Module catalogue formations
│   │   │       ├── sessions/       # Module sessions
│   │   │       ├── programs/       # Module programmes pédagogiques
│   │   │       ├── questionnaires/ # Module questionnaires
│   │   │       ├── documents/      # Module documents
│   │   │       ├── emails/         # Module emails
│   │   │       ├── signatures/     # Module signatures électroniques
│   │   │       ├── reports/        # Module rapports
│   │   │       └── crm/            # Module CRM (prospects, devis, campagnes)
│   │   ├── api/                    # Routes API Next.js (Server Actions)
│   │   ├── globals.css             # Styles globaux
│   │   ├── layout.tsx              # Layout racine
│   │   └── page.tsx                # Page d'accueil (redirection)
│   ├── components/                 # Composants React réutilisables
│   │   ├── ui/                     # Composants UI de base (shadcn/ui)
│   │   └── ...                     # Composants métier
│   ├── lib/                        # Utilitaires et configuration
│   │   ├── supabase/               # Clients Supabase (browser & server)
│   │   └── utils.ts                # Fonctions utilitaires
│   └── types/                      # Types TypeScript globaux
├── supabase/
│   ├── schema.sql                  # Schéma complet de la base de données
│   └── seed.sql                    # Données de démonstration
├── .env.local                      # Variables d'environnement (non commité)
├── next.config.mjs                 # Configuration Next.js
├── tailwind.config.ts              # Configuration Tailwind CSS
├── tsconfig.json                   # Configuration TypeScript
└── package.json                    # Dépendances et scripts
```

---

## Déploiement

### Déploiement sur Vercel (recommandé)

Vercel est la plateforme de déploiement officielle pour Next.js et offre une intégration native.

**1. Préparer le projet**

Assurez-vous que votre code est poussé sur un dépôt GitHub, GitLab ou Bitbucket.

**2. Importer le projet sur Vercel**

1. Rendez-vous sur [vercel.com](https://vercel.com) et connectez-vous
2. Cliquez sur **Add New** > **Project**
3. Importez votre dépôt
4. Vercel détecte automatiquement Next.js

**3. Configurer les variables d'environnement**

Dans le panneau Vercel, avant de déployer :
1. Allez dans **Settings** > **Environment Variables**
2. Ajoutez les variables suivantes pour `Production`, `Preview` et `Development` :
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**4. Déployer**

Cliquez sur **Deploy**. Vercel construit et déploie automatiquement votre application.

**5. Configurer l'URL de callback Supabase**

Après déploiement, récupérez votre URL Vercel (ex: `https://lms-platform.vercel.app`) et dans Supabase :
1. Allez dans **Authentication** > **URL Configuration**
2. Ajoutez votre URL dans **Redirect URLs** : `https://votre-domaine.vercel.app/**`

**Déploiements automatiques**

Chaque push sur la branche `main` déclenche automatiquement un nouveau déploiement en production. Les pull requests génèrent des déploiements de preview.

### Autres plateformes

Le projet peut être déployé sur toute plateforme supportant Node.js 18+ :
- **Railway** : `railway up`
- **Render** : Connectez votre dépôt et configurez `npm run build` + `npm run start`
- **Self-hosted** : Buildez avec `npm run build` et lancez avec `npm run start`

---

## Scripts disponibles

```bash
npm run dev        # Lance le serveur de développement sur http://localhost:3000
npm run build      # Construit l'application pour la production
npm run start      # Lance le serveur de production (après build)
npm run lint       # Analyse le code avec ESLint
```

---

## Licence

Projet privé - MR FORMATION / C3V FORMATION. Tous droits réservés.
