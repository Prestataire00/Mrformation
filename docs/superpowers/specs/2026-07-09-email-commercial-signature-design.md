# Signature commerciale automatique dans les emails

**Date** : 2026-07-09
**Statut** : Design validé

## Problème

La signature du commercial (`profiles.email_signature`, texte) n'est ajoutée qu'à **un seul**
chemin d'envoi : l'envoi manuel (`api/emails/send/route.ts`), en append brut hors du système
de templates. Les emails de documents (batch) et tous les emails passant par la file d'attente
(`email_queue`) ne la portent jamais.

Objectif : **ajouter automatiquement, en bas de l'email, la signature du commercial qui envoie
le mail**, sur tous les chemins où ce commercial est identifiable.

## Décisions (validées)

- **Placement** : ajout automatique **en bas** du corps. Pas de balise positionnable `[%Signature%]`.
- **Expéditeur** : signature du **commercial déclencheur si connu** (`sent_by` / `auth.profile.id`).
  Envois **système/cron sans expéditeur humain → aucune signature**.
- **Format** : **texte simple** (converti en HTML avec `<br/>` par les convertisseurs existants).
- Relances **devis/factures** (cron) : envois système → **pas** de signature.

## Architecture

### Helper partagé — `src/lib/email/signature.ts`
- `appendCommercialSignature(body, signature): string`
  - Ajoute `\n\n--\n${signature}` si `signature` non vide.
  - **Idempotent** : ne double pas si le corps se termine déjà par la signature (retry worker,
    double passage).
  - Renvoie le corps inchangé si signature vide/absente.
- `loadCommercialSignature(supabase, profileId): Promise<string | null>`
  - Lit `profiles.email_signature` ; `null` si `profileId` absent ou lecture vide.

### Points d'injection
| Chemin | Fichier | Action |
|--------|---------|--------|
| Manuel | `api/emails/send/route.ts` | Remplace l'append inline (l.92-102) par le helper (comportement identique) |
| File d'attente (single) | `lib/services/email-queue.ts` `enqueueEmail` | Si `sent_by` → charge la signature, append au `body` avant insert |
| File d'attente (bulk) | `lib/services/email-queue.ts` `enqueueEmails` | Charge les signatures des `sent_by` distincts (1 requête `.in`), append par ligne |
| Emails de documents | `lib/services/batch-email-handler.ts` | Charge la signature du `profileId` 1×/lot, append au corps résolu |
| Automation / OPCO / factures (cron) | — | Aucune action : pas de `sent_by` → pas de signature |

Injecter dans `enqueueEmail`/`enqueueEmails` couvre **automatiquement** tous les chemins
user-triggered qui passent par la file (send-to-recipient, relance questionnaires, sessions…),
tandis que les envois système (sans `sent_by`) restent sans signature — conforme à la décision.

Le worker `process-scheduled` reste inchangé : le `body` est déjà signé au moment de l'enqueue
(seul endroit où l'expéditeur est fiable).

## Cas limites
- Signature vide/`null` → corps inchangé (no-op).
- Double signature évitée par la garde idempotente.
- Chemin de repli non-templaté du batch (`buildEmailHtmlBody`, déclenché seulement si le seed
  `batch_<docType>` manque) : signature ajoutée au corps texte résolu uniquement ; le repli
  stylé reste sans signature (chemin dégradé, rare).

## Tests
- Helper : append nominal, signature vide → no-op, idempotence (pas de double).
- `enqueueEmail` : injecte la signature quand `sent_by` présent ; rien sinon (avec mock supabase).
- Non-régression : suites email/résolveur existantes.

## Hors périmètre
- Balise positionnable `[%Signature%]` (rejetée : placement auto choisi).
- Signature HTML riche (format texte simple choisi).
- Rattacher un « commercial responsable » aux envois cron (devis/factures/automation).
