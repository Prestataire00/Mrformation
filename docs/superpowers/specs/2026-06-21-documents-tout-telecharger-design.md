# Onglet Documents — « Tout télécharger » + actions en masse visibles — Design

> Cadrage BMAD (Mary). Langue : FR. Date : 2026-06-21.
> Retour client (Loris) : « Dans l'onglet document le bouton *PDF Tous* télécharge que
> les convocations. Il faudrait, dans l'encart action en masse, figer les certificats de
> réalisation de tout le monde et tous les télécharger. Pour chacun des docs. »

## 1. Contexte & constat (recadrage du retour)

Composant concerné : `src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx`
(onglet Documents du détail formation).

Vérifications faites sur le code + git **avant** conception :

1. **La demande a déjà été partiellement livrée** le 02/06 (commit `0f88666` « Lot G — PDF Tous
   + Figer + Envoyer », sur `main` donc en prod depuis ~18 j). Lot G ajoute, **par type de
   document**, les boutons « Tout figer » / « Envoyer tout » / « PDF tout ».
2. **MAIS** ces boutons ne vivent que dans la vue **« Détail »**, qui **n'est pas la vue par
   défaut**. La vue par défaut est **« Matrice »** (`matrixView = true`), qui n'a **aucun**
   téléchargement groupé par type — seulement un « Tout figer » global et un téléchargement
   au survol, case par case.
3. **Côté serveur, rien n'est cassé** : les endpoints `generate-convocations-batch`,
   `generate-certificats-realisation-batch`, `generate-attestations-assiduite-batch`,
   `generate-emargements-individuels-batch` génèrent **tous** un PDF pour **tous les apprenants
   inscrits, sans condition de figeage**. Les certificats se téléchargent donc aussi bien que
   les convocations.
4. **Label ambigu** : le bouton par ligne « PDF tout » se lit comme « tous les PDF » alors qu'il
   ne sort qu'**un seul type**. En cliquant la ligne *convocation*, l'utilisateur obtient les
   convocations → impression que « PDF Tous ne sort que les convocations ».
5. **Carte de téléchargement incomplète** : `BATCH_ENDPOINTS_BY_DOC_TYPE`
   (`src/lib/utils/batch-doc-download.ts`) ne mappe que **6 types**, alors que **~27 endpoints
   `generate-*-batch` existent** et que la carte d'envoi (`batch-doc-send.ts`) en couvre ~25.
   C'est pourquoi les documents secondaires (habilitations, attestations métier…) n'ont pas de
   bouton « Télécharger » : la **carte** est incomplète, pas les endpoints.

**Vraie cause (différente de « ajouter des boutons », déjà fait par Lot G)** :
(a) les actions par type sont **invisibles dans la vue par défaut**, (b) le **label** est ambigu,
et (c) il n'existe **pas** de vrai « tout télécharger, tous types ».

## 2. Décisions de cadrage (validées avec l'utilisateur)

| # | Question | Décision |
|---|----------|----------|
| 1 | Sens de « PDF Tous » | **Global + par type** : un vrai « Tout télécharger » (1 ZIP, tous types) **et** garder « Télécharger tout » par type, le tout **visible dans la vue par défaut**. |
| 2 | « figer + télécharger » | **Deux boutons séparés** (« Tout figer » / « Télécharger tout »), mais rendus visibles dans la vue par défaut. Figer reste un acte explicite (pas de figeage involontaire au téléchargement). |
| 3 | Périmètre du ZIP global | **Vraiment tout** : apprenants (convocation, certificat, attestation, émargement) + entreprises (convention) + formateurs (convention d'intervention) + communs (CGV, RI, RGPD, programme) + secondaires/custom attribués. Sous-dossiers par type. |
| — | Approche technique | **Approche A — orchestrateur côté client** réutilisant les ~27 endpoints `generate-*-batch` existants (pas de nouvel endpoint serveur, fail-soft, risque minimal). |

## 3. Architecture

Trois briques isolées + un nettoyage de carte. **Aucun** changement SQL/RLS : les endpoints batch
portent déjà le filtrage `entity_id` côté serveur.

### Brique 1 — Compléter la carte de téléchargement (data, ~0 risque)
`src/lib/utils/batch-doc-download.ts` : étendre `BATCH_ENDPOINTS_BY_DOC_TYPE` de 6 → ~27 types, en
miroir des endpoints `generate-*-batch` existants. **Le mapping `doc_type → endpoint` doit être
sourcé en lisant le `docType` réel de chaque route** (ne pas deviner — cf. méthodo audit projet).
Effet immédiat : `hasBatchEndpoint()` devient vrai pour les secondaires → le bouton « Télécharger »
par type apparaît automatiquement pour eux.

### Brique 2 — Orchestrateur global (nouveau fichier, logique pure & testable)
`src/lib/utils/batch-doc-download-all.ts` :
`downloadAllSessionDocs(args)` reçoit ce qui est présent dans la session, déjà trié en 3 familles
par `TabConventionDocs` :

- **Types « par personne » avec endpoint batch** → 1 appel `generate-*-batch` chacun (body
  `{ sessionId }` → réponse `{ zipBase64 }`) → ZIP par type rechargé via `JSZip.loadAsync` et ses
  entrées recopiées sous un sous-dossier du type.
- **Documents communs** (CGV, RI, RGPD, programme) — pas d'endpoint par-personne → **1** appel
  `generate-from-template` chacun (contexte = session) → 1 PDF (`{ base64 }`) sous `Communs/`.
- **Documents personnalisés (custom)** → `generate-from-template` par doc (template_id +
  propriétaire) → sous `Documents personnalisés/`.

**ZIP maître produit :**
```
Documents_<formation>_<date>.zip
├── Convocations/                 DUPONT_Jean.pdf, MARTIN_Sophie.pdf, …
├── Certificats de réalisation/   …
├── Attestations d'assiduité/     …
├── Feuilles d'émargement/        …
├── Conventions entreprise/       ACME-SARL.pdf
├── Conventions d'intervention/   FORMATEUR_Paul.pdf
├── Communs/                      CGV.pdf, Règlement intérieur.pdf, …
├── Documents personnalisés/      …
└── _erreurs.txt                  (présent uniquement si ≥1 échec)
```

**Robustesse (fail-soft) :**
- Tâches lancées en **pool de concurrence borné (~4)** pour ne pas saturer le sidecar Puppeteer (prod).
- Un type/doc en échec → consigné dans `_erreurs.txt`, **les autres passent**.
- **Tous** en échec → on **lève** une erreur (toast rouge, pas de ZIP vide).
- Session sans aucun document → bouton désactivé en amont (pas d'appel).
- Retour : `{ totalTypes, successTypes, failedTypes, totalFiles, latencyMs }` → toast récap.

Réutilise `fetchBatchZip` (déjà dans `batch-doc-download.ts`, renvoie blob + stats par type).

### Brique 3 — UI : panneau « Actions en masse » toujours visible (refactor ciblé)
Nouveau composant
`src/app/(dashboard)/admin/formations/[id]/_components/BulkDocActionsPanel.tsx`.

- **Bouton global** « **Tout télécharger (ZIP)** » ajouté dans la barre *Quick Actions*, à côté du
  « Tout figer » global existant → **toujours visible**, dans les deux vues.
- **`BulkDocActionsPanel`** (repliable) rendu **juste sous la barre Quick Actions**, donc visible en
  Matrice **et** en Détail. Regroupe par propriétaire, une ligne par type présent :

```
Actions en masse                                       [⌄]
─ Apprenants ──────────────────────────────────────────
  Convocations (8)        [Tout figer] [Télécharger (8)] [Envoyer tout]
  Certificats (8)         [Tout figer] [Télécharger (8)] [Envoyer tout]
  Attestations (8)        [Tout figer] [Télécharger (8)] [Envoyer tout]
  Émargements (8)         [Tout figer] [Télécharger (8)] [Envoyer tout]
─ Entreprises ─────────────────────────────────────────
  Conventions (2)         [Tout figer] [Télécharger (2)] [Envoyer tout] [Demander signature]
─ Formateurs / Secondaires … (si présents)
```

- Les **handlers existent déjà** dans `TabConventionDocs` (`handleMassConfirm`,
  `handleDownloadAllPDF`, `handleMassSendWithPDF`, `handleMassSignatureRequest`) → passés en props.
  Nouveau handler `handleDownloadAllSession` (appelle Brique 2).
- On **retire** les blocs inline redondants de la vue Détail + l'ancien encart « Actions en masse —
  documents par défaut » (qui n'avait ni download ni couverture secondaires). Tout converge dans ce
  panneau unique (DRY).
- Bénéfice annexe : `TabConventionDocs.tsx` fait 2325 lignes (trop) ; l'extraction l'allège.

**Labels (lève l'ambiguïté à l'origine du retour) :**
- Par type : « PDF tout » → « **Télécharger (N)** » (N = nombre) + tooltip « ZIP de tous les {type} ».
- Global : « **Tout télécharger (ZIP)** » + tooltip « Tous les documents de la session en un seul ZIP ».
- « Tout figer » (global, tous types) et « Tout figer » par type : inchangés.

## 4. Fichiers

- **Créer** :
  - `src/lib/utils/batch-doc-download-all.ts` (orchestrateur, Brique 2)
  - `src/app/(dashboard)/admin/formations/[id]/_components/BulkDocActionsPanel.tsx` (Brique 3)
  - `src/lib/utils/__tests__/batch-doc-download-all.test.ts`
- **Modifier** :
  - `src/lib/utils/batch-doc-download.ts` (étendre la carte — Brique 1)
  - `src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx`
    (branche `BulkDocActionsPanel` + bouton global ; retire les blocs inline)
  - `src/lib/utils/__tests__/batch-doc-download.test.ts` (garde-fou couverture de carte)

## 5. États & edge cases

- Global : spinner pendant l'opération ; **désactivé** si `docs.length === 0`.
- Par type : on conserve les loaders par clé existants (`massDownloading` / `massSending` / `saving`).
- Groupes Entreprises / Formateurs / Secondaires masqués s'ils n'ont rien à montrer.
- Type présent sans endpoint ni commun ni custom (ne devrait plus arriver après Brique 1) : pas de
  bouton Télécharger, omis du ZIP global avec note dans `_erreurs.txt` (défensif).
- **Conventions entreprise INTER incomplètes** : la validation UI `canExportCompanyDoc` reste sur le
  bouton *par type* ; pour le ZIP global on **délègue** au endpoint `generate-conventions-batch`
  (fail-soft par entreprise côté serveur) afin qu'une entreprise invalide ne bloque pas les valides.
  Limite assumée : le ZIP global est un **archivage best-effort**.

## 6. Tests (Vitest, noms FR)

- `batch-doc-download.test.ts` : « la carte de téléchargement couvre tous les types nominatifs ayant
  un endpoint `generate-*-batch` » (anti-régression sur l'oubli de mapping).
- `batch-doc-download-all.test.ts` (mock `fetch`) :
  - « fusionne les ZIP par type en sous-dossiers »
  - « fail-soft : un type en échec n'empêche pas les autres + `_erreurs.txt` présent »
  - « lève une erreur si tous les types échouent »
  - « ajoute les communs comme PDF unique sous `Communs/` »

## 7. Hors-scope (YAGNI)

- Aucun nouvel endpoint serveur (réutilisation des ~27 existants).
- Aucun changement du moteur de génération ni des templates.
- Aucun changement SQL / RLS.
- Pas de bouton combiné « figer + télécharger » (décision n°2 : boutons séparés).
- Pas de fusion en un PDF unique (c'est un **ZIP** de PDF).

## 8. Critères de succès

1. Dans la **vue par défaut (Matrice)**, l'admin voit et utilise « Tout figer » / « Télécharger
   tout » / « Envoyer tout » **pour chaque type** présent (apprenants, entreprises, formateurs,
   secondaires) — sans passer en vue Détail.
2. Le bouton **« Tout télécharger (ZIP) »** produit un ZIP unique organisé par type contenant **tous**
   les documents de la session (pas seulement les convocations).
3. Plus aucune ambiguïté de label : « Télécharger (N) » par type vs « Tout télécharger (ZIP) » global.
4. Un échec partiel ne casse pas le téléchargement (fail-soft + `_erreurs.txt`).
