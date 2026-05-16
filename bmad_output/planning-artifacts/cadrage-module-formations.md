# Cadrage du module Formations — MR / C3V Formation

**Auteur :** Mary (Business Analyst, BMad)
**Date :** 2026-05-13
**Statut :** Document de cadrage — v1.1 (validé)
**Demandeur :** Wissam (dev) au nom de Loris (gérant OF, utilisateur principal)
**Branche analysée :** `fix/resolve-variables-multi-companies`

> **Décisions validées le 2026-05-13** :
> 1. **US-5** : programme commun en INTER (pas par entreprise). Ajouter une note inline dans l'UI.
> 2. **Lots A et B en parallèle** (pas séquentiels). **US-4 (drop `sessions.client_id`) est la story de tête** qui débloque le reste du multi-entreprises.
> 3. **Champs `time_*` e-learning** : à supprimer (jamais utilisés par Loris).

---

## 0. Résumé exécutif

Le module **Formations** est le cœur produit de la plateforme MR/C3V mais il est devenu instable parce que **deux décisions structurantes ont été prises à moitié** :

1. **La migration "multi-entreprises"** (passer d'1 entreprise par formation à N) a été appliquée au schéma et à *quelques* onglets (Convention, Finances partielle, Companies), mais **pas aux autres** (Émargement, Programme, E-learning, Absences, Qualiopi). Résultat : selon l'onglet que Loris ouvre, il voit une formation "à 1 entreprise" ou "à N entreprises" — l'incohérence est *visible* à l'utilisateur.

2. **Plusieurs sources de vérité coexistent sans cascade** pour les données critiques :
   - **Prix** : `trainings.price_per_person` ↔ `sessions.total_price` ↔ `enrollments.price_per_learner` ↔ `formation_companies.amount` — quatre champs, aucune règle de propagation explicite.
   - **Heures** : un trigger SQL (`trg_recompute_planned_hours`) recalcule automatiquement `sessions.planned_hours` depuis `formation_time_slots`. Toute saisie manuelle est silencieusement écrasée.
   - **Entreprises** : la colonne legacy `sessions.client_id` cohabite avec la table `formation_companies`. Aucune migration de nettoyage.
   - **Apprenants** : `learners.client_id` peut diverger de `enrollments.client_id`.

**Diagnostic Loris** | **Cause technique racine**
---|---
"Les données ne se mettent pas bien" | Quatre tables se disputent la même donnée, sans cascade.
"C'est compliqué" | 10 onglets visibles + 12 sous-sections Resume — la formation est éparpillée.
"Rien n'est fluide" | Chaque mutation refetch tout (`onRefresh` global), mais 2 useEffect ont des dépendances incomplètes et certains onglets ignorent les changements d'autres onglets.
"Apprenants/prix/entreprises ne se propagent pas" | Multi-entreprises seulement câblé sur 3 onglets sur 10.

**Recommandation cardinale** : avant tout nouveau feature, **finir la migration multi-entreprises** et **instituer une source de vérité unique par donnée** avec cascade explicite. Sans ça, on continuera à colmater au lieu de stabiliser.

**Effort estimé** pour atteindre une plateforme stable et fluide : **15-20 jours-homme** sur 3-4 sprints, hors nouvelles features. Détail au §8.

---

## 1. Méthodologie

- **Cartographie code** : 4 sous-agents Explore parallèles ont lu les 33 fichiers du dossier `src/app/(dashboard)/admin/formations/[id]/` + `supabase/schema.sql` + migrations + `src/lib/utils/formation-companies.ts`.
- **Critères d'audit** : conformité aux 10 règles absolues du `CLAUDE.md`, présence d'un workflow utilisateur clair, sources de vérité, propagation des changements, traitement du multi-entreprises.
- **Pas de spéculation** : tout constat cite un fichier et, quand pertinent, un numéro de ligne.
- **Hors-périmètre** : tests automatisés, performance front, accessibilité, internationalisation.

---

## 2. État des lieux

### 2.1 Architecture globale (`page.tsx`, 426 lignes)

- **Un seul mega-fetch** : la page charge la session avec ~13 relations imbriquées (`formation_trainers`, `formation_companies`, `enrollments`, `formation_financiers`, `formation_comments`, `formation_time_slots`, etc.) en une requête SELECT *.
- **10 onglets actifs**, tous passés `formation` + `onRefresh()`. Le `onRefresh` rejoue le mega-fetch.
- **Tab persistence via URL** (`?tab=`) — bonne pratique conservée.
- **Une seule mutation au niveau page** : `handleToggleComplete` (statut + déclenche automation).

**Constat** : l'architecture *en façade* est saine (single source de fetch + callback uniforme), mais **le mega-fetch implicite encourage les onglets enfants à supposer "j'ai tout sous la main"**, alors que certains useEffect locaux re-fetchent de leur côté (ex. `ResumeCompanies` charge `clients`, `ResumeLearners` charge `allLearners`, `ResumePriceHours` re-calcule `autoComputedHours`). C'est là que les désynchronisations apparaissent.

### 2.2 Inventaire des composants (33 fichiers)

| Catégorie | Fichier | Statut | Multi-entreprises |
|---|---|---|---|
| Page | `page.tsx` | OK orchestration | N/A |
| **Sections Resume (12)** | | | |
| | `ResumeActions` | OK | N/A |
| | `ResumeComments` | OK | N/A |
| | `ResumeCompanies` | OK (cœur multi-co) | ✅ |
| | `ResumeDangerZone` | OK mais delete cascade dur | N/A |
| | `ResumeDescription` | OK | N/A |
| | `ResumeFinanciers` | OK | N/A |
| | `ResumeLearners` | ⚠ fetch local stale | ⚠ partiel |
| | `ResumeLocation` | OK | N/A |
| | `ResumeManager` | OK | N/A |
| | `ResumePriceHours` | ⚠ useEffect deps incomplètes | ⚠ partiel |
| | `ResumeTrainers` | OK (3 sources hours) | N/A |
| | `ResumeVisioLink` | OK | N/A |
| **Tabs majeurs (5)** | | | |
| | `TabResume` | OK orchestrateur | ✅ |
| | `TabPlanning` | OK | N/A |
| | `TabParcours` | OK | N/A |
| | `TabEmargements` | ❌ **CASSÉ** multi-co | ❌ |
| | `TabConventionDocs` | OK | ✅ |
| | `TabFinances` | ⚠ fragile | ⚠ partiel |
| **Tabs secondaires (8)** | | | |
| | `TabQuestionnaires` | OK (remplaçant) | ⚠ partiel |
| | `TabEvaluation` | ❌ **@deprecated** | N/A |
| | `TabSatisfaction` | ❌ **@deprecated** | N/A |
| | `TabProgramme` | ⚠ 1 programme/session uniquement | ❌ |
| | `TabElearning` | ⚠ champs `time_*` jamais populés | ❌ |
| | `TabDocsPartages` | OK | ⚠ partiel |
| | `TabMessagerie` | OK | ✅ |
| | `TabAbsences` | OK | ❌ |
| | `TabQualiopi` | ⚠ score stocké en JSON dans `notes` | ❌ |
| | `TabAutomation` | OK | ✅ |
| **Utilitaires (4)** | `AutomationTimeline`, `BulkSlotCreator`, `ImportInvoiceDialog`, `TimeSlotCard` | OK | N/A |

**À noter** :
- **`TabEvaluation` et `TabSatisfaction` sont marqués `@deprecated`** (lignes 2-4 de chaque) mais sont toujours affichés. Code mort actif en production.
- **`TabEmargements` est cassé en multi-entreprises** : tous les apprenants des deux entreprises apparaissent dans tous les créneaux (pas de filtrage par `client_id`).

---

## 3. Diagnostic des incohérences de données (la racine du problème)

### 3.1 Carte des duplications

| Donnée | Tables qui la portent | Source de vérité *prétendue* | Source réellement *utilisée* selon l'écran | Risque |
|---|---|---|---|---|
| **Prix** | `trainings.price_per_person`, `sessions.total_price`, `enrollments.price_per_learner`, `formation_companies.amount` | `trainings` (catalogue) | `sessions.total_price` est saisi à la main dans `ResumePriceHours`; `formation_companies.amount` calculé via pro-rata; pas de cascade | 🔴 Très élevé |
| **Heures** | `trainings.duration_hours`, `sessions.planned_hours`, `enrollments.hours_per_learner`, somme de `formation_time_slots` | Trigger SQL force `sessions.planned_hours = somme(slots)` | `ResumePriceHours` essaie de la saisir manuellement → écrasée silencieusement par le trigger | 🔴 Très élevé |
| **Entreprises** | `sessions.client_id` (legacy), `formation_companies` (nouvelle), `enrollments.client_id` (par apprenant) | `formation_companies` | Certains onglets lisent encore `sessions.client_id` | 🔴 Très élevé |
| **Apprenants** | `learners`, `enrollments.learner_id`, `enrollments.client_id` | `enrollments` (inscription) | `enrollments.client_id` peut diverger de `learners.client_id` → un apprenant peut "appartenir" à 2 entreprises selon l'angle | 🟠 Élevé |
| **Formateurs heures réalisées** | `formation_trainers.hours_done`, calcul depuis `signatures × formation_time_slots`, `sessions.planned_hours` | Calcul depuis signatures | `ResumeTrainers` hiérarchise `ft.hours_done ?? formation.planned_hours ?? null` — 3 niveaux de fallback | 🟡 Moyen |

### 3.2 Pourquoi ça casse en pratique

**Scénario "Loris ajoute une entreprise"** :
1. Il ouvre `ResumeCompanies`, ajoute une 2ᵉ entreprise → insert dans `formation_companies` + auto-enroll des apprenants.
2. `ResumePriceHours` ne re-calcule pas `autoComputedHours` car son `useEffect` ne dépend pas de `formation.formation_companies` (`ResumePriceHours.tsx` L55-102).
3. Il bascule sur `TabEmargements` : le tab voit *tous* les enrollments mais ne sait pas qu'il existe 2 entreprises → tous les apprenants dans tous les créneaux.
4. Il bascule sur `TabFinances` : l'auto-fill destinataire prend `formation_companies[0]` arbitrairement (`TabFinances.tsx` L296-306) au lieu de demander.
5. Il bascule sur `TabProgramme` : 1 seul programme par session, donc impossible d'avoir un programme différent par entreprise.

**Scénario "Loris modifie le prix"** :
1. Il met à jour `sessions.total_price` dans `ResumePriceHours`.
2. Aucune cascade vers `enrollments.price_per_learner` ou `formation_companies.amount` → si la facture est déjà créée, elle conserve l'ancien montant.
3. Si l'admin a saisi `enrollments.price_per_learner` à la main pour un apprenant spécifique, la nouvelle valeur globale ne s'applique pas à lui.

### 3.3 RLS — bonne surprise

Toutes les tables critiques (`sessions`, `enrollments`, `formation_companies`, `formation_trainers`, `formation_invoices`) ont des **policies RLS filtrées par `entity_id`** — pas d'`allow_all USING(true)` sur ce périmètre, contrairement à ce qu'on voit ailleurs dans la base (`memory: project_rls_state.md` mentionne ~50 tables avec `allow_all`, mais le module Formations est sain de ce côté).

---

## 4. Workflows utilisateur

### 4.1 Les 4 workflows critiques pour Loris

#### W1 — Créer et préparer une formation (INTRA, 1 entreprise)
**Happy path actuel** : Crée session → ajoute entreprise(s) → ajoute apprenants → définit prix → définit créneaux (planning) → ajoute formateur → génère convention → marque "Planifiée".

**Points de rupture observés** :
- Le prix est saisi manuellement, jamais auto-rempli depuis `trainings`.
- L'auto-calcul des heures écrase la saisie utilisateur → confusion ("je l'ai mis à 14h mais ça revient à 12h").
- L'adresse par défaut (intra = adresse client / inter = adresse OF) est calculée *au moment du fetch initial* uniquement.

#### W2 — Gérer une formation INTER (multi-entreprises)
**Happy path attendu** : Crée session → ajoute N entreprises avec montants individuels → ajoute N apprenants en les rattachant chacun à son entreprise → génère 1 convention par entreprise → émarge → facture chaque entreprise séparément.

**Points de rupture observés** :
- ✅ Convention OK (boucle par entreprise dans `TabConventionDocs` L258).
- ❌ Émargement : tous les apprenants visibles dans tous les créneaux (pas de filtre `client_id`).
- ⚠ Finances : auto-fill destinataire arbitraire, lookup par nom et non par ID (risque doublons).
- ❌ Programme : un seul programme commun, impossible de différencier.
- ❌ E-learning : courses attribués globalement, pas par entreprise.
- ❌ Attestations / certificats : non testé mais probablement même problème.

#### W3 — Émarger une session
**Happy path** : Générer QR codes → projeter / envoyer → apprenants signent → vérifier complétion → exporter feuille d'émargement signée.

**Points de rupture observés** :
- Si formation INTER, la feuille mélange les apprenants des 2 entreprises (pas d'export segmenté).
- Pas de validation de chevauchement de créneaux.
- Boucle séquentielle pour les envois mass (`ResumeLearners` L263-278) → timeout possible.

#### W4 — Facturer
**Happy path** : Générer facture(s) auto → relire les lignes → envoyer par email → marquer payée → générer avoir si besoin.

**Points de rupture observés** :
- Auto-fill destinataire arbitraire en INTER.
- TVA recalculée différemment entre facture et avoir (`TabFinances` L407).
- Si le prix change après création, la facture ne suit pas.
- `formation.invoice_generated` non typé (`as unknown as { invoice_generated?: boolean }` L726).

### 4.2 Workflows secondaires fonctionnels

- ✅ Évaluation/satisfaction via `TabQuestionnaires` (le nouveau remplaçant) fonctionne.
- ✅ Messagerie + automation rules ok.
- ✅ Documents partagés (upload/download) ok.
- ⚠ Qualiopi : fonctionne mais le score est stocké en JSON dans la colonne `notes` au lieu d'une table dédiée — fragile.

---

## 5. Architecture cible

### 5.1 Principes

1. **Une donnée = une source de vérité, point.** Toute lecture d'une donnée critique passe par cette source ou par un computed/derived bien identifié.
2. **Cascades explicites** (DB triggers ou service layer) pour propager les changements. Plus d'écriture redondante côté UI.
3. **Multi-entreprises uniforme** : tous les onglets respectent le contrat « 1 ou N entreprises rattachées via `formation_companies` ».
4. **`sessions.client_id` legacy → décommissionné.**
5. **TabEvaluation / TabSatisfaction supprimés.** Le remplaçant `TabQuestionnaires` est en place.
6. **Onglets sans valeur produit visible → consolidés** (voir 5.3).

### 5.2 Modèle de données cible (delta vs existant)

| Aspect | Avant | Cible |
|---|---|---|
| Prix formation | 4 colonnes potentielles | `trainings.price_per_person` = catalogue (read-only depuis session). `sessions.total_price` = override explicite uniquement. `formation_companies.amount` = calculé via helper si vide, override explicite si saisi. `enrollments.price_per_learner` = override par apprenant. |
| Heures planifiées | Trigger écrase | **Renommer** `sessions.planned_hours` → `sessions.computed_hours` (lecture seule). Ajouter `sessions.override_hours` (nullable). UI affiche `override_hours ?? computed_hours`. |
| Entreprise rattachée | `sessions.client_id` + `formation_companies` | Supprimer `sessions.client_id`. Backfill : pour toute session avec `client_id` legacy non null, créer une ligne `formation_companies` si absente, puis NULLifier `sessions.client_id` puis DROP COLUMN. |
| Apprenant ↔ entreprise (INTER) | `learners.client_id` ET `enrollments.client_id` peuvent diverger | `enrollments.client_id` devient la source unique pour le contexte session. `learners.client_id` reste pour le contexte CRM (entreprise *par défaut* de l'apprenant). Contrainte CHECK : en INTER, `enrollments.client_id` doit appartenir à `formation_companies.client_id` de la même session. |
| Score Qualiopi | JSON dans `sessions.notes` | Nouvelle table `formation_qualiopi_audits` (`session_id`, `score`, `details_json`, `audited_at`, `audited_by`). |

### 5.3 Onglets cibles (10 → 7 ou 8)

| Cible | Source(s) | Justification |
|---|---|---|
| **1. Résumé** | TabResume (orchestre 12 sections — *à consolider en 6 max*) | Garder. Fusionner ResumePriceHours+ResumeLocation, ResumeFinanciers+ResumeManager. |
| **2. Planning** | TabPlanning + TabParcours | Fusionner. "Créer des créneaux" et "remplir le contenu pédago" sont deux étapes du même workflow. |
| **3. Apprenants & Émargement** | ResumeLearners (partiellement) + TabEmargements + TabAbsences | Fusionner. La présence est *une vue* de la liste apprenants. |
| **4. Documents** | TabConventionDocs + TabDocsPartages + TabProgramme | Fusionner. Sont tous des documents générés ou téléversés. |
| **5. Questionnaires** | TabQuestionnaires | Garder. **Supprimer** TabEvaluation et TabSatisfaction (déjà marqués `@deprecated`). |
| **6. E-learning** | TabElearning | Garder mais **clarifier les champs `time_*`** : soit les populer, soit les retirer. |
| **7. Finances** | TabFinances | Garder. Refondre l'auto-fill destinataire en mode "guidé" si multi-entreprises. |
| **8. Qualiopi & Automation** | TabQualiopi + TabAutomation | Fusionner si charge faible, sinon garder séparés. |

**Bénéfice attendu** : passer de 10 onglets à 7-8 ; chaque onglet a une promesse claire (« je viens ici pour faire X »). Réduit la sensation "c'est compliqué".

### 5.4 Stratégie de propagation

Trois patterns disponibles, à appliquer cas par cas :

- **DB trigger** : pour les invariants stricts (ex. cohérence `enrollments.client_id` ⊂ `formation_companies.client_id`).
- **Service layer (`src/lib/services/`)** : pour les cascades métier (ex. update prix → recalcul invoices non envoyées).
- **Realtime / refetch ciblé** : remplacer `onRefresh()` global par une invalidation par tag (`react-query` ou équivalent maison). Hors-périmètre v1 si trop coûteux — la priorité est la cohérence, pas la fluidité réseau.

---

## 6. User stories prioritaires

Format : `En tant que <rôle>, je veux <action>, afin de <bénéfice>.` AC = critères d'acceptation.

### Priorité P0 — Sans ça, le module reste cassé

#### US-1 — Émargement multi-entreprises
> En tant que gérant d'OF, je veux que la feuille d'émargement d'une formation INTER ne liste que les apprenants de l'entreprise concernée, afin que je puisse remettre à chaque client une feuille propre.

**AC :**
- Sur un créneau d'une formation INTER, je peux filtrer la liste des apprenants par entreprise.
- L'export PDF de la feuille d'émargement génère **1 PDF par entreprise** (ou 1 PDF combiné avec section par entreprise — au choix de Loris).
- Les QR codes générés sont segmentables par entreprise.
- Test : 2 entreprises × 3 apprenants chacune × 2 créneaux → 2 PDFs (ou 1 PDF segmenté), chacun avec 3 apprenants × 2 créneaux.

#### US-2 — Source de vérité unique pour le prix
> En tant que gérant d'OF, je veux saisir le prix une seule fois et qu'il se propage proprement (ou que la plateforme me dise clairement quand un override est en jeu), afin de ne pas avoir 4 chiffres différents.

**AC :**
- Quand je crée une session depuis un `training`, `sessions.total_price` est pré-rempli depuis `trainings.price_per_person`.
- Si je modifie `sessions.total_price`, un badge "modifié" s'affiche.
- Si je modifie `formation_companies.amount` ou `enrollments.price_per_learner`, idem badge "override".
- En INTER, la somme des `formation_companies.amount` doit toujours être ≤ `sessions.total_price` (warning sinon, pas blocage).
- Test : changer le prix global → factures non envoyées (status = draft) se mettent à jour.

#### US-3 — Heures sans surprise
> En tant que gérant d'OF, je veux comprendre d'où vient le nombre d'heures affiché et pouvoir le surcharger explicitement si besoin, afin de ne pas perdre du temps à saisir une valeur qui disparaît.

**AC :**
- Le champ "heures planifiées" affiche soit "calculé depuis créneaux : 14h", soit "saisi manuellement : 16h" avec un toggle.
- Le trigger SQL ne s'applique plus aveuglément : il alimente `computed_hours`. La valeur affichée est `override_hours ?? computed_hours`.

#### US-4 — Décommissionner `sessions.client_id`
> En tant que dev/admin, je veux que toutes les références à l'entreprise rattachée passent par `formation_companies`, afin que les onglets soient cohérents.

**AC :**
- Migration SQL : backfill toutes les sessions où `client_id` est non null et `formation_companies` est vide.
- Aucun code dans `src/` ne lit plus `sessions.client_id`.
- Colonne droppée après vérification.

### Priorité P1 — Cohérence multi-entreprises sur le reste

#### US-5 — Programme commun documenté en INTER ✅ DÉCIDÉ
> En tant que gérant d'OF, je veux savoir que le programme est commun à toutes les entreprises sur une formation INTER, afin de ne pas chercher une fonctionnalité de différenciation qui n'existe pas.

**Décision produit :** programme **commun** en INTER. Pas de différenciation par entreprise.

**AC :**
- Note inline dans `TabProgramme` (ou son successeur fusionné "Documents") : « Le programme pédagogique est commun à toutes les entreprises de la formation. »
- Si la formation passe d'INTRA à INTER alors qu'un programme est déjà attribué, aucune action automatique (le programme reste, la note s'affiche).
- Aucune migration de schéma nécessaire (`sessions.program_id` conservé tel quel).

#### US-6 — Auto-fill facture intelligent en INTER
> En tant que gérant d'OF, je veux que la création de facture me demande clairement à quelle entreprise je facture si plusieurs sont présentes, afin de ne pas créer une facture mal attribuée.

**AC :**
- En INTER, l'auto-fill ne choisit plus `formation_companies[0]` arbitrairement.
- Une question modale : « Cette facture concerne quelle entreprise ? » avec liste.
- Lookup entreprise par `client_id` (FK), pas par nom.

#### US-7 — Suppression du code mort
> En tant que dev, je veux supprimer `TabEvaluation` et `TabSatisfaction` (déjà `@deprecated`), afin de réduire la confusion et la surface de bug.

**AC :**
- Fichiers supprimés.
- Aucune référence dans `page.tsx`.
- Tests manuels : envoi d'une évaluation et d'une satisfaction via `TabQuestionnaires` fonctionne.

### Priorité P2 — Fluidité et consolidation

#### US-8 — Refonte de la disposition des onglets
> En tant que gérant d'OF, je veux moins d'onglets mais mieux organisés, afin de retrouver vite ce que je cherche.

**AC :**
- Passage de 10 onglets à 7-8 selon §5.3.
- Test usabilité avec Loris : il sait où aller pour chaque tâche du workflow W1-W4.

#### US-9 — Suppression des champs `time_*` E-learning ✅ DÉCIDÉ
> En tant que dev, je veux supprimer les champs `time_modules`, `time_evals`, `time_other`, `time_virtual` de `formation_elearning_assignments`, afin d'éliminer du code et des champs jamais utilisés.

**Décision produit :** ces champs ne sont **pas utilisés** par Loris et ne le seront pas. À **supprimer**.

**AC :**
- Migration SQL : `drop_elearning_time_fields.sql` (DROP COLUMN sur les 4 champs).
- `TabElearning.tsx` : suppression du calcul `timeModules + timeEvals + timeOther + timeVirtual + signedTime` (lignes 258-263). Affichage simplifié au temps signé uniquement.
- Aucune référence résiduelle dans le code (`grep` propre).

#### US-10 — Qualiopi en table dédiée
> En tant que dev, je veux stocker le score Qualiopi dans `formation_qualiopi_audits`, afin de tracer les audits successifs et de ne plus parser de JSON dans `notes`.

**AC :**
- Nouvelle table créée.
- Migration des données existantes.
- `TabQualiopi` lit/écrit dans la nouvelle table.

---

## 7. Plan de migration depuis l'existant

**Principe** : pas de big bang. **Lots A et B en parallèle** (décision validée). US-4 (drop `sessions.client_id`) est la story de tête, à exécuter avant les autres car elle débloque la cohérence du multi-entreprises pour tout le reste.

### Story de tête (avant tout le reste) — US-4 (~1.5j)

1. Audit data prod : combien de sessions ont `sessions.client_id` non null ET `formation_companies` vide ou divergent ?
2. Migration SQL `backfill_formation_companies_from_legacy_client_id.sql` : crée la ligne `formation_companies` manquante quand `sessions.client_id` est non null.
3. Audit code (`grep -r "client_id" src/app src/lib`) : lister toutes les lectures de `sessions.client_id` et les remplacer par `formation_companies`.
4. Release intermédiaire : code ne lit plus `sessions.client_id`, mais la colonne existe encore.
5. Migration SQL `drop_sessions_client_id.sql` après 1 semaine de monitoring.

### Lot A — Stabilisation données (P0, ~3.5j) — en parallèle du lot B

1. Migration SQL `add_session_override_hours.sql` : ajoute `override_hours` (nullable). Le trigger continue d'alimenter `computed_hours` (renommer la colonne actuelle si nécessaire dans la même migration).
2. Migration SQL `add_formation_companies_amount_warning.sql` : helper SQL ou vue pour signaler quand `sum(amounts) > total_price` (pas de CHECK bloquant, juste affichage UI).
3. Refactor `ResumePriceHours` : useEffect deps complètes (ajouter `formation.formation_companies` aux deps L102), badge "modifié" sur les overrides, distinction visible override vs computed pour heures.
4. Refactor `ResumeLearners` : refetch `allLearners` quand `formation.enrollments` change (compléter deps L71-74).
5. Service layer : extraire mutations Supabase de `ResumeCompanies` vers `src/lib/services/formation-companies.ts`.

### Lot B — Multi-entreprises uniforme (P0/P1, ~5j) — en parallèle du lot A

1. `TabEmargements` : filtre apprenants par `client_id` + export segmenté (1 PDF par entreprise OU 1 PDF avec sections).
2. `TabFinances` : modal de choix destinataire en INTER + lookup par `client_id` (FK) au lieu de `name`.
3. `TabProgramme` : ajouter note inline « Le programme est commun à toutes les entreprises » (US-5).
4. Helper `getLearnersForCompany` étendu et appliqué dans tous les tabs qui itèrent sur des apprenants (`TabAbsences`, `TabDocsPartages`).

### Lot C — Nettoyage code mort & consolidation onglets (P1/P2, ~3j)

1. Supprimer `TabEvaluation.tsx`, `TabSatisfaction.tsx` + références.
2. Fusionner `TabPlanning` + `TabParcours`.
3. Fusionner `TabConventionDocs` + `TabDocsPartages` + `TabProgramme`.
4. Migration `drop_elearning_time_fields.sql` + nettoyage `TabElearning.tsx` (US-9 validé).

### Lot D — Qualité & observabilité (P2, ~3j)

1. Table `formation_qualiopi_audits`.
2. Service layer : extraire les mutations Supabase de `ResumeCompanies` et `ResumeLearners` vers `src/lib/services/formation-companies.ts` et `src/lib/services/enrollments.ts` (conforme à la règle absolue n°10 du `CLAUDE.md`).
3. Logging structuré sur les cascades de prix.

---

## 8. Estimation d'effort

| Lot | User stories | Effort dev (j-h) | Effort QA | Total |
|---|---|---|---|---|
| Story de tête | US-4 | 1.5j | 0.25j | **1.75j** |
| A (en // de B) | US-2, US-3 | 3.5j | 0.75j | **4.25j** |
| B (en // de A) | US-1, US-5, US-6 | 4j | 1j | **5j** |
| C | US-7, US-8, US-9 | 2.5j | 0.5j | **3j** |
| D | US-10 + service layer | 2.5j | 0.5j | **3j** |
| **Total** | | **14j** | **3j** | **17 j-h** |

**Calendrier proposé (lots A+B en parallèle)** :
- **Semaine 1** : Story de tête US-4 (drop `sessions.client_id`) — toute l'équipe focus dessus.
- **Semaines 2-3** : Lots A + B en parallèle (1 dev sur A, 1 dev sur B). Si 1 seul dev : alterner story par story.
- **Semaine 4** : Lots C + D.
- **Total calendaire** : 4 semaines avec 2 devs, 5-6 semaines avec 1 dev à 80%.

**Hypothèses** :
- Loris disponible 1h/sprint pour valider AC.
- Pas de feature parallèle qui ajoute du périmètre.
- Tests manuels suffisants pour cette v1 (pas de couverture automatisée exigée — à ajouter ensuite).

---

## 9. Risques et hypothèses

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Données existantes en prod incohérentes (sessions avec `client_id` legacy ET `formation_companies` divergents) | Élevée | Migration peut échouer ou perdre des données | Audit data en pré-prod + dry-run de la migration + backup |
| Loris veut "1 programme par entreprise" → refonte profonde de `TabProgramme` | Moyenne | +3j d'effort | Trancher US-5 dès le sprint 1 |
| Trigger `trg_recompute_planned_hours` toujours actif quelque part | Moyenne | Override silencieux persiste | Lister tous les triggers en prod + désactiver explicitement ce qui n'est plus voulu |
| Cascade prix sur factures envoyées (status ≠ draft) → débat juridique | Faible | Bug réglementaire | Cascade uniquement sur drafts. Confirmer avec Loris. |
| Suppression `TabEvaluation/Satisfaction` casse un workflow non identifié | Faible | Bug en prod | Feature flag pendant 1 sprint avant suppression dure |

**Hypothèses fortes à valider avec Loris** :
1. Le scénario INTER multi-entreprises est-il fréquent (>10% des sessions) ou marginal ? Conditionne la priorité du lot B.
2. Loris veut-il forcer 1 programme commun par formation INTER, ou un par entreprise ?
3. Les champs `time_*` de e-learning ont-ils été demandés par Loris ou ajoutés "au cas où" ? À supprimer si nul.

---

## 10. Recommandations finales

1. **Ne rien ajouter avant le lot A.** Toute nouvelle feature posée sur des données duppliquées aggrave la dette.
2. **Animer un point de 30 min avec Loris** sur ce document pour valider les 3 hypothèses du §9 et la priorisation des lots.
3. **Convertir ce cadrage en PRD** via `bmad-create-prd` une fois validé, puis en epics/stories via `bmad-create-epics-and-stories`.
4. **Pour les commits liés à ce chantier**, préfixer par `fix(formations):` ou `refactor(formations):` pour faciliter le suivi.

---

*Fin du document de cadrage. Document généré dans le cadre du module BMad-BMM, phase 1-analysis. Prochaine étape recommandée : validation utilisateur + passage à la phase planning (PRD).*
