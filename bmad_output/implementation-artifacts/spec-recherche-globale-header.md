---
title: 'Barre de recherche globale (header) — entreprises + prospects'
type: feature
created: '2026-06-27'
status: done
baseline_commit: 10efa5ac8a263b11518c278898f306fbe9784a44
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/bmad_output/planning-artifacts/2026-06-27-cadrage-recherche-globale-et-prospects.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La barre de recherche en haut à droite du header (`Header.tsx:199-202`) est un `<div>`
décoratif jamais câblé — « n'a jamais fonctionné ». Il faut une vraie recherche rapide pour
retrouver une entreprise cliente ou un prospect d'un coup.

**Approach:** Remplacer le `<div>` mort par un composant `GlobalSearch` (champ + popover de
résultats LIVE, debounce 300ms). À la frappe (≥2 caractères), interroger en parallèle les
**clients** (ilike `company_name`) et les **prospects** (moteur fuzzy existant `searchProspectIds`
→ fetch des lignes), via un service `globalSearchEntities`. Afficher 2 groupes (« Entreprises »,
« Prospects »), navigation clavier (cmdk), clic → fiche (`/admin/clients/[id]` ou
`/admin/crm/prospects/[id]`). Tout filtré par `entity_id` (entité active).

## Boundaries & Constraints

**Always:** filtrer chaque requête par l'entité active (`entity?.id`) ; logique Supabase dans un
service `src/lib/services/` ; composants shadcn/ui (Popover + Command/cmdk) ; debounce via le hook
existant `src/hooks/useDebounce.ts` ; gestion d'erreur (échec silencieux + état vide, pas de crash
du header) ; accessibilité clavier (cmdk fournit listbox + flèches/Enter, Échap ferme).

**Ask First:** ajouter d'autres types au périmètre (apprenants, formations) ; rendre la recherche
clients fuzzy (RPC dédiée + migration) plutôt que ilike.

**Never:** casser le header pour les rôles sans entité active ; recherche cross-entité ; SQL/RPC
inline dans le composant ; bloquer le rendu du header pendant la recherche.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Frappe ≥2 car. | `dupont` | popover ouvert : groupes Entreprises + Prospects correspondants | — |
| Frappe <2 car. | `d` | pas de requête, popover fermé | — |
| Aucun résultat | `zzzzzz` | popover « Aucun résultat » | — |
| Sélection client | clic/Enter sur une entreprise | navigation `/admin/clients/[id]`, popover fermé, champ vidé | — |
| Sélection prospect | clic/Enter sur un prospect | navigation `/admin/crm/prospects/[id]` | — |
| Pas d'entité active | `entityId = null` | aucune recherche déclenchée | — |
| Erreur Supabase | RPC/SELECT échoue | popover « Aucun résultat » (ou état neutre), header intact | échec silencieux |

</frozen-after-approval>

## Code Map

- `src/components/layout/Header.tsx` -- `<div>` mort (l.199-202) à remplacer par `<GlobalSearch>` ;
  fournit l'entité active (`entity?.id`).
- `src/components/layout/GlobalSearch.tsx` -- NOUVEAU : champ + Popover + Command (cmdk), debounce,
  états (loading/empty), navigation.
- `src/lib/services/global-search.ts` -- NOUVEAU : `globalSearchEntities(supabase, entityId, query)`.
- `src/lib/services/prospect-search.ts` -- réutilisé (`searchProspectIds`, moteur fuzzy).
- `src/components/ui/{command,popover}.tsx` -- primitives shadcn existantes.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/services/global-search.ts` -- `globalSearchEntities(supabase, entityId, query, limit=6)`
  → `ServiceResult<{ clients: {id; company_name}[]; prospects: {id; company_name; contact_name}[] }>`.
  Clients : `.from("clients").select("id, company_name").eq("entity_id", …).ilike("company_name",
  %q%).limit(limit)`. Prospects : `searchProspectIds(…)` → `.from("crm_prospects").select("id,
  company_name, contact_name").in("id", ids.slice(0,limit))`. Court-circuit si query trim <2 car. ou
  pas d'entityId. -- moteur de recherche unifié.
- [x] `src/components/layout/GlobalSearch.tsx` -- composant client : Input + `useDebounce(value,300)` ;
  au changement debouncé (≥2 car.) appeler le service, ouvrir le Popover ; `Command shouldFilter={false}`
  (filtrage serveur) avec 2 `CommandGroup` ; `CommandItem.onSelect` → `router.push(href)` + reset +
  close ; `CommandEmpty` + indicateur loading ; props `{ entityId: string | null }`. -- UI popover live.
- [x] `src/components/layout/Header.tsx` -- importer et remplacer le `<div role="search">` par
  `<GlobalSearch entityId={entity?.id ?? null} />` (garder `hidden md:flex`). -- branchement.
- [x] `src/lib/services/__tests__/global-search.test.ts` -- mock supabase + `searchProspectIds` :
  <2 car. → vide sans requête ; mappe clients + prospects ; entityId null → vide. -- couverture.

**Acceptance Criteria:**
- Given je tape `dupont` (≥2 car.), when le debounce se déclenche, then le popover affiche les
  entreprises et prospects correspondants, groupés et filtrés par l'entité active.
- Given je clique/Enter sur un résultat entreprise, when la sélection se fait, then je suis redirigé
  vers `/admin/clients/[id]` et le popover se ferme.
- Given je tape moins de 2 caractères, when je saisis, then aucune requête n'est faite et le popover
  reste fermé.
- Given aucune entité active (`entityId` null), when je tape, then aucune recherche n'est déclenchée.
- Given une recherche sans correspondance, when les résultats reviennent, then « Aucun résultat »
  s'affiche sans casser le header.

## Design Notes

cmdk filtre côté client par défaut → `shouldFilter={false}` car les résultats viennent du serveur.
Popover ancré sous le champ ; le champ reste dans le header (`hidden md:flex`). Réutiliser le moteur
fuzzy prospects garantit la cohérence accents/fautes avec la recherche prospects livrée ; les clients
restent en `ilike` (suffisant pour un saut rapide ; fuzzy clients = évolution possible).

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: 0 erreur
- `npx vitest run src/lib/services/__tests__/global-search.test.ts` -- expected: vert
- `npm run build` -- expected: build OK

**Manual checks:**
- Dans le header (desktop), taper le nom d'une entreprise/prospect → résultats groupés ; clic →
  bonne fiche ; <2 car. → rien ; Échap ferme ; navigation clavier OK.

## Suggested Review Order

**Moteur de recherche**

- Service unifié : clients (ilike échappé) + prospects (fuzzy) en parallèle, ordre de pertinence préservé
  [`global-search.ts`](../../src/lib/services/global-search.ts)

**Composant UI**

- Popover + Command (cmdk) : debounce, garde anti-stale, reset à la fermeture, navigation → fiche
  [`GlobalSearch.tsx`](../../src/components/layout/GlobalSearch.tsx)
- Branchement : remplace le `<div>` mort par `<GlobalSearch entityId={entity?.id ?? null} />`
  [`Header.tsx`](../../src/components/layout/Header.tsx)

**Tests**

- 5 cas du service (min car., entityId null, mapping clients+prospects, 0 prospect, erreur)
  [`global-search.test.ts`](../../src/lib/services/__tests__/global-search.test.ts)
