# Tests E2E — MR Formation / C3V Formation

Suite de tests end-to-end Playwright couvrant l'ensemble du CRM V1.

## Prérequis

- Node.js 20+
- Playwright installé : `npx playwright install`
- Fichier `.env.test` à la racine avec les credentials de test :

```env
TEST_ADMIN_EMAIL=admin@mrformation.fr
TEST_ADMIN_PASSWORD=password
TEST_COMMERCIAL_EMAIL=commercial@mrformation.fr
TEST_COMMERCIAL_PASSWORD=password
TEST_TRAINER_EMAIL=formateur@mrformation.fr
TEST_TRAINER_PASSWORD=password
TEST_CLIENT_EMAIL=client@mrformation.fr
TEST_CLIENT_PASSWORD=password
TEST_LEARNER_EMAIL=apprenant@mrformation.fr
TEST_LEARNER_PASSWORD=password
```

## Lancer les tests

```bash
# Tous les tests (headless)
npm run test:e2e

# Avec l'interface UI Playwright
npm run test:e2e:ui

# Un fichier spécifique
npx playwright test e2e/magic-links.spec.ts

# Voir le rapport après exécution
npm run test:e2e:report
```

## Structure

```
e2e/
├── helpers/
│   └── auth.ts                  # Login helpers par rôle
├── auth.spec.ts                 # Authentification, login, rôles
├── dashboard.spec.ts            # Dashboard admin
├── formation.spec.ts            # Module formation (liste)
├── formation-detail.spec.ts     # Détail formation (onglets)
├── clients.spec.ts              # Gestion clients
├── devis.spec.ts                # Devis rapide
├── devis-complet.spec.ts        # Devis complet
├── crm-prospect.spec.ts         # CRM prospects
├── crm-full.spec.ts             # CRM complet
├── factures-global.spec.ts      # Factures globales
├── trainings-kanban.spec.ts     # Kanban formations
├── workflows.spec.ts            # Workflows
├── automatisation.spec.ts       # Automatisation
├── convention.spec.ts           # Conventions
├── email-variables.spec.ts      # Variables email
├── rls-security.spec.ts         # Sécurité RLS
├── sidebar-navigation.spec.ts   # Navigation sidebar
├── pages-publiques.spec.ts      # Pages publiques
├── prospect-ia.spec.ts          # Prospects IA
│
│  ── Nouvelles features V1 (avril 2026) ──
├── magic-links.spec.ts          # Magic links apprenants
├── signatures-emargement.spec.ts# Signatures dans PDF émargement
├── timeline-questionnaires.spec.ts # Timeline questionnaires formation
├── cvtheque-ia.spec.ts          # CVthèque IA formateurs
├── qualiopi-ia.spec.ts          # Audit blanc Qualiopi IA
├── veille-ia.spec.ts            # Veille réglementaire IA
├── dashboards-personas.spec.ts  # Dashboards formateur/client/apprenant
├── import-facture-ia.spec.ts    # Import facture externe IA
├── command-palette.spec.ts      # Command palette Cmd+K
└── emargement-matriciel.spec.ts # Feuille émargement matricielle
```

## Configuration

- **Browser** : Chromium uniquement
- **Retries** : 2 (anti-flaky)
- **Screenshots** : uniquement en cas d'échec
- **Videos** : conservées en cas d'échec
- **Timeout** : 30s par test
- **Base URL** : http://localhost:3000
- **Web server** : `npm run dev` lancé automatiquement

## Conventions

- Nommage fichier : `feature-name.spec.ts` (kebab-case)
- Descriptions en francais
- Pattern : `test.describe > test.beforeEach > test()`
- Helpers auth dans `e2e/helpers/auth.ts`
- Skip gracieux si pas de donnees (`test.skip(true, "raison")`)
