# Historique des emails : voir les pièces jointes / documents envoyés

**Date** : 2026-07-09
**Statut** : Design validé

## Problème

Dans admin/emails → Historique → « Détail de l'envoi », on ne voit pas si un document
est parti avec le mail. Deux causes :

1. **Affichage** : le panneau (Sheet) n'affiche aucune pièce jointe, alors que la colonne
   `email_history.attachments` (jsonb) existe et est déjà chargée (`select("*")`).
2. **Enregistrement** : seuls les envois via la **file d'attente** stockent les descripteurs.
   Les envois **directs** — `documents/sign-request` (demande de signature, ex. Convention),
   `emails/send`, et `batch-email-handler` (emails de documents) — joignent le PDF au mail mais
   n'écrivent **rien** dans `attachments`. Pour ces emails, l'info du document est perdue.

## Décisions validées

- **Affichage + enregistrement** (les deux).
- Pour une demande de signature : afficher **« Nom du document (PDF) » + « Lien de signature
  inclus »**.
- Les emails **déjà envoyés** par les chemins directs restent sans PJ (donnée non stockée à
  l'époque — non récupérable).

## Architecture

### Module partagé (client-safe) — `src/lib/email/document-labels.ts`
- `DOCUMENT_LABELS: Record<string,string>` — type de document → libellé FR (convention_entreprise
  → « Convention de formation », etc.). Pur, sans dépendance serveur (utilisable dans le composant
  client). NE PAS importer `batch-email-handler` (tire Resend/Supabase service dans le bundle client).
- `EmailAttachmentRecord` — forme lâche d'un descripteur stocké (`{ type?, filename?,
  signature_link?, payload? }`) couvrant les descripteurs queue ET les nouveaux directs.
- `describeAttachment(desc): { label, note? }` — libellé lisible (type mappé + « (PDF) », sinon
  `filename`, sinon type prettifié) ; `note = "Lien de signature inclus"` si `signature_link`.

### Affichage — `admin/emails/page.tsx`
- Type `EmailHistoryWithTemplate` étendu avec `attachments?: EmailAttachmentRecord[]`.
- Nouvelle carte « Pièces jointes » dans le Sheet, entre Objet et Corps : liste
  `detailItem.attachments.map(describeAttachment)`. Masquée si aucune PJ.

### Enregistrement des descripteurs (3 chemins directs)
| Chemin | Fichier | Stocke |
|--------|---------|--------|
| Demande de signature | `api/documents/sign-request/route.ts` (insert ~l.179) | `[{ type: doc.doc_type, filename: "<docLabel>.pdf", signature_link: true }]` si PDF joint. + `sent_by` (corrige aussi « Envoyé par — »). |
| Envoi direct | `api/emails/send/route.ts` (insert ~l.244) | `payload.attachments?.map(a => ({ type: "file", filename: a.filename }))` |
| Emails de documents | `services/batch-email-handler.ts` (insert ~l.166) | `[{ type: options.docType, filename: task.attachmentFilename }]` |

Les envois via la queue continuent de stocker leurs `EmailAttachmentDescriptor[]` (inchangé) ;
`describeAttachment` les rend aussi lisibles.

## Cas limites
- `attachments` absent/vide → carte masquée.
- Descripteur queue `{type, payload}` sans filename → label via `DOCUMENT_LABELS[type]` ou type
  prettifié.
- `file_url`/`uploaded_docx`/`file` → label = `filename`.

## Tests
- `describeAttachment` : type mappé → « … (PDF) », signature_link → note, filename brut,
  type inconnu prettifié, entrée vide.
- Non-régression : suites existantes.

## Hors périmètre
- Backfill des emails déjà envoyés (donnée perdue).
- Téléchargement de la PJ depuis l'historique (on affiche seulement le libellé).
