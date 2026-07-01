# CRM — Aperçu PDF du devis avant création — Design

**Date :** 2026-07-01
**Statut :** Approuvé (design), en attente implémentation
**Origine :** Audit UX CRM — le devis part au client sans qu'on l'ait vu. Sur `quotes/new`, le PDF n'est généré qu'APRÈS insertion. 2ᵉ pas du chantier « Aperçu des envois » (le plus visible côté client).

## Contexte technique
- `src/lib/devis-pdf.ts` génère le PDF **côté client** : `generateDevisPDF(devisData: DevisData, entityName?, logoUrl?, siret?, nda?) => jsPDF doc`. `doc.output("blob")` → URL d'objet.
- `DevisData` : `{ reference, date_creation, date_echeance, training_title?, training_start?, training_end?, tva, effectifs?, duration?, notes?, lines: {description, quantity, unit_price}[], prospect_name, prospect_address?, prospect_email?, prospect_phone?, prospect_siret? }`.
- La page liste construit déjà un `DevisData` depuis un devis sauvegardé (réf. `quotes/page.tsx` `handleDownloadDevis`/`handleSendByEmail`) — même mapping à répliquer depuis le FORMULAIRE.
- `quotes/new` a `entityId` (pas la marque complète) → il faudra fetch `entities` (name, logo_url, siret, nda) pour un rendu fidèle.

## Périmètre (`quotes/new/page.tsx`)
1. **Fetch de la marque de l'entité** (name, logo_url, siret, nda) au chargement (via `entityId`), stockée en state.
2. **Bouton « Aperçu PDF »** (à côté de « Créer ») :
   - Construit un `DevisData` à partir de l'**état actuel du formulaire** — en réutilisant EXACTEMENT le même mapping que celui de la sauvegarde (référence, dates, TVA, effectifs, durée, titre formation, notes, lignes produits, infos prospect), pour que l'aperçu = le PDF final.
   - Appelle `generateDevisPDF(devisData, entity.name, entity.logo_url, entity.siret, entity.nda)` → `doc.output("blob")` → `URL.createObjectURL`.
   - Ouvre un `Dialog` large avec un `<iframe>` affichant le PDF.
   - **Aucune insertion** en base. Libère l'URL d'objet à la fermeture (`URL.revokeObjectURL`).
3. Le bouton est désactivé si le devis n'a pas le minimum requis (référence + au moins une ligne) — même garde que la création, message clair sinon.

## Hors périmètre
- Pas de refonte du formulaire ni de la génération PDF. Pas d'aperçu campagnes/séquences (chantiers suivants). Pas de migration.

## Règles projet
- shadcn/ui (Dialog), pas de type `any`, mapping DRY (idéalement une fonction `buildDevisDataFromForm()` réutilisée par l'aperçu ET la création si faisable sans risque). Barrières `tsc` + `vitest`.

## Risques / vigilance
1. **Fidélité aperçu = final** : réutiliser le MÊME mapping form→DevisData que la sauvegarde (sinon l'aperçu ment). Idéalement extraire une fonction commune.
2. **Lignes produits** : mapper chaque ligne du tableau → `{ description, quantity, unit_price }` (parser les nombres FR `,`→`.` comme au save).
3. **Fuite mémoire** : `revokeObjectURL` à la fermeture du modal.
4. **Entité** : logo/siret/nda peuvent être null → `generateDevisPDF` gère l'optionnel (PDF sans logo), ne pas planter.

## Critères d'acceptation
- « Aperçu PDF » ouvre un modal montrant le devis rendu depuis les données saisies, identique au PDF qui serait créé.
- Aucune ligne créée en base par l'aperçu.
- Bouton gardé si formulaire incomplet.
- `tsc` + `vitest` verts.
