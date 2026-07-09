# Envoi facture & docs de fin de formation : modèle + PJ (ordinateur & docs formation)

**Date** : 2026-07-09
**Statut** : Design validé

## Problème / objectif

À l'envoi **unitaire** d'une **facture** ou d'un **document de fin de formation** (certificat de
réalisation, attestations…), permettre : (1) prévisualiser le mail, (2) **changer le modèle**
d'email, (3) joindre des **PJ supplémentaires** depuis l'ordinateur **et** depuis les documents
existants de la formation.

Constat (déjà en place) : le composant partagé **`EmailPreviewDialog`** fournit déjà preview +
objet/corps éditables + upload PJ ordinateur, et est branché sur l'envoi facture (avec
`allowExtraAttachments`) et sur l'envoi unitaire de doc (sans le flag). Manquent : **sélecteur de
modèle** et **PJ depuis les documents de la formation**.

## Décisions validées

- Sources de « documents existants » : **les deux** — fichiers déposés (`formation_documents`) ET
  documents Qualiopi générés (`documents`, régénérés à la volée).
- Envoi **en masse** (« Envoyer tout ») : **hors périmètre** (backend lourd, à faire plus tard).

## Architecture

### Helper pur — `src/lib/email/template-vars.ts`
- `substituteTemplateVars(text, vars)` : remplace `{{var}}` (garde `{{inconnu}}` littéral).
- `applyEmailTemplate({subject,body}, vars)`. Testé.

### Helper — `src/lib/formations/formation-attachments.ts`
- Type `AvailableAttachment { id, label, resolve: () => Promise<{filename,content,type}|null> }`.
- `listFormationAttachments(supabase, sessionId, entityId): Promise<AvailableAttachment[]>` :
  - **Fichiers déposés** : `formation_documents` de la session → resolve = `fetchSignedDocUrl` →
    fetch → base64. Label = `file_name`.
  - **Docs générés** : `documents` (source_table='sessions', source_id=sessionId, status
    generated/sent/signed) → resolve = `POST /api/documents/generate-from-template`
    ({template_id|doc_type, context:{session_id, owner...}}) → base64. Label =
    `DOCUMENT_LABELS[doc_type] — <nom du destinataire>` (noms résolus en lot ; repli sur le
    libellé seul si absent).
  - Résolution à la demande (thunk par doc) : aucun PDF pré-généré.

### Extension `EmailPreviewDialog.tsx`
- Nouvelles props : `templates?: EmailTemplateOption[]`, `templateVars?: Record<string,string>`,
  `availableAttachments?: AvailableAttachment[]`.
- **Sélecteur de modèle** (`<Select>`) : « Modèle par défaut » + les modèles ; à la sélection →
  `applyEmailTemplate(tpl, templateVars)` → objet/corps (retouchables). « Par défaut » restaure
  `defaultSubject/Body`.
- **« Joindre un document de la formation »** : chaque `availableAttachment` en bouton ; au clic →
  `resolve()` (spinner) → ajout aux PJ. Déjà ajouté → marqué (dé-marqué si retiré). Réutilise la
  liste `extraAttachments` existante (tag interne `_sourceId`).
- Upload ordinateur : inchangé (`allowExtraAttachments`).

### Câblage
- **Facture** (`TabFinances.tsx` ~1395) : passe `templates` + `templateVars` + `availableAttachments`.
- **Doc unitaire** (`TabConventionDocs.tsx` ~2148) : **active `allowExtraAttachments`** + passe
  `templates` + `templateVars` + `availableAttachments`. Liste chargée à l'ouverture du dialog.
- Chaque onglet fetch les modèles email actifs de l'entité (ordre alpha) et construit `templateVars`
  depuis son contexte (facture : reference/montant/entite/titre ; doc : titre/nom apprenant/entite).

### Backend
- **Aucun changement** : les deux flux POST déjà `/api/emails/send` avec `attachments`
  (tracés dans l'historique via PR #328). Le choix de modèle ne modifie que l'objet/corps côté client.

## Cas limites
- Aucun modèle / aucun doc formation → sections masquées.
- Échec `resolve()` d'une PJ (génération/URL) → toast d'erreur, PJ non ajoutée, envoi possible sans.
- `{{var}}` non fourni côté client → laissé littéral (parité résolveur / devis).

## Tests
- `substituteTemplateVars` / `applyEmailTemplate` (pur).
- `formation-attachments` : construction des labels (avec/sans nom), tri ; resolve mocké.
- Réutilise `describeAttachment` (PR #328). Câblage UI vérifié par tsc/build.

## Hors périmètre
- Envoi **en masse** (`BulkDocActionsPanel`/routes `send-*-batch-email`) — Incrément 2.
- Aperçu HTML riche (aperçu texte suffisant).
