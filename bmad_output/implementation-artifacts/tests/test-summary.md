# Résumé — Filet anti-régression E2E (parcours durcis)

Généré via `bmad-qa-generate-e2e-tests`. Objectif : filet anti-régression sur
les parcours durcis (attribution formateurs/apprenants + espace apprenant),
ciblant la classe « la page a sauté » (crash runtime / page blanche).

## Tests E2E (Playwright) — `e2e/robustesse-attribution-apprenant.spec.ts`

| # | Test | Couvre |
|---|------|--------|
| 1 | Résumé : sections Formateurs/Apprenants/Entreprises rendues sans crash | UI d'attribution (ResumeTrainers/Learners/Companies) |
| 2 | Bouton « Ajouter un Formateur » présent | handler d'attribution câblé |
| 3 | Onglet Planning rend créneaux ou état vide | crainte « planning sauté » |
| 4-7 | Pages apprenant (dashboard, documents, cours, questionnaires) sans crash runtime | résolution multi-fiche `learners` durcie |

**Garde forte** : capture `pageerror` (exception non catchée) → un onglet/page
qui crashe fait échouer le test AVANT le client.

**READ-ONLY** : navigation + rendu uniquement, aucune écriture (la suite tourne
sur la base prod via le dev server — voir contrainte data-safety).

## Résultat
`npx playwright test e2e/robustesse-attribution-apprenant.spec.ts` → **7/7 passés**.

## Couverture (cumulée avec l'existant)
- Émargement + signatures : déjà couverts (`emargement-matriciel.spec.ts`, `signatures-emargement.spec.ts`).
- Attribution + espace apprenant : NOUVEAU (ce fichier).

## Prochaines extensions possibles
- Espace formateur (nécessite un compte de test `trainer` dans `.env.test`).
- Parcours d'écriture (attribution réelle) → nécessite une base de TEST isolée
  (actuellement `.env.test` ne définit pas d'URL Supabase → dev server = prod).
