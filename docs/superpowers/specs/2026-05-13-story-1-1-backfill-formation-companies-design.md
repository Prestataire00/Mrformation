# Design — Story 1.1 : Backfill `formation_companies` et arrêt de toute lecture/écriture de `sessions.client_id`

**Date :** 2026-05-13
**Auteur :** Wissam (assisté Claude)
**Branche :** `feat/story-1.1-backfill-formation-companies` (depuis `main`)
**Source :** `bmad_output/planning-artifacts/epics.md` § Epic 1 / Story 1.1
**Release pattern :** R1 (cette story) — R2 (Story 1.2 : `DROP COLUMN`) interviendra ≥ 7 jours après R1 en prod.

---

## 1. Contexte

La table `sessions` porte une colonne legacy `client_id` (ajoutée par une migration antérieure à `add-formation-management.sql`). Depuis l'introduction de `formation_companies` (table de liaison `session_id × client_id × amount`), la liaison session ↔ entreprise(s) est censée passer exclusivement par cette table. Mais le code applicatif lit et écrit encore `sessions.client_id` :

- `src/app/api/sessions/route.ts` L45-83 : filtre GET `?client_id=...` direct sur `sessions`.
- `src/app/api/sessions/route.ts` L161-170 : INSERT lors de la création de session.
- `src/app/api/sessions/[id]/route.ts` L101-149 : UPDATE lors de la modification.

Cette duplication empêche la cohérence multi-entreprises sur l'ensemble du module Formations (Epics 2 et 3 du MVP en dépendent). Story 1.1 supprime cette duplication tout en préservant le comportement utilisateur observable.

### Audit code complémentaire

Aucun composant frontend ni autre route API ne lit `formation.client_id` ou `session.client_id` directement. Tous les `.client_id` que l'on trouve ailleurs concernent : `formation_companies.client_id`, `enrollments.client_id`, `learners.client_id`, ou tables CRM (`quotes.client_id`, `prospects.client_id`, `tasks.client_id`, etc.). Le périmètre du refactor est donc strictement limité aux 2 fichiers ci-dessus.

---

## 2. Architecture (3 phases séquentielles)

```
Phase A : Préparation branche + migration SQL
   └─ Phase B : Dry-run sur snapshot (Supabase pré-prod)
        └─ Phase C : Exécution migration en prod
              └─ Phase D : Refactor code (2 routes)
                    └─ Phase E : Validation (tsc, grep, tests Loris)
                          └─ Phase F : PR + monitoring 7j → Story 1.2
```

### Ordre critique

La **migration backfill doit être exécutée en prod AVANT le déploiement du code refactoré.** Sinon, le filtre GET re-routé via `formation_companies` retournera des résultats vides pour les sessions historiques non encore backfillées.

L'idempotence de la migration permet en pratique deux ordres acceptables :
1. Migration prod → déploiement code (recommandé)
2. Déploiement code derrière un flag + migration prod + désactivation flag (overkill ici)

→ Approche retenue : **option 1** (migration prod → déploiement code).

---

## 3. Migration SQL

### Fichier

`supabase/migrations/backfill_formation_companies_from_legacy_client_id.sql`

### Contenu

```sql
-- Migration : Backfill formation_companies à partir du legacy sessions.client_id
-- Idempotente : ON CONFLICT (session_id, client_id) DO NOTHING
-- Prérequis : aucun (la table formation_companies existe depuis add-formation-management.sql).

INSERT INTO formation_companies (session_id, client_id, amount)
SELECT
  s.id          AS session_id,
  s.client_id   AS client_id,
  s.total_price AS amount   -- INTRA mono-entreprise : amount = total_price ; ajustable manuellement par Loris ensuite
FROM sessions s
WHERE s.client_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM formation_companies fc
    WHERE fc.session_id = s.id
      AND fc.client_id  = s.client_id
  )
ON CONFLICT (session_id, client_id) DO NOTHING;

-- Diagnostic (visible dans psql / Supabase SQL Editor) :
DO $$
DECLARE
  v_legacy_count   INTEGER;
  v_backfilled_now INTEGER;
  v_orphans        INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_legacy_count FROM sessions WHERE client_id IS NOT NULL;
  RAISE NOTICE 'Sessions avec sessions.client_id non null : %', v_legacy_count;

  SELECT COUNT(*) INTO v_backfilled_now
  FROM sessions s
  WHERE s.client_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM formation_companies fc
      WHERE fc.session_id = s.id AND fc.client_id = s.client_id
    );
  RAISE NOTICE 'Sessions ayant désormais une ligne formation_companies correspondante : %', v_backfilled_now;

  v_orphans := v_legacy_count - v_backfilled_now;
  RAISE NOTICE 'Sessions legacy SANS formation_companies après migration (devrait être 0) : %', v_orphans;

  IF v_orphans <> 0 THEN
    RAISE WARNING 'Backfill incomplet : % sessions legacy non backfillées. À investiguer.', v_orphans;
  END IF;
END $$;
```

### Dry-run

Avant exécution en prod :
1. Snapshot prod téléchargé localement (`supabase db dump` ou via dashboard).
2. Migration jouée sur la copie locale.
3. Output des `RAISE NOTICE` collecté + collé dans le **commit-message** ou **commentaire de PR** (pas de livrable séparé, décision Wissam).
4. Si `v_orphans` ≠ 0 ou comportement inattendu : investigation avant exécution prod.

---

## 4. Refactor `src/app/api/sessions/route.ts`

### GET — filtre `?client_id=X` re-routé via `formation_companies`

```ts
// Remplace :
//   if (clientId) {
//     query = query.eq("client_id", clientId);
//   }
// Par :

if (clientId) {
  const { data: linkedSessions, error: linkedError } = await supabase
    .from("formation_companies")
    .select("session_id")
    .eq("client_id", clientId);

  if (linkedError) {
    return NextResponse.json(
      { data: null, error: sanitizeDbError(linkedError, "filter sessions by client") },
      { status: 500 }
    );
  }

  const sessionIds = (linkedSessions ?? []).map((r) => r.session_id);
  if (sessionIds.length === 0) {
    return NextResponse.json({
      data: [],
      error: null,
      meta: { total: 0, page, per_page: perPage, total_pages: 0 },
    });
  }
  query = query.in("id", sessionIds);
}
```

### POST — `client_id` body param transformé en `formation_companies` (atomicité applicative)

```ts
// 1. Insert session SANS client_id
const { data: session, error: insertError } = await supabase
  .from("sessions")
  .insert({
    entity_id: profile.entity_id,
    training_id: training_id ?? null,
    program_id: program_id ?? null,
    trainer_id: trainer_id ?? null,
    // PAS de client_id ici
    start_date: start_date ?? null,
    end_date:   end_date ?? null,
    mode:       body.mode ?? "presentiel",
    location:   location ?? null,
    address:    body.address ?? null,
    city:       body.city ?? null,
    postal_code: body.postal_code ?? null,
    max_participants: max_participants ?? null,
    status:     status ?? "upcoming",
    notes:      notes ?? null,
    price:      body.price ?? null,
    internal_notes: body.internal_notes ?? null,
    created_by: user.id,
  })
  .select()
  .single();

if (insertError) {
  return NextResponse.json(
    { data: null, error: sanitizeDbError(insertError, "create session") },
    { status: 500 }
  );
}

// 2. Si client_id fourni → INSERT dans formation_companies avec rollback applicatif
if (client_id) {
  const { error: fcError } = await supabase
    .from("formation_companies")
    .insert({
      session_id: session.id,
      client_id,
      amount: body.price ?? null,
    });

  if (fcError) {
    // Rollback applicatif : delete la session orpheline
    await supabase.from("sessions").delete().eq("id", session.id);
    return NextResponse.json(
      { data: null, error: sanitizeDbError(fcError, "create session-company link") },
      { status: 500 }
    );
  }
}

// Le reste (logAudit, fetch automation, return) inchangé.
```

**Note** : le rollback applicatif (delete) est imparfait au sens transactionnel (un échec du delete laisserait quand même une session orpheline). Mais la probabilité d'échec en cascade est très faible, et le coût de mise en place d'une RPC Supabase pour atomicité réelle est disproportionné à ce stade (décision validée Wissam : option « Route serveur transforme »).

---

## 5. Refactor `src/app/api/sessions/[id]/route.ts`

### PATCH — retirer `client_id` du UPDATE + upsert `formation_companies` si fourni

```ts
const { data, error: updateError } = await supabase
  .from("sessions")
  .update({
    training_id,
    trainer_id: trainer_id ?? null,
    // PAS de client_id ici
    start_date,
    end_date:   end_date ?? null,
    mode:       mode ?? "présentiel",
    location:   location ?? null,
    address:    address ?? null,
    city:       city ?? null,
    postal_code: postal_code ?? null,
    max_participants: max_participants ?? null,
    status:     sessionStatus ?? "planned",
    notes:      notes ?? null,
    price:      price ?? null,
    internal_notes: internal_notes ?? null,
    meeting_url:    body.meeting_url ?? null,
    updated_at:     new Date().toISOString(),
  })
  .eq("id", params.id)
  .eq("entity_id", profile.entity_id)
  .select()
  .single();

if (updateError) {
  return NextResponse.json(
    { data: null, error: sanitizeDbError(updateError, "update session") },
    { status: 500 }
  );
}

// Si client_id fourni dans le body, upsert formation_companies
// Décision : si client_id === null, ne rien faire (option conservatrice — Loris détache via ResumeCompanies).
if (client_id !== undefined && client_id !== null) {
  const { error: fcError } = await supabase
    .from("formation_companies")
    .upsert(
      { session_id: params.id, client_id, amount: price ?? null },
      { onConflict: "session_id,client_id" }
    );

  if (fcError) {
    // Décision : pas de rollback applicatif sur PATCH (l'update session a déjà réussi → risque > bénéfice).
    // On retourne 500 avec message clair pour que Loris voie l'erreur et corrige via ResumeCompanies.
    return NextResponse.json(
      {
        data: null,
        error: "Session mise à jour mais la liaison entreprise a échoué : " +
          sanitizeDbError(fcError, "link session to company"),
      },
      { status: 500 }
    );
  }
}
```

### Comportement `client_id = null` sur PATCH

**Décision retenue : option (a) conservatrice.** Le PATCH n'enlève rien dans `formation_companies` même si `client_id = null`. Loris détache une entreprise via `ResumeCompanies` (composant qui appelle `formation_companies.delete()` explicitement).

**Justification :** explicite, pas de surprise, pas de cas d'effacement involontaire. Conforme à l'esprit du PRD (toute mutation destructive doit être explicite côté UI).

---

## 6. Validation et tests

### Checks automatisables

| Check | Méthode |
|---|---|
| Migration idempotente | Exécuter 2× sur snapshot, vérifier 0 doublon (`SELECT session_id, client_id, COUNT(*) FROM formation_companies GROUP BY 1, 2 HAVING COUNT(*) > 1` doit retourner 0 ligne) |
| Aucune session orpheline post-backfill | `SELECT COUNT(*) FROM sessions s WHERE s.client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM formation_companies WHERE session_id = s.id)` doit retourner 0 |
| Aucune lecture résiduelle | `grep -rEn "\.eq\\(.client_id|\.from\\(.sessions.\\).*client_id|sessions.*client_id" src/` retourne 0 occurrence pour `sessions` (les enrollments, formation_companies, etc. sont à exclure) |
| TypeScript clean | `npx tsc --noEmit` |
| Build OK | `npm run build` (smoke) |
| Tests si présents | `npm test` |

### Tests manuels Loris (Journey 2)

1. Ouvrir une session historique (`created_at < migration_date`) avec `sessions.client_id` non null en base.
2. Vérifier que l'entreprise s'affiche dans `ResumeCompanies`.
3. Ajouter une 2ᵉ entreprise → la 1ʳᵉ et la 2ᵉ doivent coexister.
4. Exporter convention + feuille d'émargement → aucune erreur.

### Test du filtre GET `?client_id=X`

`curl /api/sessions?client_id=<UUID_existant>` → doit retourner les sessions liées à cette entreprise via `formation_companies`.

### Test création session via UI

Créer une session avec un `client_id` dans le formulaire :
- Vérifier en base que `sessions.client_id` est **null** (refactor effectif).
- Vérifier qu'une ligne `formation_companies (session_id, client_id, amount)` existe.

---

## 7. Risques et mitigations

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Migration exécutée en prod avant déploiement du code refactoré | Moyenne (procédure manuelle) | Le code legacy continue d'écrire dans `sessions.client_id` qui ne sera plus lu — confusion. | Idempotence de la migration permet ré-exécution. Procédure de déploiement explicite : migration prod → puis Netlify deploy. |
| Refactor déployé sans migration | Moyenne | Filtre GET `?client_id=X` retourne 0 pour sessions historiques | Procédure de déploiement explicite ; ordre vérifié dans la PR description. |
| POST échoue partiellement (session créée, `formation_companies` fail) | Faible | Session orpheline en base, Loris doit nettoyer | Rollback applicatif (delete session). Acceptable car probabilité très faible. |
| PATCH échoue partiellement (session mise à jour, `formation_companies` fail) | Faible | État partiellement incohérent | Retour 500 avec message clair ; Loris voit l'erreur côté UI et corrige via `ResumeCompanies`. |
| Un caller frontend lit le filtre `?client_id=X` que je n'ai pas identifié | Faible (grep exhaustif effectué) | Caller cassé | Vérification finale `grep -rE "client_id=|client_id:" src/app/(dashboard)/` avant merge. Sentry surveille les 7 jours suivant. |
| Sentry capture erreurs sessions.client_id post-refactor | À monitorer | Indique un caller manqué | Phase F (monitoring 7j) avant Story 1.2. Si erreurs → fix avant DROP COLUMN. |

---

## 8. Audit code final

Avant merge :

```bash
# Recherche stricte de toute référence à sessions.client_id (en excluant les contextes valides)
grep -rEn '"client_id"' src/app/api/sessions/ src/app/api/sessions/\[id\]/
# → doit retourner 0 occurrence dans les routes sessions (formation_companies est dans une autre route)

# Recherche large
grep -rEn 'sessions.*client_id|session\.client_id|\.client_id' src/ \
  --include="*.ts" --include="*.tsx" \
  | grep -vE "formation_companies|enrollments|learners|prospects|quotes|clients\\(|client_id IN|recipient_id|action_type|prospect_id|task_id|quote_id|invoice"
# → doit ne montrer aucun usage légitime de sessions.client_id
```

---

## 9. Stratégie de commit & PR

### Commits prévus (atomiques)

1. `feat(formations): add backfill migration for formation_companies from legacy sessions.client_id`
   — uniquement le fichier `supabase/migrations/backfill_formation_companies_from_legacy_client_id.sql`
2. `refactor(sessions): re-route GET ?client_id filter via formation_companies`
   — modifications GET dans `src/app/api/sessions/route.ts`
3. `refactor(sessions): stop writing sessions.client_id on POST, upsert formation_companies instead`
   — modifications POST dans `src/app/api/sessions/route.ts`
4. `refactor(sessions): stop writing sessions.client_id on PATCH, upsert formation_companies instead`
   — modifications dans `src/app/api/sessions/[id]/route.ts`
5. `docs(story-1.1): add design spec and link in README/CLAUDE.md if applicable`
   — uniquement la doc

Chaque commit accompagné de `npx tsc --noEmit` clean.

### PR description

- Titre : `feat(formations): Story 1.1 — backfill formation_companies + stop reading/writing sessions.client_id`
- Description :
  - Lien vers `bmad_output/planning-artifacts/epics.md` § Epic 1 / Story 1.1
  - Lien vers ce design doc
  - Output du dry-run (count legacy, count backfillés, orphans)
  - Plan de release : migration prod → deploy → monitoring 7j → Story 1.2
- Pas de merge tant que la migration prod n'est pas exécutée et validée.

---

## 10. Hors scope (Story 1.2)

Cette story s'arrête à la coupure des lectures/écritures de `sessions.client_id`. **La colonne reste en base.**

Story 1.2 (≥ 7 jours plus tard) :
- Export d'archive `supabase/archives/sessions_client_id_dropped_YYYYMMDD.sql`
- Migration `drop_sessions_client_id.sql` (`ALTER TABLE sessions DROP COLUMN IF EXISTS client_id`)
- Mise à jour `CLAUDE.md` (suppression des mentions résiduelles)

---

## Décisions finales validées par Wissam

| # | Sujet | Décision |
|---|---|---|
| 1 | Filtre `GET /api/sessions?client_id=X` | Re-router via `formation_companies` (préserve les callers) |
| 2 | Écritures `sessions.client_id` (POST/PATCH) | Route serveur transforme `client_id` body param en `formation_companies` (atomicité applicative, frontend inchangé) |
| 3 | PATCH `client_id = null` | Conservateur — ne rien faire ; Loris détache via `ResumeCompanies` |
| 4 | Rollback PATCH partiel | Retourner 500 avec message clair ; pas de rollback applicatif risqué |
| 5 | Branche | `feat/story-1.1-backfill-formation-companies` depuis `main` |
| 6 | Dry-run report | Dans le commit-message / commentaire de PR — pas de livrable séparé |
| 7 | Convention archive | `supabase/archives/sessions_client_id_dropped_YYYYMMDD.sql` (Story 1.2) |
| 8 | Audit post-déploiement (7j) | Sentry + grep code source — pas d'audit Supabase logs |

---

*Spec figé. Prochaine étape (skill brainstorming) : commit + invocation de `writing-plans` pour générer le plan d'implémentation détaillé.*
