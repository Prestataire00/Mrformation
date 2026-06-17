# Design — Documents de formation sur la fiche entreprise

**Date :** 2026-06-17
**Statut :** Design validé (brainstorming)
**Page cible :** `src/app/(dashboard)/admin/clients/[id]/page.tsx`

---

## 0. Besoin
Sur la fiche entreprise, afficher les **documents générés pendant les formations** auxquelles ses apprenants ont participé (attestations, certificats, convocations, émargements… + conventions), **groupés par formation**.

## 1. Constat (vérifié)
- La table **`documents`** (unifiée) = 1366 lignes : `owner_type` learner (1115), company (163), trainer (88). doc_type : reglement_interieur, programme_formation, cgv, convocation, certificat_realisation, attestation_assiduite, feuille_emargement…
- La fiche entreprise affiche **déjà** les docs `owner_type='company'` (conventions, via `fetchFormationDocs`/`formationDocs`) mais **PAS** les **1115 docs apprenants**.
- `generated_documents` (legacy) = 2 lignes → ignoré. `client_documents` (uploads entreprise) = section distincte conservée.

## 2. Données

Table `documents` (colonnes utiles) : `id, entity_id, doc_type, source_table, source_id, owner_type, owner_id, file_url, status, created_at`.

Requête de la nouvelle section (sur la page, le client a déjà `learners` et ses sessions résolues via `formation_companies` + enrollments) :
```
documents
  .select("id, doc_type, source_id, owner_type, owner_id, file_url, status, created_at")
  .eq("entity_id", entityId)
  .eq("source_table", "sessions")
  .in("source_id", companySessionIds)
  .or(`and(owner_type.eq.company,owner_id.eq.${clientId}),and(owner_type.eq.learner,owner_id.in.(${companyLearnerIds.join(",")}))`)
```
> Si le `.or(...)` imbriqué pose souci avec PostgREST, faire **2 requêtes** (company-owned + learner-owned) et fusionner côté client. Garde-fou `entity_id` obligatoire.

## 3. Présentation
Nouvelle section **« Documents de formation »**, groupée **par formation (session)** :
- Un bloc par session (titre + dates), repliable (accordéon `<details>` cohérent avec le calendrier de la fiche).
- Dans chaque bloc, la liste de ses documents : **libellé du type** (réutiliser le mapping `doc_type → label` de `src/lib/templates/secondary-categories.ts`), **destinataire** (« Entreprise » si owner_type=company, sinon le **nom de l'apprenant** résolu depuis `learners`), **date**, **statut** (généré / envoyé / signé depuis `status`), et un **lien de téléchargement** (`file_url`, même mécanisme que les conventions existantes).
- Tri : sessions par date décroissante ; dans une session, conventions d'abord puis docs apprenants groupés par apprenant.

**Fusion** : cette section **remplace** l'affichage séparé des conventions (`formationDocs`) pour éviter le doublon — les conventions (owner=company) apparaissent dans le bloc de leur formation. `fetchFormationDocs`/state `formationDocs` retirés s'ils ne servent qu'à ça.

## 4. Architecture
- **Fonction pure** `src/lib/documents/group-formation-docs.ts` : `groupFormationDocsBySession(docs, sessions, learnersById)` → `[{ session, docs: [{ id, typeLabel, recipientLabel, status, fileUrl, createdAt }] }]`. Testable (TDD) : groupement, libellé type, destinataire (entreprise vs apprenant, fallback si apprenant inconnu), tri.
- **Page** : ajouter `companyFormationDocs` (état) + `fetchFormationDocuments()` (requête ci-dessus), appeler dans le `Promise.all` de chargement ; rendre la section via la fonction pure.
- **Isolation** : `entity_id` + scope `source_id ∈ sessions de l'entreprise` et `owner_id ∈ {clientId} ∪ apprenants de l'entreprise`. Vue admin (pas d'isolation portail client ici, mais on ne fuit jamais hors entreprise par construction du scope).

## 5. États & robustesse
- Empty state (« Aucun document de formation pour cette entreprise »).
- Doc sans `file_url` → afficher la ligne sans lien (désactivé), pas de plantage.
- Erreur de fetch → la section n'empêche pas le reste de la fiche.

## 6. Tests
TDD sur `groupFormationDocsBySession` : groupement par session ; libellé type connu/inconnu (fallback = doc_type brut) ; destinataire entreprise vs apprenant (nom résolu, fallback « Apprenant »); docs sans session associée ignorés ; tri sessions desc + conventions avant apprenants.

## 7. Hors périmètre (YAGNI)
- `client_documents` (uploads entreprise) — section conservée telle quelle.
- `generated_documents` legacy (2 lignes).
- Génération/envoi de documents (lecture seule ici).
- Portail client (`client/*`) — ce design concerne la vue **admin**.

## 8. Suite
Design → writing-plans (TDD sur le helper d'abord) → exécution → PR sur `main`.
