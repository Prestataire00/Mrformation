---
stepsCompleted: [1, 2, 3]
inputDocuments: []
session_topic: "Attribution des documents secondaires aux sessions de formation par Loris"
session_goals: "Brancher les 22 templates secondaires existants (code en place mais non attribuables) au flow de session formation, pour que Loris puisse les sélectionner par formation au besoin, avec stockage + traçabilité Qualiopi + signature optionnelle."
selected_approach: "Divergence multi-domaines orthogonaux (anti-bias) → convergence design MVP"
techniques_used: ["Divergence multi-domaines orthogonaux", "Analyse compétitive (existant projet)"]
ideas_generated: []
context_file: ""
---

# Brainstorming Session Results

**Facilitator:** Wissam
**Date:** 2026-05-19

## Session Overview

**Topic:** Attribution des documents secondaires aux sessions de formation par Loris

**Goals:** Permettre à Loris (admin opérationnel) d'attribuer à la demande des documents secondaires (attestations spécifiques par type de formation, autorisations, lettres décharge…) aux sessions de formation, avec la même qualité de service que les 13 documents officiels actuels (génération PDF, stockage, envoi email, signature optionnelle, traçabilité Qualiopi).

### Contexte technique (cadrage)

**État actuel des templates :**
- 37 fichiers `*.ts` dans `src/lib/templates/`
- 13 branchés au registry `SYSTEM_TEMPLATES_BY_DOC_TYPE` → attribuables à une session via TabConventionDocs
- **22 "fantômes"** : code complet (HTML + footer + variables `[%Var%]`) mais ne sont :
  - PAS dans le registry
  - PAS dans la `CHECK constraint` `formation_convention_documents_doc_type_check`
  - PAS dans l'union TypeScript `DocumentType`
  - PAS dans les maps UI (`DOC_LABELS`, `DOC_BADGE_COLORS`, `DOC_SHORT`)
  - PAS dans le validator `FALLBACK_TO_ENTITY_FIELD`
  - PAS dans le `EmailAttachmentDescriptor`

**Liste des 22 fantômes :**

| Catégorie | Templates |
|-----------|-----------|
| Habilitation électrique (8 variantes) | avis-hab-elec-b0-bf-bs, b1v-b2v-br, bf-hf, bt-ht, bt, h0-b0-bf-hf-bs, h0-b0-initial, h0-b0 |
| Attestations métier | attestation-aipr, attestation-competences, attestation-abandon-formation, certificat-travail-hauteur, certificat-diplome |
| Documents administratifs | autorisation-image, decharge-responsabilite, lettre-decharge-responsabilite |
| Pédagogie / bilan | bilan-poe, charte-formateur, contrat-engagement-stagiaire |
| Évaluation / satisfaction | reponses-evaluations, reponses-satisfaction-session, resultats-evaluations |

**Endpoints API existants mais non-UI :** plusieurs routes `/api/documents/generate-{attestation-aipr,avis-habilitation-*}-mock` existent → utilisables individuellement via la page `/admin/test-convention` mais non rattachées à une session.

### Besoin produit (3 axes égaux)

1. **Gain de temps Loris** : centraliser dans la TabConventionDocs au lieu d'envoyer manuellement par email
2. **Traçabilité Qualiopi** : doc lié à session_id + horodatage + statut envoyé/signé
3. **Signature électronique** : certains secondaires nécessitent signature apprenant (autorisation image, décharge, charte, engagement stagiaire)

---

## Phase 1 — Divergence multi-domaines

### Domaine A — Architecture data model

1. **1 doc_type par template fantôme (22 nouveaux types)** : ajouter `avis_hab_elec_b1v_b2v_br`, `attestation_aipr`, etc. au DocumentType + CHECK constraint + registry. Mapping 1:1.
2. **1 doc_type générique "secondaire" + template_id** : un seul nouveau type `document_secondaire` qui pointe vers une table `secondary_templates(id, key, name, html, footer, owner_type, requires_signature)`. Évolutif sans migration.
3. **Réutiliser `custom` + métadonnée template_key** : pas de nouveau type, on stocke le key du template fantôme dans une colonne `template_ref` (JSONB ou TEXT). Pragmatique mais polue l'historique custom.
4. **Catégorisation par famille** : 3-4 doc_types groupés (`avis_habilitation`, `attestation_metier`, `document_administratif`, `evaluation`) + sous-type via `template_variant` colonne.
5. **Hybride** : doc_type spécifique pour les 8-10 plus utilisés (hab élec, AIPR, autorisation image), `secondary` générique pour la longue traîne.

### Domaine B — UX surface pour Loris

6. **Bouton "+ Ajouter un document" dans TabConventionDocs** → modal avec catalogue des 22 templates secondaires (search + tags + preview).
7. **Section "Documents secondaires" séparée** sous les 13 officiels, avec drag-and-drop pour ordonner.
8. **Catalogue par formation type** : si formation taggée "Hab élec B1V" → propose direct les 3-4 templates pertinents (avis-hab-elec-b1v-b2v-br + certificat-diplome + attestation-competences). Suggestions intelligentes.
9. **Combobox shadcn searchable** : `[Search dans 22 templates...]` avec preview hover.
10. **Templates "favoris"** par Loris : épingle ses N plus utilisés en haut.
11. **Bouton "+ Doc secondaire" dans la barre du Hub Formations** : action en bulk sur plusieurs sessions.
12. **Catégories visuelles** (Habilitation / Attestation / Administratif / Évaluation) avec badges colorés.

### Domaine C — Mécanisme d'attribution par défaut (automatisation)

13. **Default packs par type de formation** : à la création d'une formation taggée "Habilitation électrique", auto-attribuer les 3 templates pertinents (similaire à l'automation pack "Sous-traitance" existant).
14. **Règles d'auto-attribution** dans `formation_automation_rules` : `if formation.tag = "habilitation" then auto_assign(avis_hab_elec_*)`.
15. **Inférence par titre formation** : NLP simple — si le titre contient "B1V" → propose avis-hab-elec-b1v-b2v-br par défaut.
16. **Pas d'auto, full manuel** : Loris attribue à chaque session (KISS, prédictible).
17. **Templates favoris persistés au profil Loris** : il choisit une fois sa shortlist, c'est appliqué partout.

### Domaine D — Signature et workflow

18. **Champ `requires_signature` par template** : Loris coche au catalogue, le doc rentre dans le batch signature.
19. **Réutiliser `convention_intervention` signature flow** : si requires_signature → /sign/<token> existant fonctionne tel quel.
20. **Signature batch pour cohérent UX** : `SIGNATURE_BATCH_SUPPORTED_DOC_TYPES` étendu aux secondaires signables.
21. **Owner type intelligent** : autorisation-image owner=learner (chaque apprenant signe la sienne), charte-formateur owner=trainer, decharge owner=learner.
22. **Pas de signature pour les secondaires v1** : juste génération + stockage. Story dédiée plus tard si demande.

### Domaine E — Génération PDF

23. **Brancher au registry** `SYSTEM_TEMPLATES_BY_DOC_TYPE` → route `/api/documents/generate-from-template` les gère automatiquement (zéro code spécifique).
24. **Garder les routes API dédiées** (`generate-attestation-aipr`) en parallèle pour la page test-convention.
25. **Générer en batch** "Tout générer secondaires" comme on a "Tout générer officiels".
26. **Mock route auto-générée** : si une route mock existe (test-convention), réutiliser le résolveur de variables identique.
27. **Validation Qualiopi-like** : `qualiopiBlocking: false` pour les secondaires (vs true pour les officiels) — pas de blocage si placeholder manque.

### Domaine F — Variables et données spécifiques

28. **Variables métier additionnelles** : hab élec a besoin de `[%Niveau habilitation%]`, `[%Date validité%]`, etc. Étendre le resolver.
29. **Champs ad-hoc sur formation_trainers** ou nouvelle table `session_metadata(session_id, key, value)` pour stocker `niveau_habilitation = "B1V"`, etc.
30. **Saisie au moment de la génération** : un dialog s'ouvre demandant à Loris les variables custom (date validité, niveau).
31. **Hériter de la formation type** : si formation = "Hab élec B1V Initial", le `niveau_habilitation` est inféré du titre.

### Domaine G — Traçabilité Qualiopi

32. **Stockage dans `formation_convention_documents`** identique aux officiels (1 row par session+doc+owner).
33. **Tab Qualiopi : section "Documents secondaires"** avec compteur sent/signed/pending.
34. **Audit log dédié** : `commercial_actions` étendu avec `document_secondaire_attribue`.
35. **Indicator "Documents secondaires non attribués"** sur l'onglet Documents si formation type X attendrait normalement un secondaire absent.

### Domaine H — Adjacent / futures features débloquées

36. **Catalogue partageable cross-entité** : MR FORMATION et C3V FORMATION partagent les templates secondaires (économie d'échelle).
37. **Versioning des templates** : Loris peut éditer un secondaire et garder l'historique.
38. **Import bulk de templates** depuis Word/PDF (avec OCR + structuration auto).
39. **Templates personnalisés par client** : un EHPAD X veut son logo dans la décharge → variante template.
40. **Statistiques d'usage** : "Top 5 templates secondaires de l'année" pour aider Loris à mieux organiser.

---

## Phase 2 — Convergence : design MVP recommandé

**Objectif MVP** : permettre à Loris d'attribuer les 22 templates secondaires existants en 1-2 j-h max, sans casser le flux officiels existant.

### Stack technique retenue

| Décision | Choix | Pourquoi |
|----------|-------|----------|
| **Architecture** | **Option 1 — 1 doc_type par template fantôme** (#1) | Plus simple à brancher au registry actuel. Migration CHECK + types Type OK. 22 entrées de plus c'est gérable. |
| **UX d'attribution** | **#6 Bouton "+ Ajouter un document" + modal catalogue** + **#9 Combobox searchable** + **#12 Catégories visuelles** | Pattern shadcn standard, déjà utilisé ailleurs. Search permet de scaler si on en ajoute. |
| **Default packs** | **#13 Auto-attribution par tag formation** (vague 2 — pas MVP) | KISS pour v1. Loris choisit. Plus tard si demande, on ajoute les défauts automatiques. |
| **Signature** | **#18 Champ `requires_signature` au registry** + **#19 réutilise le flow /sign/<token>** | Aucun code nouveau côté signature, on étend juste la liste des doc_types signables. |
| **Génération PDF** | **#23 Brancher au registry SYSTEM_TEMPLATES_BY_DOC_TYPE** | Route `generate-from-template` les gère automatiquement, zéro code additionnel. |
| **Validation** | **#27 `qualiopiBlocking: false`** par défaut | Les secondaires ne bloquent pas l'audit, juste un nice-to-have. |
| **Variables custom** | **#30 Dialog au moment de la génération** (vague 2) | MVP : variables standard (apprenant/session/organisme). Variables métier (niveau hab) en story dédiée. |
| **Traçabilité** | **#32 stockage identique formation_convention_documents** | Réutilise toute l'infra existante. |

### Items écartés explicitement

- ❌ **#2 doc_type générique + template_id** : flexible mais refactor plus lourd, et casse la cohérence avec le pattern actuel
- ❌ **#3 réutiliser `custom`** : pollue l'historique, perd la sémantique
- ❌ **#15 Inférence NLP** : trop hasardeux pour la qualité requise
- ❌ **#38 Import Word/PDF OCR** : v3+, hors scope

### Story h-22 candidate (~2 j-h)

**Scope** :
1. Brancher les 22 templates fantômes au registry `SYSTEM_TEMPLATES_BY_DOC_TYPE` avec `ownerType` adapté (learner pour autorisation-image, certificat-* ; session pour bilan-poe, charte-formateur ; trainer pour engagement)
2. Étendre l'union TypeScript `DocumentType` avec les 22 nouveaux types
3. Migration SQL : étendre `CHECK constraint formation_convention_documents_doc_type_check` avec les 22 valeurs
4. Étendre `DOC_LABELS`, `DOC_BADGE_COLORS`, `DOC_SHORT` du TabConventionDocs (22 nouvelles entrées)
5. **Nouvelle UI** : bouton "+ Ajouter un document secondaire" dans TabConventionDocs → ouvre un Dialog avec :
   - Combobox shadcn searchable filtrant les 22 templates
   - Catégories visuelles (4 groupes : Habilitation / Attestation / Admin / Évaluation)
   - Sélection multi-template + bouton "Attribuer (N)"
6. Catégorisation côté code (constante `SECONDARY_TEMPLATE_CATEGORIES` mappant key → label + icône)
7. Pour les 4-5 templates signables : ajouter à `SIGNATURE_BATCH_SUPPORTED_DOC_TYPES` (autorisation-image, decharge-responsabilite, lettre-decharge-responsabilite, charte-formateur, contrat-engagement-stagiaire)

**Hors scope MVP — vagues 2/3** :
- Default packs par type de formation (#13/#14)
- Variables custom métier (hab élec niveau B1V) (#28-31)
- Templates favoris Loris (#10/#17)
- Templates personnalisés par client (#39)
- Versioning templates (#37)
- Statistiques usage (#40)

### Effort estimé

| Tâche | Lignes | Temps |
|-------|--------|-------|
| Imports + entries dans registry.ts (22 templates) | ~70 | 30 min |
| Étendre DocumentType union | ~10 | 5 min |
| Migration SQL CHECK | ~30 | 10 min |
| Étendre DOC_LABELS + BADGE_COLORS + SHORT (3 maps × 22 entries) | ~80 | 30 min |
| Nouvelle UI Dialog "Ajouter doc secondaire" + Combobox + Catégories | ~150 | 1h30 |
| Constante SECONDARY_TEMPLATE_CATEGORIES | ~30 | 15 min |
| Ajouter doc_types signables au set | ~10 | 5 min |
| Smoke tests + tsc | — | 30 min |
| **Total** | **~380 LOC** | **~3h** |

### Prochaine étape recommandée

Lancer `bmad-create-story` pour produire la story **h-22 — Documents secondaires attribuables par Loris**.

Pré-requis avant la story :
- Valider avec Loris la **liste finale** des 22 templates (peut-être qu'il en veut moins, ou veut renommer certains pour la lisibilité)
- Valider les **catégories** : 4 groupes proposés, mais Loris peut préférer 2-3 ou autre découpage
- Valider la **liste des signables** (5 proposés : autorisation-image, decharge, lettre-decharge, charte-formateur, engagement-stagiaire)
