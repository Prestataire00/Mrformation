---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
status: complete
completedAt: 2026-05-17
inputDocuments:
  - bmad_output/planning-artifacts/architecture.md
  - CLAUDE.md
  - audit BMad du 2026-05-17 (portail apprenant + résidus magic link)
---

# Stabilisation Portail Apprenant & Magic Link — Epic Breakdown

## Overview

Ce document décompose en stories implémentables un epic **correctif de stabilisation** (Epic G) né d'un
audit BMad du 2026-05-17. Contrairement aux epics A-F (refonte documents) et 1-5 (refonte formations),
ce lot G **ne livre pas de nouvelle fonctionnalité** — il corrige des régressions identifiées en production
après le merge de PR #126 et des bugs latents du portail apprenant.

**Contexte du déclencheur** :
- 2026-05-17 — bug remonté en prod : un apprenant connecté avec 2 enrollments en DB voit "Aucune
  formation" sur `/learner/my-trainings`.
- Investigation : les RLS policies ont été corrigées (6 nouvelles policies learner_read), les données
  sont bien présentes, mais la page utilise un pattern de query défaillant (2 queries séparées au
  lieu d'1 query nested).
- Investigation parallèle : la PR #126 (URL+credentials remplaçant magic link convocation) a supprimé
  3 fichiers (`access/[token]/page.tsx`, `auth/callback/page.tsx`, `convocation-magic-link.ts`) mais
  les routes `send-welcome` et `magic-link` génèrent toujours des URLs `/access/[token]` → emails
  envoyés depuis le merge pointent vers une 404. L'utilisateur a confirmé que le magic link
  **fonctionnait** par email avant suppression.

**Périmètre** : 4 stories de correction, **toutes en P0/P1**, effort total estimé **~1.5 j-h dev**.

**Mode de livraison** : séquentiel (g-1 → g-2 → g-3 → g-4), une story = un commit, regroupées dans
1 PR `fix/stabilisation-portail-apprenant`.

---

## Requirements Inventory

### Bugs identifiés (Audit BMad 2026-05-17)

| ID | Sévérité | Fichier | Symptôme | Cause racine |
|----|----------|---------|----------|--------------|
| BUG-G1 | **P0** | `src/app/(dashboard)/learner/my-trainings/page.tsx` | Apprenant voit "Aucune formation" malgré enrollments en DB | 2 queries séparées, échec silencieux si `learner` null |
| BUG-G2 | **P0** | `src/app/api/learners/[id]/send-welcome/route.ts` + `magic-link/route.ts` | Emails "Bienvenue" → 404 `/access/[token]` | PR #126 a supprimé la page cible à tort (user confirme que le magic link fonctionnait) |
| BUG-G3 | P1 | `src/app/(dashboard)/learner/calendar/page.tsx` | Probable même bug que G1 (pattern 2-queries) | Symétrique de G1 |
| BUG-G4 | P1 | `src/app/(dashboard)/learner/courses/page.tsx` | Recherche learner par `email` au lieu de `profile_id` (fragile) | Pattern hérité, désynchronisation possible auth.users / learners |
| BUG-G5 | P1 | `src/app/(dashboard)/learner/documents/page.tsx` | 2 systèmes de documents co-existent (liste unifiée + 3 cartes statiques CGV/RGPD/Règlement en double) | Résidu de l'ancien système non nettoyé après migration Epic B (PR #105) |

### Pages NON affectées (vérifiées) ✅

- `src/app/(dashboard)/learner/page.tsx` (dashboard) — utilise déjà la query nested correcte (référence)
- `src/app/(dashboard)/learner/questionnaires/page.tsx` — pattern `.eq("profile_id", user.id)` OK
- `src/app/(dashboard)/learner/documents/page.tsx` — pattern OK
- `src/app/(dashboard)/learner/contacts/page.tsx` — pattern OK
- `src/app/(dashboard)/learner/profile/page.tsx` — pattern OK
- `src/app/(dashboard)/learner/layout.tsx` — auto-création learner OK

---

## Epic G — Stabilisation Portail Apprenant & Magic Link

### Story g-1: Fix `/learner/my-trainings` — unifier la query sur le pattern nested

**As a** apprenant inscrit à une ou plusieurs formations,
**I want** voir la liste de mes formations sur la page `/learner/my-trainings`,
**So that** je puisse accéder aux détails de chaque formation et préparer ma session.

**Acceptance Criteria** :

**Given** un apprenant authentifié avec `profile_id` lié à un record `learners` ayant ≥1 enrollment non `cancelled`,
**When** il navigue sur `/learner/my-trainings`,
**Then** il voit la liste de ses formations groupées par statut (à venir / en cours / passées),
**And** chaque formation affiche : titre, date début, date fin, lieu, formateur, statut enrollment.

**Given** un apprenant authentifié sans enrollment OU avec uniquement des enrollments `cancelled`,
**When** il navigue sur `/learner/my-trainings`,
**Then** il voit l'état vide actuel (« Aucune formation »).

**Given** la story est livrée,
**When** un audit code est exécuté sur `my-trainings/page.tsx`,
**Then** la page utilise **1 seule query Supabase nested** (pattern `learners → enrollments(*) → session:sessions(*)`)
identique à celui de `/learner/page.tsx:284-300`,
**And** plus aucun `.eq("learner_id", learner.id)` séparé n'apparaît dans le fichier.

**Notes techniques (hors AC)** :
- Référence du bon pattern : [src/app/(dashboard)/learner/page.tsx:284-300](src/app/(dashboard)/learner/page.tsx#L284-L300)
- Fichier à corriger : [src/app/(dashboard)/learner/my-trainings/page.tsx:111-157](src/app/(dashboard)/learner/my-trainings/page.tsx#L111-L157)
- Tests : aucun nouveau test (couvert par tests d'intégration RLS si pertinent — sinon validation manuelle prod)
- Effort estimé : ~0.25 j-h dev.

---

### Story g-2: Restaurer les 3 fichiers magic link supprimés à tort en PR #126

**As a** admin envoyant un email de bienvenue à un nouvel apprenant,
**I want** que le lien d'accès reçu par mail conduise l'apprenant connecté à son espace,
**So that** les apprenants n'aient pas à mémoriser email + mot de passe temporaire et puissent
accéder à leur formation en 1 clic depuis l'email.

**Acceptance Criteria** :

**Given** la PR #126 a supprimé 3 fichiers (`src/app/access/[token]/page.tsx`,
`src/app/auth/callback/page.tsx`, `src/lib/services/convocation-magic-link.ts`) sur la base d'un
mauvais diagnostic (le magic link fonctionnait en réalité en email),
**When** la story est livrée,
**Then** les 3 fichiers sont restaurés via `git show 590d95e^:<path>` ou équivalent,
**And** les imports dans `send-welcome/route.ts` et `magic-link/route.ts` redeviennent fonctionnels,
**And** l'URL `/access/${token}` retourne une page 200 OK qui authentifie l'apprenant et redirige vers `/learner`.

**Given** un admin clique sur « Envoyer le lien d'accès » depuis `/admin/clients/apprenants/[id]`,
**When** l'email est délivré,
**Then** l'apprenant qui clique sur le bouton dans l'email est authentifié et redirigé vers `/learner`,
**And** l'apprenant voit ses formations sans avoir saisi email/password.

**Given** le nouveau flow URL+credentials (PR #126) reste également opérationnel,
**When** un admin génère une convocation,
**Then** le PDF contient toujours email + mot de passe + URL `/login` (pas de régression sur PR #126),
**And** les apprenants ont **2 voies d'accès au choix** : magic link (email send-welcome) OU
identifiants (PDF convocation).

**Given** la story est livrée,
**When** un audit code est exécuté,
**Then** `getOrCreateConvocationMagicLink` n'est PLUS appelé par la route
`/api/documents/generate-from-template` (qui utilise `ensureLearnerAccount` désormais),
**And** le helper magic link n'est utilisé QUE par `send-welcome/route.ts` et `magic-link/route.ts`.

**Notes techniques (hors AC)** :
- Commits source à utiliser pour la restauration : `590d95e` est le commit de suppression
  (parent `590d95e^` contient encore les 3 fichiers).
- Alternative : `git checkout 590d95e^ -- <path>` pour chaque fichier.
- Validation manuelle requise : envoyer 1 email de bienvenue et vérifier que le clic auth bien l'apprenant.
- Effort estimé : ~0.5 j-h dev + test manuel.

---

### Story g-3: Fix `/learner/calendar` — symétrique de g-1

**As a** apprenant inscrit à une ou plusieurs formations,
**I want** voir mon calendrier de sessions sur `/learner/calendar`,
**So that** je puisse planifier mon temps et ne manquer aucun créneau.

**Acceptance Criteria** :

**Given** un apprenant authentifié avec ≥1 enrollment ayant des `formation_time_slots`,
**When** il navigue sur `/learner/calendar`,
**Then** il voit ses créneaux affichés dans la vue calendrier,
**And** chaque créneau affiche : date, horaire, formation, formateur.

**Given** la story est livrée,
**When** un audit code est exécuté sur `calendar/page.tsx`,
**Then** la page utilise le même pattern nested que g-1 (1 seule query),
**And** plus aucun pattern 2-queries `learners` → `.eq("learner_id", learner.id)` séparé n'apparaît.

**Notes techniques (hors AC)** :
- Fichier à corriger : [src/app/(dashboard)/learner/calendar/page.tsx:152-163](src/app/(dashboard)/learner/calendar/page.tsx#L152-L163)
- Réutiliser la query construite en g-1 si possible (extraction helper `getLearnerEnrollments(supabase, userId)` ?).
- Effort estimé : ~0.25 j-h dev.

---

### Story g-5: Cleanup `/learner/documents` — supprimer ancien système (3 cartes statiques)

**As a** apprenant consultant la page `/learner/documents`,
**I want** voir mes documents dans une seule liste cohérente,
**So that** je ne sois pas confus par 2 systèmes de téléchargement co-existants pour les mêmes
documents (CGV, Politique RGPD, Règlement intérieur).

**Acceptance Criteria** :

**Given** la page `/learner/documents` affichait 2 sections distinctes : (1) liste unifiée
"Mes Documents" via la table `documents` (PR #105 Epic B) et (2) 3 cartes statiques en bas
("CGV", "Politique RGPD", "Règlement Intérieur") avec téléchargement direct via les endpoints
`/api/documents/generate-cgv|rgpd|reglement-interieur`,
**When** la story est livrée,
**Then** la section (2) avec les 3 cartes est supprimée,
**And** la liste unifiée (1) reste seule, suffisante (les 4 docs CGV/Politique/Règlement/Programme
y apparaissent déjà via génération admin → confirmation),
**And** les states `downloadingCgv/Rgpd/Ri`, la fonction `downloadStaticDoc`, les helpers
`downloadCgv/Rgpd/Ri`, les imports `ScrollText`, `Download`, `Shield`, `Gavel`, `useToast`,
`toast` sont retirés (devenus dead code).

**Given** les routes API `/api/documents/generate-cgv`, `generate-rgpd`,
`generate-reglement-interieur` sont encore utilisées par `client/documents/page.tsx` (seul
système actuel côté portail client) et `admin/test-convention/page.tsx` (page de test admin),
**When** la story est livrée,
**Then** les routes API sont **conservées** (pas de suppression — risque de régression sur 2 autres sites).

**Notes techniques (hors AC)** :
- Fichier à modifier : [src/app/(dashboard)/learner/documents/page.tsx](src/app/(dashboard)/learner/documents/page.tsx)
- Suivi potentiel : si à terme `client/documents` migre vers la liste unifiée, on pourra supprimer
  les 3 routes API + 3 endpoints en cleanup global.
- Effort estimé : ~0.15 j-h dev.

---

### Story g-4: Fix `/learner/courses` — chercher par profile_id, pas par email

**As a** apprenant inscrit à des cours e-learning,
**I want** voir mes cours sur `/learner/courses`,
**So that** je puisse suivre ma progression e-learning indépendamment de mon email Supabase Auth.

**Acceptance Criteria** :

**Given** un apprenant authentifié dont l'email auth peut différer de `learners.email` (ex : changement d'email après création du record),
**When** il navigue sur `/learner/courses`,
**Then** il voit ses cours assignés,
**And** la query repose sur `auth.uid()` (donc `profile_id`), **pas** sur l'email.

**Given** la story est livrée,
**When** un audit code est exécuté sur `courses/page.tsx`,
**Then** la query learner utilise `.eq("profile_id", user.id)`,
**And** le pattern `.eq("email", user.email)` n'apparaît plus.

**Notes techniques (hors AC)** :
- Fichier à corriger : [src/app/(dashboard)/learner/courses/page.tsx:108-112](src/app/(dashboard)/learner/courses/page.tsx#L108-L112)
- Pattern à appliquer : identique à `questionnaires/page.tsx:68-72` (déjà OK).
- Effort estimé : ~0.1 j-h dev.

---

## Récapitulatif global

| Story | Sévérité | Fichier | Effort dev | Phase |
|-------|----------|---------|-----------|-------|
| g-1 — Fix my-trainings (pattern nested) | **P0** | `learner/my-trainings/page.tsx` | ~0.25 j-h | Stabilisation |
| g-2 — Restaurer magic link (3 fichiers PR #126) | **P0** | `access/[token]/` + `auth/callback/` + `convocation-magic-link.ts` | ~0.5 j-h | Stabilisation |
| g-3 — Fix calendar (pattern nested) | P1 | `learner/calendar/page.tsx` | ~0.25 j-h | Stabilisation |
| g-4 — Fix courses (profile_id) | P1 | `learner/courses/page.tsx` | ~0.1 j-h | Stabilisation |
| g-5 — Cleanup 2e système docs (3 cartes statiques) | P1 | `learner/documents/page.tsx` | ~0.15 j-h | Stabilisation (post-merge PR #127) |
| **Total** | | | **~1.25 j-h dev** | **2 PRs** |

Aucun nouveau test attendu (les tests existants 395+ doivent rester verts). Validation manuelle prod
requise après merge sur les 4 pages corrigées.
