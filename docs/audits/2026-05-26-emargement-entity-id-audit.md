# Audit entity_id — Routes Émargement/Signatures

> **Date :** 2026-05-26
> **Sous-chantier :** Volet A Sécurité Émargement (Task 7 du plan)
> **Source spec :** [docs/superpowers/specs/2026-05-26-emargement-volet-a-securite-design.md](../superpowers/specs/2026-05-26-emargement-volet-a-securite-design.md) § 4.3
> **Branche :** `feat/emargement-volet-a-securite`

## Méthodologie

Pour chaque route, vérifier :
1. **INSERT** : la valeur `entity_id` est-elle passée à `.insert({...})` ? D'où vient-elle ?
2. **UPDATE/DELETE** : le WHERE inclut-il `entity_id` (direct ou proxy via session_id) ?
3. Peut-on attaquer cross-tenant en passant un id d'une autre entité ?

Contexte critique :
- Les routes utilisant `createServiceClient()` (service_role) **bypass toute RLS**. Pour ces routes, la seule protection est la validation applicative.
- La table `signatures` n'a **pas** de colonne `entity_id` directe — l'isolation multi-tenant se fait par proxy `session_id → sessions.entity_id`.
- Les routes utilisant `auth.supabase` (client user-scoped) bénéficient de la RLS.

---

## Verdict par route

### 1. `/api/signatures` POST (INSERT signatures)

**Référence :** `src/app/api/signatures/route.ts:143`
**Client utilisé :** `auth.supabase` (user-scoped → RLS active)
**Verdict :** ✅ OK

**Détails :**
La table `signatures` n'a pas de colonne `entity_id` directe. L'isolation est assurée par `session_id` :

```ts
.insert({
  session_id,        // lié à sessions.entity_id
  signer_id: effectiveSignerId,
  signer_type: signerType,
  signature_data: sanitized_signature,
  signed_at: new Date().toISOString(),
  time_slot_id: time_slot_id || null,
})
```

Protection en place :
1. **App level** : avant l'INSERT, la route vérifie que le demandeur est bien inscrit/assigné à la session (lignes 83–112). Un learner ou trainer ne peut signer que pour une session à laquelle il est rattaché.
2. **Admin** : peut signer pour n'importe qui dans sa session. L'`entity_id` n'est pas dans l'INSERT mais la RLS `signatures_admin_all` applique `session_id IN (SELECT id FROM sessions WHERE entity_id = auth.user_entity_id())` — bloque les sessions cross-entity.
3. Pas de `service_role` → RLS actif.

---

### 2. `/api/signatures/[id]` DELETE

**Référence :** Route `src/app/api/signatures/[id]/` — **n'existe pas**. Le handler DELETE se trouve dans `src/app/api/signatures/route.ts:183`.
**Client utilisé :** `auth.supabase` (user-scoped → RLS active)
**Verdict :** ✅ OK

**Détails :**
```ts
const { error } = await auth.supabase
  .from("signatures")
  .delete()
  .eq("id", signatureId);
```

Pas de filtre `entity_id` explicite au niveau applicatif, mais :
- La route utilise `auth.supabase` (client user-scoped) → RLS s'applique.
- La RLS `signatures_admin_all` contraint :
  ```sql
  USING (
    user_role() IN ('admin', 'super_admin')
    AND session_id IN (SELECT id FROM sessions WHERE entity_id = user_entity_id())
  )
  ```
- Un admin ne peut donc DELETE que des signatures pour des sessions de son entité. Cross-entity DELETE impossible.

---

### 3. `/api/emargement` POST — 2× INSERT signing_tokens (lignes 295 et 354)

**Référence :** `src/app/api/emargement/route.ts:295` (session token) et `:354` (individual token)
**Client utilisé :** `createServiceClient()` → service_role, **bypass RLS**
**Verdict :** ⚠️ Fixed (commit `57c75bf`)

**Détails :**

**Avant fix :** Les deux INSERTs incluaient `entity_id: auth.profile.entity_id` dans le payload, ce qui est correct. MAIS la route acceptait `session_id` du body sans vérifier qu'il appartient à l'entité du demandeur. Un admin d'entité A pouvait passer un `session_id` d'entité B → service_role ne filtre pas → tokens créés pour une session cross-entity, exposant la liste des apprenants de B.

**Fix appliqué :** Ajout d'une validation immédiate après l'auth check :

```ts
const { data: sessionCheck, error: sessionCheckError } = await supabase
  .from("sessions")
  .select("id, entity_id")
  .eq("id", session_id)
  .single();

if (sessionCheckError || !sessionCheck) {
  return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
}

if (sessionCheck.entity_id !== auth.profile.entity_id) {
  return NextResponse.json(
    { error: "Accès non autorisé à cette session" },
    { status: 403 }
  );
}
```

---

### 4. `/api/emargement/slots` POST — 4× INSERT + 2× UPDATE signing_tokens

**Référence :** `src/app/api/emargement/slots/route.ts:152, 287, 361` (INSERT) + `:264, 346` (UPDATE)
**Client utilisé :** `createServiceClient()` → service_role, **bypass RLS**
**Verdict :** ⚠️ Fixed (commit `47e3457`)

**Détails :**

**Avant fix :** Même vulnérabilité que la route 3 mais amplifée :
- 4 chemins d'INSERT (`signing_tokens` pour learners et trainers en mode individual, plus mode session)
- 2 chemins d'UPDATE (`expires_at` refresh sur tokens existants)
- Aucune vérification que `session_id` appartient à l'entité du demandeur avant de fetcher les slots via service_role.

Un admin d'entité A pouvait :
- Passer `session_id` d'entité B → liste des apprenants de B exposée
- Générer des tokens QR pour les apprenants/formateurs de B
- Refresher l'expiry de tokens existants de B

Les INSERTs incluaient `entity_id: auth.profile.entity_id`, créant des données inconsistantes (token avec entity_id=A mais session_id→entité B).

**Fix appliqué :** Validation `session.entity_id == auth.profile.entity_id` avant le step 1 (fetch slots) :

```ts
const { data: sessionCheck, error: sessionCheckError } = await supabase
  .from("sessions")
  .select("id, entity_id")
  .eq("id", session_id)
  .single();

if (sessionCheckError || !sessionCheck) {
  return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
}

if (sessionCheck.entity_id !== auth.profile.entity_id) {
  return NextResponse.json(
    { error: "Accès non autorisé à cette session" },
    { status: 403 }
  );
}
```

---

### 5. `/api/emargement/sign` POST — INSERT signatures + INSERT signature_evidence + UPDATE used_at

**Référence :** `src/app/api/emargement/sign/route.ts:117, 169, 182`
**Client utilisé :** `createServiceClient()` → service_role, **bypass RLS**
**Verdict :** ✅ OK

**Détails :**

Cette route est **token-based** (publique, sans auth Supabase). L'entity_id n'est pas dans la table `signatures` (pas de colonne). Analyse des 3 opérations :

**INSERT signatures (ligne 117)** :
```ts
.insert({
  session_id: tokenData.session_id,  // vient du token, pas du body
  signer_id: signerId,               // résolu depuis le token (anti-tampering)
  signer_type: signerType,
  ...
})
```
Le `session_id` provient de `tokenData` (ligne récupérée en DB depuis le token UUID). Un attaquant ne peut pas forger un token (UUID v4 = 2^122 entropie). Le `session_id` est donc toujours celui de la session d'origine du token → appartient forcément à l'entité qui a généré le token.

**INSERT signature_evidence (ligne 169)** : table sans `entity_id`. L'isolation est via `signature_id → signatures.session_id → sessions.entity_id`. Aucune donnée cross-entity possible car le `signature_id` vient d'une signature que l'on vient d'insérer (même session_id sécurisé).

**UPDATE signing_tokens used_at (ligne 182)** : `.update({ used_at }).eq("id", tokenData.id)` — l'`id` vient du token récupéré, lié à la session du token. Pas de risque cross-entity.

Pas de cross-tenant possible : la chaîne `token → session_id` est entièrement contrôlée par la DB (token UUID imprévisible).

---

### 6. `/api/emargement/post-session-eval` POST

**Référence :** `src/app/api/emargement/post-session-eval/route.ts:16`
**Client utilisé :** `createServiceClient()` → service_role pour lectures; emails via fetch interne
**Verdict :** ✅ OK

**Détails :**

Cette route **n'effectue aucun INSERT/UPDATE/DELETE** en base de données. Son seul effet est d'envoyer des emails via `/api/emails/send`. Pas de manquement entity_id possible.

La route accepte un `session_id` sans vérification d'appartenance à l'entité, ce qui permettrait à un admin d'entité A d'envoyer des emails aux apprenants d'une session d'entité B. Cependant, cette route ne modifie pas la base de données → hors scope de l'audit des écritures. À noter pour un futur audit "information disclosure".

---

### 7. `/api/sessions/[id]/auto-absences` POST — INSERT formation_absences

**Référence :** `src/app/api/sessions/[id]/auto-absences/route.ts:158`
**Client utilisé :** `auth.supabase` (user-scoped → RLS active)
**Verdict :** ✅ OK

**Détails :**

```ts
const { error: insertError } = await auth.supabase
  .from("formation_absences")
  .insert(absencesToInsert);
```

`absencesToInsert` ne contient pas de colonne `entity_id` (la table `formation_absences` n'en a pas — isolation via `session_id → sessions.entity_id`).

Protection en place :
1. **App level** : au début de la route (ligne 19–28), la session est validée avec **double filtre** :
   ```ts
   .from("sessions")
   .select("id, title, entity_id")
   .eq("id", sessionId)
   .eq("entity_id", auth.profile.entity_id)  // ← filtre explicite entity_id
   .single();
   ```
   Si la session n'appartient pas à l'entité → 404. Toutes les opérations suivantes s'appuient sur ce `sessionId` validé.

2. **RLS** : `formation_absences_entity_access` sur la table via proxy session_id.

C'est le pattern le plus robuste des 7 routes auditées.

---

## Findings

### 🚨 FINDING 1 — `/api/emargement` POST : session ownership non validée (service_role bypass)

**Criticité :** HIGH  
**Statut :** ⚠️ Fixed — commit `57c75bf`  
**Impact :** Admin entité A pouvait générer des tokens de signature pour des sessions d'entité B, exposant les enrollments (liste apprenants) de B et créant des tokens avec entity_id incohérent.

### 🚨 FINDING 2 — `/api/emargement/slots` POST : session ownership non validée (service_role bypass)

**Criticité :** HIGH  
**Statut :** ⚠️ Fixed — commit `47e3457`  
**Impact :** Même que Finding 1, amplifié : 4× INSERT + 2× UPDATE possibles cross-entity. Admin entité A pouvait générer et refresher les tokens QR d'une session d'entité B.

### ℹ️ OBSERVATION 1 — `/api/emargement/post-session-eval` POST : session ownership non validée

**Status : ✅ RÉSOLU le 2026-05-26 dans le Sous-chantier 2 (commit ownership check post-session-eval).**

**Criticité :** LOW (hors scope écritures DB)  
**Statut :** ✅ Résolu — Sous-chantier 2 (voir commit `0fc46ed`)  
**Impact :** Admin entité A pourrait envoyer des emails aux apprenants d'une session d'entité B. Pas d'écriture DB cross-entity. À adresser dans un futur audit "information disclosure".

### ℹ️ OBSERVATION 2 — `/api/emargement/slots` GET : session ownership non validée (information disclosure)

**Status : ✅ RÉSOLU le 2026-05-26 dans le Sous-chantier 2 (commit ownership check slots GET).**

**Criticité :** LOW (lecture seule)  
**Statut :** ✅ Résolu — Sous-chantier 2 (voir commit ownership check slots GET)  
**Impact :** `/api/emargement/slots` **GET** utilise aussi `createServiceClient()` et accepte un `session_id` sans validation d'ownership. Permet à un admin entité A de lire les tokens et learner_ids d'une session entité B. Lecture seule, criticité LOW (pas d'écriture cross-entity). Résolu : même pattern que Volet A — ownership check `session.entity_id !== resolveActiveEntityId(auth.profile)` ajouté avant le fetch des slots.

---

## Conclusion

- Nombre de routes auditées : 7
- ✅ OK : 5 (`/api/signatures` POST, `/api/signatures` DELETE, `/api/emargement/sign` POST, `/api/emargement/post-session-eval` POST, `/api/sessions/[id]/auto-absences` POST)
- ⚠️ Fixed : 2 (`/api/emargement` POST, `/api/emargement/slots` POST)
- 🚨 Issue (escalation) : 0

**Verdict global :** ⚠️ avec corrections — 2 findings HIGH corrigés dans la foulée. Aucune issue résiduelle bloquante sur les écritures DB.

**Note sur la table `signatures`** : elle n'a pas de colonne `entity_id` directe. C'est intentionnel — l'isolation multi-tenant est assurée par proxy `session_id → sessions.entity_id`. Ce pattern est cohérent avec la RLS (`signatures_admin_all` filtre via `session_id IN (sessions WHERE entity_id = ...)`).

**Pattern observé :** Les routes utilisant `auth.supabase` (user-scoped) sont généralement sûres car la RLS prend le relais. Les vulnérabilités se concentrent sur les routes utilisant `createServiceClient()` (service_role) qui bypass toute RLS — pour ces routes, la validation applicative est **obligatoire** et doit précéder tout accès DB.
