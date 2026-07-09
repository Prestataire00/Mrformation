# Envoi de devis : sélecteur de modèle d'email + PJ (Incrément 1)

**Date** : 2026-07-09
**Statut** : Design validé

## Problème

À l'envoi d'un devis (CRM), le modèle d'email est **codé en dur** :
- Mode **e-signature** (`api/crm/quotes/sign-request`) : clé fixe `quote_sign_request`.
- Mode **simple** (via `/api/emails/send`) : clé `batch_devis` — **ni seedée ni requise** → tombe
  toujours sur un fallback codé en dur.

L'utilisateur veut, dans les deux modes, **choisir le modèle** d'email et le **retoucher** avant
envoi ; et pour l'envoi simple, **ajouter des pièces jointes**.

Constat : les deux dialogs de `admin/crm/quotes/page.tsx` ont **déjà** objet/corps éditables, PDF
auto joint et upload manuel de PJ. Ce qui manque : un **sélecteur de modèle**.

## Décisions validées

- **Sélecteur + édition inline** dans les deux dialogs (le modèle pré-remplit des champs
  retouchables).
- Pièces jointes envoi simple : PDF auto (existe) + upload manuel (existe) + « documents
  plateforme » → **reporté à l'Incrément 2** (pas de source existante).
- Approche : **sélecteur côté client qui pré-remplit les champs éditables**. Les deux backends
  reçoivent déjà un objet/corps personnalisés → **aucun changement backend**.

## Périmètre — Incrément 1

1. **Sélecteur de modèle** dans les deux dialogs (`<Select>` déjà importé).
2. **Fix `batch_devis`** : migration de seed (l'admin obtient un modèle par défaut éditable pour
   l'envoi simple, au lieu du fallback en dur).
3. Auto-PDF + upload manuel : conservés tels quels.

**Hors périmètre** : picker « documents plateforme » (Incrément 2) ; persistance du modèle choisi
sur le devis ; changement de rôles.

## Architecture

### Helper pur — `src/lib/crm/quote-email-template.ts`
- `substituteQuoteVars(text, vars): string` — remplace `{{var}}` (garde `{{inconnu}}` littéral).
- `applyQuoteTemplate({subject, body}, vars): {subject, body}`.
- Type `QuoteEmailTemplate = { id, key, name, subject, body }`.
- Factorise la substitution aujourd'hui dupliquée dans les deux dialogs. **Testé unitairement.**

### `admin/crm/quotes/page.tsx`
- **Fetch** (au mount, si `entityId`) des modèles devis actifs de l'entité :
  `email_templates` où `is_active` ET (`type='devis'` **OU** `key ∈ {quote_sign_request,
  batch_devis}`), triés par `name`. Stockés dans un state `devisTemplates`.
- **Dialog e-signature** : `<Select>` (défaut = template `quote_sign_request`). `onChange` →
  `applyQuoteTemplate(tpl, signVars)` → `setSignSubject`/`setSignBody`. `signVars` (reference,
  montant, destinataire, date_validite, entite, `lien_signature` laissé littéral) calculées et
  stockées à l'ouverture.
- **Dialog envoi simple** : `<Select>` (défaut = template `batch_devis`). `onChange` →
  `applyQuoteTemplate(tpl, emailVars)` → met à jour `emailForm.subject/body`. `emailVars`
  (reference, destinataire, entite, montant) calculées et stockées à l'ouverture.
- La logique de fetch-single + substitution actuelle (openSignPreview / handleSendByEmail) est
  refactorée pour piocher dans `devisTemplates` et utiliser le helper (une seule source).
- Fallbacks hardcodés existants conservés si aucun modèle trouvé (aucune régression).

### Migration — `supabase/migrations/add_batch_devis_email_template.sql`
- Insère `batch_devis` (`type='devis'`, `recipient_type='client'`, `is_active=true`) pour chaque
  entité qui ne l'a pas déjà (idempotent). Ne touche pas `REQUIRED_KEYS`.
- **`REQUIRED_KEYS` inchangé** : `batch_devis` n'est consommé par aucun cron (défaut d'UI
  uniquement) ; l'ajouter exposerait les crons à un faux `ok=false`. `assertSeedComplete` reste
  intact.
- Non-bloquant : si la migration n'est pas jouée, le dialog simple retombe sur le fallback en dur
  (comportement actuel). À jouer dans Supabase pour activer le modèle éditable.

## Données / flux
- Aucune colonne ajoutée à `crm_quotes` (le modèle choisi n'est pas persisté — YAGNI).
- Les deux backends restent inchangés : ils reçoivent `custom_subject`/`custom_body` (e-sign) ou
  `subject`/`body` (simple), déjà résolus côté client.

## Tests
- Helper `substituteQuoteVars` / `applyQuoteTemplate` : substitution nominale, variable inconnue
  conservée, sujet/corps vides.
- Non-régression : suites existantes.
- (UI : câblage, vérifié au build + typecheck.)

## Cas limites
- Aucun modèle devis en base → `<Select>` affiche le défaut hardcodé, envoi inchangé.
- `{{lien_signature}}` : laissé littéral côté client (re-substitué par le serveur e-sign).
- Modèle sans `type` (null) → couvert par la clause `key ∈ {...}` pour les canoniques.
