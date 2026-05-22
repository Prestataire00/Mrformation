# Solidification du workflow e-learning — Design

**Date :** 2026-05-22
**Statut :** Validé
**Périmètre :** sous-système e-learning de la plateforme (sous-onglet `TabElearning`, 22 routes `/api/elearning/*`, services, tables `elearning_*` + table-pont `formation_elearning_assignments`). Refonte de sécurité, de cohérence et de robustesse — **pas** de nouvelle fonctionnalité produit.
**Base :** audit deep-dive `docs/deep-dive-elearning.md`, section §6.

---

## 1. Contexte & objectif

L'audit deep-dive du sous-système e-learning a relevé des problèmes sur trois axes :

- **§6.1 Sécurité / multi-tenant** — RLS `allow-all` sur 12/13 tables, aucun filtre `entity_id` applicatif sur la plupart des mutations (accès cross-tenant par UUID), le rôle `learner` peut éditer/supprimer des chapitres et poster une fausse progression pour n'importe quelle inscription, réponses d'examen exposées par défaut.
- **§6.2 Cohérence fonctionnelle** — le statut affiché par `TabElearning` est un toggle manuel déconnecté de la progression réelle ; deux « mondes » e-learning cloisonnés (cours IA `elearning_courses` vs cours « programme » manuels stockés en JSONB dans `programs`).
- **§6.3 Robustesse** — incréments de compteurs non atomiques, écritures « fire-and-forget » non vérifiées, pas de garde avant publication, pas de journal d'audit.

**Objectif :** rendre ce workflow **sûr, cohérent et robuste**.

### Décisions de cadrage

1. **Périmètre complet** : les trois axes §6.1 + §6.2 + §6.3 en un seul chantier. La conformité §6.4 (RHF/Zod, taille des fichiers) est **hors périmètre**.
2. **Les deux mondes : conservés et réconciliés.** Aucune migration de données ; `TabElearning` listera et attribuera les deux types de cours.
3. **Sécurité : durcissement applicatif.** La RLS `allow-all` est laissée telle quelle — c'est un sujet plateforme traité séparément. La sécurité e-learning est garantie au niveau des routes.

---

## 2. Approche retenue : hybride

Structurel là où une omission coûte cher (sécurité, robustesse) ; correctifs en place ailleurs.

- Un **garde de sécurité partagé** centralise `entity_id` + rôle + propriété (volet A).
- Les **opérations critiques** deviennent atomiques via RPC / `UPDATE` atomiques (volet B).
- Une **abstraction « cours unifié »** réconcilie les deux mondes (volet C).
- Correctifs en place pour le reste : fuite des réponses, écritures vérifiées, journal d'audit (volets A, B, D).

Une couche de service e-learning *complète* (réécriture des 22 routes) a été écartée — disproportionnée.

---

## 3. Volet A — Garde de sécurité partagé (§6.1)

### 3.1 Module `src/lib/auth/elearning-access.ts` (nouveau)

Toute route e-learning passe par ce module. Deux fonctions :

- **`requireElearningCourse(courseId, allowedRoles)`** — vérifie l'authentification et le rôle (s'appuie sur le helper existant `requireRole`), charge le cours, contrôle `course.entity_id === profile.entity_id`. Renvoie `{ supabase, profile, course }` en cas de succès, ou une réponse d'erreur (401/403/404) sinon. Les routes indexées par `chapterId` ou `enrollmentId` résolvent d'abord le `course_id` parent, puis appellent ce garde.
- **`requireElearningEnrollment(enrollmentId, ctx)`** — pour le runtime apprenant. Vérifie que l'inscription appartient à l'entité de l'appelant **et**, si l'appelant a le rôle `learner`, qu'elle est la sienne — via la chaîne `enrollment.learner_id → learners.profile_id = auth.uid()` (même pattern que `client-portal-isolation`). Corrige « un apprenant poste la progression de n'importe qui ».

### 3.2 Modèle de rôles corrigé

| Famille de routes | Rôles autorisés | Correction |
|-------------------|-----------------|------------|
| Création / édition / suppression de cours, génération IA, publication, **édition/suppression de chapitres**, exports, live-session | `admin`, `super_admin` | ⚠ `learner` retiré de l'édition/suppression de chapitres |
| `enroll` (inscription d'apprenants) | `admin`, `super_admin` | ⚠ `learner` retiré |
| Runtime apprenant — `progress`, `quiz/submit`, `final-exam` (GET + submit), GET cours | `admin`, `super_admin`, `learner` | `learner` borné par `requireElearningEnrollment` (sa seule inscription) |
| `scores` (GET/POST) | `admin`, `super_admin`, `learner` | déjà clé sur `user.id` ; ajout du contrôle de rôle |

### 3.3 Fuite des réponses d'examen

- `GET /api/elearning/final-exam/[courseId]` : les réponses (`correct_answer`, `explanation`, `is_correct` des options) sont **masquées par défaut**. Seuls `admin`/`super_admin` reçoivent la version complète. Le paramètre `strip_answers` opt-in (non sûr) est supprimé.
- `GET /api/elearning/[courseId]` : lorsqu'il embarque les questions de quiz, `is_correct` est retiré des options pour un appelant `learner`.

---

## 4. Volet B — Opérations atomiques & écritures fiables (§6.3)

### 4.1 Opérations atomiques

- **Compteurs de tentatives** (`elearning_chapter_progress.quiz_attempts`, `elearning_final_exam_progress.attempts`, `elearning_course_scores.attempts`) : l'incrément passe par un `upsert` à expression d'incrément (`attempts = <table>.attempts + 1`) ou un RPC dédié — atomique, sans lecture préalable. Fini le lire-puis-écrire.
- **Recalcul de progression** : `/api/elearning/progress` délègue à un RPC plpgsql `elearning_recompute_progress(p_enrollment_id)` qui recalcule `completion_rate`, `status`, et les dates de façon **idempotente** (`started_at` posé une seule fois via `COALESCE`, `completed_at` uniquement à 100 %).
- **Publication** : un RPC `elearning_publish_course(p_course_id)` réalise la bascule `published`/`draft` de façon atomique **et** applique une **garde avant publication** : refus si `generation_status <> 'completed'` ou si le cours n'a aucun chapitre.

### 4.2 Écritures vérifiées

Suppression de tous les `upsert`/`update` « fire-and-forget » des routes runtime (`progress`, `quiz/submit`, `final-exam/submit`) : chaque écriture contrôle son erreur et renvoie une réponse explicite en cas d'échec — un apprenant ne peut plus « réussir » sans que sa progression soit persistée.

---

## 5. Volet C — Réconciliation des deux mondes & cohérence du sous-onglet (§6.2)

### 5.1 Abstraction « cours assignable »

Nouveau service `src/lib/services/elearning-courses.ts` :

- **`getAssignableElearningCourses(entityId)`** — renvoie la liste **unifiée** des cours e-learning publiés de l'entité, depuis **les deux mondes** :
  - `elearning_courses` où `status = 'published'` ;
  - `programs` où `content.type = 'elearning'` et `content.status = 'published'`.
  - Forme normalisée : `{ id, source: 'ai' | 'program', title, duration_minutes }`.

### 5.2 Table-pont `formation_elearning_assignments`

- Ajout d'une colonne **`course_source TEXT NOT NULL DEFAULT 'ai' CHECK (course_source IN ('ai','program'))`** — indique à quel monde appartient `course_id`. Lignes existantes : backfill `'ai'`.
- `formation_elearning_assignments.course_id` porte aujourd'hui une FK `REFERENCES elearning_courses(id) ON DELETE CASCADE` (confirmée dans `add-elearning-tab.sql`). La migration **retire cette FK** : `course_id` devient une référence polymorphe désambiguïsée par `course_source` (un cours « programme », dont l'id vient de `programs`, ne pourrait pas satisfaire la FK). Le `ON DELETE CASCADE` est perdu de fait — acceptable : le nettoyage des attributions orphelines reste géré applicativement.
- `elearning_enrollment_id` reste renseigné **uniquement** pour les cours `source = 'ai'` (les cours « programme » n'ont pas de runtime d'inscription).

### 5.3 `TabElearning` — attribution des deux mondes & statut réel

- Le `Select` de cours utilise `getAssignableElearningCourses` → les deux mondes sont attribuables ; à l'attribution, `course_source` est renseigné.
- **Statut branché sur la progression réelle.** Pour une attribution `source = 'ai'`, `TabElearning` lit la progression réelle (`elearning_enrollments.completion_rate`/`status`, `elearning_final_exam_progress.passed`) et l'affiche comme **signal principal** (p. ex. « 60 % · examen non passé »).
- **Toggle manuel conservé, reclassé.** `formation_elearning_assignments.is_completed` devient une **« validation admin »** explicite, affichée *à côté* de la progression réelle (et non à sa place). Il reste l'unique signal de complétion pour les cours `source = 'program'` (qui n'ont pas de runtime de progression).

---

## 6. Volet D — Journal d'audit (§6.3)

Ajout des appels `logAudit(...)` manquants sur les mutations e-learning aujourd'hui non journalisées : publication/dépublication, édition et suppression de chapitre, `PATCH`/`DELETE` cours, `enroll`. Cohérent avec le pattern d'audit déjà utilisé par `POST /api/elearning` et le reste de la plateforme.

---

## 7. Architecture & fichiers

**Créés :**
- `src/lib/auth/elearning-access.ts` — garde de sécurité partagé (volet A).
- `src/lib/services/elearning-courses.ts` — abstraction « cours assignable » (volet C).
- `src/lib/auth/__tests__/elearning-access.test.ts`, `src/lib/services/__tests__/elearning-courses.test.ts` — tests Vitest.
- Une **migration SQL** (`supabase/migrations/`) : RPC `elearning_recompute_progress`, `elearning_publish_course` ; colonne `course_source` + backfill ; retrait éventuel de la FK `course_id`.

**Modifiés :**
- Les 22 routes `/api/elearning/*` — recâblées sur le garde, écritures vérifiées, RPC, audit, masquage des réponses.
- `src/app/(dashboard)/admin/formations/[id]/_components/TabElearning.tsx` — helper unifié + progression réelle + `course_source`.

**Inchangé :** modèle de données e-learning (hormis la colonne `course_source`), UI apprenant `/learner/courses/*`, pipeline de génération IA (sécurisé via le garde, mais logique inchangée).

---

## 8. Hors périmètre

- Réécriture des policies RLS (`allow-all`) — sujet plateforme, traité séparément.
- Conformité §6.4 — passage des formulaires e-learning à React Hook Form + Zod, découpage des fichiers volumineux (`admin/elearning/page.tsx`, `create/page.tsx`).
- Fusion ou migration des deux mondes e-learning (décision de cadrage : on les garde).
- Toute nouvelle fonctionnalité produit.

---

## 9. Tests

- **`requireElearningCourse` / `requireElearningEnrollment`** — tests unitaires Vitest : rôle refusé, entité étrangère refusée, propriété apprenant refusée, cas nominal.
- **`getAssignableElearningCourses`** — test unitaire : fusion correcte des deux mondes, filtrage `published`.
- **Logique de masquage des réponses** — test unitaire : `learner` ne reçoit jamais `is_correct`/`correct_answer`.
- Les RPC SQL sont vérifiés via leurs appels applicatifs ; pas de framework de test SQL dédié dans le projet.
- Non-régression : suite Vitest complète verte, `tsc` propre.

---

## 10. Critères de succès

- Toute route e-learning filtre par `entity_id` (via le garde) — plus d'accès cross-tenant par UUID.
- Le rôle `learner` ne peut plus éditer/supprimer de contenu ni agir sur une inscription qui n'est pas la sienne.
- Les réponses d'examen ne sont jamais exposées à un `learner`.
- Les compteurs de tentatives et le recalcul de progression sont atomiques ; aucune écriture runtime n'est silencieuse.
- Un cours ne peut être publié que s'il est complet (`generation_status = 'completed'`, ≥ 1 chapitre).
- `TabElearning` attribue les deux mondes de cours et affiche la progression **réelle** pour les cours IA.
- Les mutations e-learning sont journalisées (audit).
- Aucune régression : suite de tests verte, `tsc` propre.
