---
title: 'Recherche prospects assouplie (fuzzy + accents)'
type: feature
created: '2026-06-27'
status: done
baseline_commit: 7a98f7703d6cee6013e1d0e6e9828eb73359ea3b
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/bmad_output/planning-artifacts/2026-06-27-cadrage-recherche-globale-et-prospects.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'équipe se plaint que la recherche de prospects exige un nom quasi exact. Le code
fait déjà du `ilike %x%` (partiel), donc la gêne réelle vient des **accents** (`Café` ≠ `cafe`)
et des **fautes de frappe** (`dupond` ne trouve pas `Dupont`), que `ilike` ne tolère pas. De
plus la route API `api/crm/prospects` n'échappe pas la recherche → corruption possible du DSL
PostgREST `.or()`.

**Approach:** Activer `pg_trgm` + `unaccent` côté Postgres et exposer une fonction RPC
`search_crm_prospect_ids(entity_id, query)` qui renvoie les ids de prospects correspondants
(insensible aux accents/casse + tolérance aux fautes via similarité trigram, complétée par un
substring). Les deux surfaces (page liste + route API) remplacent leur prédicat `.or(ilike)` par
un appel RPC suivi d'un `.in("id", ids)`, en conservant `entity_id`, pagination, count et autres
filtres existants. Supprime du même coup le risque d'injection DSL de l'API.

## Boundaries & Constraints

**Always:** migration dans un **fichier séparé** sous `supabase/migrations/` (jamais
`schema.sql`), exécutée en Supabase Dashboard AVANT le déploiement du code ; conserver le filtre
applicatif `.eq("entity_id", …)` sur la requête externe (défense en profondeur, RLS prod
non fiable) ; wrapper `immutable_unaccent` IMMUTABLE pour pouvoir indexer ; logique Supabase via
service/RPC, pas de SQL inline ; le chemin sans recherche reste inchangé.

**Ask First:** changer le seuil de similarité par défaut globalement (`pg_trgm.similarity_threshold`)
plutôt que via l'opérateur dans la RPC ; étendre le périmètre au-delà des prospects (clients) —
réservé à l'objectif B différé.

**Never:** introduire un `.rpc` qui ignore `entity_id` ; casser la pagination/count existants ;
implémenter la barre de recherche globale (objectif B, différé dans deferred-work.md) ;
réintroduire une `.or()` non échappée.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Accent | recherche `cafe`, prospect `Café Lyon` | trouvé (insensible accents) | — |
| Faute de frappe | recherche `dupond`, prospect `Dupont SARL` | trouvé (similarité trigram) | — |
| Partiel | recherche `dupon` | `Dupont SARL` trouvé (substring) | — |
| Aucun match | recherche `zzzzzz` | 0 résultat, liste vide propre | — |
| Recherche vide | `""` | comportement inchangé (liste complète paginée) | — |
| Caractères DSL | recherche `o'brien, (test)` | traité comme texte, pas d'erreur 500 | RPC paramétrée → pas d'injection |
| RPC en échec | erreur Postgres | toast erreur (page) / 500 propre (API), pas de crash | try/catch + message |

</frozen-after-approval>

## Code Map

- `supabase/migrations/add_prospect_fuzzy_search.sql` -- NOUVEAU : extensions pg_trgm + unaccent,
  wrapper `immutable_unaccent`, index GIN trigram, fonction `search_crm_prospect_ids`.
- `src/app/(dashboard)/admin/crm/prospects/liste/page.tsx` -- recherche liste (`fetchProspects`
  ~l.155-166) + export Excel (~l.243-257) : remplacer `.or(ilike)` par RPC + `.in(ids)`.
- `src/app/api/crm/prospects/route.ts` -- recherche API (~l.66-69, non échappée) : remplacer par
  RPC + `.in(ids)`.
- `src/lib/services/` -- NOUVEAU helper `searchProspectIds(supabase, entityId, query)` encapsulant
  l'appel RPC (réutilisé par les 3 call-sites).

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/add_prospect_fuzzy_search.sql` -- extensions `pg_trgm`/`unaccent`,
  `immutable_unaccent` IMMUTABLE, 2 index GIN trigram, fonction `search_crm_prospect_ids` (trigram
  `%` + substring ILIKE accent/casse-insensibles, ordre similarity, LIMIT 500, GRANT). -- moteur fuzzy.
- [x] `src/lib/services/prospect-search.ts` -- helper `searchProspectIds()` (RPC →
  `ServiceResult<{ ids: string[] }>`, normalise scalaires/objets). -- centralise, testable.
- [x] `src/app/(dashboard)/admin/crm/prospects/liste/page.tsx` -- `fetchProspects` +
  `handleExportExcel` : helper puis `.in("id", ids)` ; `computeSearchPattern` supprimée ; ids vides
  → résultat vide ; entity_id/count/pagination conservés. -- liste fuzzy.
- [x] `src/app/api/crm/prospects/route.ts` -- `.or()` non échappé remplacé par helper RPC +
  `.in("id", ids)` (sentinelle UUID si vide). -- API fuzzy + supprime injection DSL.
- [x] `src/lib/services/__tests__/prospect-search.test.ts` -- 5 tests (vide, args trimmés, mapping
  scalaires/objets, erreur). -- couverture.

**Acceptance Criteria:**
- Given un prospect `Café Dupont`, when je tape `cafe dupon`, then il ressort (accents + partiel).
- Given un prospect `Dupont`, when je tape `dupond` (faute), then il ressort (trigram).
- Given une recherche vide, when je charge la liste, then le comportement et la pagination sont inchangés.
- Given une recherche `o'brien, (x)`, when l'API la traite, then aucune erreur 500 (plus d'injection DSL).
- Given chaque requête, when elle s'exécute, then elle reste filtrée par `entity_id`.

## Design Notes

`unaccent()` est STABLE → non indexable. D'où le wrapper :
```sql
CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$ SELECT unaccent('unaccent', $1) $$;
```
La RPC combine trigram (`%`, tolère les fautes) ET `ILIKE '%q%'` (substring court) :
```sql
WHERE p.entity_id = p_entity_id AND (
     immutable_unaccent(lower(p.company_name)) % immutable_unaccent(lower(p_query))
  OR immutable_unaccent(lower(coalesce(p.contact_name,''))) % immutable_unaccent(lower(p_query))
  OR immutable_unaccent(lower(p.company_name)) ILIKE '%'||immutable_unaccent(lower(p_query))||'%'
  OR immutable_unaccent(lower(coalesce(p.contact_name,''))) ILIKE '%'||immutable_unaccent(lower(p_query))||'%'
  OR lower(coalesce(p.email,'')) ILIKE '%'||lower(p_query)||'%')
ORDER BY similarity(immutable_unaccent(lower(p.company_name)), immutable_unaccent(lower(p_query))) DESC
LIMIT 500
```
Le pattern `.in("id", ids)` préserve tout le code de filtres/pagination/count existant — on ne
remplace QUE le prédicat de recherche.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: 0 erreur
- `npx vitest run src/lib/services/__tests__/prospect-search.test.ts` -- expected: vert
- `npm run build` -- expected: build OK

**Manual checks:**
- Migration appliquée en Dashboard ; sur la liste prospects, `cafe dupon` et `dupond` ramènent les
  bons prospects ; recherche vide = liste normale ; pas d'erreur sur caractères spéciaux.

## Suggested Review Order

**Moteur de recherche (SQL)**

- Le cœur : fonction RPC fuzzy (trigram + unaccent), match company/contact/email/naf_code, p_limit borné
  [`add_prospect_fuzzy_search.sql`](../../supabase/migrations/add_prospect_fuzzy_search.sql)

**Accès applicatif**

- Helper unique : RPC → ids, normalise le retour, guarde entityId/query vides
  [`prospect-search.ts:23`](../../src/lib/services/prospect-search.ts#L23)

**Call-sites**

- Liste : recherche → `.in("id", ids)`, conserve entity_id/count/pagination ; 0 match court-circuité
  [`liste/page.tsx:145`](../../src/app/(dashboard)/admin/crm/prospects/liste/page.tsx#L145)
- Export : limite élevée pour ne pas tronquer l'export filtré
  [`liste/page.tsx:240`](../../src/app/(dashboard)/admin/crm/prospects/liste/page.tsx#L240)
- API : remplace le `.or()` non échappé (fix injection DSL) + sentinelle UUID si 0 match
  [`route.ts:67`](../../src/app/api/crm/prospects/route.ts#L67)

**Tests**

- 7 cas du helper (vide, entityId vide, args trimmés, p_limit, mapping scalaires/objets, erreur)
  [`prospect-search.test.ts`](../../src/lib/services/__tests__/prospect-search.test.ts)
