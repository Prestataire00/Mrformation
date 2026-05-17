---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
status: complete
completedAt: 2026-05-17
inputDocuments:
  - bmad_output/planning-artifacts/architecture.md
  - bmad_output/planning-artifacts/epics-stabilisation.md
  - CLAUDE.md
  - audit BMad du 2026-05-17 (super admin + PDFs + facturation, 10 bugs)
---

# Stabilisation Admin & PDFs Entreprise — Epic Breakdown

## Overview

Epic H **correctif de stabilisation côté admin/super admin** né de l'audit BMad du 2026-05-17,
suite à l'audit Epic G (portail apprenant). 10 bugs touchant les PDFs entreprise (variables
non résolues, signatures manquantes), la facturation (RIB, tri apprenants) et l'extranet
apprenant (questionnaires, programmes).

Contrairement à Epic G qui réparait des régressions PR #126/#127, **Epic H couvre des bugs
métier latents** (Qualiopi, facturation, conformité légale) qui doivent être traités avant
la prochaine vague d'utilisation par Loris.

**Périmètre** : 10 stories de correction, classées par criticité.
**Mode de livraison** : story par story selon priorité business, 1 PR par bloc cohérent.

---

## Requirements Inventory

### Bugs identifiés (Audit BMad super admin 2026-05-17)

| ID | Sévérité | Catégorie | Symptôme | Détail |
|----|----------|-----------|----------|--------|
| **BUG-H1** | **P0 Qualiopi** | PDF signature | Signatures non affichées dans feuilles d'émargement | Bug conformité Qualiopi — émargement sans signature = non conforme audit |
| **BUG-H2** | **P0 Qualiopi** | PDF signature | Convention entreprise signée mais signature pas reprise sur le PDF | Bug conformité — la signature est enregistrée en DB mais ne rend pas dans le PDF |
| **BUG-H3** | **P0 Business** | Facturation RIB | Génération PDF facture impossible malgré RIB configuré | Toast "RIB de l'entité n'est pas configuré (IBAN manquant)" alors que l'admin a renseigné le RIB → bloquant facturation client |
| **BUG-H4** | **P0 Business** | Facturation tri | Factures prennent tous les apprenants même quand on sélectionne UNE seule entreprise | Erreur de calcul facture INTER → mauvais montant client = erreur business |
| **BUG-H5** | P1 UX | PDF variables | "Nom client" non résolu dans certificat de réalisation | Variable `{{nom_client}}` ou alias non câblé → affiche le label brut au lieu de la valeur |
| **BUG-H6** | P1 UX | PDF formatage | Attestation d'assiduité : "35" sans unité "heures" | Manque le suffix "h" ou "heures" après la durée formatée |
| **BUG-H7** | P1 UX | PDF variables | PDF facture affiche "13 HABITAT" au lieu du nom entreprise complet configuré | Variable nom_entreprise/raison_sociale incorrecte ou alias incomplet |
| **BUG-H8** | P1 Métier | Configuration session | Programme de la formation : pas de saisie objectifs/contenu à la création session | Les PDFs programme/certificat héritent de champs vides car la session n'a pas de bloc "objectifs" éditable |
| **BUG-H9** | P2 Émargement | UX feuille | "1 page d'émargement par entreprise" ne fonctionne pas | Option visible mais inactive — alternative possible : supprimer les documents depuis l'espace émargement car ils sont déjà dans les docs entreprise |
| **BUG-H10** | P2 Questionnaires | Accès apprenant + admin | (a) Loris doit pouvoir voir les réponses des apprenants depuis l'admin (b) apprenant doit voir ses questionnaires ouverts depuis son extranet | 2 sous-bugs distincts à traiter ensemble |

---

## Epic H — Stabilisation Admin & PDFs Entreprise

### Priorité 1 : Conformité Qualiopi (P0)

Ces bugs touchent les documents légaux exigés par Qualiopi. Un audit OPCO/Qualiopi peut
relever ces points et faire perdre la certification.

#### Story h-1: Signatures émargement non affichées dans le PDF
**Symptôme** : Feuille d'émargement générée ne contient pas les signatures alors qu'elles
sont en DB (table `signatures` ou `documents` avec colonne signature_svg).
**Investigation requise** :
- La signature est-elle bien stockée (`signature_svg`, `signed_by`, `signed_at`) ?
- Le template `feuille_emargement` lit-il bien `signature_svg` via la fonction de rendu ?
- Y a-t-il un bug de sanitization SVG qui retire le path ?
**Référence** : Epic C `c-1-signature-service-unifie` était censé unifier ça — possible régression.
**Effort estimé** : 1-2h (investigation + fix)

#### Story h-2: Convention entreprise signée pas reprise sur le PDF
**Symptôme** : Convention signée par le client via lien public → signature enregistrée en DB
→ mais le PDF re-généré ne montre pas la signature.
**Investigation requise** :
- Le cache PDF est-il invalidé après signature ? (Epic E `e-2-cache-pdf-100`)
- Le template `convention_entreprise` lit-il `signature_svg` du document signé ?
- La régénération post-signature passe-t-elle par `DocumentGenerationService.generate` ?
**Référence** : Epic C `c-3-audit-trail-qualiopi` ajoutait signed_at + signature_method, peut-être
que la régénération PDF n'inclut pas signature_svg côté template.
**Effort estimé** : 1-2h

### Priorité 2 : Facturation bloquante (P0 business)

#### Story h-3: RIB configuré mais génération PDF facture impossible
**Symptôme** : Toast d'erreur "Le RIB de l'entité n'est pas configuré (IBAN manquant). Configurez-le dans /admin/settings/organization."
alors que le RIB est saisi.
**Investigation requise** :
- Le SELECT lit-il bien la bonne colonne (entities.bank_iban vs entities.iban vs entities.rib_iban) ?
- Y a-t-il un bug de cache contexte (le RIB est saisi mais pas pris en compte à l'instant) ?
- La validation côté API se base sur quel champ ?
**Effort estimé** : 30 min

#### Story h-4: Factures INTER prennent tous les apprenants au lieu de filtrer par entreprise
**Symptôme** : "Créer facture" pour entreprise X → ligne facture inclut TOUS les apprenants
de la session INTER (apprenants des autres entreprises aussi). Montant total faussé.
**Investigation requise** :
- L'auto-fill des lignes de facture filtre-t-il par `enrollments.client_id == X` ?
- Référence FR42 du PRD (story 3.x epic 3) : "auto-fill invoice lines from the recipient's context" — peut-être pas implémenté
- Risque : double-facturation ou sur-facturation client.
**Effort estimé** : 1h

### Priorité 3 : UX PDFs (P1)

#### Story h-5: "Nom client" non résolu dans certificat de réalisation
**Symptôme** : PDF certificat affiche "Présenté par : [Nom client]" littéralement au lieu de
la valeur résolue.
**Cause probable** : Variable alias manquante dans `resolve-variables.ts` ou `template-variables.ts`.
**Effort estimé** : 15 min

#### Story h-6: Attestation d'assiduité — durée sans unité "heures"
**Symptôme** : "Durée effectivement suivie par le stagiaire : 35.00h," manque l'unité explicite.
Actuellement la donnée "35" est affichée mais sans qualification.
**Note** : Sur le screenshot je vois "35.00h" donc l'unité est là. À reclarifier avec user :
peut-être que la durée brute est affichée à un autre endroit sans suffixe.
**Effort estimé** : 15 min après confirmation user

#### Story h-7: Facture affiche "13 HABITAT" au lieu du nom entreprise complet
**Symptôme** : Nom entreprise tronqué/court (juste "13 HABITAT" au lieu de "13 HABITAT SARL" ou similaire).
**Cause probable** : Mauvaise variable (nom court vs raison sociale officielle).
**Effort estimé** : 15 min

### Priorité 4 : Configuration métier (P1)

#### Story h-8: Programme formation — saisie objectifs/contenu à la création session
**Symptôme** : Les PDFs programme et certificat héritent de champs vides (objectifs, contenu pédagogique)
car la session n'a pas de bloc éditable pour ça.
**Scope** : ajouter à la création/édition session un bloc "Programme pédagogique" avec champs :
- Objectifs pédagogiques
- Contenu du programme
- Modalités d'évaluation
- Méthodes pédagogiques
**Effort estimé** : 2-3h (UI + DB + intégration PDFs)

### Priorité 5 : Améliorations UX (P2)

#### Story h-9: Émargement — page par entreprise
**Symptôme** : Option "1 page d'émargement par entreprise" présente dans l'UI mais ne fonctionne pas.
**Alternative proposée par user** : Supprimer cette option car les documents sont déjà dans les
documents entreprise (réduit la surface).
**Décision requise** : implémenter ou supprimer ?

#### Story h-10: Questionnaires — accès admin + apprenant
**Sous-bugs** :
- (a) Admin/super admin doit voir les réponses des apprenants (route déjà existante ?)
- (b) Apprenant doit voir ses questionnaires ouverts depuis `/learner/questionnaires`
**Investigation requise** : auditer l'existant pour identifier ce qui manque.
**Effort estimé** : 1-2h

---

## Récapitulatif global

| Story | Sévérité | Catégorie | Effort estimé | Phase |
|-------|----------|-----------|---------------|-------|
| h-1 — Signatures émargement absentes | **P0 Qualiopi** | PDF signature | ~1-2h | Critique |
| h-2 — Convention signée non rendue | **P0 Qualiopi** | PDF signature | ~1-2h | Critique |
| h-3 — RIB facture invalide | **P0 Business** | Facturation | ~30 min | Critique |
| h-4 — Factures filtrage entreprise | **P0 Business** | Facturation | ~1h | Critique |
| h-5 — "Nom client" non résolu | P1 UX | PDF variables | ~15 min | Stabilisation |
| h-6 — Unité heures attestation | P1 UX | PDF formatage | ~15 min | Stabilisation |
| h-7 — Nom entreprise tronqué | P1 UX | PDF variables | ~15 min | Stabilisation |
| h-8 — Programme formation saisie | P1 Métier | Configuration | ~2-3h | Stabilisation |
| h-9 — Émargement par entreprise | P2 | UX | ~30 min - 2h | Polish |
| h-10 — Questionnaires accès | P2 | UX | ~1-2h | Polish |
| **Total estimé** | | | **~10-15h dev** | **3-4 PRs** |

**Ordre recommandé** :
1. **PR-H1** : Quick wins UX P1 (h-5 + h-6 + h-7) → ~45 min, satisfaction visuelle immédiate
2. **PR-H2** : Facturation P0 (h-3 + h-4) → ~1h30, débloquer business
3. **PR-H3** : Qualiopi P0 (h-1 + h-2) → ~2-4h, conformité
4. **PR-H4** : Métier (h-8) → ~2-3h
5. **PR-H5** : Polish (h-9 + h-10) → ~1-2h
