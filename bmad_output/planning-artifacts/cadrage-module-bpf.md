# Cadrage — Module BPF (Bilan Pédagogique et Financier)

**Date :** 2026-07-02 (v2 — enrichi blocs 1-4)
**Périmètre :** Mise en conformité du rapport BPF avec le Cerfa 10443
**Effort estimé :** 6-7 j-h
**Entités :** MR Formation + C3V Formation (multi-tenant, entity_id partout)

---

## 1. État des lieux

### 1.1 Existant réutilisable (~2 400 lignes)

Le module BPF a un socle fonctionnel : `BPFForm.tsx` (1 196 l.), `bpf-calculator.ts` (166 l.), 14 composants Section, tests (230 l.), classification IA, exports PDF/Excel. **Mais** il présente des écarts structurels avec le Cerfa 10443.

### 1.2 Écarts à corriger

| # | Écart | Impact |
|---|-------|--------|
| E1 | **Cadre C utilise `crm_quotes`** (devis acceptés) au lieu de `formation_invoices` (facturé) | Source de données à changer |
| E2 | **Pas de `invoice_date`** — seul `created_at` existe (date technique, pas métier) | Champ à ajouter + backfill |
| E3 | **`bpf_trainee_type` sur `learners`** au lieu de `enrollments` | Migration + backfill depuis `learners.learner_type` |
| E4 | **`is_subcontracted_to_other_of` absent** sur sessions | Nouveau champ boolean |
| E5 | **Pas de découpe année civile** : heures par date de créneau, CA par date de facture | Logique de calcul à refaire |
| E6 | **Section F-2 vide** (31 lignes de placeholder) | À câbler sur le nouveau champ session |
| E7 | **Signatures legacy sans `time_slot_id`** (72 sur 416, soit 17%) | Fallback prorata à implémenter |

### 1.3 Ce qui est DÉJÀ bon

- **Mapping `FUNDING_TO_LINE`** dans `bpf-calculator.ts` : 18 types → 11 lignes Cerfa. Conforme au Cerfa 10443. On le conserve tel quel.
- **`bpf_objective`** sur `trainings` : 11 valeurs alignées sur le cadre F-3 du Cerfa.
- **`funding_type`** sur `formation_invoices` : 18 types granulaires, déjà utilisé dans TabFinances. On le conserve comme champ source.
- **Composants Section A→H** : découplés de la logique, réutilisables.
- **EditableCell** : overrides manuels visuellement signalés.
- **AI classify API** : classification IA batch des learner_type, bpf_objective, nsf_code.
- **Tests TDD** : 23 cas existants sur le calculateur.

### 1.4 Volumes actuels (Bloc 0 — requêtes exécutées le 2026-07-02)

| Donnée | Count | Total | % | Impact BPF |
|--------|-------|-------|---|------------|
| Factures sans funding_type | 600 | 617 | 97% | Cadre C inexploitable sans qualification |
| Factures importées (external_ref NOT NULL) | 599 | 617 | 97% | Dates d'émission non fiables |
| Factures natives (créées dans le LMS) | 18 | 617 | 3% | Seules données fiables nativement |
| Factures importées avec created_at < 2026 | 0 | 599 | 0% | Pas de pollution inter-exercice au backfill |
| Enrollments actifs (hors cancelled) | 1 654 | — | 100% | À qualifier bpf_trainee_type |
| Learners sans learner_type | 0 | — | 0% | Backfill complet possible |
| Trainings sans bpf_objective | 162 | 162 | 100% | Classification IA indispensable |
| Signatures sans time_slot_id | 72 | 416 | 17% | Fallback prorata nécessaire |

---

## 2. Modèle de données — Delta

### 2.1 Nouveau champ : `invoice_date` sur `formation_invoices`

```sql
ALTER TABLE formation_invoices ADD COLUMN IF NOT EXISTS invoice_date DATE;
UPDATE formation_invoices SET invoice_date = created_at::date WHERE invoice_date IS NULL;
ALTER TABLE formation_invoices ALTER COLUMN invoice_date SET NOT NULL;
ALTER TABLE formation_invoices ALTER COLUMN invoice_date SET DEFAULT CURRENT_DATE;
```

### 2.2 Nouveau champ : `invoice_date_confirmed` sur `formation_invoices`

```sql
-- Auditabilité : une facture importée n'entre dans le total BPF fiable
-- que si sa date d'émission a été confirmée par l'utilisateur.
ALTER TABLE formation_invoices ADD COLUMN IF NOT EXISTS invoice_date_confirmed BOOLEAN DEFAULT TRUE;

-- Backfill : les factures importées (date douteuse) sont non confirmées ;
-- les factures natives (créées dans le LMS) sont confirmées par construction.
UPDATE formation_invoices SET invoice_date_confirmed = FALSE
  WHERE external_reference IS NOT NULL;
UPDATE formation_invoices SET invoice_date_confirmed = TRUE
  WHERE external_reference IS NULL;
```

### 2.3 Nouveau champ : `bpf_trainee_type` sur `enrollments`

```sql
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS bpf_trainee_type TEXT
  DEFAULT 'salarie_prive'
  CHECK (bpf_trainee_type IN (
    'salarie_prive',        -- F1-a : Salariés d'employeurs privés hors apprentis
    'apprenti',             -- F1-b : Apprentis
    'demandeur_emploi',     -- F1-c : Personnes en recherche d'emploi
    'particulier',          -- F1-d : Particuliers à leurs propres frais
    'autre'                 -- F1-e : Autres stagiaires
  ));

-- Backfill depuis learners.learner_type (100% des learners ont un learner_type)
UPDATE enrollments e
SET bpf_trainee_type = CASE l.learner_type
  WHEN 'salarie' THEN 'salarie_prive'
  WHEN 'apprenti' THEN 'apprenti'
  WHEN 'demandeur_emploi' THEN 'demandeur_emploi'
  WHEN 'particulier' THEN 'particulier'
  WHEN 'autre' THEN 'autre'
  ELSE 'salarie_prive'
END
FROM learners l WHERE l.id = e.learner_id AND e.bpf_trainee_type IS NULL;
```

### 2.4 Nouveau champ : `is_subcontracted_to_other_of` sur `sessions`

```sql
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_subcontracted_to_other_of BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN sessions.is_subcontracted_to_other_of IS
  'Cadre F-2 BPF : la formation est sous-traitée À un autre OF (distinct de formation_trainers.is_subcontracted qui concerne les formateurs sous-traitants)';
```

### 2.5 Existant conservé (pas de migration)

- `formation_invoices.funding_type` (18 valeurs) : conservé, mapping Cerfa via `FUNDING_TO_LINE`
- `trainings.bpf_objective` (11 valeurs) : conservé, mapping F-3 via `getF3Index()`
- `bpf_financial_data.overrides` (JSONB) : conservé pour les données comptables externes (charges non calculables)

---

## 3. Spécification des calculs par cadre

### 3.1 Cadre C — Origine des produits (CA facturé HT)

```sql
-- Source : formation_invoices (pas crm_quotes)
-- Filtre année : invoice_date (date d'émission métier)
-- Inclure avoirs (montant négatif → se nettoient dans le SUM)
-- Exclure : status = 'cancelled'
SELECT
  fi.funding_type,
  fi.invoice_date_confirmed,
  SUM(fi.amount) AS total_ht
FROM formation_invoices fi
WHERE fi.entity_id = :entity_id
  AND EXTRACT(YEAR FROM fi.invoice_date) = :year
  AND fi.status != 'cancelled'
GROUP BY fi.funding_type, fi.invoice_date_confirmed;
```

**Split fiable / à vérifier :**
- `invoice_date_confirmed = TRUE` → total fiable, affiché dans les lignes Cerfa
- `invoice_date_confirmed = FALSE` → total "à vérifier", affiché dans une ligne séparée, exclu du total fiable
- Dès que l'utilisateur confirme la date ou la corrige → bascule automatique dans le total fiable

**Avoirs à cheval sur 2 années :** règle Cerfa = l'avoir s'impute sur SON année d'émission (`invoice_date` de l'avoir), pas celle de la facture d'origine. Le SUM par `invoice_date` est donc correct. **Mais** `computeDataGaps` doit détecter et signaler tout avoir dont la facture d'origine (`parent_invoice_id`) est dans une année différente → alerte "avoir orphelin" pour que Loris comprenne un éventuel CA négatif sur une ligne.

### 3.2 Cadre D — Charges de formation

```sql
SELECT
  t.is_external,
  SUM(COALESCE(ft.agreed_cost_ht, ft.hourly_rate * s.computed_hours,
               t.hourly_rate * s.computed_hours, 0)) AS total
FROM formation_trainers ft
JOIN sessions s ON s.id = ft.session_id
JOIN trainers t ON t.id = ft.trainer_id
WHERE s.entity_id = :entity_id
  AND EXTRACT(YEAR FROM s.start_date) = :year  -- approximation MVP
GROUP BY t.is_external;
-- is_external = false → salaires formateurs (rémunérations internes)
-- is_external = true  → achats de prestations (sous-traitance)
```

### 3.3 Cadre E — Personnes dispensant des heures

Count formateurs distincts + total heures, split interne/externe. Heures formateur via `getTrainerStats()` existant (signatures × time_slots).

### 3.4 Cadre F-1 — Stagiaires par type

```sql
SELECT
  e.bpf_trainee_type,
  COUNT(DISTINCT e.learner_id) AS nb_stagiaires,
  SUM(EXTRACT(EPOCH FROM (ts.end_time - ts.start_time)) / 3600) AS heures_realisees
FROM enrollments e
JOIN signatures sig ON sig.session_id = e.session_id
  AND sig.signer_id = e.learner_id
  AND sig.signer_type = 'learner'
JOIN formation_time_slots ts ON ts.id = sig.time_slot_id
WHERE e.session_id IN (SELECT id FROM sessions WHERE entity_id = :entity_id)
  AND EXTRACT(YEAR FROM ts.start_time) = :year  -- DÉCOUPE ANNÉE CIVILE
  AND e.status != 'cancelled'
GROUP BY e.bpf_trainee_type;
```

**Sémantique "annulé" vs "abandon" (Cadre F) :**
- `enrollments.status = 'cancelled'` = inscription annulée avant toute participation. Exclue du BPF. Un apprenant `cancelled` ne peut pas signer d'émargements (`SIGNABLE_ENROLLMENT_STATUSES` l'exclut dans `src/lib/auth/learner-session-access.ts:5`), donc il a 0 heure signée par construction.
- Un apprenant qui **abandonne** en cours de formation garde son statut `registered` ou `confirmed`. Ses heures signées avant l'abandon **comptent** dans le BPF (conforme au Cerfa : heures réalisées). L'abandon est documenté via `attestation_abandon_formation` (document séparé), pas via un changement de statut enrollment.
- Le filtre `status != 'cancelled'` est donc suffisant et correct.

**Découpe année civile (D3) :** session nov 2026 → fév 2027 :
- Créneaux signés en nov-déc → BPF 2026
- Créneaux signés en jan-fév → BPF 2027
- L'apprenant compte comme stagiaire dans **les deux années** (COUNT DISTINCT par année)

**Signatures legacy (`time_slot_id IS NULL`) — 72 signatures (17%) :**
- Fallback : `heures_imputées = session.computed_hours / nb_slots_total` pour chaque signature sans slot
- L'année d'imputation = année de `signed_at` (meilleure approximation disponible)
- Signalé dans la section "données à compléter" : "72 signatures sans créneau associé (heures imputées au prorata)"

### 3.5 Cadre F-2 — Sous-traitance à un autre OF

Même logique que F-1, filtré par `sessions.is_subcontracted_to_other_of = true`. Les stagiaires F-2 comptent AUSSI dans F-1 (pas exclusifs).

### 3.6 Cadre F-3 — Objectif général des prestations

Même logique que F-1, groupé par `trainings.bpf_objective` via `getF3Index()`.

---

## 4. Cohérence "annulé" entre cadres (documentation technique)

Deux sémantiques distinctes, documentées en commentaire dans `bpf-report-service.ts` :

| Cadre | Champ filtré | Sémantique |
|-------|-------------|------------|
| **C** (CA) | `formation_invoices.status != 'cancelled'` | Facture annulée comptablement (différent d'un avoir : l'avoir a `is_avoir = true` et un montant négatif, la facture annulée est simplement ignorée) |
| **F** (Stagiaires) | `enrollments.status != 'cancelled'` | Inscription annulée avant participation (0 heure signée par construction). Un abandon en cours de formation ≠ annulation : l'apprenant garde son statut et ses heures comptent |

---

## 5. Points de vigilance

| # | Risque | Mitigation |
|---|--------|------------|
| V1 | **599 factures importées** avec date d'émission = date d'import | `invoice_date_confirmed = FALSE` → exclues du total fiable jusqu'à confirmation |
| V2 | **600 factures sans funding_type** (97%) | DataGapsPanel éditable inline + actions groupées |
| V3 | **162 trainings sans bpf_objective** (100%) | Classification IA (ai-classify) + validation inline |
| V4 | **Formateurs sans coût** (`agreed_cost_ht` null) | Signalement avec liens dans "données à compléter" |
| V5 | **72 signatures legacy** sans `time_slot_id` | Fallback prorata + tests TDD dédiés |
| V6 | **Sessions à cheval** sur 2 années civiles | Découpe par `ts.start_time` (date du créneau) |
| V7 | **Avoirs à cheval** sur 2 années | Signalement automatique des avoirs orphelins (année différente de la facture d'origine) |

---

## 6. Questions ouvertes pour Loris

**Q1 — Rattrapage rétroactif :** Le premier BPF complet sur la plateforme sera-t-il 2026 (avec rattrapage : 599 factures à re-dater, 600 à qualifier en funding_type, 162 trainings à classifier) ou 2027 (premier exercice entièrement saisi dans le LMS) ?

**Q2 — Mapping financeurs → catégorie Cerfa :** Valider la correspondance sur vos cas réels :
- OPCO Santé / OPCO EP → `entreprise_privee` (ligne 1) ou `plan_developpement` (ligne 2.h) ?
- CPAM / ARS → `pouvoir_public_agents` (ligne 3) ?
- France Travail → `pole_emploi` (ligne 7) — OK ?
- ANFH → `pouvoir_public_agents` (ligne 3) ou `autre` ?

---

## 7. Hors périmètre (MVP)

- Export Cerfa pré-rempli (PDF interactif) — post-MVP
- Découpe année civile du Cadre D (charges formateurs au prorata des créneaux) — MVP utilise `s.start_date`
- Intégration API DREETS (télédéclaration) — n'existe pas
- Cadre F-4 (NSF) — déjà implémenté et fonctionnel, pas de changement
