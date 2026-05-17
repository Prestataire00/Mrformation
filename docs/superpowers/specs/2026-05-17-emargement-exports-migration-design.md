# Design : Migration des 4 exports émargement vers le système serveur unifié

**Date** : 2026-05-17
**Auteur** : Wissam + Claude (brainstorming session)
**Statut** : approved (brainstorming)
**Story BMad** : Migration architecture exports émargement TabEmargements

## Contexte / Problème

L'onglet Émargement (`TabEmargements.tsx`) présente 4 actions d'export dans sa card "Exporter" :

1. **Feuille d'émargement signée** (bouton primaire)
2. **1 PDF par entreprise (N)** (bouton secondaire, visible en INTER multi-entreprises)
3. **Planning hebdo signé (paysage)** (link texte)
4. **Imprimer une feuille vide** (link texte)

L'audit a révélé que les 4 actions sont **100% côté client** :
- Actions 1 + 2 + 3 : `jsPDF` direct via `src/lib/emargement-pdf-export.ts` et `src/lib/planning-hebdo-pdf-export.ts`
- Action 4 : `window.open()` + HTML inline

### Problème principal : double système

Tout le reste du projet a migré vers un système serveur unifié :
- Route `/api/documents/generate-from-template`
- Template registry `src/lib/templates/registry.ts` (`SYSTEM_TEMPLATES_BY_DOC_TYPE`)
- Resolver `resolveDocumentVariables` (gestion variables, signatures, multi-entreprise)
- Validation Qualiopi (PR #116) : refuse de générer si organisme/client incomplet
- Cache PDF côté serveur (`pdf-cache` storage)
- DocumentGenerationService (Puppeteer + CloudConvert fallback)

Les 4 exports émargement contournent tout ça → :
- ❌ Pas de header/footer organisme propre (logo, adresse, SIRET, NDA)
- ❌ Hardcoding "SIRET C3V = à compléter" dans le footer
- ❌ Pas de validation Qualiopi (PDF généré même si organisme incomplet)
- ❌ Pas de cache PDF (chaque export régénère)
- ❌ Dette architecturale : double système à maintenir, incohérent

## Comportement attendu après migration

### Action 1 — Feuille émargement signée
- Bouton "Feuille d'émargement signée" → POST `/api/documents/generate-from-template`
- `doc_type: "feuille_emargement_collectif"` (existant en registry)
- Si organisme incomplet (pas de SIRET/NDA) → 422 → modal `IncompleteDataDialog` (PR #116)
- Si OK → PDF avec header MR FORMATION + tableau apprenants × créneaux + signatures rendues
- Cache distinct par `(session_id, session.updated_at)`

### Action 2 — 1 PDF par entreprise
- Bouton "1 PDF par entreprise (N)" → boucle frontend sur `companies`
- Pour chaque entreprise : POST `/api/documents/generate-from-template` avec `doc_type: "feuille_emargement_collectif"` + `context.client_id: fc.client_id`
- Le serveur filtre les apprenants via `getLearnersForCompany(session, client_id)` (déjà supporté par le template `emargement-collectif`)
- Cache distinct par `(session_id, client_id)` — évite régénération si une seule entreprise change
- Toast résumé : "N PDFs générés" + détail si certains échouent (422 INCOMPLETE_DATA)

### Action 3 — Planning hebdo signé (paysage)
- Link "Planning hebdo signé (paysage)" → POST `/api/documents/generate-from-template`
- `doc_type: "planning_hebdo_signe"` (NEW)
- Nouveau template `src/lib/templates/planning-hebdo-signe.ts` :
  - Layout tableau N+1 colonnes (Nom + jours×moments), max 10 colonnes
  - Orientation A4 paysage
  - Header organisme + footer SIRET/NDA standard
  - Signatures rendues comme `<img>` dans chaque cellule
- Ajout `"planning_hebdo_signe"` au switch `useLandscape` dans la route `/api/documents/generate-from-template`
- Toast feedback à la fin (fix du bug actuel : pas de feedback)

### Action 4 — Imprimer feuille vide
- Link "Imprimer une feuille vide" → POST `/api/documents/generate-from-template`
- `doc_type: "feuille_emargement_vierge"` (NEW)
- Nouveau template `src/lib/templates/feuille-emargement-vierge.ts` :
  - Copie structurelle de `emargement-collectif.ts`
  - **Ignore complètement** `signaturesById` et `signedLearnerIds` du contexte (toutes cellules vides)
  - Header + footer organisme identique aux autres
- PDF téléchargé directement (vs `window.open` + print actuel)

## Architecture

### Composant 1 — Nouveau template `planning-hebdo-signe.ts`

Fichier : `src/lib/templates/planning-hebdo-signe.ts` (nouveau)

Structure inspirée de `src/lib/planning-hebdo-pdf-export.ts` (262 lignes existantes à porter en HTML) :

- Construction des colonnes via `formation_time_slots` regroupées par `(date, moment)` où `moment = "M"` (avant 13h) ou `"AM"` (après 13h)
- Tri chronologique + limite à 10 colonnes max
- Pour chaque (column, person), résolution de la signature via `signaturesById` (cf pattern `emargement-collectif`)
- Tableau HTML avec header dynamique (jours × moments) et lignes par apprenant + formateur
- CSS A4 landscape : `@page { size: A4 landscape; margin: 10mm; }`

Exports :
- `PLANNING_HEBDO_SIGNE_HTML` (string)
- `PLANNING_HEBDO_SIGNE_FOOTER_TEMPLATE` (string, identique aux footers Qualiopi standards)

### Composant 2 — Nouveau template `feuille-emargement-vierge.ts`

Fichier : `src/lib/templates/feuille-emargement-vierge.ts` (nouveau)

Structure très proche de `emargement-collectif.ts` (205 lignes) :

- Même header organisme + même titre + même tableau apprenants × créneaux
- **Différence clé** : la fonction qui rend une cellule de signature retourne **toujours une case vide** (pas de check `signaturesById.has()`, pas de fallback "Non signé")
- Idéalement : factoriser le tableau commun entre `emargement-collectif` et `feuille-emargement-vierge` dans un helper partagé. Hors scope MVP (YAGNI). Pour cette story, c'est OK d'avoir 2 templates très similaires — clarté > DRY.

Exports :
- `FEUILLE_EMARGEMENT_VIERGE_HTML`
- `FEUILLE_EMARGEMENT_VIERGE_FOOTER_TEMPLATE` (réutilise probablement `EMARGEMENT_FOOTER_TEMPLATE` de `emargement-collectif.ts`)

### Composant 3 — Registry update

Fichier : `src/lib/templates/registry.ts` (modification)

Ajout de 2 entrées :

```typescript
planning_hebdo_signe: {
  html: PLANNING_HEBDO_SIGNE_HTML,
  footer: PLANNING_HEBDO_SIGNE_FOOTER_TEMPLATE,
  ownerType: "session",
  qualiopiBlocking: false,
},
feuille_emargement_vierge: {
  html: FEUILLE_EMARGEMENT_VIERGE_HTML,
  footer: FEUILLE_EMARGEMENT_VIERGE_FOOTER_TEMPLATE,
  ownerType: "session",
  qualiopiBlocking: false,
},
```

**Choix `qualiopiBlocking: false`** :
- Planning hebdo : pas un document Qualiopi critique (juste pratique pour visualisation)
- Feuille vide : c'est un brouillon pour impression — pas d'enjeu Qualiopi vu qu'aucune donnée n'est encore validée

### Composant 4 — Route update (support landscape)

Fichier : `src/app/api/documents/generate-from-template/route.ts` (modification ligne ~371)

Actuellement :
```typescript
const useLandscape = payload.doc_type === "planning_semaine";
```

Devient :
```typescript
const useLandscape = ["planning_semaine", "planning_hebdo_signe"].includes(payload.doc_type ?? "");
```

### Composant 5 — TabEmargements refactor

Fichier : `src/app/(dashboard)/admin/formations/[id]/_components/TabEmargements.tsx` (modification majeure)

Remplacer les 4 handlers par des appels au hook `useDocumentGeneration` (déjà créé en PR #116) :

```typescript
const { generate: generateDocument, incompleteDialog } = useDocumentGeneration();

// Action 1
const handleExportEmargementPdf = async () => {
  await generateDocument(
    { doc_type: "feuille_emargement_collectif", context: { session_id: formation.id } },
    { onSuccess: (r) => downloadBlob(r.base64, r.filename) }
  );
};

// Action 2
const handleExportEmargementPerCompany = async () => {
  let succeeded = 0;
  for (const fc of companies) {
    await generateDocument(
      { doc_type: "feuille_emargement_collectif", context: { session_id: formation.id, client_id: fc.client_id } },
      { onSuccess: (r) => { downloadBlob(r.base64, `${fc.company_name}.pdf`); succeeded++; } }
    );
  }
  toast({ title: `${succeeded}/${companies.length} PDF générés` });
};

// Action 3
const handleDownloadPlanningHebdo = async () => {
  await generateDocument(
    { doc_type: "planning_hebdo_signe", context: { session_id: formation.id } },
    { onSuccess: (r) => downloadBlob(r.base64, r.filename) }
  );
  toast({ title: "Planning hebdo généré" }); // ← fix du bug actuel (pas de feedback)
};

// Action 4
const handlePrintEmpty = async () => {
  await generateDocument(
    { doc_type: "feuille_emargement_vierge", context: { session_id: formation.id } },
    { onSuccess: (r) => downloadBlob(r.base64, r.filename) }
  );
};
```

Helper `downloadBlob(base64, filename)` à créer ou réutiliser si existant (pattern atob → Uint8Array → Blob → URL.createObjectURL → click `<a>`).

### Composant 6 — Cleanup

Une fois les 4 actions migrées et validées par test manuel :

- DELETE `src/lib/emargement-pdf-export.ts` (417 lignes)
- DELETE `src/lib/planning-hebdo-pdf-export.ts` (262 lignes)
- DELETE imports `downloadEmargementPDF` et `downloadPlanningHebdoPDF` dans `TabEmargements.tsx`
- DELETE state `exportingSheet` + `setExportingSheet` (le hook `useDocumentGeneration` gère son propre loading via la modal)

Vérification grep avant suppression : `grep -rn "emargement-pdf-export\|planning-hebdo-pdf-export" /Users/wissam/Desktop/lms-platform/src` doit retourner **0 match** après refactor.

## Tests

### Tests automatisés
Aucun nouveau test automatisé (les routes PDF nécessitent Puppeteer/CloudConvert lourd en CI — déjà tranché sur les PRs précédentes). La suite Vitest existante (393 tests) doit continuer à passer.

### Tests manuels (Wissam post-deploy)

1. **Action 1** : sur formation INTRA (1 entreprise), bouton "Feuille d'émargement signée" → PDF téléchargé avec header MR FORMATION + apprenants × créneaux + signatures rendues comme images
2. **Action 1 organisme incomplet** : retirer SIRET de l'entité → bouton → modal `IncompleteDataDialog` apparaît avec "Compléter le profil organisme" (PR #116)
3. **Action 2** : sur formation INTER 2 entreprises → 2 PDFs téléchargés avec nom entreprise dans le fichier, apprenants correctement filtrés (entreprise A ne voit pas apprenants entreprise B)
4. **Action 3** : link "Planning hebdo signé" → PDF paysage A4 avec tableau jours × moments, signatures par cellule, toast feedback "Planning hebdo généré"
5. **Action 4** : link "Imprimer une feuille vide" → PDF avec apprenants listés mais toutes cellules signature vides (pas de signatures électroniques affichées même si elles existent en DB)
6. **Cache** : refaire Action 1 immédiatement → PDF servi depuis cache (vérifier dans Network tab : `cacheHit: true`)
7. **Régression** : autres exports/actions de TabEmargements (signature directe via dialog, génération QR) fonctionnent toujours

## Edge cases

- **0 apprenant sur la session** : la route serveur génère un PDF avec tableau vide. Pas de validation `enrollments.length > 0` au frontend (vu que c'est rare et le PDF vide est lisible). À noter dans la PR mais pas bloquant.
- **0 entreprise sur la session INTER** : le bouton Action 2 est déjà caché (condition `companies.length > 0`) — comportement inchangé
- **N > 10 créneaux pour planning hebdo** : le template tronque à 10 colonnes (cohérent avec l'existant jsPDF). À noter dans le template via un commentaire HTML, optionnel : ajouter une note "Affichage limité à 10 créneaux".
- **Cache stale après modif entité** : déjà géré par le pattern `session_updated_at` dans `cacheInputs` (cf PR #111). Si Loris met à jour l'entité (logo, SIRET), il faudra touch `entities.updated_at` ou similaire pour invalider — hors scope MVP (le cache se régénère naturellement après 5 min de TTL).
- **`feuille_emargement_collectif` pour Action 2** : le template doit déjà filtrer par `client_id` via le helper `getLearnersForCompany` du resolver. À vérifier en Task 1 du plan. Si pas le cas, ajustement minimal du template (1 ligne).
- **Popup blocker** : on n'utilise plus `window.open()`, donc plus de risque popup blocker. Téléchargement via blob URL + `<a download>` click.

## Hors scope (post-MVP)

- **Factorisation du tableau apprenants×créneaux** entre `emargement-collectif`, `emargement-individuel` et `feuille-emargement-vierge` : DRY tentant mais YAGNI pour cette story (les 3 templates ont des nuances : individuel = 1 apprenant, collectif = tous, vierge = sans signatures). Refactor possible plus tard si maintenance devient pénible.
- **Migration du planning hebdo vers un nouveau composant React** (vs template HTML statique) : hors scope, le pattern actuel (HTML string + resolver variables) est cohérent avec le reste.
- **Tests E2E Playwright** sur les 4 exports : nécessite infra Puppeteer + Supabase de test, story dédiée Lot E si Loris le demande.
- **Pagination du planning hebdo** au-delà de 10 créneaux : limite acceptée comme telle pour MVP (formations > 5 jours sont rares dans le projet).

## Risques

- **Régression visuelle** sur Action 1 vs le PDF jsPDF actuel : le nouveau PDF serveur sera plus "Qualiopi propre" mais visuellement différent. Loris doit valider que c'est OK. Mitigation : test manuel avant merge.
- **Régression sur le filtrage multi-entreprise (Action 2)** : dépend de `getLearnersForCompany` côté template. Tester en INTER 2 entreprises (= cas Loris actuel) avant merge.
- **Le nouveau template `planning_hebdo_signe`** doit reproduire fidèlement le layout existant (paysage, jours×moments, signatures par cellule). Risque de divergence — comparer visuellement les 2 PDFs (avant/après) en test manuel.
- **Cleanup des helpers jsPDF avant validation** : si on supprime trop tôt et que la route serveur échoue en prod, on perd la fonctionnalité. Mitigation : cleanup en dernière task du plan, après validation des 4 actions migrées.

## Definition of Done

- [ ] Template `src/lib/templates/planning-hebdo-signe.ts` créé avec HTML + FOOTER exportés
- [ ] Template `src/lib/templates/feuille-emargement-vierge.ts` créé avec HTML + FOOTER exportés
- [ ] Registry `src/lib/templates/registry.ts` enrichi des 2 nouveaux doc_types (`qualiopiBlocking: false`)
- [ ] Route `generate-from-template` : switch `useLandscape` inclut `planning_hebdo_signe`
- [ ] Si nécessaire : template `emargement-collectif.ts` ajusté pour supporter le filtrage `client_id` (à vérifier au début du plan)
- [ ] `TabEmargements.tsx` : 4 handlers refactorés vers `useDocumentGeneration`
- [ ] Helper `downloadBlob` extrait ou réutilisé
- [ ] DELETE `src/lib/emargement-pdf-export.ts`
- [ ] DELETE `src/lib/planning-hebdo-pdf-export.ts`
- [ ] Imports + state nettoyés dans `TabEmargements.tsx`
- [ ] `grep -rn "emargement-pdf-export\|planning-hebdo-pdf-export"` retourne 0 match
- [ ] Typecheck `npx tsc --noEmit` clean
- [ ] Suite Vitest 393 tests passent
- [ ] PR créée + mergée
- [ ] Test manuel Wissam : 7 cas du test plan validés post-deploy

## Intégration BMad

Cette story s'intègre dans le sprint en cours. À créer via `bmad-create-story` après validation du spec :
- **Titre** : "Migration architecture des 4 exports émargement vers le système serveur unifié"
- **Epic** : E2 ou E5 (Documents) selon décision PO
- **Estimation** : 5-7 jours dev (1 sprint), répartition en tasks dans le plan d'implémentation
- **Priorité** : Medium-High (dette architecturale, pas de bug bloquant prod mais Qualiopi non conforme sur exports)
- **Prérequis** : PR #117 (Node 22 + RLS) mergée + migration SQL exécutée
