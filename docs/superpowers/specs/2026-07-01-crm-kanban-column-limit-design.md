# CRM — Limite d'affichage par colonne du Kanban prospects — Design

**Date :** 2026-07-01
**Statut :** Approuvé (design), en attente implémentation
**Origine :** Audit UX CRM — le Kanban (`prospects/page.tsx`) rend TOUTES les cartes de chaque colonne → coût DOM à l'échelle. Option (a) validée : **plafonner le rendu par colonne + « Afficher plus »**, sans casser le drag-drop.

## Contexte (vérifié, `prospects/page.tsx`)
- `columns.map((col) => { const cards = getProspectsForColumn(col.id); ... })` (l.695-696).
- Badge de nombre de la colonne + total montant utilisent l'ensemble des `cards`.
- Rendu des cartes : `cards.map((p) => ...)` (l.746).

## Principe
On garde **toute la donnée** (fetch inchangé, compteurs/totaux/ drag-drop exacts) ; on **plafonne uniquement le RENDU** : chaque colonne affiche au plus N cartes, avec un bouton « Afficher plus » qui en révèle davantage. Le coût DOM (des centaines de cartes) est le vrai problème → réglé.

## Périmètre
1. `const COLUMN_PAGE = 20;` + état `const [colLimits, setColLimits] = useState<Record<string, number>>({});`.
2. Dans le rendu de colonne : `const shown = colLimits[col.id] ?? COLUMN_PAGE;`. Rendre `cards.slice(0, shown).map(...)` (au lieu de `cards.map(...)`). **Garder `cards.length`** pour le badge de compte et le total montant (inchangés).
3. Après la liste des cartes de la colonne, si `cards.length > shown` : un bouton **« Afficher plus (N restantes) »** (`N = cards.length - shown`) qui fait `setColLimits(l => ({ ...l, [col.id]: shown + COLUMN_PAGE }))`.
4. (Optionnel léger) réinitialiser `colLimits` à `{}` quand les filtres changent, pour repartir plafonné.

## Hors périmètre
- Pas de virtualisation (react-window). Pas de changement du fetch, des compteurs, du drag-drop. Pas de migration.

## Règles projet
- shadcn/ui (ou bouton texte cohérent avec la colonne), pas de type `any`. Le drag-drop continue de fonctionner sur les cartes rendues. Barrières `tsc` + `vitest`.

## Risques / vigilance
1. **Badges/totaux exacts** : ne PAS baser le compte/total sur les cartes tronquées — utiliser `cards` complet ; seul le `.map` de rendu est tronqué.
2. **Drag-drop** : glisser vers une colonne dépose en tête (statut) indépendamment du plafond ; le drop reste géré au niveau colonne (l.703-704). OK.
3. **Bouton par colonne** : `key`/état par `col.id` (map), pas un compteur global.

## Critères d'acceptation
- Une colonne avec >20 prospects n'affiche que 20 cartes + « Afficher plus (X restantes) » ; cliquer en révèle 20 de plus.
- Le badge de nombre et le total montant de la colonne restent exacts (toutes les cartes).
- Le drag-drop fonctionne sur les cartes affichées.
- `tsc` + `vitest` verts.
