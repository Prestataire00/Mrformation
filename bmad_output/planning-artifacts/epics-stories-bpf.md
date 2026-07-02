# Epics & Stories — Module BPF (Bilan Pédagogique et Financier)

**Réf. cadrage :** `cadrage-module-bpf.md` (v2 — enrichi blocs 1-4)
**Effort total estimé :** 6.5 j-h
**Patterns :** service layer, migrations idempotentes, TDD sur les helpers de calcul

---

## Epic BPF-1 — Qualification des données (~2 j-h)

### Story BPF-1.1 : Migration des champs + enums + types TS

**Effort :** 0.5 j-h

**Description :** Ajouter les champs de qualification BPF dans la base et les types TypeScript correspondants.

**Files :**
- Create : `supabase/migrations/bpf_qualification_fields.sql`
- Modify : `src/lib/types/index.ts` (interfaces Session, Enrollment, Invoice)
- Modify : `src/lib/bpf-enums.ts` (ajouter `BPF_TRAINEE_TYPE_VALUES`)
- Modify : `src/lib/bpf-labels.ts` (labels FR pour bpf_trainee_type)

**FRs :**
- FR-1.1.1 : `formation_invoices.invoice_date DATE NOT NULL DEFAULT CURRENT_DATE` + backfill `created_at::date`
- FR-1.1.2 : `formation_invoices.invoice_date_confirmed BOOLEAN DEFAULT TRUE` + backfill `FALSE` pour `external_reference IS NOT NULL`, `TRUE` pour les natives
- FR-1.1.3 : `enrollments.bpf_trainee_type TEXT DEFAULT 'salarie_prive'` CHECK 5 valeurs
- FR-1.1.4 : Backfill `bpf_trainee_type` depuis `learners.learner_type` (mapping salarie→salarie_prive, etc.)
- FR-1.1.5 : `sessions.is_subcontracted_to_other_of BOOLEAN DEFAULT FALSE`
- FR-1.1.6 : Types TS mis à jour (Session, Enrollment, FormationInvoice)
- FR-1.1.7 : `BPF_TRAINEE_TYPE_VALUES` + labels FR dans `bpf-enums.ts` / `bpf-labels.ts`
- FR-1.1.8 : Migration idempotente (`ADD COLUMN IF NOT EXISTS`)

**ACs :**

```gherkin
Given la migration est exécutée sur une base avec des données existantes
When je vérifie formation_invoices
Then toutes les factures ont invoice_date = created_at::date
And les 599 factures importées ont invoice_date_confirmed = false
And les 18 factures natives ont invoice_date_confirmed = true

Given un apprenant avec learner_type = 'salarie' inscrit à 2 sessions
When la migration backfill s'exécute
Then ses 2 enrollments ont bpf_trainee_type = 'salarie_prive'

Given la migration est rejouée (idempotence)
When les colonnes existent déjà
Then aucune erreur, les données ne sont pas écrasées
```

---

### Story BPF-1.2 : Intégration des champs dans les écrans existants

**Effort :** 1.5 j-h

**Description :** Ajouter les champs de qualification BPF dans les formulaires existants avec défauts intelligents.

**Files :**
- Modify : `src/app/(dashboard)/admin/formations/[id]/_components/TabFinances.tsx` (invoice_date + invoice_date_confirmed)
- Modify : `src/app/(dashboard)/admin/formations/[id]/_components/sections/ResumeLearners.tsx` (bpf_trainee_type)
- Modify : `src/app/(dashboard)/admin/formations/[id]/_components/TabResume.tsx` ou section session (is_subcontracted_to_other_of)
- Modify : formulaire training (bpf_objective — vérifier si déjà intégré)
- Modify : `src/app/api/formations/[id]/invoices/route.ts` (accepter invoice_date)

**FRs :**
- FR-1.2.1 : **TabFinances** — champ `Date d'émission` (date picker) dans le dialog de création/édition de facture. Défaut : aujourd'hui. Affiché avant `Échéance`. L'API POST/PATCH accepte et sauvegarde `invoice_date`. Les factures natives créées dans le LMS ont `invoice_date_confirmed = true` automatiquement.
- FR-1.2.2 : **ResumeLearners** — select `Type de stagiaire (BPF)` dans le dialog d'ajout d'apprenant. Options : Salarié privé (défaut), Apprenti, Demandeur d'emploi, Particulier, Autre. Sauvegardé sur l'enrollment, pas le learner.
- FR-1.2.3 : **Section session** — checkbox `Formation sous-traitée à un autre organisme (BPF cadre F-2)` dans les métadonnées de la session. Défaut : décoché. Tooltip : "Cochez si la formation est dispensée par un AUTRE organisme pour votre compte. Ne pas confondre avec les formateurs sous-traitants."
- FR-1.2.4 : **Formulaire training** — select `Objectif BPF` (vérifier si déjà intégré avant d'agir).
- FR-1.2.5 : L'API invoices accepte `invoice_date` dans le POST et le PATCH. Si absent dans le POST, défaut = `CURRENT_DATE`.

**ACs :**

```gherkin
Given je crée une facture dans TabFinances
When je ne modifie pas la date d'émission
Then invoice_date = date du jour
And invoice_date_confirmed = true (facture native)

Given j'ajoute un apprenant à une formation
When le dialog d'ajout s'ouvre
Then le champ "Type de stagiaire (BPF)" est pré-rempli à "Salarié privé"
And je peux le changer avant validation
And la valeur est sauvegardée sur l'enrollment, pas le learner

Given je coche "Formation sous-traitée à un autre organisme" sur une session
When je sauvegarde
Then sessions.is_subcontracted_to_other_of = true
And un tooltip explique la distinction avec les formateurs sous-traitants
```

---

## Epic BPF-2 — Calcul & Rapport (~4.5 j-h)

### Story BPF-2.1 : Service layer + helpers de calcul par cadre (TDD obligatoire)

**Effort :** 1.5 j-h

**Description :** Créer le service layer `bpf-report-service.ts` et adapter `bpf-calculator.ts` pour calculer chaque cadre depuis les bonnes sources, avec découpe année civile, split fiable/à vérifier, et détection des trous.

**Files :**
- Modify : `src/lib/bpf-calculator.ts` (adapter `computeSectionC` : invoices au lieu de quotes)
- Create : `src/lib/services/bpf-report-service.ts` (requêtes Supabase + orchestration)
- Modify : `src/lib/__tests__/bpf-calculator.test.ts` (adapter + ajouter tests)

**FRs :**
- FR-2.1.1 : `computeSectionC(invoices[])` — agrège par `funding_type` via `FUNDING_TO_LINE`, filtré par `invoice_date` dans l'année. Exclut `status = 'cancelled'`. Inclut les avoirs (montant négatif). **Split** : sépare le total en `fiable` (invoice_date_confirmed = true) et `a_verifier` (false).
- FR-2.1.2 : `computeSectionD(trainers[])` — split `agreed_cost_ht` par `is_external`. Fallback chain : `agreed_cost_ht` → `hourly_rate × computed_hours` → `trainer.hourly_rate × computed_hours` → 0.
- FR-2.1.3 : `computeSectionE(trainers[])` — count distinct formateurs + heures par interne/externe.
- FR-2.1.4 : `computeSectionF1(enrollments[], signatures[], timeSlots[])` — stagiaires par `bpf_trainee_type`, heures par créneaux signés dans l'année civile. Filtre `status != 'cancelled'` uniquement (les abandons en cours comptent).
- FR-2.1.5 : `computeSectionF2(...)` — idem F1, filtré par `is_subcontracted_to_other_of = true`. Les stagiaires F-2 comptent aussi dans F-1 (pas exclusifs).
- FR-2.1.6 : `computeSectionF3(...)` — stagiaires par `bpf_objective` du training.
- FR-2.1.7 : **Découpe année civile** — F1/F2/F3 filtrent par `EXTRACT(YEAR FROM ts.start_time) = year`. Un apprenant COUNT DISTINCT dans chaque année où il a des créneaux signés.
- FR-2.1.8 : **Fallback signatures legacy** — si `time_slot_id IS NULL` : `heures_imputées = session.computed_hours / nb_slots_total`. Année d'imputation = année de `signed_at`.
- FR-2.1.9 : `computeDataGaps(data)` — retourne :
  - Factures sans `funding_type` (count + liste)
  - Factures avec `invoice_date_confirmed = false` (count + liste)
  - Avoirs orphelins : avoir dont `parent_invoice_id` pointe vers une facture d'une année différente (count + liste avec explication)
  - Enrollments sans `bpf_trainee_type` null (count + liste)
  - Trainings sans `bpf_objective` (count + liste)
  - Sessions avec formateur sans coût (count + liste)
  - Signatures sans `time_slot_id` (count, info seulement)
- FR-2.1.10 : Service layer `fetchBPFData(supabase, entityId, year)` — requêtes Supabase centralisées, entity_id strict.
- FR-2.1.11 : Commentaire de documentation dans `bpf-report-service.ts` explicitant les 2 sémantiques "annulé" (cf. §4 du cadrage).

**ACs (TDD) :**

```gherkin
# Cadre C — base
Given 3 factures confirmées : entreprise_privee 1000€, cpf 500€, avoir entreprise_privee -200€
When computeSectionC(invoices)
Then fiable.line_1 = 800€, fiable.line_2e = 500€, total fiable = 1300€

# Cadre C — split fiable / à vérifier
Given 1 facture confirmée 1000€ + 1 facture non confirmée 500€, même funding_type
When computeSectionC(invoices)
Then fiable = 1000€, a_verifier = 500€

# Cadre C — funding_type null
Given 1 facture avec funding_type = null
When computeSectionC(invoices)
Then elle est comptée dans "non_classifie"
And dataGaps.invoices_sans_funding contient cette facture

# Cadre C — avoir à cheval sur 2 années
Given facture 1000€ funding_type=entreprise_privee invoice_date=déc année N
And avoir -1000€ parent_invoice_id=facture, invoice_date=jan année N+1
When computeSectionC pour année N
Then fiable.line_1 = 1000€
When computeSectionC pour année N+1
Then fiable.line_1 = -1000€
And dataGaps.avoirs_orphelins contient l'avoir avec explication

# Cadre F — Année civile
Given session nov 2026 → fév 2027, 40 créneaux (20 en 2026, 20 en 2027)
And apprenant a signé 30 créneaux (15 en 2026, 15 en 2027)
When computeSectionF1 pour année=2026
Then nb_stagiaires = 1, heures = somme des 15 créneaux 2026
When computeSectionF1 pour année=2027
Then nb_stagiaires = 1 (compté dans les 2 années)

# Cadre F — Abandon vs annulation
Given apprenant inscrit (status='registered'), signe 3 créneaux sur 10, puis abandonne
When computeSectionF1
Then il compte comme stagiaire, ses 3 créneaux signés comptent en heures
(l'abandon ne change pas le status enrollment)

Given apprenant annulé (status='cancelled')
When computeSectionF1
Then il est EXCLU (0 heure signée par construction, SIGNABLE_ENROLLMENT_STATUSES l'empêche)

# Signatures legacy
Given 1 signature time_slot_id=NULL, session de 35h, 10 créneaux, signed_at en 2026
When computeSectionF1 avec fallback prorata pour 2026
Then heures imputées = 35/10 = 3.5h
And dataGaps.signatures_legacy = 1

# Cadre D
Given formateur interne agreed_cost_ht=2000€
And formateur externe agreed_cost_ht=NULL, hourly_rate=50€, session 14h
When computeSectionD
Then salaires = 2000€, prestations = 700€

# Cadre F-2
Given 2 sessions, 1 avec is_subcontracted_to_other_of=true (5 apprenants)
When computeSectionF2
Then nb_stagiaires = 5
And ces 5 comptent aussi dans F1
```

---

### Story BPF-2.2 : Page rapport + DataGapsPanel éditable inline

**Effort :** 2 j-h

**Description :** Refactorer `BPFForm.tsx` pour utiliser le nouveau service layer. Le DataGapsPanel passe de lecture seule à **édition inline** : Loris traite tous les trous directement dans le rapport sans aller-retour écran par écran.

**Files :**
- Modify : `src/components/BPFForm.tsx` (remplacer requêtes inline par `fetchBPFData()`)
- Modify : `src/components/bpf/SectionC.tsx` (source = invoices, afficher split fiable/à vérifier)
- Modify : `src/components/bpf/SectionF2.tsx` (câbler sur données réelles)
- Create : `src/components/bpf/DataGapsPanel.tsx` (édition inline des 4 types de trous)
- Create : `src/lib/services/bpf-gaps-service.ts` (mutations pour corriger les trous via service layer)

**FRs :**
- FR-2.2.1 : Sélecteur d'année (défaut : année en cours). Chargement via `fetchBPFData()`.
- FR-2.2.2 : Cadres dans l'ordre exact du Cerfa 10443 : A, B, C, D, E, F-1, F-2, F-3, F-4, G, H.
- FR-2.2.3 : Cadre C affiche le total fiable ET une ligne "à vérifier (X factures importées)" séparée.
- FR-2.2.4 : Chaque valeur overridée manuellement (EditableCell) affiche un badge "Ajusté manuellement" + tooltip avec la valeur calculée originale.
- FR-2.2.5 : Section G conservée : saisie manuelle pour données comptables hors LMS.
- FR-2.2.6 : **DataGapsPanel en haut du rapport** si trous > 0, avec 4 tableaux éditables inline :

**a) Factures à vérifier** (date douteuse OU funding_type null) :
- Colonnes : formation/client, montant, invoice_date (éditable date picker), funding_type (éditable select 18 catégories), bouton "Date confirmée" (met `invoice_date_confirmed = true`)
- Sort de la liste dès re-datée/confirmée ET funding_type rempli
- Mutations via `bpf-gaps-service.ts` → appelle le service invoices existant

**b) Inscriptions sans type de stagiaire** (bpf_trainee_type null après backfill = cas où learner_type était null) :
- Colonnes : apprenant, formation, bpf_trainee_type (select 5 valeurs, défaut salarie_prive)
- **Action groupée** : bouton "Tout mettre à Salarié privé" pour une formation entière (mutation batch unique)
- Mutations via `bpf-gaps-service.ts` → update enrollments

**c) Formations sans objectif BPF** (trainings.bpf_objective null) :
- Colonnes : nom training, bpf_objective (select 11 valeurs F-3)
- **Suggestion IA pré-remplie** via ai-classify existant : la suggestion apparaît comme valeur par défaut que Loris valide ou corrige
- Mutations via `bpf-gaps-service.ts` → update trainings

**d) Sessions avec formateur sans coût** (agreed_cost_ht null) :
- Colonnes : session, formateur, agreed_cost_ht (input numérique éditable)
- Mutations via `bpf-gaps-service.ts` → update formation_trainers

- FR-2.2.7 : **Après chaque correction** : la ligne disparaît de la liste ET le cadre concerné se recalcule (optimistic update côté client).
- FR-2.2.8 : Toutes les mutations passent par le service layer, jamais d'update Supabase inline dans le composant.
- FR-2.2.9 : Validation Zod sur les inputs (date valide, montant numérique > 0, select dans les valeurs autorisées).
- FR-2.2.10 : Actions groupées (cas b) = une seule mutation batch Supabase, pas N appels.
- FR-2.2.11 : entity_id strict sur toutes les mutations.

**ACs :**

```gherkin
Given 30 factures importées sans date fiable dans le BPF 2026
When j'ouvre le panneau "Données à compléter"
Then je vois un tableau éditable des 30 factures
And je peux corriger la date de chacune sans quitter le rapport
And chaque facture corrigée sort de la liste et rebascule dans le total fiable du Cadre C

Given une formation avec 12 apprenants sans bpf_trainee_type
When je clique "Tout mettre à Salarié privé" sur cette formation
Then les 12 enrollments passent à salarie_prive en une seule requête batch
And ils disparaissent de la liste des trous
And le Cadre F-1 se recalcule immédiatement

Given un training sans bpf_objective
When le panneau s'affiche
Then une suggestion IA de l'objectif est pré-remplie (via ai-classify)
And je peux la valider ou la corriger avant sauvegarde

Given je corrige une donnée dans le panneau
When la mutation réussit
Then elle est passée par bpf-gaps-service.ts (service layer)
And le cadre BPF concerné se recalcule (optimistic update)

Given je suis admin MR Formation
When je traite les trous
Then je ne vois et ne corrige QUE des données de MR (entity_id strict)

Given une facture dont la date est corrigée et le funding_type renseigné
When invoice_date_confirmed est cliqué
Then la facture bascule du total "à vérifier" vers le total fiable du Cadre C
And elle disparaît du tableau des factures à vérifier

Given un avoir émis en jan 2027 sur une facture de déc 2026
When je consulte le BPF 2027
Then le Cadre C affiche -1000€ sur la ligne correspondante
And une alerte "Avoir portant sur une facture de l'exercice 2026" est visible
```

---

### Story BPF-2.3 : Export du rapport

**Effort :** 0.5 j-h

**Description :** Adapter les exports existants pour refléter les nouvelles sources et le split fiable/à vérifier.

**Files :**
- Modify : fonctions d'export existantes appelées par `BPFHeader.tsx`

**FRs :**
- FR-2.3.1 : Export Excel : un onglet par cadre, valeurs brutes + overrides signalés. Le Cadre C a 2 sous-totaux : "Total fiable" et "À vérifier".
- FR-2.3.2 : Export PDF : mise en page calquée sur le Cerfa 10443 (pour recopie).
- FR-2.3.3 : La section "données à compléter" (résumé des trous restants) est incluse en première page.
- FR-2.3.4 : Nom du fichier : `BPF-2026-MR-Formation.xlsx`.

**ACs :**

```gherkin
Given le rapport BPF 2026 de MR Formation est affiché avec 3 factures non confirmées
When je clique "Exporter Excel"
Then un fichier BPF-2026-MR-Formation.xlsx est téléchargé
And le Cadre C a 2 sous-totaux : "Total fiable" et "À vérifier (3 factures)"
And les valeurs overridées sont signalées (cellule colorée)

Given le rapport a 5 trous restants
When j'exporte le PDF
Then la première page contient un résumé "5 éléments à compléter"
```

---

## Ordre d'implémentation

```
BPF-1.1 (migration)     ──┐
                           ├── BPF-2.1 (helpers TDD) ── BPF-2.2 (rapport + DataGapsPanel) ── BPF-2.3 (export)
BPF-1.2 (écrans UI)     ──┘
```

BPF-1.1 et BPF-1.2 parallélisables. BPF-2.1 (TDD) bloque BPF-2.2 et BPF-2.3.

---

## Résumé effort révisé

| Story | Titre | Effort | Delta v1 |
|-------|-------|--------|----------|
| **BPF-1.1** | Migration 5 champs + backfills + types TS | 0.5 j-h | +invoice_date_confirmed |
| **BPF-1.2** | Intégration UI des champs | 1.5 j-h | inchangé |
| **BPF-2.1** | Helpers de calcul TDD | 1.5 j-h | +3 tests (avoirs, abandon, import) |
| **BPF-2.2** | Page rapport + DataGapsPanel éditable | **2 j-h** | +1 j-h (édition inline, batch, IA) |
| **BPF-2.3** | Export Excel/PDF | 0.5 j-h | +split fiable/à vérifier |
| **Total** | | **6.5 j-h** | +1.5 j-h vs v1 (5 j-h) |

---

## Checklist de validation finale

- [ ] Les 23 tests existants passent toujours (non-régression)
- [ ] Nouveaux tests couvrent : année civile, signatures legacy, avoirs à cheval, abandon vs annulation, facture importée hors total fiable, funding_type null
- [ ] Le rapport BPF affiche les cadres dans l'ordre Cerfa exact
- [ ] Le Cadre C sépare "total fiable" et "à vérifier"
- [ ] La section "données à compléter" est éditable inline avec 4 types de trous
- [ ] Les actions groupées fonctionnent (batch mutation)
- [ ] Les suggestions IA sont pré-remplies pour bpf_objective
- [ ] Les overrides manuels ont un badge "Ajusté manuellement" + tooltip valeur originale
- [ ] Les avoirs orphelins (année différente de la facture d'origine) sont signalés
- [ ] Multi-entité vérifié : MR et C3V ne se mélangent pas
- [ ] Toutes les mutations passent par le service layer
- [ ] Export Excel + PDF reflètent le split fiable/à vérifier
