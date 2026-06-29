# Cohabitation des chemins de création de programme : IA + Import PDF + Grille manuelle

**Date :** 2026-06-29
**Statut :** Approuvé (design), en attente du plan d'implémentation
**Contexte :** Retour client — l'ancien système de création de programme « à partir d'un PDF » (et la
saisie manuelle des modules) a été retiré par le commit `d0e51118` (« un seul chemin = IA »). Le client
le veut de retour **en plus** du générateur IA, car c'est plus simple pour migrer manuellement ses
programmes existants (sous forme de PDF) dans la plateforme.

## Objectif

Faire **cohabiter trois chemins de création de programme** dans l'onglet / module Programme :

1. **Générer (IA)** — l'IA *invente* un programme à partir d'une description. **Système actuel, conservé tel quel.**
2. **Importer un PDF** — l'IA *transcrit* un PDF existant en programme structuré (préserve le contenu réel du client). **Restauré.**
3. **Créer manuellement (vierge)** — crée un programme vide puis ouvre l'édition pour saisir les modules à la main. **Restauré (grille en édition).**

Le composant **grille de modules n'existe qu'à un seul endroit : l'écran d'édition** (`EditProgramDialog`).
Il est réutilisé après un import PDF comme après une création vierge.

## Stratégie : restauration sélective depuis l'historique git

Le code retiré date du 27/06/2026 (2 jours) et était éprouvé. On **récupère les fichiers supprimés
quasi à l'identique** depuis `d0e51118^` et on **re-fusionne la grille** dans l'édition actuelle,
**par-dessus** le système IA que l'on ne modifie pas.

Alternative écartée : `git revert d0e51118` — annulerait aussi les améliorations du flux « Générer (IA) »
(le commit mélangeait retrait + nouveau flux standalone). Plus risqué.

## Périmètre détaillé (fichiers)

| Fichier | Action | Détail |
|---|---|---|
| `src/app/(dashboard)/admin/programs/import/page.tsx` | **Restaurer** | Page d'import 3 étapes (upload → aperçu → done) depuis `d0e51118^`. Rapprochement de titre (`titleSimilarity`) conservé. |
| `src/app/api/programs/ai-extract/route.ts` | **Restaurer** | Route d'extraction IA du PDF → `ParsedData`. Restaurée à l'identique. |
| `src/app/(dashboard)/admin/programs/page.tsx` (hub) | **Modifier** | 3 boutons côte à côte : « Générer (IA) » (existant), « Importer un PDF » (→ `/admin/programs/import`), « Créer manuellement (vierge) » (→ `createProgram` vide puis redirection vers l'édition). |
| `src/app/(dashboard)/admin/formations/[id]/_components/EditProgramDialog.tsx` | **Modifier** | Réintroduire la grille de séquences (modules : titre, durée, thèmes/objectifs/exercices) **sans casser** l'édition métadonnées actuelle. |
| `src/app/(dashboard)/admin/programs/[id]/page.tsx` | **Modifier** | `handleSave` : ré-enregistrer le `content` (modules) au lieu de seulement préserver l'existant. |
| `src/lib/validations/program.ts` | **Modifier** | Remettre les champs Zod des modules retirés (requis par la grille + l'extraction), sans casser le schéma du flux IA. |
| `src/lib/validations/__tests__/program.test.ts` | **Restaurer** | Re-ajouter les cas de test liés à la grille / aux modules. |

## Comportement attendu

- **Hub :** 3 boutons visibles. Chaque chemin aboutit à un programme enregistré via `createProgram`,
  filtré par `entity_id` (MR / C3V).
- **Import PDF :** upload d'un PDF → `ai-extract` renvoie un `ParsedData` (titre, durées, public,
  objectifs, modules, ressources…) → écran d'aperçu éditable → enregistrement, avec proposition de
  rapprochement si un programme de titre proche existe déjà.
- **Création vierge :** crée un programme minimal (titre + métadonnées vides) puis redirige vers
  l'édition où la grille permet de saisir les modules.
- **Grille en édition :** identique à l'ancienne (mêmes champs par module). Disponible pour tout
  programme (importé, vierge, ou généré IA) afin de retoucher les modules.

## Hors périmètre / intacts

Génération IA (`GenerateProgramDialog`), lien programme→session (`sessions.program_id`,
`handleAssignProgram`), versions, catalogue, export PDF (A2), e-learning, supports de cours.
**Aucune migration SQL** (le retrait n'en comportait pas).

## Règles projet à respecter

- Jamais d'appel Supabase sans filtre `entity_id`.
- Tout handler async : `try/catch` + toast d'erreur + état loading + refetch après succès.
- Formulaires en React Hook Form + Zod.
- Pas de type `any` ; logique Supabase via `src/lib/services/`.
- Composants shadcn/ui.

## Risques / points de vigilance

1. **Dépendance IA de `ai-extract`** — restaurée telle quelle (tournait il y a 2 jours). **À re-tester
   en conditions réelles avec un vrai PDF client** avant livraison.
2. **Drift du schéma `program.ts`** — la grille et l'extraction réintroduisent des champs ; vérifier
   que le schéma du flux « Générer (IA) » (qui a évolué dans `d0e51118`) reste valide. Barrière :
   `tsc --noEmit` + `vitest` (le lint ESLint 9 est cassé, ne pas s'y fier).
3. **Re-fusion de la grille** dans `EditProgramDialog` allégé — conflit possible avec l'édition
   métadonnées actuelle ; tester l'édition d'un programme existant après modif.

## Validation

- `tsc --noEmit` vert.
- `vitest` vert (dont les cas de `program.test.ts` restaurés).
- Test manuel des 3 chemins en conditions réelles (un vrai PDF pour l'import) sur l'entité MR.
