# Design : Charger `client` dans tous les batch endpoints per-learner

**Date** : 2026-05-17
**Auteur** : Wissam + Claude (brainstorming session 2)
**Statut** : approved (brainstorming)
**Story** : Risque #1 identifié par audit approfondi multi-entreprises

## Contexte / Problème

L'audit approfondi du filtrage multi-entreprises a confirmé que le **filtrage core** (apprenants par entreprise) est solide via `getLearnersForCompany` dans `resolve-variables.ts:176`. Aucun risque de **leak** d'apprenants entre entreprises sur les docs `owner_type=company` (convention, émargement collectif).

**Risque latent identifié** : les batch endpoints qui génèrent des docs `owner_type=learner` (1 PDF par apprenant) ne chargent **pas** le client correspondant à l'enrollment. Si le template référence `[%Nom du client%]`, `[%Adresse du client%]`, `[%SIRET du client%]` → ces variables affichent des fallback vides ou les placeholders `[Nom client]`.

Pas de **leak multi-entreprise** (les apprenants restent isolés vu que c'est 1 PDF par apprenant), mais **PDFs incomplets** avec données client manquantes.

### Pattern de référence (déjà OK)

`generate-certificats-realisation-batch/route.ts` charge correctement le client :

```typescript
// Lignes 117-125
const clientIds = [...new Set(validEnrolled.map((e) => e.client_id).filter((id): id is string => Boolean(id)))];
const clientById = new Map<string, Client>();
if (clientIds.length > 0) {
  const { data: clients } = await supabase
    .from("clients")
    .select("*, contacts(*)")
    .in("id", clientIds);
  ((clients ?? []) as unknown as Client[]).forEach((c) => clientById.set(c.id, c));
}
```

**⚠ NB** : ce pattern utilise `select("*, contacts(*)")` qui souffre du bug PGRST201 (cf PR #113). Le fix doit utiliser `loadClientsWithContacts` du helper `src/lib/services/load-client.ts` à la place.

## Comportement attendu

Pour chaque batch endpoint **per-learner** dont le template référence des variables client :

1. Charger les `clientIds` distincts depuis les enrollments
2. Charger les clients en batch via `loadClientsWithContacts(supabase, clientIds)` (helper PR #113, contourne PGRST201)
3. Dans le task de génération PDF par apprenant : récupérer le `client` correspondant à `enrollment.client_id` (peut être `null` si apprenant orphelin)
4. Injecter `client` dans le `ResolveContext`

## Architecture

### Helper réutilisable

Le helper `loadClientsWithContacts(supabase, clientIds[])` existe déjà (PR #113, fichier `src/lib/services/load-client.ts`). Il retourne `Map<string, Client>` avec contacts inclus.

### Pattern à appliquer (template)

```typescript
import { loadClientsWithContacts } from "@/lib/services/load-client";

// Après le fetch des enrollments :
const clientIds = [...new Set(
  enrolled.map((e) => e.client_id).filter((id): id is string => Boolean(id))
)];
const clientsMap = await loadClientsWithContacts(supabase, clientIds);

// Dans le task de génération :
const tasks = enrolled.map(async (enr) => {
  const learner = enr.learner!;
  const client = enr.client_id ? clientsMap.get(enr.client_id) ?? null : null;
  const context: ResolveContext = {
    session: session as unknown as Session,
    learner,
    client,  // ← AJOUT
    entity,
  };
  // ...
});
```

### Fichiers candidats (à vérifier 1 par 1)

Le grep brut a retourné 22 batch endpoints. Certains sont **déjà OK** ou **non concernés** :

**À EXCLURE** (non concernés ou déjà OK) :
- `generate-conventions-batch` : `owner_type=company`, pas per-learner (charge déjà via `formation_companies` + clients) ✅
- `generate-certificats-realisation-batch` : déjà a le pattern ✅ (pattern de référence)
- `generate-conventions-intervention-batch` : `owner_type=trainer`, pas concerné

**À VÉRIFIER + FIXER** (per-learner avec template potentiellement client-aware) :
1. `generate-attestations-abandon-batch`
2. `generate-attestations-assiduite-batch`
3. `generate-attestations-competences-batch`
4. `generate-autorisations-image-batch`
5. `generate-avis-habilitation-electrique-batch` (legacy/main)
6. `generate-avis-habilitation-electrique-b0-bf-bs-batch`
7. `generate-avis-habilitation-electrique-b1v-b2v-br-batch`
8. `generate-avis-habilitation-electrique-bf-hf-batch`
9. `generate-avis-habilitation-electrique-bt-batch`
10. `generate-avis-habilitation-electrique-bt-ht-batch`
11. `generate-avis-habilitation-electrique-h0-b0-batch`
12. `generate-avis-habilitation-electrique-h0-b0-bf-hf-bs-batch`
13. `generate-avis-habilitation-electrique-h0-b0-initial-batch`
14. `generate-bilans-poe-batch`
15. `generate-certificats-diplome-batch`
16. `generate-contrats-engagement-batch`
17. `generate-convocations-batch` : per-learner mais convocation = pas de réf client → **probablement EXCLURE**
18. `generate-decharges-responsabilite-batch`
19. `generate-emargements-individuels-batch` : per-learner émargement, pas de réf client direct → **probablement EXCLURE**
20. `generate-lettres-decharge-batch`
21. `generate-resultats-evaluations-batch`

**Critère de fix par fichier** : grep le template HTML correspondant (`src/lib/templates/X.ts`) pour `Nom du client`, `Adresse du client`, `SIRET du client`, `client_name`, `client_address`, etc. Si le template a au moins 1 variable client → fixer. Sinon, exclure et documenter pourquoi.

Estimé : **12-15 fichiers à patcher réellement** (sur les 19 candidats hors exclusions).

## Pattern de migration

Pour chaque fichier identifié, modification ciblée :

1. **Ajouter import** :
   ```typescript
   import { loadClientsWithContacts } from "@/lib/services/load-client";
   ```

2. **Adapter le SELECT enrollments** : doit inclure `client_id` :
   ```typescript
   const { data: enrollments } = await supabase
     .from("enrollments")
     .select("client_id, learner:learners(*)")  // ← ajouter client_id si manquant
     .eq("session_id", body.sessionId);
   ```

3. **Charger les clients** après le fetch enrollments :
   ```typescript
   const clientIds = [...new Set(enrolled.map((e) => e.client_id).filter((id): id is string => Boolean(id)))];
   const clientsMap = await loadClientsWithContacts(supabase, clientIds);
   ```

4. **Injecter `client` dans le context** :
   ```typescript
   const client = enr.client_id ? clientsMap.get(enr.client_id) ?? null : null;
   const context: ResolveContext = { session, learner, client, entity, ...other };
   ```

5. **`cacheInputs.client_id`** : ajouter si pas déjà :
   ```typescript
   cacheInputs: {
     // ... autres champs
     client_id: enr.client_id ?? null,
   }
   ```

## Tests

### Pas de tests automatisés à ajouter

Ces batch endpoints n'ont pas de tests unitaires (le code de génération PDF nécessite Puppeteer/CloudConvert en CI, lourd). Les snapshots tests E4 ne couvrent que F1/F2.x/F3.

### Validation

- **Typecheck** : `npx tsc --noEmit` doit rester clean (rien ne casse car on **ajoute** des champs au context)
- **Tests existants** : 386/386 doivent continuer à passer
- **Manual test (Wissam après merge)** : sur une formation INTRA test avec un client complet (nom, adresse, SIRET), générer un bilan POE et un avis habilitation électrique → vérifier que les variables client sont résolues

## Edge cases

- **Apprenant orphelin (`enrollment.client_id = null`)** : `client = null` → fallback dans resolver `[Nom client]` etc. (comportement actuel acceptable, juste plus visible pour Loris qu'il manque un rattachement client)
- **Client supprimé entre-temps** : `clientsMap.get(id) = undefined` → `client = null` → fallback. Pas de crash.
- **Performance** : 1 query supp en batch (Promise.all avec enrollments query) ≈ +50ms négligeable

## Hors scope (post-MVP)

- **Risque #2** (warning UI orphelins dans batch email) : story séparée si besoin
- **Risque #3** (CHECK constraint SQL) : story séparée
- **Tests E2E** des batch endpoints : nécessite infra Puppeteer en CI, story dédiée Lot E

## Definition of Done

- [ ] Pattern documenté + appliqué dans 12-15 fichiers candidats (après vérification template par template)
- [ ] Import `loadClientsWithContacts` ajouté dans chaque fichier modifié
- [ ] `cacheInputs.client_id` ajouté quand manquant
- [ ] Typecheck `npx tsc --noEmit` OK
- [ ] Tests 386/386 passent
- [ ] PR créée + mergée
- [ ] Wissam confirme manual test : bilan_poe + avis_habilitation_electrique génèrent avec données client résolues
