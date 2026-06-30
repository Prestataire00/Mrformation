# Annulation de facture dans l'UX — Design

**Date :** 2026-06-30
**Statut :** Approuvé (design), en attente du plan d'implémentation
**Contexte :** Un client (Loris) a créé une facture erronée et ne peut pas s'en débarrasser : la
suppression de facture n'existe nulle part dans l'app (aucune route `DELETE`, aucun bouton UI ; seules
les *charges* sont supprimables). C'est un manque UX.

## Décision de conformité

En facturation FR + contexte Qualiopi/BPF, la **numérotation doit être continue (sans trou)**. Or le
numéro est attribué **dès la création** (fonction atomique `create_invoice_with_atomic_number`). Toute
**suppression dure créerait un trou** → non conforme. Le traitement correct d'une facture erronée est
l'**annulation** : la facture reste au registre, marquée « Annulée », **numéro conservé**.

→ On implémente **uniquement l'annulation** (status `cancelled`). Pas de suppression dure, pas d'avoir
automatique (l'avoir reste une action séparée existante).

## État existant (déjà en place)

- `formation_invoices.status` accepte déjà `cancelled` (CHECK `IN ('pending','sent','paid','late','cancelled')`).
- Le PATCH `/api/formations/[id]/invoices` accepte déjà un changement de `status` (dont `cancelled`) —
  les changements de statut sont autorisés même sur facture émise (garde H7 ne bloque que l'édition du *contenu*).
- `InvoiceRow` affiche déjà le badge « Annulée » (barré, `STATUS_BADGES.cancelled`).
- `TabFinances` a déjà `handleUpdateStatus(id, status)` (utilisé pour « Marquer payée »), avec try/catch +
  toast + refetch.

**Ce qui manque = uniquement le déclencheur UX (un bouton « Annuler »).**

## Périmètre détaillé

| Fichier | Action |
|---|---|
| `src/app/(dashboard)/admin/formations/[id]/_components/finances/InvoiceActionsMenu.tsx` | Ajouter l'action **« Annuler la facture »** : confirmation avant action ; masquée si déjà `cancelled` ; masquer aussi Envoyer / Marquer payée quand `cancelled` (facture annulée = lecture seule). |
| `InvoiceActionHandlers` (type, dans `InvoiceActionsMenu.tsx`) | Ajouter `onCancel?: (inv: Invoice) => void`. |
| `src/app/(dashboard)/admin/formations/[id]/_components/TabFinances.tsx` | Câbler `onCancel={(inv) => handleUpdateStatus(inv.id, "cancelled")}` (handler existant). |
| `src/app/api/formations/[id]/invoices/route.ts` (GET stats) | Exclure les `cancelled` du `total_invoiced` (aujourd'hui il somme toutes les non-avoir, y compris annulées → gonfle le CA facturé). `total_paid/pending/late` filtrent déjà par statut, donc déjà OK. |

## Règles de comportement

- **Annulation depuis n'importe quel statut non-`cancelled`** (pending/sent/paid/late), avec confirmation.
  Cohérent avec le modèle actuel (l'admin change librement les statuts) et utile (ex. facture passée
  « payée » par erreur). La confirmation rend l'action délibérée.
- **Idempotent / lecture seule** : une facture `cancelled` n'expose plus Annuler / Envoyer / Marquer payée.
- **Texte de confirmation** : « Annuler cette facture ? Elle restera dans le registre, marquée Annulée,
  et son numéro est conservé. »
- Filtrage `entity_id` respecté (le PATCH le fait déjà via `resolveActiveEntityId`).

## Hors périmètre / intacts

Création, envoi email, marquage payé, avoir, numérotation, export, charges. **Aucune migration SQL.**

## Validation

- `tsc --noEmit` vert, `vitest` vert.
- Test manuel : créer une facture pending → « Annuler » → badge « Annulée », actions réduites ; la même
  sur une facture `paid` → annulée ; vérifier que le `total_invoiced` n'inclut plus les annulées.

## Comportement résultant pour le besoin initial

Facture erronée → « Annuler » → « Annulée » (numéro gardé, conforme) → l'admin crée la bonne facture
qui prend le numéro suivant. Plus de blocage « je ne peux pas supprimer ».
