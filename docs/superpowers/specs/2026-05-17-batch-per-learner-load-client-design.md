# Design : Charger `client` dans tous les batch endpoints per-learner

**Date** : 2026-05-17
**Auteur** : Wissam + Claude (brainstorming session 2)
**Statut** : ✅ **AUDIT TERMINÉ — 0 fichier à patcher actuellement** (cf section "Résultat audit Task 1" en bas)
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

- [x] Pattern documenté
- [x] Audit Task 1 exécuté : 19 templates inspectés
- [x] **Résultat : 0 fichier à patcher** (aucun template ne référence de variable client actuellement)
- [x] 3 commits vides documentant les SKIP par catégorie (trace pour futur dev)
- [x] Typecheck OK, 386 tests passent
- [x] PR créée + mergée (PR documentation, pas de code de production modifié)

## Résultat audit Task 1 (2026-05-17)

L'audit exhaustif des 19 templates batch candidats a révélé que **aucun ne référence les variables client canoniques** (`[%Nom du client%]`, `[%Adresse du client%]`, `[%SIRET du client%]`, `[%Nom de l'entreprise%]`, etc.) :

| Template | Variables client ? | Décision |
|---|---|---|
| attestation-abandon-formation | Non | SKIP |
| attestation-assiduite | Non | SKIP |
| attestation-competences | Non | SKIP |
| autorisation-image | Non | SKIP |
| avis-habilitation-electrique (+ 9 variants) | Non (mentions "employeur" = texte légal, pas variable) | SKIP |
| bilan-poe | Non | SKIP |
| certificat-diplome | Non | SKIP |
| contrat-engagement-stagiaire | Non (mentions "entreprise" = texte stages) | SKIP |
| decharge-responsabilite | Non | SKIP |
| lettre-decharge-responsabilite | Non | SKIP |
| resultats-evaluations | Non | SKIP |

Tous les placeholders dans ces templates concernent `de l'organisme`, `de l'apprenant`, `de la formation`, `du programme`, ou `du formateur` — pas `du client`.

### Conclusion

**Risque #1 est LATENT, pas actif.** Aucun bug de PDFs incomplets sur ces docs actuellement.

**Quand activer ce fix** : si/quand un template parmi cette liste évolue pour ajouter une variable client (par exemple `[%Nom du client%]` dans une attestation). À ce moment-là, le pattern de migration documenté dans ce spec est prêt à être appliqué au fichier correspondant.

### Note pour futur dev

Si tu ajoutes une variable client à l'un de ces templates :
1. Localiser le batch endpoint correspondant (ex: si tu modifies `bilan-poe.ts`, c'est `generate-bilans-poe-batch/route.ts`)
2. Appliquer le pattern 5-changes décrit en section "Pattern à appliquer" ci-dessus
3. Tester manuellement que la variable est résolue correctement
4. Commit avec message `fix(batch per-learner): charge client pour <doc_type>`

Le helper `loadClientsWithContacts` (PR #113) est prêt à l'emploi.
