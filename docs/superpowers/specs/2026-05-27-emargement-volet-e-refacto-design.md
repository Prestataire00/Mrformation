# Sous-chantier Émargement — Volet E Refacto architectural

> **Spec validée par Wissam le 2026-05-27.**
> Source : Deep-dive [docs/deep-dive-tab-emargements.md](../../deep-dive-tab-emargements.md) + exploration approfondie via agent Explore.
> Pré-requis : Sous-chantiers 1, 2 et 3 mergés en prod (commits `f0fb68e`, `16a00cb`, `bd47247`).

---

## 1. Contexte

Les Sous-chantiers 1, 2 et 3 ont solidifié l'émargement côté sécurité (Volet A), type safety/robustesse (Volets B+C), et tests (Volet F). Score TabEmargements : 6/10 → 8/10 maintenu.

Ce **Sous-chantier 4 (Volet E)** s'attaque au **refacto architectural** : découper le composant monolithique TabEmargements.tsx (1232 LOC) en sous-composants logiques dans `_components/emargements/`. Le filet de sécurité Volet F (11 tests + coverage 100%) sécurise ce refacto.

**Score post-Volet E** : 8/10 maintenu visiblement, mais maintenabilité fortement améliorée (parent passe de 1232 → ~650 LOC, 7 composants réutilisables et focalisés).

### 1.1 Périmètre déboutonné après exploration

Le deep-dive proposait 3 livrables pour le Volet E. L'exploration via agent a invalidé 2 d'entre eux :

| Item deep-dive | Verdict après audit | Décision |
|----------------|---------------------|----------|
| Découpage TabEmargements 1232 LOC | ✅ Justifié | **Inclus** (livrable unique) |
| Retrait `/admin/signatures` legacy 1279 LOC | ❌ **PAS un duplicate** — 3 features uniques (vue globale toutes-sessions, SignaturePad custom, enrichissement async), linkée depuis sidebar admin | **Exclu** (Wissam : "laisser tel quel") |
| Extraction `save-signature` service partagé | ❌ Over-engineering — les 2 routes (`/api/signatures` POST RBAC + `/api/emargement/sign` POST token public) sont volontairement différentes (sync vs async, audit log différent, race condition handling différent) | **Exclu** |

**Scope effective** : **~8-10h** (vs 32h estimé deep-dive — sur-estimation 3-4× cohérente avec Volets B+C et F).

---

## 2. Goal

Découper TabEmargements.tsx (1232 LOC) en 7 sous-composants logiques dans `_components/emargements/` pour améliorer la maintenabilité, en suivant le pattern de référence TabQuestionnaires post-Volet D.

---

## 3. Périmètre

### 3.1 In-scope — 5 extractions

> **Ajustement post-planning** : DocumentExportActions et SignatureManagement initialement listés mais retirés. Raison : ces "composants" seraient juste des fonctions handlers sans JSX propre (les boutons d'export vivent dans HeroStatsAndWorkflow, `handleDeleteSignature` est utilisé inline dans `renderPersonRow` qui reste dans le parent). Extraction artificielle. Voir le plan d'implémentation pour le détail.

| # | Composant extrait | LOC approximative | Coupling | État local |
|---|-------------------|-------------------|----------|-----------|
| 1 | `HeroStatsAndWorkflow.tsx` | ~140 | Très faible | Aucun (UI pure) |
| 2 | `CompanyFilter.tsx` | ~30 | Faible | `filterClientId` (passé en prop + setter) |
| 3 | `QrCodesDialog.tsx` | ~150 | Faible | `qrDialog`, `qrSlotTokens`, `qrImages` |
| 4 | `SingleSignDialog.tsx` | ~40 | Faible | `signDialog`, `signing` |
| 5 | `BulkSignDialog.tsx` | ~80 | Moyen | `bulkSignSlot`, `bulkSigning` (Volet A) |

**Total extrait** : ~440 LOC. **Parent post-refacto** : ~740 LOC (vs 1232 actuel — réduction significative tout de même).

### 3.2 Out-of-scope (volontairement)

- **Retrait `/admin/signatures`** : ce N'EST PAS un duplicate (vue globale, features uniques, accessible via sidebar). Décision Wissam : "laisser tel quel".
- **Extraction `save-signature` service** : les 2 routes sont volontairement différentes. Extraction = coupling artificiel.
- **Extraction `SlotsList.tsx`** (~390 LOC) : trop fortement couplé au state parent (signatures, enrollments, trainers, filterClientId, multiples helpers). Reste dans le parent.
- **Extraction `QrGenerationActions.tsx`** : YAGNI, bien isolé inline déjà.
- **Modification de la logique métier** : pure réorganisation. Aucun comportement ne doit changer.
- **Ajout de tests Vitest sur les nouveaux composants** : tests d'intégration UI hors scope (les 550 tests existants restent verts comme garde, le filet Volet F couvre `load-signatures`).

---

## 4. Architecture

### 4.1 Structure de fichiers cible

```
src/app/(dashboard)/admin/formations/[id]/_components/
  TabEmargements.tsx                    # 1232 → ~740 LOC (orchestrateur)
  emargements/                          # NOUVEAU dossier (pattern TabQuestionnaires)
    HeroStatsAndWorkflow.tsx            # ~140 LOC
    CompanyFilter.tsx                   # ~30 LOC
    QrCodesDialog.tsx                   # ~150 LOC
    SingleSignDialog.tsx                # ~40 LOC
    BulkSignDialog.tsx                  # ~80 LOC
```

### 4.2 Pattern d'extraction

Pour chaque composant extrait :

1. **Créer** `emargements/<Name>.tsx` avec un composant fonctionnel typé strictement.
2. **Définir** une interface `<Name>Props` listant **explicitement** :
   - Données nécessaires (e.g. `formation`, `timeSlots`, `enrollments`)
   - State partagé du parent (e.g. `bulkSignSlot`, `setBulkSignSlot`)
   - Callbacks (e.g. `onRefresh`, `onSignSuccess`)
3. **Déplacer** la portion JSX + les handlers locaux (`handleX`) dans le nouveau fichier.
4. **Remplacer** dans TabEmargements parent : la portion JSX devient `<NewComponent {...props} />`.
5. **Garder** le state lié à la section dans le parent (passé en props comme `state` + `setState`), sauf si purement local au composant (e.g. `qrImages` peut migrer dans QrCodesDialog).
6. **Vérifier** : `npx tsc --noEmit` clean + Vitest 550/550 vert après chaque extraction.
7. **Commit** : 1 commit par section avec message standard `refactor(emargement): extract <Component> from TabEmargements (Volet E)`.

### 4.3 Pattern de référence (TabQuestionnaires post-Volet D)

L'agent Explore a confirmé que TabQuestionnaires utilise déjà ce pattern (`_components/questionnaires/` avec 4 sous-composants : QuestionnaireOverview, StageStatsBar, LearnerStatusGrid, LearnerResponsesDialog). Le parent garde l'orchestration (state, data fetch, logic) et délègue le rendu.

### 4.4 Ordre d'extraction (intentionnel : moins risqué d'abord)

L'ordre est conçu pour gagner en confiance progressivement :

1. **HeroStatsAndWorkflow** — UI pure, 0 état local, 0 callback critique → pratique pour rôder le pattern
2. **CompanyFilter** — 1 state simple, isolé
3. **QrCodesDialog** — Le plus gros (~150 LOC) mais coupling faible
4. **SingleSignDialog** — Standard pattern Dialog
5. **BulkSignDialog** — **EN DERNIER** : modifié récemment par Volet A (canvas 2-étapes), critique pour Qualiopi. Toute régression doit être attrapée par le smoke check final.

---

## 5. Tests

### 5.1 Aucun nouveau test Vitest requis

Pure réorganisation, aucune logique métier modifiée. Les 550 tests existants restent verts comme garde de régression. Le filet Volet F sur `load-signatures.ts` (100% coverage) reste activement enforcé.

### 5.2 Smoke check manuel (~20 min après tous les extracts)

Checklist exhaustive à faire par Wissam à Task 9 (avant merge prod) :

**Affichage de base** :
- [ ] Ouvrir une session avec apprenants → onglet Émargement charge sans erreur
- [ ] HeroStats visible avec taux signature correct
- [ ] 3-card workflow visible (générer QR / exporter / signer)
- [ ] Slots affichés avec apprenants/formateurs

**Filtre INTER** :
- [ ] En formation INTER (multi-entreprises) → CompanyFilter visible
- [ ] Sélectionner une entreprise → liste filtrée correctement
- [ ] "Toutes les entreprises" → liste complète

**Exports PDF** :
- [ ] Export planning hebdo signé → PDF téléchargé
- [ ] Export feuille émargement → PDF téléchargé
- [ ] Export per-company (INTER) → N PDFs téléchargés (un par entreprise)

**QR Codes** :
- [ ] Cliquer "Générer QR codes" → Dialog s'ouvre, codes visibles
- [ ] Codes individuels par apprenant + par formateur
- [ ] Empty state si pas d'apprenants/formateurs

**Signatures** :
- [ ] Single sign : cliquer "Signer pour X" → Dialog s'ouvre, canvas marche, toast succès
- [ ] **Bulk sign Volet A** : cliquer "Marquer tous présents" → Dialog 2-étapes (confirm → sign), canvas marche, toast succès, **SVG enregistré (pas 'admin_bulk')**
- [ ] Suppression signature : icône poubelle → toast succès, signature retirée

---

## 6. Critères d'acceptance

**Technique** :
- [ ] TabEmargements.tsx passe de 1232 LOC à ~740 LOC (±100)
- [ ] 5 fichiers créés dans `src/app/(dashboard)/admin/formations/[id]/_components/emargements/`
- [ ] Aucun import orphelin dans TabEmargements parent (verifié `npx tsc --noEmit`)
- [ ] Vitest : 550/550 maintenu
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run build` success
- [ ] Coverage : 100% sur `load-signatures.ts` et `questionnaire-scoring.ts` maintenu
- [ ] Aucun changement de comportement métier (verifié par smoke check)

**Validation manuelle Wissam** : 16 checks ci-dessus (§ 5.2) tous verts avant merge prod.

---

## 7. Pattern d'exécution

**Branche** : `feat/emargement-volet-e-refacto` (depuis `main` à `bd47247`)

**Stratégie** : **1 chantier, 1 commit par extraction** (bisect-friendly si régression).

**~9 tasks bite-sized** :

| Task | Livrable | Estimation |
|------|----------|-----------|
| 0 | Baseline + branche + créer dossier `emargements/` | 10 min |
| 1 | Extract HeroStatsAndWorkflow (~140 LOC) | 1h |
| 2 | Extract CompanyFilter (~30 LOC) | 30 min |
| 3 | Extract QrCodesDialog (~150 LOC, le plus gros) | 1.5h |
| 4 | Extract SingleSignDialog (~40 LOC) | 45 min |
| 5 | Extract BulkSignDialog (~80 LOC, **EN DERNIER**, Volet A critique) | 1h |
| 6 | Cleanup final (imports orphelins, types orphelins) + vérifs | 30 min |
| 7 | STOP smoke check Wissam (~20 min) | manuel |
| 8 | Finishing après Go (merge + push prod) | 10 min |

**Validation Vitest + tsc + build après CHAQUE extraction** : si une extraction casse le build/tests, le commit isolé permet un rollback ciblé sans perdre les extracts précédents.

---

## 8. Risques et mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Régression sur bulk-sign (Volet A critique) | Faible | Élevé | Task 7 en DERNIER, smoke check stricte. Les 11 tests Volet F sur load-signatures protègent l'aval. |
| Props missing → runtime undefined | Faible | Moyen | TypeScript strict catch immédiatement, ne build pas |
| State partagé mal géré (Dialog ne ferme pas, race condition) | Faible | Moyen | Pattern explicit : passer `state` + `setState` en props (verbose mais clair). Test manuel de chaque Dialog en Task 9. |
| Imports orphelins laissés dans le parent | Très faible | Faible | Task 8 dédiée au cleanup. `tsc --noEmit` catch les imports non utilisés (mode strict). |
| Modal/Dialog opener cassé (asymétrie ouverture/fermeture) | Faible | Moyen | Smoke check chaque Dialog dans Task 9 |
| Régression UI subtile (espacement, couleur, alignement) | Faible | Faible | Pure réorganisation JSX, pas de modif TailwindCSS. Visual diff possible si nécessaire. |

---

## 9. Estimation finale

| Tâche | Estimation |
|-------|-----------|
| Tasks 0-6 (5 extractions + cleanup) | ~5h |
| Task 7 (smoke check manuel Wissam) | ~20 min |
| Task 8 (finishing) | ~10 min |
| **Total Sous-chantier 4** | **~5-6h** |

---

## 10. Suite

Après merge prod du Sous-chantier 4 :

- **Score TabEmargements** : 8/10 maintenu (UX inchangée), mais **maintenabilité fortement améliorée** (parent passe de 1232 → ~650 LOC, 7 composants réutilisables).
- **Parcours Émargement complet** : Volets A (sécurité) + B (types) + C (robustesse) + E (refacto) + F (tests) tous mergés. Volet D (UX pilotage) volontairement refusé par Wissam.
- **Sous-système Émargement final** : solidifié, testé, refactoré. Prêt pour maintenance long terme avec confiance.
- **Pattern réutilisable** : la structure `_components/emargements/` documente une approche valable pour d'autres gros composants (e.g. TabConventionDocs 2042 LOC reste candidat futur).
