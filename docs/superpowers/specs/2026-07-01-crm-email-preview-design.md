# CRM — Aperçu de l'email prospect (tags résolus) — Design

**Date :** 2026-07-01
**Statut :** Approuvé (design), implémentation directe (1 fichier)
**Origine :** Audit UX CRM — envoi « à l'aveugle ». Sur `prospects/[id]/email`, `resolveTags()` n'est appelé qu'à l'envoi → l'utilisateur ne voit pas « Bonjour Alice » (il voit « Bonjour [%contact_name%] ») avant d'envoyer. Premier pas du chantier « Aperçu des envois ».

## Objectif
Ajouter un **aperçu** montrant le sujet et le message **avec les tags résolus**, avant l'envoi.

## Périmètre (fichier : `src/app/(dashboard)/admin/crm/prospects/[id]/email/page.tsx`)
- State `showPreview: boolean`.
- Un bouton **« Aperçu »** (bascule « Modifier » quand actif) près de la zone d'édition.
- Quand `showPreview` : afficher une carte **lecture seule** rendant `resolveTags(subject)` (titre) et `resolveTags(message)` (corps, `whitespace-pre-wrap` pour préserver les sauts de ligne). Un tag sans valeur reste visible tel quel (comportement actuel de `resolveTags`).
- Quand off : l'éditeur actuel (inchangé).
- L'aperçu n'altère PAS le contenu saisi (on résout une copie pour l'affichage). Le bouton « Envoyer » reste disponible et inchangé (il résout déjà à l'envoi).

## Hors périmètre
- Aperçu campagnes / séquences / PDF devis : chantiers suivants du thème « Aperçu des envois ». Pas de rendu HTML riche (gras/italique) dans l'aperçu — texte + sauts de ligne suffisent pour valider la résolution des tags.

## Règles projet
- shadcn/ui, pas de type `any`, pas de logique d'envoi modifiée. Barrières `tsc` + `vitest`. Pas de migration.

## Critères d'acceptation
- Un clic sur « Aperçu » affiche le sujet + message avec les tags remplacés par les valeurs du prospect ; « Modifier » revient à l'éditeur.
- Le contenu saisi n'est pas modifié par l'aperçu.
- `tsc` + `vitest` verts.
