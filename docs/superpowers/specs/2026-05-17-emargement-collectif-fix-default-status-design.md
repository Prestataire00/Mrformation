# Design : Fix statut par défaut feuille d'émargement (collectif + individuel)

**Date** : 2026-05-17
**Auteur** : Wissam + Claude
**Statut** : approved (brainstorming)
**Story** : Bug reporté en test post-PR #113

## Contexte / Problème

Le PDF feuille d'émargement collectif affiche `Présent (A signé en présentiel)` pour TOUS les apprenants même quand aucune signature n'existe en base.

### Cause technique

1. **Resolver** : `src/lib/utils/resolve-variables.ts:886-892` (collectif) et `:571-580` (individuel) ont un fallback codé volontairement à `"Présent (A signé en présentiel)"` quand `signedLearnerIds` n'est pas dans le contexte. Le commentaire dit "assume présent (cas par défaut le plus courant)" — sémantiquement faux pour un document Qualiopi.

2. **Data loading** : `src/app/api/documents/generate-from-template/route.ts:323` ne charge `signedLearnerIds` que pour `attestation_assiduite` et `feuille_emargement` (individuel) — pas pour `feuille_emargement_collectif`. Du coup même si on fixe le fallback, le test `signed.has()` ne marche pas pour la collective.

### Impact

- **Documents Qualiopi falsifiés** : la feuille affirme la présence d'apprenants sans signature vérifiée
- **Risque audit Qualiopi** : si Loris envoie ces feuilles aux financeurs ou auditeurs sans avoir vraiment fait signer, c'est une non-conformité grave
- **UX trompeuse** : Loris pense que ses tests fonctionnent ("le PDF est rempli") alors qu'en réalité aucune signature n'est traitée

## Usage métier (validé brainstorming)

Loris utilise la feuille d'émargement collectif en **2 modes hybrides selon les sessions** :
- **Papier** : imprimée vierge → signée au stylo en présentiel → scannée/archivée
- **Électronique** : signature via magic link OU tablette en présentiel (SignaturePad inline)

Le PDF doit donc supporter les 2 cas : laisser des cases VIDES disponibles pour signature manuscrite, mais aussi afficher les signatures électroniques quand elles existent.

## Comportement attendu

Pour chaque cellule d'émargement (apprenant × créneau ou ligne apprenant), 4 cas possibles selon l'état :

| État | Affichage PDF |
|---|---|
| **Signature électronique présente** (image SVG/PNG) | Image signature rendue (`<img>`) — inchangé |
| **Pas de signature + session à venir** (`session.end_date >= today`) | **Cellule vide** (espace prêt pour signature manuscrite à l'impression) |
| **Pas de signature + session passée** (`session.end_date < today`) | **`Non signé`** en rouge discret (italique, `#ef4444`, 9pt) |
| **`session.end_date` null/inconnu** | **Cellule vide** (fallback safe : on assume "à venir") |

Logique appliquée aux **2 templates** :
- `EMARGEMENT_COLLECTIF_HTML` (tableau de tous les apprenants, le bug actuel)
- `EMARGEMENT_INDIVIDUEL_HTML` (1 PDF par apprenant, même bug latent)
- Statut formateur dans le collectif (`formateurStatus` ligne 922-924, même fallback à corriger)

## Architecture du fix

### Composants impactés

| Fichier | Changement |
|---|---|
| `src/lib/utils/resolve-variables.ts` | Nouveau helper `renderUnsignedCell(sessionEndDate)` + 3 call sites mis à jour (individuel ~571, collectif ~887, formateur ~922) |
| `src/lib/templates/emargement-individuel.ts` | CSS : ajouter classe `.status-unsigned` |
| `src/lib/templates/emargement-collectif.ts` | CSS : ajouter classe `.status-unsigned` |
| `src/app/api/documents/generate-from-template/route.ts` | Ligne 323 : étendre condition de chargement `signedLearnerIds` à `feuille_emargement_collectif` |
| `src/lib/templates/__tests__/__snapshots__/snapshots.test.ts.snap` | Regen auto via `vitest -u` après modif |

### Helper `renderUnsignedCell` (dans resolve-variables.ts)

```typescript
function renderUnsignedCell(sessionEndDate: string | null | undefined): string {
  if (!sessionEndDate) return ""; // Pas de date connue → cellule vide (safe)
  const isPastSession = new Date(sessionEndDate) < new Date();
  if (isPastSession) {
    return `<span class="person-status status-unsigned">Non signé</span>`;
  }
  return ""; // Session à venir → cellule vide pour signature manuscrite
}
```

### Pattern de résolution unifié

```typescript
// Pour chaque cellule (collectif + individuel)
const sessionEndDate = data.session?.end_date;
const sig = sigMap?.get(learnerId); // ou trainerId pour formateur
if (sig) return `<span>Présent</span>${renderSignature(sig)}`;
if (signed?.has(learnerId)) {
  // Signé électroniquement mais sans image (rare, ex: legacy)
  return `<span class="person-status">Signé</span>`;
}
return renderUnsignedCell(sessionEndDate);
```

### CSS partagé (à dupliquer dans les 2 templates ou factoriser plus tard)

```css
.person-status.status-unsigned {
  color: #ef4444;
  font-style: italic;
  font-size: 9pt;
}
```

### Data flow

```
TabConventionDocs.handleView(doc) [type=feuille_emargement_collectif]
  ↓
POST /api/documents/generate-from-template { doc_type, context.session_id, context.client_id }
  ↓
generate-from-template/route.ts :
  ├── Charge session (avec end_date, formation_companies, formation_trainers, enrollments)
  ├── Charge client + contacts (helper PR #113)
  ├── Charge signedLearnerIds + signaturesById (NEW : étendre condition à feuille_emargement_collectif)
  ├── Build ResolveContext { session, client, signedLearnerIds, signaturesById, ... }
  ├── resolveDocumentVariables(EMARGEMENT_COLLECTIF_HTML, ctx)
  │     ↓ pour chaque cellule :
  │     ├── sig dispo → image
  │     ├── signed.has(id) → "Signé"
  │     └── renderUnsignedCell(session.end_date) → "" ou "Non signé"
  ↓
DocumentGenerationService.generate(...)
  ↓
PDF retourné
```

## Tests

### Snapshot tests

Les snapshots E4 existants (`emargement_individuel` au minimum) vont changer car le rendu diffère. Regénérer via :
```bash
npx vitest run src/lib/templates/__tests__/snapshots.test.ts -u
```

Review humain du diff snapshot pour valider que les nouveaux rendus sont corrects (pas de "Présent" abusif).

### Tests unitaires ciblés

Ajouter dans `src/lib/utils/__tests__/resolve-variables.test.ts` (ou nouveau `emargement-status.test.ts`) :

```typescript
describe("renderUnsignedCell (émargement status)", () => {
  it("session passée + non signé → 'Non signé' rouge", () => {
    // session.end_date = '2025-01-01' (passé)
    // signedLearnerIds vide
    // expect: contient "Non signé" + class status-unsigned
  });
  it("session à venir + non signé → cellule vide", () => {
    // session.end_date = '2030-01-01' (futur)
    // expect: ""
  });
  it("session avec end_date null → cellule vide (fallback safe)", () => {
    // session.end_date = null
    // expect: ""
  });
  it("signature image présente → image rendue (pas de fallback)", () => {
    // signaturesById a la learner_id
    // expect: contient "<img src="..."
  });
  it("signé sans image (legacy) → 'Signé'", () => {
    // signedLearnerIds a la learner_id mais signaturesById vide
    // expect: contient "Signé" (pas "Présent")
  });
});
```

### Tests manuels post-deploy (Wissam)

1. **Cas à venir** : créer session avec `end_date > today` → générer feuille collective → vérifier que toutes cellules sont VIDES
2. **Cas passé** : `UPDATE sessions SET end_date = '2025-01-01' WHERE id = '<id>'` → re-générer → vérifier "Non signé" rouge sur tous
3. **Cas mixte** : faire signer 1 apprenant via magic link → re-générer → cet apprenant a image signature, les autres "Non signé" (vu que session passée dans le test)

## Edge cases / robustesse

- **`session.end_date` null** → cellule vide (assume "à venir", évite faux positif "Non signé")
- **Session terminée aujourd'hui** (`end_date = today`) → `new Date(end_date) < new Date()` retourne `false` si `end_date` n'a pas d'heure ou est à minuit → encore considéré "à venir" jusqu'au lendemain (comportement raisonnable, évite changement de statut en cours de journée)
- **`signedLearnerIds` non chargé** (cas erreur load) → `signed?.has()` = undefined → tombe dans `renderUnsignedCell(sessionEndDate)` → comportement date-aware (vs ancien fallback trompeur)
- **Mock endpoints** (`generate-emargement-mock`) : ne sont PAS impactés, ils ont leur propre logique hardcodée
- **Mode présentiel vs distanciel** : pas de différenciation, même rendu (les 2 ont signatures)

## Hors scope (post-MVP, story future si besoin)

- **Distinction "Absent déclaré"** via table `formation_absences` : afficher "Absent" (rouge plein) vs "Non signé" (rouge italique) selon que l'admin a déclaré l'absence formellement. Pertinent si Loris utilise activement le tracking absences. À implémenter dans une story dédiée (e-1.x ou story C-extension).
- **Factorisation CSS** : la classe `.status-unsigned` est dupliquée dans 2 templates. Si on factorise les CSS communs dans un fichier partagé un jour, l'inclure. Pas urgent.
- **Autres endpoints batch** (`generate-emargements-batch`, `send-emargements-individuels-batch-email`) qui appellent aussi `resolveDocumentVariables` avec contexte signatures : ces endpoints chargent déjà signedLearnerIds (vérifié dans PR #105 pour F2.4), donc le fix de resolver les couvre automatiquement.

## Risques

- **Faible** : changement isolé au resolver + 1 ligne route. Les snapshots E4 vont catch les régressions de rendu HTML.
- **Compat documents passés** : si Loris a des sessions passées sans signatures, les PDFs vont passer de "Présent" (faux) à "Non signé" (vrai). C'est une correction, pas une régression — mais c'est visible immédiatement.

## Definition of Done

- [ ] Helper `renderUnsignedCell()` ajouté dans `resolve-variables.ts`
- [ ] 3 call sites migrés (collectif learner ~887, individuel ~571, collectif trainer ~922)
- [ ] CSS `.status-unsigned` ajouté dans 2 templates
- [ ] `generate-from-template/route.ts:323` : `feuille_emargement_collectif` ajouté à la condition
- [ ] Snapshots regénérés + review humain OK
- [ ] 5 tests unitaires `renderUnsignedCell` ajoutés
- [ ] Typecheck `npx tsc --noEmit` OK
- [ ] Tests 381/381 + 5 nouveaux passent
- [ ] PR créée + mergée
- [ ] Wissam confirme retest manuel : feuille à venir = vide, feuille passée + non signé = "Non signé" rouge
