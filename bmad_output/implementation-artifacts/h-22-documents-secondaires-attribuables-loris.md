---
storyId: H22
storyKey: h-22-documents-secondaires-attribuables-loris
epic: H
title: Documents secondaires attribuables aux sessions par Loris (Epic H)
status: ready-for-dev
priority: P1
effort: 3-4 j-h
wave: hot-fix (extension Epic H, suite h-19/h-20)
sourceBrainstorming: bmad_output/brainstorming/brainstorming-session-2026-05-19-0914.md
createdAt: 2026-05-19
createdBy: bmad-create-story (Claude Opus 4.7)
---

# Story H22 — Documents secondaires attribuables aux sessions par Loris

## 1. Story Statement

**As an** admin opérationnel (Loris),
**I want** pouvoir attribuer à chaque session de formation des documents secondaires (attestations métier, autorisations, décharges, bilans) depuis l'UI de la fiche formation,
**So that** je centralise tous les livrables d'une formation au même endroit (officiels + secondaires), avec génération PDF, stockage, envoi email et signature optionnelle, sans avoir à passer par des envois manuels par email externe.

## 2. Context

**Découverte du 2026-05-19** : `src/lib/templates/` contient **37 fichiers de templates HTML** dont **13 sont branchés** au registry `SYSTEM_TEMPLATES_BY_DOC_TYPE` (les officiels Qualiopi : convocation, certificat_realisation, attestation_assiduite, conventions, émargements, programme, CGV, RGPD, RI, planning, etc.) et **23 sont "fantômes"** — le code HTML + footer + variables existent mais ils ne sont ni dans le registry, ni dans la CHECK constraint `formation_convention_documents_doc_type_check`, ni dans l'union TypeScript `DocumentType`, ni dans les maps UI de `TabConventionDocs`.

Conséquence : Loris a accès à ces templates uniquement via la page de test `/admin/test-convention` (génération individuelle, hors contexte session). Il ne peut PAS les attribuer à une session de formation, donc :
- Pas de stockage par session (perte d'audit Qualiopi)
- Pas d'envoi par email centralisé
- Pas de signature électronique
- Loris doit gérer ces docs en parallèle (emails manuels, drive perso, etc.)

**Décisions structurantes héritées du brainstorming (Phase 1+2, 2026-05-19)** :
- Architecture : **1 doc_type par template** (option 1, cohérent avec pattern existant)
- UX : **bouton "+ Ajouter doc secondaire" → Dialog catalogue avec Combobox searchable + 4 catégories visuelles**
- Génération : **brancher au registry → route `generate-from-template` les gère automatiquement, 0 code spécifique côté API**
- Signature : **5 templates signables** (autorisation_image, decharge_responsabilite, lettre_decharge_responsabilite, charte_formateur, contrat_engagement_stagiaire) → ajout à `SIGNATURE_BATCH_SUPPORTED_DOC_TYPES`
- Validation : **`qualiopiBlocking: false`** par défaut sur les secondaires (vs true sur les officiels)
- Stockage : **réutilise `formation_convention_documents`** identique aux officiels (1 row par session+doc+owner)

## 3. Scope

### Dans le scope h-22 (MVP)

1. **Brancher les 23 templates fantômes** au registry `SYSTEM_TEMPLATES_BY_DOC_TYPE` avec `ownerType` adapté (learner / trainer / session) et `qualiopiBlocking: false`.
2. **Étendre l'union TypeScript `DocumentType`** avec les 23 nouveaux types snake_case.
3. **Migration SQL** : étendre la `CHECK constraint formation_convention_documents_doc_type_check` avec les 23 valeurs.
4. **Étendre les 3 maps UI** du `TabConventionDocs` : `DOC_LABELS` (label long), `DOC_BADGE_COLORS` (badge), `DOC_SHORT` (label compact), `DOC_BORDER_COLORS`.
5. **Nouvelle UI "Ajouter doc secondaire"** :
   - Bouton "+ Ajouter document secondaire" dans `TabConventionDocs` (visible aux roles admin/super_admin)
   - Ouvre un `Dialog` shadcn avec :
     - Combobox `Command` shadcn searchable filtrant les 23 templates par nom
     - 4 sections de catégories visuelles (Habilitation électrique, Attestations métier, Documents administratifs, Pédagogie / Évaluation)
     - Multi-sélection par checkboxes + bouton "Attribuer (N)" en bas
     - Aperçu hover du nom long + description courte si dispo
6. **Constante exportée `SECONDARY_TEMPLATE_CATEGORIES`** : objet mappant `doc_type → { category, label, icon }` pour piloter le rendu UI.
7. **Étendre `SIGNATURE_BATCH_SUPPORTED_DOC_TYPES`** avec les 5 secondaires signables.
8. **Étendre `EmailAttachmentDescriptor`** (union dans `email-queue.ts`) avec les 23 nouveaux types — payload `{ session_id, owner_id }` selon ownerType.
9. **Étendre `FILENAME_LABELS`** (email-attachments-resolver.ts) pour des noms de fichiers PDF lisibles.

### Hors scope h-22 (vagues 2/3 — stories séparées si demande)

- **Default packs par type de formation** (auto-attribution si formation taggée "Habilitation électrique" → propose 3 templates par défaut). Story h-23 candidate.
- **Variables custom métier** (niveau habilitation, date validité, etc.) avec dialog au moment de la génération.
- **Templates favoris Loris** persistés en profil.
- **Templates personnalisés par client** (variante par EHPAD X).
- **Versioning des templates** + édition inline.
- **Statistiques d'usage** "Top 5 templates secondaires".
- **Inférence automatique par titre formation** (NLP).
- **Import bulk de templates depuis Word/PDF** avec OCR.
- **Inclusion dans `FALLBACK_TO_ENTITY_FIELD`** (validator Qualiopi) — les secondaires sont `qualiopiBlocking: false` donc pas pertinent.

## 4. Acceptance Criteria (Given/When/Then)

### AC-1 — Les 23 templates sont génération-ready via le registry

- **Given** je suis admin/super_admin sur une session de formation
- **When** je fais un POST `/api/documents/generate-from-template` avec `doc_type = "attestation_aipr"` (ou n'importe lequel des 23)
- **Then** la route appelle `renderSystemTemplate(docType, data)` qui trouve le template, résout les variables, et retourne le PDF (via Puppeteer ou CloudConvert selon engine)
- **And** aucune erreur 404 "template inconnu"
- **And** le PDF généré est cohérent (mêmes patterns de variables `[%Var%]` que les officiels)

### AC-2 — Migration SQL accepte les 23 nouveaux doc_types

- **Given** la migration SQL `h-22-add-secondary-doc-types.sql` est exécutée dans Supabase Dashboard
- **When** je fais un INSERT dans `formation_convention_documents` avec `doc_type = "decharge_responsabilite"` (ou les 22 autres)
- **Then** l'INSERT réussit sans violation du CHECK constraint
- **And** la query `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'formation_convention_documents_doc_type_check'` affiche les 23 nouveaux types

### AC-3 — Bouton "+ Ajouter document secondaire" visible et fonctionnel

- **Given** je suis sur `/admin/formations/[id]?tab=documents` en tant qu'admin ou super_admin
- **When** je regarde la `TabConventionDocs`
- **Then** je vois un bouton `+ Ajouter document secondaire` placé à un endroit cohérent avec le pattern existant (probablement à côté du "Ajouter un document personnalisé" déjà présent ou en remplacement)
- **And** un clic ouvre un `Dialog` shadcn intitulé "Documents secondaires disponibles"

### AC-4 — Dialog catalogue : recherche + catégories + multi-sélection

- **Given** le Dialog est ouvert
- **When** je regarde son contenu
- **Then** je vois :
  - Un champ recherche (Combobox `Command` shadcn) en haut, placeholder "Rechercher un document..."
  - 4 sections collapsibles ou en grid : "🔌 Habilitation électrique", "📜 Attestations métier", "📋 Documents administratifs", "📊 Pédagogie / Évaluation"
  - Chaque template a une checkbox + son label long + un mini-badge "Signable" si signable
  - Un footer du Dialog avec bouton "Annuler" + bouton "Attribuer (N)" (N = nb sélectionnés)
- **When** je tape "aipr" dans la recherche
- **Then** seul le template "Attestation AIPR" reste visible
- **When** je sélectionne 3 templates et clique "Attribuer (3)"
- **Then** 3 INSERT sont faits dans `formation_convention_documents` (un par template, status `brouillon`)
- **And** le Dialog se ferme
- **And** la TabConventionDocs se rafraîchit et affiche les 3 nouveaux docs sous leur section appropriée (trainer / learner / session)

### AC-5 — Templates correctement catégorisés et labellisés

- **Given** la constante `SECONDARY_TEMPLATE_CATEGORIES` est exportée depuis un nouveau fichier `src/lib/templates/secondary-categories.ts`
- **When** j'inspecte sa structure
- **Then** elle mappe chacun des 23 doc_types à `{ category: "habilitation" | "attestation_metier" | "administratif" | "evaluation", label: string, icon: string }`
- **And** dans le Dialog UI, chaque template apparaît sous sa catégorie correcte
- **And** dans `DOC_LABELS` du `TabConventionDocs`, le label long est correct (ex: `attestation_aipr: "ATTESTATION AIPR"`)

### AC-6 — 5 templates signables s'intègrent au flow signature batch

- **Given** j'ai attribué le template `autorisation_image` à une session avec 10 apprenants
- **When** je clique sur "Demander signature à tous" depuis `TabConventionDocs` (bouton existant pour les officiels signables)
- **Then** le bouton est visible et actif pour `autorisation_image` (parce que dans `SIGNATURE_BATCH_SUPPORTED_DOC_TYPES`)
- **And** la route `/api/documents/signature-request-batch` crée 10 magic links + envoie 10 emails (réutilise le flow existant)
- **And** chaque apprenant peut signer via `/sign/<token>` (route existante)
- **And** le statut du doc passe de `brouillon` → `envoyé` → `signé` par apprenant

### AC-7 — Génération en batch fonctionne

- **Given** j'ai attribué 5 templates secondaires à une session avec apprenants/clients/trainer
- **When** je clique sur "Tout générer" (bouton existant)
- **Then** les 5 PDFs sont générés via `/api/documents/generate-from-template` en parallèle
- **And** les PDFs sont stockés dans Supabase Storage (bucket existant)
- **And** la TabConventionDocs reflète le statut de chaque doc

### AC-8 — Zéro régression sur les 13 officiels

- **Given** les 13 doc_types officiels existants (convocation, certificat_realisation, etc.)
- **When** je teste manuellement la TabConventionDocs après cette story
- **Then** ils s'affichent exactement comme avant (mêmes couleurs, mêmes labels, mêmes actions)
- **And** la génération PDF de chacun fonctionne sans dégradation
- **And** le flow signature batch sur convention_entreprise + convention_intervention reste opérationnel

## 5. Tasks / Subtasks

- [ ] **Task 1 — Étendre le registry SYSTEM_TEMPLATES_BY_DOC_TYPE** (AC-1)
  - [ ] Importer les 23 templates fantômes dans `src/lib/templates/registry.ts` (23 paires `_HTML` + `_FOOTER_TEMPLATE`)
  - [ ] Ajouter 23 entrées au mapping avec `ownerType` et `qualiopiBlocking: false`
  - [ ] Mapping owner type :
    - learner : `avis_hab_elec_*` (9), `attestation_aipr`, `attestation_competences`, `attestation_abandon_formation`, `certificat_travail_hauteur`, `certificat_diplome`, `autorisation_image`, `decharge_responsabilite`, `lettre_decharge_responsabilite`, `contrat_engagement_stagiaire`
    - trainer : `charte_formateur`
    - session : `bilan_poe`, `reponses_evaluations`, `reponses_satisfaction_session`, `resultats_evaluations`
- [ ] **Task 2 — Étendre l'union TypeScript DocumentType** (AC-1)
  - [ ] Modifier `src/lib/types/index.ts` ligne ~451
  - [ ] Ajouter les 23 nouveaux types snake_case dans l'union
- [ ] **Task 3 — Migration SQL** (AC-2)
  - [ ] Créer `supabase/migrations/h-22-add-secondary-doc-types.sql`
  - [ ] DROP + CREATE de la CHECK constraint avec les 23 nouvelles valeurs (+ les 13 existantes + `custom`)
  - [ ] Inclure pre-check (count existing rows) + post-check (pg_get_constraintdef)
  - [ ] À exécuter manuellement dans Supabase Dashboard après merge
- [ ] **Task 4 — Constante SECONDARY_TEMPLATE_CATEGORIES** (AC-5)
  - [ ] Créer `src/lib/templates/secondary-categories.ts`
  - [ ] Exporter `SECONDARY_DOC_TYPES: readonly DocumentType[]` (les 23 keys)
  - [ ] Exporter `SECONDARY_TEMPLATE_CATEGORIES: Record<DocumentType, { category, label, icon, description? }>`
  - [ ] Exporter `SECONDARY_CATEGORY_LABELS: Record<Category, { label, icon }>` pour les sections du Dialog
- [ ] **Task 5 — Étendre les maps UI TabConventionDocs** (AC-5, AC-8)
  - [ ] `DOC_LABELS` : ajouter les 23 labels longs (ex: `attestation_aipr: "ATTESTATION AIPR"`)
  - [ ] `DOC_BADGE_COLORS` : ajouter les 23 entrées (vert pour attestations, ambre pour habilitation, gris pour admin, bleu pour évaluation)
  - [ ] `DOC_SHORT` : ajouter les 23 entrées (max 12 chars)
  - [ ] `DOC_BORDER_COLORS` : ajouter les 23 entrées
- [ ] **Task 6 — Nouveau composant `SecondaryDocCatalogDialog`** (AC-3, AC-4)
  - [ ] Créer `src/app/(dashboard)/admin/formations/[id]/_components/SecondaryDocCatalogDialog.tsx`
  - [ ] Props : `{ open, onOpenChange, formationId, onAttributed: (docTypes: DocumentType[]) => void }`
  - [ ] Utilise `Dialog`, `Command` (shadcn), `Checkbox`, `Button` shadcn
  - [ ] Search input filtrant en client (les 23 templates en memory)
  - [ ] 4 sections déroulées par défaut, ordre : Habilitation > Attestations > Admin > Évaluation
  - [ ] Footer fixe avec bouton "Attribuer (N)" disabled si N=0
  - [ ] Au submit : POST `/api/documents/attribute-secondary` avec `{ formationId, docTypes }`
- [ ] **Task 7 — Nouvelle route API `/api/documents/attribute-secondary`** (AC-4)
  - [ ] Créer `src/app/api/documents/attribute-secondary/route.ts`
  - [ ] POST : body Zod `{ formationId: uuid, docTypes: DocumentType[] }`
  - [ ] Pour chaque docType : INSERT row dans `formation_convention_documents` avec status `brouillon`, owner_type = registry.ownerType
  - [ ] Si ownerType = learner → 1 row par learner de la session
  - [ ] Si ownerType = trainer → 1 row par trainer de la session
  - [ ] Si ownerType = session → 1 row pour la session
  - [ ] Validation entity_id + role admin/super_admin
  - [ ] Retour `{ created: number, docTypes: DocumentType[] }`
- [ ] **Task 8 — Brancher le bouton dans TabConventionDocs** (AC-3)
  - [ ] Ajouter état `secondaryDialogOpen` à `TabConventionDocs.tsx`
  - [ ] Ajouter bouton "+ Ajouter document secondaire" à côté ou en remplacement de "Ajouter un document personnalisé"
  - [ ] Render `<SecondaryDocCatalogDialog open={...} formationId={formation.id} onAttributed={refresh} />`
  - [ ] `onAttributed` appelle `onRefresh()` du parent pour recharger les docs
- [ ] **Task 9 — Étendre SIGNATURE_BATCH_SUPPORTED_DOC_TYPES** (AC-6)
  - [ ] Modifier `src/lib/utils/batch-doc-signature-request.ts`
  - [ ] Ajouter au Set : `autorisation_image`, `decharge_responsabilite`, `lettre_decharge_responsabilite`, `charte_formateur`, `contrat_engagement_stagiaire`
  - [ ] Mettre à jour le test `batch-doc-signature-request.test.ts` : size 2 → 7 + expectations
- [ ] **Task 10 — Étendre EmailAttachmentDescriptor** (AC-7)
  - [ ] Modifier `src/lib/services/email-queue.ts`
  - [ ] Ajouter 23 nouveaux discriminators à l'union `EmailAttachmentDescriptor`
  - [ ] Payload selon ownerType (`session_id + learner_id` ou `+ trainer_id` ou juste `session_id`)
  - [ ] Mettre à jour le worker `/api/emails/process-scheduled` (vérifier si déjà generic via `renderSystemTemplate` ou s'il faut switch cases)
- [ ] **Task 11 — Étendre FILENAME_LABELS** (AC-7)
  - [ ] Modifier `src/lib/services/email-attachments-resolver.ts`
  - [ ] Ajouter 23 entrées avec noms de fichiers PDF lisibles (ex: `attestation_aipr: "Attestation-AIPR"`)
- [ ] **Task 12 — Tests + validation** (AC-1 à AC-8)
  - [ ] `npx tsc --noEmit` : 0 erreur
  - [ ] `npx vitest run` : tous les tests existants passent + le test batch-doc-signature mis à jour (taille set = 7)
  - [ ] Smoke manuel par Wissam après merge :
    - Aller sur `/admin/formations/[id]?tab=documents`
    - Cliquer "+ Ajouter document secondaire"
    - Vérifier les 4 sections + search
    - Sélectionner 2-3 templates → vérifier qu'ils apparaissent dans la liste après attribution
    - Générer un PDF → vérifier rendu
    - (Si template signable) Envoyer signature batch → vérifier email reçu + /sign/<token>
- [ ] **Task 13 — Commit + push + MAJ sprint-status**
  - [ ] Commits structurés par concern (feat code + chore migration + docs story)
  - [ ] Push origin/main
  - [ ] MAJ `bmad_output/implementation-artifacts/sprint-status.yaml` : `h-22 → review` après dev

## 6. Dev Notes

### 6.1 — Architecture du code existant à respecter

**Fichier registry à étendre** : [src/lib/templates/registry.ts](src/lib/templates/registry.ts:81-164) — ligne 81 à 164, le mapping `SYSTEM_TEMPLATES_BY_DOC_TYPE`. Pattern à reproduire identique pour chaque nouveau template :

```ts
import {
  ATTESTATION_AIPR_HTML,
  ATTESTATION_AIPR_FOOTER_TEMPLATE,
} from "./attestation-aipr";

// ...
attestation_aipr: {
  html: ATTESTATION_AIPR_HTML,
  footer: ATTESTATION_AIPR_FOOTER_TEMPLATE,
  ownerType: "learner",
  qualiopiBlocking: false,
},
```

Vérifier le nom exact des exports en lisant chaque fichier template (la convention est `<TEMPLATE_NAME>_HTML` et `<TEMPLATE_NAME>_FOOTER_TEMPLATE` mais peut varier pour les variantes hab élec — déjà observé `AVIS_HABILITATION_ELECTRIQUE_HTML` côté générique).

**Fichier types à étendre** : [src/lib/types/index.ts:451](src/lib/types/index.ts#L451) — ajouter les 23 keys snake_case à l'union `DocumentType` avant `| "custom"`.

**TabConventionDocs maps à étendre** : [src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx](src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx) — 4 maps à étendre (`DOC_BORDER_COLORS`, `DOC_BADGE_COLORS`, `DOC_SHORT`, `DOC_LABELS`) lignes 60-124.

### 6.2 — Liste complète des 23 templates fantômes avec mapping

| # | Fichier template | doc_type cible | ownerType | Signable | Catégorie | Label long |
|---|---|---|---|---|---|---|
| 1 | avis-habilitation-electrique.ts | avis_hab_elec_generique | learner | non | habilitation | AVIS HABILITATION ÉLECTRIQUE |
| 2 | avis-habilitation-electrique-b0-bf-bs.ts | avis_hab_elec_b0_bf_bs | learner | non | habilitation | AVIS HAB. ÉLEC. B0/BF/BS |
| 3 | avis-habilitation-electrique-b1v-b2v-br.ts | avis_hab_elec_b1v_b2v_br | learner | non | habilitation | AVIS HAB. ÉLEC. B1V/B2V/BR |
| 4 | avis-habilitation-electrique-bf-hf.ts | avis_hab_elec_bf_hf | learner | non | habilitation | AVIS HAB. ÉLEC. BF/HF |
| 5 | avis-habilitation-electrique-bt-ht.ts | avis_hab_elec_bt_ht | learner | non | habilitation | AVIS HAB. ÉLEC. BT/HT |
| 6 | avis-habilitation-electrique-bt.ts | avis_hab_elec_bt | learner | non | habilitation | AVIS HAB. ÉLEC. BT |
| 7 | avis-habilitation-electrique-h0-b0.ts | avis_hab_elec_h0_b0 | learner | non | habilitation | AVIS HAB. ÉLEC. H0/B0 |
| 8 | avis-habilitation-electrique-h0-b0-bf-hf-bs.ts | avis_hab_elec_h0_b0_bf_hf_bs | learner | non | habilitation | AVIS HAB. ÉLEC. H0/B0/BF/HF/BS |
| 9 | avis-habilitation-electrique-h0-b0-initial.ts | avis_hab_elec_h0_b0_initial | learner | non | habilitation | AVIS HAB. ÉLEC. H0/B0 INITIAL |
| 10 | attestation-aipr.ts | attestation_aipr | learner | non | attestation_metier | ATTESTATION AIPR |
| 11 | attestation-competences.ts | attestation_competences | learner | non | attestation_metier | ATTESTATION DE COMPÉTENCES |
| 12 | attestation-abandon-formation.ts | attestation_abandon_formation | learner | non | attestation_metier | ATTESTATION D'ABANDON DE FORMATION |
| 13 | certificat-travail-hauteur.ts | certificat_travail_hauteur | learner | non | attestation_metier | CERTIFICAT TRAVAIL EN HAUTEUR |
| 14 | certificat-diplome.ts | certificat_diplome | learner | non | attestation_metier | CERTIFICAT DIPLÔME |
| 15 | autorisation-image.ts | autorisation_image | learner | **oui** | administratif | AUTORISATION DROIT À L'IMAGE |
| 16 | decharge-responsabilite.ts | decharge_responsabilite | learner | **oui** | administratif | DÉCHARGE DE RESPONSABILITÉ |
| 17 | lettre-decharge-responsabilite.ts | lettre_decharge_responsabilite | learner | **oui** | administratif | LETTRE DÉCHARGE DE RESPONSABILITÉ |
| 18 | charte-formateur.ts | charte_formateur | trainer | **oui** | administratif | CHARTE FORMATEUR |
| 19 | contrat-engagement-stagiaire.ts | contrat_engagement_stagiaire | learner | **oui** | administratif | CONTRAT D'ENGAGEMENT STAGIAIRE |
| 20 | bilan-poe.ts | bilan_poe | session | non | evaluation | BILAN POE |
| 21 | reponses-evaluations.ts | reponses_evaluations | session | non | evaluation | RÉPONSES AUX ÉVALUATIONS |
| 22 | reponses-satisfaction-session.ts | reponses_satisfaction_session | session | non | evaluation | RÉPONSES SATISFACTION SESSION |
| 23 | resultats-evaluations.ts | resultats_evaluations | session | non | evaluation | RÉSULTATS DES ÉVALUATIONS |

### 6.3 — Pattern UI : Dialog + Command shadcn

Pattern shadcn `Command` (combobox searchable) est déjà utilisé ailleurs dans le projet — vérifier les utilisations existantes via `grep -rn "from \"@/components/ui/command\"" src/`. Le composant supporte :
- `<Command>` racine
- `<CommandInput>` champ recherche
- `<CommandList>` conteneur
- `<CommandGroup heading="...">` section
- `<CommandItem>` item sélectionnable
- `<CommandEmpty>` état vide

Pour la multi-sélection avec Checkbox dans CommandItem, voir h-20 où on a fait quelque chose de similaire avec `Select` + `SelectGroup` + `SelectLabel`. Pour h-22 le pattern Command est plus adapté car catalogue plus large.

### 6.4 — Route API attribute-secondary : pattern d'INSERT batch

```ts
// Squelette
const schema = z.object({
  formationId: z.string().uuid(),
  docTypes: z.array(z.string()).min(1).max(50),
});

// Pour chaque docType :
const tmpl = getSystemTemplate(docType);
if (!tmpl) return 400;

// Récupérer les owners selon ownerType
let owners: { type: string; id: string }[] = [];
if (tmpl.ownerType === "learner") {
  // SELECT learners de la session
} else if (tmpl.ownerType === "trainer") {
  // SELECT trainers via formation_trainers
} else { // session
  owners = [{ type: "session", id: formationId }];
}

// 1 INSERT par owner
for (const owner of owners) {
  await supabase.from("formation_convention_documents").insert({
    session_id: formationId,
    doc_type: docType,
    owner_type: tmpl.ownerType,
    owner_id: owner.id,
    status: "brouillon",
    entity_id: profile.entity_id, // règle CLAUDE.md 2
  });
}
```

**Attention règles CLAUDE.md** :
- Règle 2 : entity_id obligatoire sur chaque insert ✓
- Règle 5 : try/catch + toast sur le call frontend ✓
- Règle 10 : pas d'inline Supabase dans le composant — utiliser fetch vers l'API qu'on crée ✓

### 6.5 — Migration SQL : pattern h-20 à reproduire

Voir [supabase/migrations/drop_contrat_sous_traitance.sql](supabase/migrations/drop_contrat_sous_traitance.sql) du 2026-05-18 (commit `eec6829`) qui a refait la CHECK constraint après suppression de `contrat_sous_traitance`. Pattern :

```sql
-- Pre-check (sécurité)
SELECT count(*) FROM formation_convention_documents
WHERE doc_type NOT IN (<liste actuelle>);

-- DROP + CREATE avec la nouvelle liste
ALTER TABLE formation_convention_documents
  DROP CONSTRAINT IF EXISTS formation_convention_documents_doc_type_check;

ALTER TABLE formation_convention_documents
  ADD CONSTRAINT formation_convention_documents_doc_type_check
  CHECK (doc_type IN (
    -- 13 officiels existants
    'convocation', 'certificat_realisation', 'attestation_assiduite',
    'feuille_emargement', 'feuille_emargement_collectif',
    'micro_certificat', 'planning_semaine',
    'cgv', 'politique_confidentialite', 'reglement_interieur', 'programme_formation',
    'convention_entreprise', 'convention_intervention',
    -- 23 nouveaux secondaires h-22
    'avis_hab_elec_generique', 'avis_hab_elec_b0_bf_bs', 'avis_hab_elec_b1v_b2v_br',
    'avis_hab_elec_bf_hf', 'avis_hab_elec_bt_ht', 'avis_hab_elec_bt',
    'avis_hab_elec_h0_b0', 'avis_hab_elec_h0_b0_bf_hf_bs', 'avis_hab_elec_h0_b0_initial',
    'attestation_aipr', 'attestation_competences', 'attestation_abandon_formation',
    'certificat_travail_hauteur', 'certificat_diplome',
    'autorisation_image', 'decharge_responsabilite', 'lettre_decharge_responsabilite',
    'charte_formateur', 'contrat_engagement_stagiaire',
    'bilan_poe', 'reponses_evaluations', 'reponses_satisfaction_session', 'resultats_evaluations',
    -- custom
    'custom'
  ));

-- Post-check
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conname = 'formation_convention_documents_doc_type_check';
```

### 6.6 — Previous Story Intelligence (h-19 / h-20 / h-21)

Patterns récents Epic H confirmés :
- **Commits Epic H = small, focused, P0 d'abord** : un seul sujet par commit, message bilingue rigoureux, co-author Claude Opus 4.7
- **`npx tsc --noEmit` avant chaque commit** : convention projet, échec = blocking
- **Test snapshots stables** depuis b0af85e (date figée dans `beforeAll`) — h-22 ne touche pas aux templates donc pas d'impact direct, mais ajouter les nouveaux dans le test snapshot si on a le temps
- **Migrations SQL toujours dans `supabase/migrations/`** avec pre-check + post-check, exécutées MANUELLEMENT dans le Dashboard par Wissam (pas auto)
- **Pas de hook `dev-server` automatique** : Wissam fait le smoke prod après deploy Netlify (~2-5 min)

### 6.7 — Git Intelligence (5 derniers commits)

```
eec6829 chore(documents): suppression du doc_type contrat_sous_traitance (doublon) (Epic H)
7cedc82 fix(documents): redirection dialog Qualiopi pour Coût formateur (Epic H)
8f0808f chore(crm): h-20 migration SQL backfill assigned_to depuis created_by (Epic H)
23702ec fix(crm): h-20 hotfix v2 cap Supabase 1000 rows (stats + counts faux) (Epic H)
1754b9d fix(crm): h-20 hotfix bugs onglet tâches (counts dropdown + tabs vides) (Epic H)
```

Le commit `eec6829` (suppression contrat_sous_traitance) est le pattern direct à reproduire pour la migration SQL h-22. Le commit `7cedc82` (dialog Qualiopi pour Coût formateur) montre le bon pattern pour modifier `IncompleteDataDialog` si on veut ajouter des labels pour des templates h-22 — mais comme tous nos secondaires sont `qualiopiBlocking: false`, ce dialog ne s'affichera jamais pour eux. Pas d'action requise sur IncompleteDataDialog.

### 6.8 — Project Context Reference

- `CLAUDE.md` règles 1-10 (notamment règles 2 "entity_id sur chaque query", 9 "shadcn/ui obligatoire", 10 "Supabase via src/lib/services/ pas inline")
- `_bmad/bmm/config.yaml` : `document_output_language: French`, `user_skill_level: intermediate`
- `bmad_output/brainstorming/brainstorming-session-2026-05-19-0914.md` : contexte stratégique complet de la session brainstorming source

### 6.9 — Risques + mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Noms d'exports HTML/FOOTER inconsistants entre les 23 templates | Moyenne | Build break | Lire chaque fichier avant import dans registry, vérifier le nom exact |
| Variables `[%Var%]` manquantes dans les templates secondaires | Moyenne | PDF avec placeholders visibles | OK car `qualiopiBlocking: false` — pas de blocage 422. Logguer warning si match `\[%[^%]+%\]` dans PDF généré (post-MVP) |
| Catalog UI trop chargé (23 items + multi-sélection) | Faible | UX confuse | 4 catégories visuelles + search + ordre alphabétique au sein de chaque catégorie |
| Conflict avec story h-21 future (importeur Sellsy fix) | Faible | Rework léger | h-21 et h-22 touchent des fichiers différents (importeur vs registry/UI) — pas de conflict prévu |
| Migration SQL non exécutée → INSERT failent en prod | Moyenne | Bug majeur | Documenter clairement dans le commit, mettre une note au tooltip du bouton "+ Ajouter doc secondaire" si CHECK pas étendue (post-MVP) |

### 6.10 — Testing standards

- Tests unitaires : ajouter ou étendre `batch-doc-signature-request.test.ts` (taille set 2 → 7 après ajout des 5 signables h-22)
- Tests snapshots HTML : OPTIONNEL ajouter 23 nouveaux snapshots (~1h supplémentaire). Pour MVP, smoke manuel suffit
- Si DEV veut ajouter des tests unitaires sur la route `attribute-secondary` : pattern à reproduire = tests `automation-rules` ou `signature-request-batch` existants

## 7. References

- [Source: src/lib/templates/registry.ts:81-164] — mapping `SYSTEM_TEMPLATES_BY_DOC_TYPE` à étendre
- [Source: src/lib/templates/registry.ts:210] — fonction `renderSystemTemplate` qui consomme le registry
- [Source: src/lib/types/index.ts:451] — union `DocumentType` à étendre
- [Source: src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx:60-124] — maps UI à étendre
- [Source: src/lib/utils/batch-doc-signature-request.ts] — `SIGNATURE_BATCH_SUPPORTED_DOC_TYPES` à étendre
- [Source: src/lib/services/email-queue.ts:39-48] — `EmailAttachmentDescriptor` à étendre
- [Source: src/lib/services/email-attachments-resolver.ts:29-37] — `FILENAME_LABELS` à étendre
- [Source: src/components/ui/command.tsx] — composant Combobox shadcn à utiliser
- [Source: supabase/migrations/drop_contrat_sous_traitance.sql] — pattern migration à reproduire
- [Source: bmad_output/brainstorming/brainstorming-session-2026-05-19-0914.md] — contexte stratégique complet
- [Source: CLAUDE.md] — règles projet absolues

## 8. Dev Agent Record

### Agent Model Used

À renseigner par le dev agent (probablement `claude-opus-4-7[1m]` via bmad-dev-story).

### Debug Log References

À renseigner pendant l'implémentation.

### Completion Notes

À renseigner pendant l'implémentation.

### File List

**Created (estimé)** :
- `src/lib/templates/secondary-categories.ts` (~80 LOC)
- `src/app/(dashboard)/admin/formations/[id]/_components/SecondaryDocCatalogDialog.tsx` (~180 LOC)
- `src/app/api/documents/attribute-secondary/route.ts` (~120 LOC)
- `supabase/migrations/h-22-add-secondary-doc-types.sql` (~60 LOC)

**Modified (estimé)** :
- `src/lib/templates/registry.ts` (+23 imports + 23 entries ~80 LOC)
- `src/lib/types/index.ts` (+23 entries dans l'union ~10 LOC)
- `src/app/(dashboard)/admin/formations/[id]/_components/TabConventionDocs.tsx` (+~80 LOC : 4 maps × 23 entries + bouton + state + dialog)
- `src/lib/utils/batch-doc-signature-request.ts` (+5 entries ~5 LOC)
- `src/lib/utils/__tests__/batch-doc-signature-request.test.ts` (~10 LOC pour test ajusté)
- `src/lib/services/email-queue.ts` (+~25 LOC pour 23 nouveaux discriminators)
- `src/lib/services/email-attachments-resolver.ts` (+~25 LOC pour FILENAME_LABELS)
- `bmad_output/implementation-artifacts/sprint-status.yaml` (MAJ status h-22 → review)

**Total estimé** : ~700 LOC créés + ~150 LOC modifiés = **~850 LOC** sur ~7 fichiers nouveaux + ~8 modifiés.

### Change Log

| Date | Description |
|---|---|
| 2026-05-19 | Story h-22 créée via bmad-create-story (Claude Opus 4.7). Source : brainstorming-session-2026-05-19-0914.md Phase 4. Scope MVP figé : brancher 23 templates fantômes au registry + UI catalogue searchable + 5 templates signables + migration SQL CHECK. Hors scope : défaut packs par type formation, variables custom métier, favoris, etc. (vagues 2/3). Effort estimé 3-4 j-h. |

## 9. Questions ouvertes pour le dev

1. **Noms exacts des exports HTML/FOOTER dans les fichiers secondaires** : doit être vérifié au moment de l'import dans le registry (la convention `<TEMPLATE_NAME>_HTML` et `_FOOTER_TEMPLATE` n'est pas garantie pour les 23 — certains anciens fichiers peuvent avoir des noms divergents). Action dev : `grep -rn "^export const" src/lib/templates/*.ts | grep -E "(HTML|FOOTER)"` avant Task 1.

2. **Variables manquantes** : certains templates secondaires utilisent peut-être des `[%Var%]` qui n'existent pas encore dans le resolver (`src/lib/utils/resolve-variables.ts`). Si c'est le cas, le PDF sortira avec des `[%Var%]` visibles (acceptable car `qualiopiBlocking: false`) mais à logguer. Solution v1 : ne pas bloquer. Solution v2 (h-23 candidate) : étendre le resolver.

3. **Bouton "Ajouter un document personnalisé" actuel** : faut-il le garder en plus du nouveau "+ Ajouter doc secondaire" ? Réponse pragmatique : oui (custom permet upload de PDF Word, c'est différent du catalogue de templates système). Mais à valider visuellement avec Loris au smoke.

4. **Multi-sélection vs sélection unique** : le Dialog propose multi (checkboxes). Si Loris préfère 1-à-la-fois (clic = ajoute immédiatement), simpler côté code mais plus de clics pour lui. Default proposé : multi-sélection. À valider après smoke.

5. **Ordre des sections** : Habilitation > Attestations > Admin > Évaluation. Inversable selon les préférences UX de Loris. À valider après smoke.

6. **Variantes "avis-habilitation-electrique-*"** : 9 variantes très proches. Loris pourrait préférer une UX différente (1 entrée "Avis Habilitation électrique" + dropdown sous-type) au lieu de 9 items dans le catalogue. Risque : refactor non trivial des templates. Default proposé : 9 entrées séparées (simple, pas de refactor template). À ajuster si Loris se plaint après smoke.
