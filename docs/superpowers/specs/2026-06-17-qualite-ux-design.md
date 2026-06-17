# Design — UX du Suivi Qualité (Évaluation & Satisfaction)

**Date :** 2026-06-17
**Statut :** Design validé (brainstorming)
**Page cible :** `src/app/(dashboard)/admin/reports/qualite/page.tsx`

---

## 0. Problème (vérifié en base)
La page « donne l'impression d'être cassée » :
- **Année par défaut figée à 2026** (`useState<number>(2026)`, l.132) — année la moins remplie ; les données existent surtout en **2025**.
- **Colonnes « Éval. » (pré/pendant/post) vides PARTOUT** : 0/102 `quality_scores` ont une valeur d'éval (data gap — hors périmètre ici).
- **Satisfaction a des données** (`satisfaction_chaud` : 63 en 2025, 4 en 2026) mais l'utilisateur atterrit sur 2026 et la satisfaction est peu visible.
- **« -- % »** partout (`formatPct`/`formatPctWithColor`, l.38-45) → lu comme un bug.
Les boutons (Excel/PDF/Qualiopi/Vue détaillée/navigation/refresh) **fonctionnent** — ce n'est pas un bug de feature.

## 1. Décisions (validées)
UX uniquement. **Pas** de modif de données ; la collecte/migration des évaluations = chantier séparé (data gap, non traité).

## 2. Améliorations

### D1 — Année par défaut intelligente
Au lieu de figer 2026 : au chargement, récupérer les **années disponibles avec données** depuis `quality_scores` (entité), et **défaut sur l'année la plus fournie** (tie → la plus récente). Repli sur l'année courante si aucune donnée.
- **Fonction pure** `pickDefaultQualityYear(years: { year: number; dataCount: number }[], currentYear: number): number` — testable (TDD) : choisit le max `dataCount` (tie → year max) ; liste vide → `currentYear`.
- Fetch léger des années + comptage de scores non-vides (satisfaction OU éval non-null) côté chargement initial ; `setYear(pickDefaultQualityYear(...))` une seule fois (pas à chaque navigation manuelle).

### D2 — États vides explicites
- **Bandeau d'info** au-dessus du tableau quand une famille de colonnes est globalement vide sur l'année affichée : « Les évaluations (préformation / pendant / postformation) ne sont pas encore renseignées pour cette période. » (calculé : toutes les valeurs `eval_*` nulles).
- Remplacer le rendu « -- % » par un **« — » discret** (gris) avec `title="Pas encore de réponse"` (tooltip natif), dans `formatPct`/`formatPctWithColor`. Les valeurs présentes restent en `X.X %`.

### D3 — Mettre la satisfaction en avant
- **Résumé en tête** (bandeau de stats) : moyenne **Satisfaction à chaud** et **à froid** de l'année affichée (réutiliser le helper de moyenne existant `avg(...)`, l.50-52) + nombre de formations évaluées.
- S'assurer que les colonnes **Satisfaction** sont visibles (ordre/colonnes), puisque c'est la seule donnée renseignée. (Ne pas masquer les colonnes Éval — juste ne plus les faire passer pour cassées via D2.)

## 3. Architecture
- **Fonction pure** `src/lib/reports/quality-default-year.ts` : `pickDefaultQualityYear` (+ test).
- **Page** `qualite/page.tsx` : remplacer `useState(2026)` par un défaut calculé après fetch des années dispo ; ajouter le bandeau D2 + le résumé D3 ; ajuster `formatPct`/`formatPctWithColor` (D2). Isolation `entity_id` conservée (déjà filtré).
- Boutons/export/Qualiopi/vue détaillée **inchangés**.

## 4. États & robustesse
- Aucune donnée du tout → bandeau « Aucune donnée qualité disponible » + année courante.
- Navigation manuelle d'année (`< >`) reste prioritaire sur le défaut auto (le défaut ne s'applique qu'au premier chargement).

## 5. Tests
TDD sur `pickDefaultQualityYear` : année la plus fournie choisie ; égalité → année la plus récente ; liste vide → année courante ; une seule année → elle.

## 6. Hors périmètre (YAGNI)
- Collecte/migration des évaluations pré/pendant/post (data gap).
- Refonte du tableau Qualiopi / export (inchangés).

## 7. Suite
Design → writing-plans (TDD sur le helper) → exécution → PR sur `main`.
