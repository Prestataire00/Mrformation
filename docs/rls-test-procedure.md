# Procédure manuelle de tests RLS — pré-release MVP

Cette procédure est à exécuter **avant chaque release MVP** pour valider que
les invariants de sécurité multi-tenant tiennent réellement côté base
(Postgres + Row Level Security), et pas uniquement côté applicatif.

Référence : Story 5.4 — NFR-SEC-1, NFR-SEC-2, FR51.

## Pourquoi cette procédure

- Les helpers d'isolation `src/lib/utils/client-portal-isolation.ts` constituent
  une **défense en profondeur applicative**. La RLS Supabase reste la première
  barrière. Cette procédure vérifie cette première barrière.
- Vitest n'exécute pas de SQL réel : ces tests doivent être lancés en environnement
  Supabase (staging ou local CLI).
- À conserver dans le repo, mis à jour à chaque évolution de policy.

## Prérequis

1. Accès au projet Supabase staging (ou Supabase CLI local : `supabase start`).
2. Service role key disponible pour le setup (jamais pour les tests eux-mêmes).
3. URL projet : `SUPABASE_URL` ; anon key : `SUPABASE_ANON_KEY`.
4. Les 5 migrations finales appliquées : `add_formation_automation_rules.sql`,
   `add_formation_finances.sql`, `add_veille_notes.sql`, `add_affacturage.sql`,
   `add_certificateurs.sql` — plus `add_learners_deleted_at.sql` (Story 5.4).

## Setup commun (à exécuter une fois)

À lancer dans le SQL editor Supabase **avec le service role** :

```sql
-- Deux entités
INSERT INTO entities (id, name, slug) VALUES
  ('11111111-1111-1111-1111-111111111111', 'MR FORMATION (test)', 'mr-test'),
  ('22222222-2222-2222-2222-222222222222', 'C3V FORMATION (test)', 'c3v-test')
ON CONFLICT DO NOTHING;

-- Deux clients (entreprises) sur entité MR
INSERT INTO clients (id, entity_id, company_name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Acme'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Beta')
ON CONFLICT DO NOTHING;

-- Apprenants : 2 pour Acme, 2 pour Beta (tous entity MR)
INSERT INTO learners (id, entity_id, client_id, first_name, last_name, email) VALUES
  ('00000000-0000-0000-0000-00000000a001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alice', 'Acme', 'alice@acme.test'),
  ('00000000-0000-0000-0000-00000000a002', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Andre', 'Acme', 'andre@acme.test'),
  ('00000000-0000-0000-0000-00000000b001', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Bob', 'Beta', 'bob@beta.test'),
  ('00000000-0000-0000-0000-00000000b002', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Bea', 'Beta', 'bea@beta.test')
ON CONFLICT DO NOTHING;

-- Une session INTER partagée entre Acme et Beta
INSERT INTO sessions (id, entity_id, title, start_date, end_date, status) VALUES
  ('dddd0001-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111',
   'Session INTER partagée', NOW(), NOW() + INTERVAL '1 day', 'upcoming')
ON CONFLICT DO NOTHING;

-- Apprenants inscrits sur la session (Acme + Beta)
INSERT INTO enrollments (session_id, learner_id, client_id) VALUES
  ('dddd0001-0001-0001-0001-000000000001', '00000000-0000-0000-0000-00000000a001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('dddd0001-0001-0001-0001-000000000001', '00000000-0000-0000-0000-00000000a002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('dddd0001-0001-0001-0001-000000000001', '00000000-0000-0000-0000-00000000b001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('dddd0001-0001-0001-0001-000000000001', '00000000-0000-0000-0000-00000000b002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
ON CONFLICT DO NOTHING;
```

Créer ensuite 4 utilisateurs de test via le dashboard Supabase Auth :
- `admin-mr@test.local` → profile rôle `admin`, `entity_id` MR.
- `admin-c3v@test.local` → profile rôle `admin`, `entity_id` C3V.
- `client-acme@test.local` → profile rôle `client`, lié au client Acme (`clients.profile_id`).
- `trainer-mr@test.local` → profile rôle `trainer`, formateur sur la session ci-dessus.

---

## Test 1 — Isolation multi-entité (NFR-SEC-1)

**Invariant** : un admin de l'entité MR ne doit voir aucune ligne `entity_id = C3V`.

### Setup

Insérer un apprenant côté C3V :

```sql
INSERT INTO learners (id, entity_id, first_name, last_name, email) VALUES
  ('00000000-0000-0000-0000-0000000c3a01', '22222222-2222-2222-2222-222222222222', 'Carl', 'C3V', 'carl@c3v.test')
ON CONFLICT DO NOTHING;
```

### Test

Se connecter en tant que `admin-mr@test.local`, récupérer l'`access_token`, puis :

```bash
curl -s "$SUPABASE_URL/rest/v1/learners?select=id,first_name,entity_id" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $ADMIN_MR_TOKEN" \
  | jq '[.[] | select(.entity_id == "22222222-2222-2222-2222-222222222222")]'
```

### Résultat attendu

`[]` (tableau vide). Aucune ligne de l'entité C3V ne doit remonter.

### Si le test échoue

- Vérifier les RLS policies sur `learners` : doivent filtrer `entity_id IN (SELECT entity_id FROM profiles WHERE id = auth.uid())`.
- **NE PAS** mettre la table en prod tant que ce test échoue — c'est une fuite cross-entité.

---

## Test 2 — Isolation multi-entreprises sur session INTER (NFR-SEC-2)

**Invariant** : un utilisateur `client` rattaché à Acme ne doit voir aucun apprenant de Beta, même si une session INTER est partagée par les deux entreprises.

### Test

Se connecter en tant que `client-acme@test.local`, récupérer l'`access_token`, puis :

```bash
# Lecture directe des enrollments de la session partagée
curl -s "$SUPABASE_URL/rest/v1/enrollments?select=learner_id,client_id&session_id=eq.dddd0001-0001-0001-0001-000000000001" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $CLIENT_ACME_TOKEN" \
  | jq '[.[] | select(.client_id != "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")]'
```

```bash
# Lecture directe des apprenants Beta
curl -s "$SUPABASE_URL/rest/v1/learners?select=id,client_id&client_id=eq.bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $CLIENT_ACME_TOKEN"
```

### Résultat attendu

Les deux requêtes doivent renvoyer `[]`. Le client Acme ne voit aucun enrollment ni apprenant rattaché à Beta.

### Si le test échoue

- Vérifier les RLS sur `enrollments` et `learners` pour le rôle `client` : filtre attendu = `client_id IN (SELECT id FROM clients WHERE profile_id = auth.uid())`.
- Cf. `src/lib/utils/client-portal-isolation.ts` — la défense en profondeur applicative doit aussi tenir.

---

## Test 3 — Périmètre formateur (FR51)

**Invariant** : un `trainer` ne voit que les sessions auxquelles il est rattaché (`sessions.trainer_id = mon trainer_id`).

### Setup

Créer un trainer rattaché à `trainer-mr@test.local`, puis l'assigner à la session INTER :

```sql
INSERT INTO trainers (id, entity_id, profile_id, first_name, last_name)
SELECT 'eeeeeee0-0000-0000-0000-000000000001',
       '11111111-1111-1111-1111-111111111111',
       p.id, 'Trainer', 'Test'
  FROM profiles p WHERE p.email = 'trainer-mr@test.local'
ON CONFLICT DO NOTHING;

UPDATE sessions
   SET trainer_id = 'eeeeeee0-0000-0000-0000-000000000001'
 WHERE id = 'dddd0001-0001-0001-0001-000000000001';

-- Créer une 2e session SANS ce trainer
INSERT INTO sessions (id, entity_id, title, start_date, end_date, status, trainer_id) VALUES
  ('dddd0002-0002-0002-0002-000000000002', '11111111-1111-1111-1111-111111111111',
   'Session AUTRE trainer', NOW(), NOW() + INTERVAL '1 day', 'upcoming', NULL)
ON CONFLICT DO NOTHING;
```

### Test

Se connecter en tant que `trainer-mr@test.local`, puis :

```bash
curl -s "$SUPABASE_URL/rest/v1/sessions?select=id,title,trainer_id" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $TRAINER_MR_TOKEN" \
  | jq '.'
```

### Résultat attendu

- La session `dddd0001-…` apparaît.
- La session `dddd0002-…` (sans trainer assigné, ou avec un autre trainer) n'apparaît **pas** dans la liste.

### Si le test échoue

- Vérifier la RLS sur `sessions` pour le rôle `trainer` : doit ajouter une clause `OR trainer_id = (SELECT id FROM trainers WHERE profile_id = auth.uid())`.
- À adapter selon la policy actuelle (admin all + trainer scoped).

---

## Test 4 — Soft-delete learners (Story 5.4 / FR20) — bonus

Vérifier que le trigger `prevent_hard_delete_session_linked_learner` bloque effectivement.

```sql
-- Marquer la session comme terminée pour activer la règle
UPDATE sessions SET status = 'completed'
 WHERE id = 'dddd0001-0001-0001-0001-000000000001';

-- Tentative de hard-delete d'un apprenant lié → doit lever P0001
DELETE FROM learners WHERE id = '00000000-0000-0000-0000-00000000a001';
-- Attendu : ERROR P0001 "Apprenant lié à une session terminée — utilisez le soft-delete (deleted_at)"

-- Soft-delete autorisé
UPDATE learners SET deleted_at = NOW()
 WHERE id = '00000000-0000-0000-0000-00000000a001';
-- Attendu : UPDATE 1
```

---

## Checklist pré-release MVP

À cocher par **Loris** et **Wissam** avant chaque mise en prod :

- [ ] **Test 1** — Admin MR ne voit aucun apprenant C3V (NFR-SEC-1)
- [ ] **Test 2** — Client Acme ne voit aucun enrollment / apprenant Beta sur session INTER (NFR-SEC-2)
- [ ] **Test 3** — Trainer ne voit que ses sessions (FR51)
- [ ] **Test 4** — Hard-delete d'apprenant lié à session `completed` lève P0001 (Story 5.4 / FR20)
- [ ] **Test 4** — Soft-delete (`UPDATE deleted_at`) du même apprenant fonctionne
- [ ] Toutes les RLS policies actives (vérifier `pg_policies` dans Supabase Dashboard)
- [ ] Données de setup nettoyées après tests (`DELETE FROM learners WHERE email LIKE '%@test.local'`, etc.)

---

## Tear-down (à exécuter après la passe de tests)

```sql
-- Cleanup en cascade (ordre inverse des FK)
DELETE FROM enrollments WHERE session_id IN ('dddd0001-0001-0001-0001-000000000001', 'dddd0002-0002-0002-0002-000000000002');
DELETE FROM sessions WHERE id IN ('dddd0001-0001-0001-0001-000000000001', 'dddd0002-0002-0002-0002-000000000002');
DELETE FROM learners WHERE id LIKE '00000000-0000-0000-0000-00000000%';
DELETE FROM trainers WHERE id = 'eeeeeee0-0000-0000-0000-000000000001';
DELETE FROM clients WHERE id IN ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
DELETE FROM entities WHERE id IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
-- Supprimer aussi les 4 users de test via Supabase Dashboard > Authentication.
```
