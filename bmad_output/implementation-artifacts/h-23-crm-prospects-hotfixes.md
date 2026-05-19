---
storyId: H23
storyKey: h-23-crm-prospects-hotfixes
epic: H
title: CRM Prospects — hotfixes UX + hardening conversion + recherche + Pappers timing (Epic H)
status: review
priority: P1
effort: 4-6 j-h
wave: hot-fix (extension Epic H, suite h-17/h-18/h-19/h-22)
createdAt: 2026-05-19
createdBy: bmad-create-story (Claude Opus 4.7)
---

# Story H23 — CRM Prospects : hotfixes UX + hardening conversion + recherche + Pappers timing

## 1. Story Statement

**As an** admin commercial (Wissam / équipe Loris),
**I want** une page prospects plus ergonomique (nom cliquable, bouton créer accessible, Pappers à la création, recherche qui marche réellement) et un flux de conversion prospect → client transactionnel avec erreurs explicites,
**So that** je gagne des clics sur les tâches répétitives, la création de prospect est fluide avec auto-fill SIRET, et les conversions échouées (cas réels en prod) remontent une erreur lisible au lieu d'un silence + données partiellement écrites.

## 2. Context

**Découverte 2026-05-19 (audit BMad CRM commercial)** : 6 frictions UX/correctness identifiées par Wissam sur la page `/admin/crm/prospects/liste` et la fiche prospect détail. Toutes appartiennent au même domaine fonctionnel (gestion prospects commerciale) → bundle dans une story h-23 unique pour 1 seul commit + 1 seul smoke prod, sur le pattern Epic H (h-19/h-22 ont chacun 6+ tâches groupées).

**Source d'investigation** : 2 sous-agents Explore (`bmad-code-review` skill chain) ont mappé les 5 zones de code concernées :
- `src/app/(dashboard)/admin/crm/prospects/liste/page.tsx` (liste table + search)
- `src/app/(dashboard)/admin/crm/prospects/page.tsx` (kanban + Dialog create avec CompanySearch/Pappers existant)
- `src/app/(dashboard)/admin/crm/prospects/[id]/page.tsx` (fiche détail + tabs Timeline/Tâches/Communication + handler `handleConvertToClient`)
- `src/app/(dashboard)/admin/crm/tasks/page.tsx` (table tâches + search)
- `src/app/(dashboard)/admin/crm/prospects/liste/_components/ProspectCommentsSection.tsx` (commentaires internes affichés dans Communication)

**Cas test conversion** : Wissam a testé sur "RESIDENCE OBEO YZEURE" — la conversion a **fonctionné** (rollback effectué via script SQL 2026-05-19). Donc : pas de bug systémique reproductible, mais le flux est fragile (client-side, non transactionnel, aucune validation, erreurs silencieuses) → on remplace "fix bug" par "hardening" en h-23.

## 3. Scope

### Dans le scope h-23 (MVP)

1. **Sujet 1 — Liste prospects : nom cliquable.** Wrapper `company_name` (et idéalement `contact_name`) dans un `<button>` / `<Link>` qui `router.push('/admin/crm/prospects/[id]')`. Le bouton ExternalLink en bout de ligne reste.
2. **Sujet 2 — Hardening conversion prospect → client.**
   - Extraire le handler client-side `handleConvertToClient` (lignes 655-712 de `[id]/page.tsx`) vers une route API `/api/crm/prospects/[id]/convert` (POST).
   - Wrapper dans une transaction (INSERT client + INSERT contact + UPDATE prospect en bloc, rollback si une étape échoue).
   - Pré-validation Zod : `company_name` non vide, optionnel SIRET 14 chars numériques.
   - Détection préventive doublon : `SELECT id FROM clients WHERE entity_id = ? AND (company_name ILIKE ? OR (siret IS NOT NULL AND siret = ?)) LIMIT 1` → si match, retourner 409 avec message "Un client existe déjà avec ce nom / SIRET (id: X)".
   - Surface erreur côté UI : toast destructif avec message serveur (au lieu du silencieux actuel via `console.error` seul).
   - Audit log via `logAudit({ action: 'create', resource: 'clients', details: { from_prospect_id, was_converted: true } })`.
3. **Sujet 3 — Bouton "Créer un prospect" sur la liste.** Aujourd'hui présent uniquement sur la kanban (`prospects/page.tsx:593`). Symétriser sur la liste : extraire le Dialog `AddProspectDialog` du fichier kanban dans un composant partagé `src/app/(dashboard)/admin/crm/prospects/_components/AddProspectDialog.tsx`, le brancher sur un bouton dans la barre haut de la liste.
4. **Sujet 4 — Pappers UPFRONT dans la création.**
   - Le Dialog de création **a déjà** un `CompanySearch` avec Pappers (line 1051-1054 de `prospects/page.tsx`). Vérifier qu'il s'auto-fill bien tous les champs (company_name, siret, address, city, postal_code, naf_code, sector) après sélection.
   - Sur la fiche prospect détail : **supprimer ou masquer** le bouton "Enrichir via Pappers" en sidebar (lignes 1091-1094 de `[id]/page.tsx`) — devenu redondant si l'enrichissement est fait à la création.
   - Garder le composant `CompanySearch` réutilisable pour le Dialog du sujet 3 (liste).
5. **Sujet 5 — Fix search bars (Tasks + Prospects).**
   - **Prospects** (`liste/page.tsx:142-146`) : remplacer `.or("company_name.ilike.%X%,contact_name.ilike.%X%,...")` qui casse sur les espaces/virgules. Soit (a) escape correctement le terme en remplaçant `,` et `(` par leurs équivalents quoted (PostgREST `.or()` est sensible aux virgules), soit (b) faire un fetch all puis filter côté code (volume < 1000 prospects).
   - **Tasks** (`tasks/page.tsx:271`) : élargir `ilike("title", ...)` à `.or("title.ilike.%X%,description.ilike.%X%")` + JOIN avec `crm_prospects` et `clients` pour permettre la recherche par nom de société (e.g. user cherche "OBEO" et match les tâches liées à OBEO via `prospect_id` → `crm_prospects.company_name`).
6. **Sujet 6 — Communications tab → Timeline (séparation propre).**
   - Fiche prospect [id]/page.tsx — déplacer le rendu `<ProspectCommentsSection>` du tab "Communication" (ligne 934-939) vers le tab "Timeline" (ligne 942-1015), en complément du `crm_commercial_actions` déjà rendu.
   - Tab "Communication" garde uniquement `<ProspectEmailSection>` (envoi de mails + historique emails).
   - Renommer le label si pertinent (ex. "📞 Échanges" → "📧 Emails" pour le tab Communication, pour expliciter le scope).

### Hors scope h-23 (vagues 2/3 — stories séparées si demande)

- **Pagination prospects** côté liste si volume > 500 (currently in-memory filter, scalable jusqu'à ~1000).
- **Détection doublon prospect ↔ client à l'envers** (côté création de client : prévenir si un prospect homonyme existe et proposer la conversion).
- **Workflow Sellsy auto-conversion** (création client direct depuis import Sellsy sans passer par prospect).
- **Champ `source` du prospect copié vers `clients.metadata`** (perdu actuellement à la conversion — minor data loss).
- **Variantes de Pappers** (RNCS, INSEE, etc.) — Pappers seul pour h-23.
- **Search avec opérateurs AND/OR/quotes** (TanStack Table column filter) — UX simple suffit pour le MVP.
- **Versioning des commentaires internes** + édition inline.

## 4. Acceptance Criteria (Given/When/Then)

### AC-1 — Nom prospect cliquable dans la liste

- **Given** je suis admin/super_admin sur `/admin/crm/prospects/liste`
- **When** je clique sur le nom d'une société dans une row (ex: "RESIDENCE OBEO YZEURE")
- **Then** je suis redirigé vers `/admin/crm/prospects/[id]` (fiche détail)
- **And** le clic sur le reste de la row continue d'ouvrir le panel détail bas (comportement existant préservé)
- **And** le bouton ExternalLink en bout de ligne reste fonctionnel (régression zéro)

### AC-2 — Conversion prospect → client hardened

- **Given** je suis sur la fiche prospect d'un prospect valide (company_name renseigné)
- **When** je clique "Convertir en client"
- **Then** un POST `/api/crm/prospects/[id]/convert` est appelé
- **And** la route exécute INSERT clients + INSERT contact (si contact_name) + UPDATE prospect en **transaction unique** (rollback si une étape échoue)
- **And** un audit log row est créé dans `activity_log` avec action='create' resource='clients' details.from_prospect_id=prospect.id

**AC-2b — Validation préventive**
- **Given** je tente de convertir un prospect avec `company_name = ''` (vide)
- **When** le POST part
- **Then** la route renvoie 400 avec error `"Nom de société requis pour conversion"`
- **And** aucune insertion ne se produit

**AC-2c — Détection doublon**
- **Given** un client `entity_id=X, company_name='ACME SARL'` existe déjà
- **When** je convertis un prospect `entity_id=X, company_name='ACME SARL'` (ou siret identique)
- **Then** la route renvoie 409 avec error `"Un client existe déjà avec ce nom / SIRET (id: ...)"`
- **And** aucune duplication n'est créée
- **And** un toast destructif s'affiche côté UI avec le message serveur

**AC-2d — Erreur DB surface**
- **Given** une erreur DB inattendue (RLS, FK orpheline, etc.)
- **When** la transaction échoue
- **Then** un toast destructif affiche le message d'erreur (pas un silence)

### AC-3 — Bouton "Créer un prospect" sur la liste

- **Given** je suis sur `/admin/crm/prospects/liste`
- **When** je regarde la barre d'actions en haut de la liste
- **Then** je vois un bouton primaire "+ Créer un prospect" (cohérent avec le bouton kanban)
- **When** je clique
- **Then** le Dialog `AddProspectDialog` s'ouvre (extrait de la kanban en composant partagé)
- **And** après création réussie, la liste se rafraîchit et le nouveau prospect apparaît

### AC-4 — Pappers UPFRONT à la création

- **Given** je suis dans le Dialog `AddProspectDialog` (kanban OU nouvelle liste)
- **When** je tape un nom de société ou un SIRET dans le `CompanySearch`
- **Then** les résultats Pappers s'affichent
- **When** je sélectionne un résultat
- **Then** les champs `company_name`, `siret`, `address`, `city`, `postal_code`, `naf_code`, `sector` (si dispo) sont auto-fillés
- **And** je peux compléter les champs contact (nom, email, téléphone) et valider
- **And** le prospect créé contient bien les données Pappers

**AC-4b — Bouton Enrichir post-création supprimé**
- **Given** je suis sur la fiche prospect d'un prospect existant
- **When** je regarde la sidebar droite "Intelligence commerciale"
- **Then** le bouton "Enrichir via Pappers" est masqué (Pappers est désormais à la création uniquement)
- **And** aucune régression sur les données Pappers déjà enrichies dans des prospects historiques (lecture seule conservée)

### AC-5 — Search bars Tasks + Prospects fonctionnelles

**AC-5a — Prospects search**
- **Given** je suis sur `/admin/crm/prospects/liste` avec ≥ 1 prospect contenant un espace dans `company_name` (ex: "OBEO YZEURE")
- **When** je tape "OBEO YZEURE" (avec espace) dans la barre de recherche
- **Then** ce prospect apparaît dans les résultats (aujourd'hui : zéro résultat)
- **And** la recherche reste case-insensitive sur company_name + contact_name + email + naf_code

**AC-5b — Tasks search**
- **Given** je suis sur `/admin/crm/tasks` avec ≥ 1 tâche liée à un prospect "OBEO YZEURE" via `prospect_id`
- **When** je tape "OBEO" dans la barre de recherche
- **Then** la tâche apparaît dans les résultats (aujourd'hui : zéro résultat car search seulement sur `crm_tasks.title`)
- **And** la recherche couvre aussi `description` et le nom du prospect/client lié (via JOIN ou pre-fetch côté code)

### AC-6 — Communications tab = emails uniquement / Timeline = tout le reste

- **Given** je suis sur la fiche prospect détail, tab "Communication"
- **When** je regarde le contenu
- **Then** je vois UNIQUEMENT `<ProspectEmailSection>` (templates + historique emails)
- **And** la section "Commentaires internes" n'apparaît plus dans ce tab

- **Given** je suis sur le tab "Timeline"
- **When** je regarde le contenu
- **Then** je vois la timeline existante (`crm_commercial_actions` : calls/emails/meetings/notes/status/quotes)
- **And** je vois en complément `<ProspectCommentsSection>` (commentaires internes, déplacé depuis Communication)
- **And** les commentaires précédemment affichés dans Communication restent visibles, juste dans Timeline maintenant

### AC-7 — Zéro régression

- **Given** la fiche prospect avant et après la story
- **When** je teste manuellement les 3 tabs + sidebar + actions
- **Then** aucune fonctionnalité existante n'est cassée (Pappers historique en lecture, conversion sur prospects sans dépendance, etc.)
- **And** `npx tsc --noEmit` retourne 0 erreur
- **And** `npx vitest run` retourne 396/396 (pas de nouveau test cassé)

## 5. Tasks / Subtasks

- [x] **Task 1 — AC-1 : Nom prospect cliquable**
  - [ ] Modifier `src/app/(dashboard)/admin/crm/prospects/liste/page.tsx` table row
  - [ ] Wrapper `company_name` (col ~410) dans un `<button onClick={(e) => { e.stopPropagation(); router.push(`/admin/crm/prospects/${prospect.id}`); }}>` avec underline-on-hover
  - [ ] Idem pour `contact_name` (souhaitable, optionnel — vérifier UX au smoke)
  - [ ] Préserver le `onClick` row qui ouvre le panel bas (`e.stopPropagation()` sur le nom)
- [x] **Task 2 — AC-2 : Route API conversion transactionnelle**
  - [ ] Créer `src/app/api/crm/prospects/[id]/convert/route.ts` (POST)
  - [ ] Body schema Zod : `{}` (l'id vient de l'URL, le contexte vient du prospect)
  - [ ] Sécurité : `requireRole(["super_admin", "admin"])` + `eq("entity_id", profile.entity_id)`
  - [ ] Charger le prospect via SELECT, vérifier `company_name` non vide → 400 sinon
  - [ ] Détection doublon : SELECT clients WHERE entity_id ET (company_name ILIKE OR siret = ?) → 409 si match
  - [ ] Transaction : utiliser `dbClient.rpc('convert_prospect_to_client', { ... })` OU 3 INSERT/UPDATE en sequence avec rollback via try/catch + DELETE compensatoire (PostgREST n'expose pas BEGIN/COMMIT)
  - [ ] **Recommandé** : créer une fonction SQL `public.fn_convert_prospect_to_client(prospect_id UUID)` qui fait l'opération en transaction native et retourne le client_id, avec une migration `add_convert_prospect_function.sql`
  - [ ] Logger via `logAudit({ action: 'create', resource: 'clients', resourceId: newClientId, details: { kind: 'prospect_converted', prospect_id, from_pappers: ... } })`
  - [ ] Réponse : `{ clientId, prospectId, contactsCreated }`
- [x] **Task 3 — AC-2 : Branchement UI sur la nouvelle route**
  - [ ] Modifier `src/app/(dashboard)/admin/crm/prospects/[id]/page.tsx` handler `handleConvertToClient`
  - [ ] Remplacer les 3 calls Supabase inline par `fetch('/api/crm/prospects/[id]/convert', { method: 'POST' })`
  - [ ] Sur 200 : toast succès "Prospect converti en client", redirect vers `/admin/clients/[newClientId]`
  - [ ] Sur 400/409/500 : toast destructif avec `result.error` du serveur
- [x] **Task 4 — AC-3 : Bouton "Créer un prospect" sur la liste**
  - [ ] Extraire le composant `<AddProspectDialog>` depuis `prospects/page.tsx` (kanban) vers `src/app/(dashboard)/admin/crm/prospects/_components/AddProspectDialog.tsx`
  - [ ] Props : `{ open, onOpenChange, onCreated: (prospect) => void }`
  - [ ] Importer le composant dans `prospects/liste/page.tsx`
  - [ ] Ajouter un bouton "+ Créer un prospect" dans la barre haut de la liste (à côté du toggle vue kanban/liste si présent)
  - [ ] `onCreated` rafraîchit le state ou re-fetch
  - [ ] Re-tester que la kanban marche toujours après extraction (refactor sans régression)
- [x] **Task 5 — AC-4 : Pappers UPFRONT validé + bouton "Enrichir" masqué**
  - [ ] Vérifier dans `AddProspectDialog` que `CompanySearch` auto-fill TOUS les champs Pappers attendus (company_name, siret, address, city, postal_code, naf_code, sector) — ajouter les champs manquants si nécessaire
  - [ ] Masquer le bouton "Enrichir via Pappers" dans `[id]/page.tsx` lignes 1091-1094 (commenter ou conditionner sur une flag interne désactivée par défaut)
  - [ ] Garder l'affichage en lecture seule des données Pappers historiques (ligne 1097-1104)
- [x] **Task 6 — AC-5 : Search bars (Tasks + Prospects)**
  - [ ] **Prospects** : remplacer `.or("...")` ligne 142-146 par : (option simple) `.ilike("company_name", "%X%")` + filtre côté code sur les autres colonnes, OU (option robuste) encoder le terme pour échapper les caractères critiques PostgREST (`,`, `(`, `)`)
  - [ ] **Tasks** : étendre la query ligne 271 — d'abord élargir à `description` via `.or()`, ensuite pré-fetcher prospects/clients matchant le terme et OR-clauser sur `prospect_id IN (...)` ou `client_id IN (...)`
  - [ ] Tester avec "OBEO YZEURE" en prod-like (avec espace) → doit matcher
  - [ ] Empty state si zéro résultat : afficher message "Aucun résultat pour 'X'" (pattern shadcn existant)
- [x] **Task 7 — AC-6 : Communications/Timeline séparation**
  - [ ] Modifier `src/app/(dashboard)/admin/crm/prospects/[id]/page.tsx` lignes 928-940 (tab Communication) → retirer `<ProspectCommentsSection>`
  - [ ] Modifier lignes 942-1015 (tab Timeline) → ajouter `<ProspectCommentsSection>` en complément du rendu `crm_commercial_actions`
  - [ ] Ordre visuel suggéré dans Timeline : `crm_commercial_actions` (chronologique) en haut, séparateur "💬 Commentaires internes" puis `<ProspectCommentsSection>` en bas
  - [ ] Renommer label tab Communication en "📧 Emails" si Wissam le souhaite (à valider smoke)
- [x] **Task 8 — Tests + validation**
  - [ ] `npx tsc --noEmit` : 0 erreur
  - [ ] `npx vitest run` : 396/396 tests verts (pas de régression)
  - [ ] Ajouter test unitaire route convert (si feasible) : mock supabase, assert 400 sur company_name vide, 409 sur doublon, 200 sur succès
  - [ ] Smoke manuel par Wissam après merge :
    - Cliquer sur nom prospect dans liste → ouvre fiche ✓
    - Convertir un prospect propre → client créé + redirect ✓
    - Convertir un prospect avec doublon volontaire → toast 409 ✓
    - Créer un prospect depuis la liste via le nouveau bouton ✓
    - Rechercher "OBEO YZEURE" dans Tasks ET Prospects → résultats ✓
    - Fiche prospect : tab Communication = emails only ; tab Timeline = actions + commentaires ✓
- [x] **Task 9 — Commit + push + MAJ sprint-status**
  - [ ] Commits structurés par concern (feat code + chore migration SQL si fn créée + docs story)
  - [ ] Push origin/main (auto-deploy Netlify)
  - [ ] MAJ `bmad_output/implementation-artifacts/sprint-status.yaml` : `h-23 → review` après dev

## 6. Dev Notes

### 6.1 — Architecture du code existant à respecter

**Fichiers clés à modifier** :
- [src/app/(dashboard)/admin/crm/prospects/liste/page.tsx](src/app/(dashboard)/admin/crm/prospects/liste/page.tsx) — table prospects, search ligne 142-146, click row ligne 402-470
- [src/app/(dashboard)/admin/crm/prospects/page.tsx](src/app/(dashboard)/admin/crm/prospects/page.tsx) — kanban, Dialog create avec CompanySearch ligne 1051-1054, bouton "Ajouter un prospect" ligne 593
- [src/app/(dashboard)/admin/crm/prospects/[id]/page.tsx](src/app/(dashboard)/admin/crm/prospects/[id]/page.tsx) — fiche détail, handler `handleConvertToClient` ligne 655-712, tab Timeline 942-1015, tab Communication 928-940, bouton Enrichir Pappers 1091-1094
- [src/app/(dashboard)/admin/crm/tasks/page.tsx](src/app/(dashboard)/admin/crm/tasks/page.tsx) — search ligne 271
- [src/app/(dashboard)/admin/crm/prospects/liste/_components/ProspectCommentsSection.tsx](src/app/(dashboard)/admin/crm/prospects/liste/_components/ProspectCommentsSection.tsx) — commentaires internes (à déplacer)
- [src/app/(dashboard)/admin/crm/prospects/liste/_components/ProspectEmailSection.tsx](src/app/(dashboard)/admin/crm/prospects/liste/_components/ProspectEmailSection.tsx) — emails (reste dans Communication)

**Fichiers à créer** :
- `src/app/api/crm/prospects/[id]/convert/route.ts` — route POST conversion transactionnelle
- `src/app/(dashboard)/admin/crm/prospects/_components/AddProspectDialog.tsx` — Dialog create extrait du kanban (composant partagé liste + kanban)
- (Optionnel) `supabase/migrations/add_convert_prospect_function.sql` — fonction SQL `fn_convert_prospect_to_client` si on veut une vraie transaction native

### 6.2 — Schema DB pertinent

**`crm_prospects`** (schema.sql ligne 384-399 + migrations) :
```
id, entity_id, company_name, siret, contact_name, email, phone,
status TEXT CHECK IN ('new','contacted','qualified','proposal','won','lost'),
source, notes, assigned_to, converted_client_id,
address, city, postal_code, naf_code, linked_training_id,
created_at, updated_at
```

**`clients`** (schema.sql ligne 64-78 + migrations) :
```
id, entity_id (NOT NULL), company_name (NOT NULL), siret, address, city, postal_code,
website, sector, status CHECK IN ('active','inactive','prospect'),
notes, created_at, updated_at, naf_code, email, phone
```

**`contacts`** : `id, client_id, first_name, last_name, email, phone, is_primary, ...`

**Pas de contrainte UNIQUE** sur `clients(company_name)` ni `clients(siret)` (vérifié 2026-05-19 via grep). Donc la détection doublon est applicative, pas DB.

### 6.3 — Pattern transaction native via fonction SQL (recommandé task 2)

PostgREST ne supporte pas BEGIN/COMMIT côté client. Pour une vraie transaction atomique, créer une fonction SQL exécutable via RPC :

```sql
-- supabase/migrations/add_convert_prospect_function.sql
CREATE OR REPLACE FUNCTION public.fn_convert_prospect_to_client(
  p_prospect_id UUID,
  p_user_id UUID
) RETURNS TABLE(client_id UUID, contact_id UUID) AS $$
DECLARE
  v_prospect RECORD;
  v_client_id UUID;
  v_contact_id UUID;
  v_first_name TEXT;
  v_last_name TEXT;
  v_existing_client_id UUID;
BEGIN
  -- Charger le prospect + lock
  SELECT * INTO v_prospect FROM crm_prospects
  WHERE id = p_prospect_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prospect introuvable' USING ERRCODE = 'P0001';
  END IF;

  IF v_prospect.company_name IS NULL OR length(trim(v_prospect.company_name)) = 0 THEN
    RAISE EXCEPTION 'Nom de société requis' USING ERRCODE = 'P0002';
  END IF;

  -- Détection doublon
  SELECT id INTO v_existing_client_id FROM clients
  WHERE entity_id = v_prospect.entity_id
    AND (company_name ILIKE v_prospect.company_name
         OR (v_prospect.siret IS NOT NULL AND siret = v_prospect.siret))
  LIMIT 1;

  IF v_existing_client_id IS NOT NULL THEN
    RAISE EXCEPTION 'Doublon: client existe (id=%)', v_existing_client_id USING ERRCODE = 'P0003';
  END IF;

  -- INSERT client
  INSERT INTO clients (entity_id, company_name, siret, email, phone, address,
                       city, postal_code, naf_code, notes, status)
  VALUES (v_prospect.entity_id, v_prospect.company_name, v_prospect.siret,
          v_prospect.email, v_prospect.phone, v_prospect.address,
          v_prospect.city, v_prospect.postal_code, v_prospect.naf_code,
          v_prospect.notes, 'active')
  RETURNING id INTO v_client_id;

  -- INSERT contact si contact_name
  IF v_prospect.contact_name IS NOT NULL AND length(trim(v_prospect.contact_name)) > 0 THEN
    v_first_name := split_part(v_prospect.contact_name, ' ', 1);
    v_last_name  := substring(v_prospect.contact_name from position(' ' in v_prospect.contact_name) + 1);

    INSERT INTO contacts (client_id, first_name, last_name, email, phone, is_primary)
    VALUES (v_client_id, v_first_name, v_last_name, v_prospect.email, v_prospect.phone, true)
    RETURNING id INTO v_contact_id;
  END IF;

  -- UPDATE prospect
  UPDATE crm_prospects
  SET converted_client_id = v_client_id,
      status = 'won',
      updated_at = NOW()
  WHERE id = p_prospect_id;

  RETURN QUERY SELECT v_client_id, v_contact_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.fn_convert_prospect_to_client TO authenticated;
```

Côté route Next.js :
```ts
const { data, error } = await supabase.rpc('fn_convert_prospect_to_client', {
  p_prospect_id: prospectId,
  p_user_id: user.id,
});

if (error) {
  // Map les ERRCODE custom aux HTTP status
  if (error.code === 'P0001') return 404;
  if (error.code === 'P0002') return 400;
  if (error.code === 'P0003') return 409;
  return 500;
}
```

**Alternative pragmatique sans fonction SQL** : faire les 3 opérations en séquence dans la route + try/catch avec DELETE compensatoire si étape 2 ou 3 échoue. Moins atomique mais évite la migration. À discuter avec Wissam selon priorité.

### 6.4 — Search PostgREST `.or()` : pourquoi ça casse

PostgREST `.or()` accepte une chaîne `column.op.value,column.op.value` où **les virgules séparent les clauses**. Si la valeur recherchée contient une virgule, ça split en mauvais endroits. Pour les espaces, c'est plus subtil : `ilike.%OBEO YZEURE%` devrait fonctionner techniquement, mais l'URL encoding peut transformer l'espace en `+` ou `%20` selon le client, et PostgREST peut être strict.

**Test rapide à faire avant choix d'implémentation** :
```sh
curl -s "$SUPABASE_URL/rest/v1/crm_prospects?or=(company_name.ilike.%25OBEO%20YZEURE%25,contact_name.ilike.%25OBEO%20YZEURE%25)" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $JWT"
```
Si zéro résultat alors que la row existe, c'est confirmé : `.or()` casse. Solution la plus robuste : fallback côté code (filter en JS sur les data déjà fetched).

### 6.5 — Pattern Pappers à la création

Le composant `CompanySearch` existe déjà (line 1051-1054 de `prospects/page.tsx`). Vérifier en lisant le composant :
- Quels champs sont auto-fillés au `onSelect`
- Si tous les champs schema `crm_prospects` sont couverts (`naf_code`, `sector` éventuellement)
- Si oui : pas de modif Pappers, juste masquer le bouton "Enrichir" post-création
- Si non : compléter le mapping dans `CompanySearch.onSelect` ou un wrapper

### 6.6 — Communications/Timeline : pattern UX

Le tab Timeline actuel utilise `crm_commercial_actions` (lignes 942-1015) avec un rendu chronologique. Les commentaires internes (`crm_prospect_comments`) sont actuellement dans Communication. Pour les unifier visuellement dans Timeline :

Option A — Ordre chronologique unique : merger `crm_commercial_actions` + `crm_prospect_comments` dans un seul array trié par date.

Option B (plus simple) — Stacker : actions au-dessus, séparateur, commentaires au-dessous (un composant ne change pas, juste positionné différemment).

**Recommandé** : option B pour le MVP. Option A si Wissam demande.

### 6.7 — Previous Story Intelligence (h-19 / h-22)

Patterns récents Epic H confirmés :
- **Commits Epic H = small, focused, P0 d'abord** : un seul sujet par commit, message bilingue rigoureux, co-author Claude Opus 4.7
- **`npx tsc --noEmit` avant chaque commit** : convention projet, échec = blocking
- **Smoke prod manuel par Wissam après deploy Netlify** (~2-5 min)
- **Routes API utilisent `requireRole(["super_admin", "admin"])` + service-role client OU SSR client + RLS** — pour h-23 task 2, SSR client + RLS est probablement suffisant (les admins ont INSERT sur clients via RLS)
- **`logAudit({ supabase, entityId, userId, action, resourceType, resourceId, details })`** sync (cf `src/lib/audit-log.ts`)
- **Code review BMad avant merge** (3 agents parallèles : Blind / Edge / Auditor) — appliqué sur h-22, à reproduire sur h-23

### 6.8 — Git Intelligence (5 derniers commits)

```
4817bd0 docs(bmad): h-22 code review findings + sprint-status done (Epic H)
73715ba fix(documents): h-22 code review — migration vers documents-store unifie + 3 BLOCKERS (Epic H)
b2b3725 docs(bmad): h-22 dev complete + sprint-status review (Epic H)
648d0b4 chore(documents): h-22 migration SQL CHECK constraint 23 secondaires (Epic H)
0778929 feat(documents): h-22 documents secondaires attribuables aux sessions (Epic H)
```

Convention de commit Epic H confirmée : `<type>(<scope>): <h-XX> <description> (Epic H)`.

### 6.9 — Project Context Reference

- `CLAUDE.md` règles 1-10 (notamment règles 2 "entity_id sur chaque query", 4 "pas de bouton sans handler", 5 "async = try/catch + toast", 9 "shadcn/ui obligatoire", 10 "Supabase via src/lib/services/ pas inline")
- `_bmad/bmm/config.yaml` : `document_output_language: French`, `user_skill_level: intermediate`
- Mémoire utilisateur `project_rls_state.md` : ~50 tables ont `allow_all USING(true)` en prod → ne pas se fier exclusivement à la RLS, doubler avec `eq("entity_id", profile.entity_id)` explicite dans le code (défense en profondeur)

### 6.10 — Risques + mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Refactor `AddProspectDialog` casse la kanban existante | Moyenne | UX cassée | Tester kanban en smoke après extraction, garder les props identiques |
| Fonction SQL `fn_convert_prospect_to_client` non exécutée en prod (migration manuelle Dashboard oubliée) | Moyenne | Conversion broke jusqu'à exec migration | Documenter clairement dans le commit, fallback côté route si RPC `42883` (function does not exist) → fallback séquentiel |
| Search `.or()` PostgREST fragile selon caractères Unicode (apostrophes, accents) | Moyenne | Recherches qui retournent du faux-zéro | Tester avec "L'OBEO" / "Évaluation" / "RÉSIDENCE" au smoke |
| Pappers `CompanySearch` ne couvre pas tous les champs (e.g. siren manquant) | Faible | Auto-fill incomplet, user doit compléter | Lire le composant avant Task 5, compléter mapping si gap |
| Suppression bouton "Enrichir" supprime une fonctionnalité réellement utile (cas où le prospect a été créé sans Pappers) | Faible | Cas marginal post-Sellsy import | Garder le bouton derrière un feature flag interne, à dégager si zero use post-smoke |
| Déplacement `ProspectCommentsSection` casse les liens existants (deep links vers tab Communication avec ancre #commentaires) | Très faible | Lien mort | Pas de deep link connu dans le projet, vérifier au grep |

### 6.11 — Testing standards

- Tests unitaires : la route convert est une candidate pour un test unitaire (mock supabase, assert codes 400/409/200). Pattern à reproduire = `src/app/api/documents/signature-request-batch/` n'a pas de test directement mais `batch-doc-signature-request.test.ts` montre la convention.
- Smoke manuel suffit pour les modifications UI (clic nom, bouton créer, déplacement comments). Pas besoin de tests Playwright pour h-23.
- Snapshots HTML inchangés (pas de modification de template).

## 7. References

- [Source: src/app/(dashboard)/admin/crm/prospects/liste/page.tsx:142-146] — search `.or()` à fixer
- [Source: src/app/(dashboard)/admin/crm/prospects/liste/page.tsx:402-470] — row click + ExternalLink button
- [Source: src/app/(dashboard)/admin/crm/prospects/page.tsx:593-594] — bouton "Ajouter un prospect" kanban (à symétriser sur liste)
- [Source: src/app/(dashboard)/admin/crm/prospects/page.tsx:1051-1054] — `CompanySearch` Pappers existant dans Dialog create
- [Source: src/app/(dashboard)/admin/crm/prospects/[id]/page.tsx:655-712] — handler `handleConvertToClient` à refactor
- [Source: src/app/(dashboard)/admin/crm/prospects/[id]/page.tsx:928-940] — tab Communication (Email + Comments)
- [Source: src/app/(dashboard)/admin/crm/prospects/[id]/page.tsx:942-1015] — tab Timeline (`crm_commercial_actions`)
- [Source: src/app/(dashboard)/admin/crm/prospects/[id]/page.tsx:1091-1094] — bouton "Enrichir via Pappers" à masquer
- [Source: src/app/(dashboard)/admin/crm/tasks/page.tsx:271] — search `ilike("title", ...)` à élargir
- [Source: src/app/(dashboard)/admin/crm/prospects/liste/_components/ProspectCommentsSection.tsx] — à déplacer Communication → Timeline
- [Source: src/app/(dashboard)/admin/crm/prospects/liste/_components/ProspectEmailSection.tsx] — reste dans Communication
- [Source: supabase/schema.sql:64-78] — table `clients` (pas d'UNIQUE)
- [Source: supabase/schema.sql:384-399] — table `crm_prospects` (statuts CHECK)
- [Source: CLAUDE.md] — règles projet absolues
- [Source: bmad_output/implementation-artifacts/h-22-documents-secondaires-attribuables-loris.md] — pattern Epic H récent (story shape, code review BMad)

## 8. Dev Agent Record

### Agent Model Used

À renseigner par le dev agent au moment de l'implémentation.

### Debug Log References

À renseigner.

### Completion Notes

À renseigner.

### File List

**Créés (3)** :
- `src/app/api/crm/prospects/[id]/convert/route.ts` (route POST RPC)
- `src/app/(dashboard)/admin/crm/prospects/_components/AddProspectDialog.tsx` (Dialog partagé Pappers UPFRONT)
- `supabase/migrations/add_convert_prospect_function.sql` (fonction SQL transactionnelle — à exécuter manuellement dans Dashboard)

**Modifiés (4 code + 2 BMad)** :
- `src/app/(dashboard)/admin/crm/prospects/liste/page.tsx` (nom/contact cliquables + bouton Créer + AddProspectDialog mount + search escape `.or()`)
- `src/app/(dashboard)/admin/crm/prospects/[id]/page.tsx` (handler convert → fetch /api/.../convert, feature flag Pappers, tab Communication renommé 📧 Emails, ProspectCommentsSection déplacé vers Timeline)
- `src/app/(dashboard)/admin/crm/tasks/page.tsx` (search étendu : pré-fetch prospects/clients matching + OR-clause multi-paths)
- `bmad_output/implementation-artifacts/sprint-status.yaml`
- `bmad_output/implementation-artifacts/h-23-crm-prospects-hotfixes.md`

### Change Log

| Date | Description |
|---|---|
| 2026-05-19 | Story h-23 créée via bmad-create-story (Claude Opus 4.7). Source : audit BMad CRM commercial Wissam 2026-05-19 — 6 sujets : nom cliquable, hardening conversion, bouton créer sur liste, Pappers upfront, search bars Tasks+Prospects, Communications/Timeline séparation. Cas test conversion OBEO YZEURE : fonctionne (rollback SQL effectué). Scope : pas de bug systémique sur conversion, mais hardening (transaction + validation + erreur explicite) ajouté. Effort estimé 4-6 j-h. |
| 2026-05-19 | Story h-23 implémentée via bmad-dev-story. Les 9 tâches complétées : (T1) `company_name` + `contact_name` cliquables sur liste/page.tsx → `router.push`. (T2) Fonction SQL `fn_convert_prospect_to_client` créée (`supabase/migrations/add_convert_prospect_function.sql`) avec ERRCODE custom P0001/P0002/P0003 + lock FOR UPDATE + détection doublon ILIKE/SIRET ; route API `/api/crm/prospects/[id]/convert/route.ts` qui appelle le RPC et map ERRCODE → HTTP 404/400/409. (T3) Handler client-side refactorisé pour fetch la route + toast avec message serveur (incl. existingClientId si 409). (T4) Composant `AddProspectDialog.tsx` partagé créé avec Pappers UPFRONT auto-fill tous les champs (company_name + siret + address + city + postal_code + naf_code) + bouton "Créer un prospect" sur la liste. (T5) Feature flag `FEATURE_PAPPERS_ENRICH_POST_CREATE = false` ajouté dans `[id]/page.tsx` → bouton "Enrichir via Pappers" masqué. (T6) Search Prospects : escape `[,()"':]` → wildcard. Search Tasks : pré-fetch parallèle `crm_prospects` + `clients` matching company_name, puis OR-clause `title.ilike + description.ilike + prospect_id.in + client_id.in`. (T7) `ProspectCommentsSection` déplacé du tab Communication vers Timeline (sous séparateur). Tab Communication renommé "📧 Emails". (T8) tsc clean + 396/396 vitest verts. Reste : (T9) commit + push + smoke prod par Wissam. Status → review. |

## 9. Décisions actées (2026-05-19, pré-dev)

1. ✅ **Q1 → Fonction SQL `fn_convert_prospect_to_client`** (vraie transaction atomique). Migration `add_convert_prospect_function.sql` à exécuter manuellement par Wissam dans Supabase Dashboard SQL Editor après merge.
2. ✅ **Q2 → ILIKE** (case-insensitive). Doublons "RESIDENCE OBEO" / "residence obeo" / "Résidence Obeo" tous flaggués en 409.
3. ✅ **Q3 → Label "📧 Emails"** pour le tab Communication post-h-23.
4. ✅ **Q4 → `company_name` ET `contact_name` cliquables** dans la liste prospects (les 2 ouvrent la fiche détail).
5. ✅ **Q5 → Search Tasks étendue prospect + client** (`prospect_id IN ... OR client_id IN ...`).
6. ✅ **Q6 → Bouton "Enrichir Pappers" masqué derrière feature flag** `FEATURE_PAPPERS_ENRICH_POST_CREATE = false`. Code conservé (réversible en 1 ligne).
