---
storyId: E4
storyKey: e-4-tests-e2e-snapshot
epic: E
title: Tests E2E snapshot pour les templates HTML critiques
status: done
priority: med
effort: 0.5 j-h
sourcePRD: prd-documents.md FR-DOC-40
sourceEpic: epics-documents.md Epic E
createdAt: 2026-05-15
completedAt: 2026-05-17
---

# Story E4 — Tests E2E snapshot

## Statement

**As a** dev équipe,
**I want** des tests snapshot couvrant les 6 templates HTML critiques (couverts par F1/F2.x/F3) + un test de régression "no orphan variable",
**So that** toute régression dans `resolveDocumentVariables` ou dans les templates HTML est détectée AVANT le déploiement (vs en prod via Loris qui se plaint).

## Décision de scope : HTML résolu (pas PDF binaire)

L'epic initial mentionnait "snapshot PDF". Décision pragmatique : **on snapshote le HTML pré-PDF** plutôt que le binaire PDF, parce que :

1. **PDF binaire fragile en CI** : changement de version Puppeteer / police système / margin pixel = nouveau snapshot. Faux positifs constants.
2. **PDF binaire lent** : faut Puppeteer en CI, coûteux (build + run).
3. **HTML résolu = source de vérité fonctionnelle** : 99% des régressions PDF viennent soit des variables non résolues, soit du template HTML modifié. Le rendu Puppeteer est déterministe après ça.
4. **Snapshots lisibles** : un diff HTML est immédiatement compréhensible. Un diff PDF binaire = inutilisable.

Le snapshot HTML couvre donc le risque #1 (régressions variables/template). Le rendu Puppeteer final reste testable manuellement en preview Netlify si besoin.

## Implementation

**Fichier** : `src/lib/templates/__tests__/snapshots.test.ts`

**12 tests** :
- **6 snapshots HTML** (un par doc_type critique) avec fixtures inline dates fixes :
  - convocation-apprenant
  - certificat-realisation
  - attestation-assiduite
  - emargement-individuel
  - convention-entreprise
  - convention-intervention

- **6 tests régression "no orphan variable"** : pour chaque template, on appelle `resolveDocumentVariables()` et vérifie qu'aucune balise `[%...%]` ne reste non-résolue. Détecte typos ou suppressions accidentelles dans `ALIAS_TO_VARIABLE_KEY`.

**Snapshots stockés** : `src/lib/templates/__tests__/__snapshots__/snapshots.test.ts.snap` (~1090 lignes).

**Fixtures stables** :
- Dates fixes (`2026-05-01`, `2026-06-15`)
- QR data URL fixe (pour convocation-apprenant — sinon dépend du moment de génération)
- Cost HT fixe (`1200`) pour convention-intervention

## Definition of Done

- [x] Fichier `snapshots.test.ts` créé avec 6 snapshots + 6 régression tests
- [x] Snapshots `__snapshots__/snapshots.test.ts.snap` générés (~1090 lignes, lisibles)
- [x] Typecheck `npx tsc --noEmit` OK
- [x] Tests : 381/381 passent (369 + 12 nouveaux)
- [x] PR créée + mergée
- [x] Sprint-status : e-4 → done

## Notes / Trade-offs

- **Pas de PDF binaire** : voir décision de scope ci-dessus.
- **6 templates seulement** : couverture limitée aux templates utilisés par F1/F2.x/F3 (les plus critiques user-facing). Les 28 autres templates (attestation_abandon, certificat_diplome, etc.) à ajouter dans story future E4.x si besoin (~15 min chacun).
- **Maintenance** : si un template change volontairement, mettre à jour le snapshot via `npx vitest -u`. Si une variable est renommée, le test "no orphan" attrape, et il faut soit ajouter l'alias dans `ALIAS_TO_VARIABLE_KEY` soit corriger le template.
