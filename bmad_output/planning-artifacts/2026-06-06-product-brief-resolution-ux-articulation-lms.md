# Product Brief — Résolution zones d'ombre UX/articulation module LMS

**Date** : 2026-06-06
**Auteur** : Mary (Business Analyst BMAD)
**Statut** : Draft v2 (post-reviews adversariales)
**Scope estimé** : 1-2 mois (epic complet)

---

## Status of RLS Work (clarification préalable)

- **RLS V1 P0** : mergé le 2026-06-05 via PR #201 (commits `5705656`, `61bd374`, `f8c95af`, `864c8fb`). Les 2 P0 critiques cross-tenant (unlink + create-access) sont clos.
- **RLS V2/V3** : 10 tables résiduelles + 5 routes cron à durcir. **Epic séparé**, parallèle, n'est PAS dans le scope de ce brief UX.
- **Items sécurité V1.1, V1.2, V1.3, V1.8, V1.9, V1.11, V1.12** de l'audit : explicitement **transférés au backlog RLS V2/V3** (cf. §6). Ce brief se concentre exclusivement sur la **complétude UX** (archétypes A/B/C).

Conséquence : aucun item sécurité multi-tenant n'est dans le Scope IN ci-dessous. Si Wissam souhaite re-prioriser sécurité avant UX, ce brief doit être re-séquencé en accord avec l'épic RLS V2/V3.

---

## 1. Problématique en 1 phrase

Les utilisateurs internes (admins, formateurs, apprenants) perdent en confiance opérationnelle face à 14 zones d'ombre UX qui cassent silencieusement leurs parcours critiques (imports, mutations, questionnaires) — créant un coût croissant (support manuel, contournements Excel, abandons learner) que l'audit chiffre à 78 findings dédupliqués et que l'onboarding de nouveaux clients prévu en Q3 va amplifier si non résolu.

---

## 2. Contexte

L'audit complet du module LMS (`docs/audit-lms-module-2026-06-05.md`, 317 lignes) conduit le 2026-06-05 a inventorié **78 findings dédupliqués** sur 5 sous-systèmes (Sessions, Formations, E-Learning, Programmes, Questionnaires). Le score global de qualité du module est de **72/100**, avec une concentration en trois archétypes UX récurrents.

### Cost of inaction (pourquoi maintenant)

- **Coût présent** (baseline à confirmer en pré-PRD via export Zendesk + logs Sellsy) :
  - Estimation Wissam : ~3-5 tickets support/mois liés à "bouton ne fait rien" / "j'ai cliqué mais rien" sur module LMS.
  - Estimation contournement : usage Excel parallèle pour bulk import >20 apprenants (workaround actuel).
  - Risque learner : aucun draft auto-save sur questionnaires (cross-check #3 confirmé) — perte de réponses non quantifiée mais signalée informellement.
- **Coût projeté** : onboarding nouveaux clients prévu Q3 2026 (volumes 2-3x supérieurs à actuel) → si UX debt non résolue, escalade attendue à ~10-15 tickets/mois + risque réputationnel.
- **Fenêtre opportune** : aucun incident urgent, audit frais, branche RLS P0 vient d'être clôturée — moment idéal pour traiter dette UX avant compounding.

### Découplage avec RLS V2/V3

Cross-check confirme que les chantiers UX et RLS V2/V3 sont **totalement découplés** : aucune route API UX ne dépend d'un fix RLS préalable. Les 2 chantiers peuvent avancer en parallèle.

---

## 3. Personas et parcours impactés

| Persona | Volume estimé* | Parcours cassés actuellement | Impact si non résolu |
|---|---|---|---|
| **Admin** (MR/C3V) | ~5-10 actifs | Bulk import >20 silencieux ; Duplicate/Delete formation inertes ; TabAbsences/TabDocsPartages sans refetch ; auto-fill planning sans loading ; batch ops sans confirmation | Tickets support, retours manuels, contournement Excel, perte de confiance |
| **Trainer** | ~10-20 actifs | Loading states absents sur planning, mutations sans feedback, conflicts détectés sans erreur visible | Frustration, doute sur enregistrement, double-saisie |
| **Learner** | ~100-500 par session | Questionnaire fill sans draft auto-save ; reader e-learning sans loading state | Perte réponses, abandons questionnaire, support sollicité |

*Volumes sourcés de l'estimation Wissam (entités MR FORMATION + C3V FORMATION). **Validation gate pré-PRD** : query prod Supabase sur tables `profiles` (par role), `learners`, `enrollments` sur 6 derniers mois. Si volumes réels divergent de >2x des estimations, re-trigger effort estimation. Pris en charge par Wissam, deadline : avant kickoff PRD.

---

## 4. Les 3 archétypes de problèmes

Les 3 archétypes ci-dessous ont été identifiés dans l'audit `docs/audit-lms-module-2026-06-05.md` et validés via cross-check code (11 zones vérifiées par lecture manuelle des routes/pages, 4 critiques confirmées, 2 incertaines, 1 réfutée).

### A. Parcours sans signal de fin (5 findings)

L'utilisateur déclenche une action async, ne reçoit aucun feedback intermédiaire, et ne sait pas si l'action est terminée, en cours, ou échouée silencieusement.

**Exemples confirmés** :
- **Bulk import >20 apprenants** (audit V1.10) : `netlify/functions/learners-bulk-create-background.mts:14` est un **stub V1 explicite**. L'API `bulk/start/route.ts:84` route sur cette fonction dès que `count > INLINE_THRESHOLD = 20`. Résultat : l'admin reçoit 202 OK, aucun apprenant n'est créé.
- **TabFinances dialogs** (audit V2.10) : `TabFinances.tsx:170` et `:389` utilisent `setTimeout` (50ms) pour séquencer l'ouverture des dialogues. Timing-dépendant, imprévisible sous charge.
- **Dropdown Duplicate/Delete formation** (audit V1.6) : `formations/[id]/page.tsx:318-320`, snippet : `<DropdownMenuItem className="gap-2 text-xs">Dupliquer</DropdownMenuItem>` — pas de prop `onClick`. Boutons cliquables, aucune action exécutée.
- **TabPlanning auto-fill** (audit V2.6, ⚠ Incertain) : grep `useState.*loading` et `import.*Loader` négatif sur le fichier. Hypothèse : bouton déclenche calcul async sans spinner. Vérification finale requise par lecture complète du composant en phase PRD.

### B. Limites silencieuses (3 findings)

Le système atteint une limite (taille, format, scope) sans en informer l'utilisateur.

**Exemples confirmés** :
- **Hub E-Learning + Programmes pagination client-only** (audit V2.14) : `programs/page.tsx:224-227` utilise `pagedFiltered.slice()` (pagination en mémoire). Au-delà de ~100 entrées, freeze UX.
- **TabConventionDocs batch ops** (audit V2.9) : génération/envoi/signature batch multi-apprenants sans confirmation ni scope warning (`TabConventionDocs.tsx:850-900`).

### C. Promesses cassées (6 findings)

L'UI promet une action mais l'implémentation ne tient pas : action absente, validation incohérente entre couches, mutation sans refresh.

**Exemples confirmés par cross-check code** :
- **Course type enum mismatch 3 couches** (audit V1.7) : `create/page.tsx:36` définit `type CourseType = "presentation" | "quiz" | "complete"`, tandis que `validations/elearning.ts:69` définit `z.enum(["presentation_quiz", "presentation_quiz_flashcard", "quiz", "flashcards"])`. **Enums incompatibles**.
- **BpfFundingType enum mismatch Zod/DB** (audit V1.7 bis) : utilisateur sélectionne "Apprentissage", validation Zod passe, insert Supabase échoue avec toast générique.
- **TabAbsences/TabDocsPartages mutations sans refetch** (audit V1.5) : utilisateur valide une mutation, toast success, UI ne se rafraîchit pas.
- **Historical scoring non rétroactif** (audit V2.4) : correction de scoring ne s'applique pas aux réponses antérieures.

---

## 5. Scope IN — Items PROPOSÉS (validation Wissam requise)

⚠ **Note de sourcing** : les 14 items ci-dessous sont la **proposition Mary** sur la base de l'audit V1/V2 et du cross-check. Ils ne reflètent **pas encore un signoff Wissam explicite** sur ce sous-ensemble précis (vs autres findings du tableau dédupliqué). Validation Wissam = condition d'entrée PRD.

Effort estimates sourcés de `audit-lms-module-2026-06-05.md` Vague V1/V2. **Échelle** : S = 1-3 jours, M = 3-5 jours, L = 1-2 semaines (1 dev seul, sans parallélisation).

| # | Item | Archétype | Persona | Effort | Source |
|---|---|---|---|---|---|
| 1 | Bulk import >20 apprenants opérationnel (background function réelle) | A | Admin | L | `learners-bulk-create-background.mts:14` (V1.10) |
| 2 | Dropdown Duplicate/Delete formation : handlers + confirmation | A | Admin | M | `formations/[id]/page.tsx:318-320` (V1.6) |
| 3 | TabAbsences/TabDocsPartages : refetch après mutation | C | Admin | S | V1.5 |
| 4 | TabPlanning auto-fill : loading state + spinner | A | Admin | M | V2.6 |
| 5 | TabFinances dialogs : remplacer setTimeout par Promise | A | Admin | M | `TabFinances.tsx:170,389` (V2.10) |
| 6 | TabConventionDocs batch ops : dialog de confirmation avec scope | B | Admin | M | V2.9 |
| 7 | Course type enum unification (Zod ↔ TS ↔ DB) | C | Admin | M | `create/page.tsx:36` vs `validations/elearning.ts:69` (V1.7) |
| 8 | E-Learning reader : loading state changement chapitre | A | Learner | M | V2.8 |
| 9 | E-Learning wizard create : step indicator (7 étapes) | A/B | Admin | S | `create/page.tsx:135-250` |
| 10 | Hub E-Learning pagination serveur | B | Admin | M | V2.14 |
| 11 | BpfFundingType enum unification | C | Admin | S | V1.7 bis |
| 12 | Hub Programmes pagination serveur | B | Admin | M | `programs/page.tsx:224-227` |
| 13 | Questionnaire learner : draft auto-save + beforeunload | A | Learner | M | Cross-check #3 (aucun listener détecté) |
| 14 | Historical scoring rétroactif sur corrections | C | Admin/Learner | M | V2.4 |

**Bilan effort** : 2×S + 11×M + 1×L = ~3 semaines pure engineering + ~1 semaine review/intégration = **~4 semaines réalistes**, dans la fenêtre 1-2 mois mais sans gros buffer.

**Note séquencement** : les ~64 findings MAJOR/MINOR additionnels du tableau dédupliqué peuvent être intégrés en epic 2 (post-MVP zones d'ombre) selon priorisation PRD.

---

## 6. Scope OUT (avec rationale)

| Item | Raison d'exclusion | Risque résiduel |
|---|---|---|
| Course type 'presentation' : flow exam final | 0 cours actif de ce type | Dette anticipée — à reprendre si usage réel apparaît |
| Refactoring composants >1000 LOC (3 pages : 1468, 1284, 1087 LOC) | Wissam : "tant que ça marche". **Vérifié** : aucun des 14 items Scope IN n'est bloqué par la taille des composants (refetch, enums, loading states modifiables in-place) | Régression +5-10% sur modifications futures grosses zones. À monitorer ; refactor à planifier en sprint code-health post-epic |
| Items sécurité V1.1, V1.2, V1.3, V1.8, V1.9, V1.11, V1.12 | **Transférés à epic RLS V2/V3** (séparé, parallèle) | Aucun — découplage code/RLS confirmé par cross-check |
| Markdown XSS sanitization (Programmes) | Chantier sécurité dédié, hors UX | Bas, isolé à 1 surface non-critique |
| Tests e2e Programmes / Questionnaires | Chantier QA séparé | Moyen — à planifier post-epic UX |
| Analytics dashboard e-learning completion | Feature additionnelle, pas une zone d'ombre | Aucun |

---

## 7. Définition du succès

KPIs mesurables avec baseline, méthode et fenêtre.

| # | KPI | Baseline (pré-deploy) | Cible (post-deploy 30j) | Méthode mesure | Owner |
|---|---|---|---|---|---|
| 1 | Tickets support "bouton inerte / silence" | Audit Zendesk 30j (regex : `bouton\|click\|rien ne se passe\|aucun retour` AND `formation\|planning\|finances\|questionnaire\|elearning`) | ≤ baseline ÷ 2 | Tag Zendesk `LMS-UX-FIX` post-deploy + comptage hebdo | Wissam |
| 2 | Imports admin >20 apprenants réussis | 0% (stub) | 100% en <2 min, avec count créé/erreur visible + lien résultats | Logs background function + observabilité Netlify | Wissam |
| 3 | Pertes de réponses questionnaire signalées | À mesurer (informel) | 0 signalement learner sur 30j | Instrumentation `beforeunload` + log draft saves + canal direct support | Wissam |
| 4 | Boutons & dropdowns sans `onClick` | Audit code (≥3 confirmés) | 0 (script grep automatique pré-merge) | CI : grep `<DropdownMenuItem\|<Button` sans `onClick=` | CI/CD |
| 5 | Enums applicatifs alignés (Zod ↔ TS ↔ DB) | 2 mismatches confirmés (course type, BPF funding) | 0 mismatch | Test unitaire dédié `enums-consistency.test.ts` | Wissam |
| 6 | Loading state sur actions async >200ms | Audit manuel : ≥4 confirmés absents | 100% des async user-facing avec feedback (spinner / skeleton / bouton disabled) en <200ms | Checklist PR + grep `useState.*loading` sur PR diff | Wissam (review) |
| 7 | Pagination serveur Hub E-Learning + Programmes | Client-only (`.slice()`) | Test avec dataset 200+ entrées : pas de freeze, scroll fluide | Test e2e seed 200 entrées | Wissam |

**Validation statistique** : cohorte admin restreinte (~5-10), donc baseline KPI 1 sera mesurée sur **60 jours pré-deploy** au lieu de 30 pour fiabilité, et fenêtre post-deploy sera également 60 jours avant verdict.

---

## 8. Décisions de design + confirmations PRD requises

Reframe des "hypothèses critiques" en 2 catégories actionnables.

### A. Validations PRD (input data/business requis)

| # | Question | Owner décision | Input requis | Critère d'acceptation |
|---|---|---|---|---|
| 1 | Borne haute bulk import (50 / 200 / 1000 ?) | Wissam | Query prod : max import observé 6 derniers mois + roadmap commerciale | Si ≤100 : Netlify BG function suffit. Si >100 : architecture queue externe requise (décision PRD avant story bulk import). |
| 2 | Volumes utilisateurs réels par entité | Wissam | Query Supabase `profiles` GROUP BY role + entity_id | Estimations §3 confirmées à ±50%, sinon re-estimation effort |
| 3 | TabPlanning auto-fill : feedback déjà présent ou absent ? | Wissam | Lecture complète composant + test manuel | Confirmer si item #4 du scope est en M ou en S |

**Gate** : items 1 et 2 doivent être résolus **avant** kickoff PRD. Item 3 peut être résolu pendant PRD.

### B. Décisions de design (UX / architecture)

| # | Décision | Owner | Input requis | Deadline |
|---|---|---|---|---|
| 4 | Comportement questionnaire pré-rempli admin : learner écrase ? warn ? lock ? | Wissam + métier MR/C3V | Audit métier : qui pré-remplit aujourd'hui, quel cas d'usage ? | PRD kickoff |
| 5 | Refetch full vs optimistic update sur mutations TabAbsences/TabDocsPartages | Wissam | Trade-off latence vs complexité revert | PRD kickoff |

---

## 9. Contraintes et risques

**Techniques** :
- **Netlify timeout 26s sur fonctions sync** (plan actuel : standard Netlify Functions). Background Functions : 15 min max. → Si bulk import nécessite >50 apprenants régulièrement, escalade plan ou queue externe. Décision verrouillée au design review pré-story #1.
- **Supabase RLS** : chaque nouvelle query doit filtrer par `entity_id` (CLAUDE.md règle absolue). Items entity_id manquants hors scope UX (transférés RLS V2/V3).
- **Composants monolithiques** (1500 LOC reader, etc.) : toléré par Wissam. Vérifié : aucun item Scope IN n'est bloqué par leur taille. Risque régression +5-10% à monitorer.

**Organisationnels** :
- **Un seul dev (Wissam)** : sequencing strict, pas de parallélisation. Epic 1-2 mois = ~8 semaines focus avec ~50% capacité effective (autres chantiers en cours).
- **Pas de QA dédié** : checklist verification + test plan par story obligatoires.
- **Branche prod (main) = Netlify auto-deploy** : merger en `develop` d'abord, regrouper en releases.

**Risques résiduels** :
- Élargissement scope si MINOR remontent en MAJOR pendant exécution.
- Couplage caché entre items (ex. changement enum course type → migration nécessaire).
- Background function bulk import = nouvelle dépendance infra (queue, retry, observability).

---

## 10. Recommandation

1. **PRD requis** — oui. 14 items, 5 sous-systèmes, 3 personas → sans PRD, dérive et scope creep inévitables.
   - **Entrée PRD** : validations §8.A items 1 et 2 résolues (query prod, 1 semaine).
   - **Owner PRD** : Mary (BA) + Wissam (dev).
   - **Durée PRD** : 1 semaine.
   - **Sortie PRD** : 14 items refinés en stories, dépendances mappées, architecture bulk import décidée (BG function vs queue), test plan par persona.

2. **Architecture document** — partielle, **uniquement pour le bulk import >20** (background function design, idempotency, observability, retry). Les 13 autres items = fixes UX locaux ne nécessitant pas doc archi dédiée.

3. **Découpage epics suggéré** (3 epics séquencés) :
   - **Epic 1 — Promesses cassées (archétype C)** : enums unification, dropdowns inertes, refetch mutations, historical scoring. ~3 semaines. Plus fort impact confiance utilisateur → en premier.
   - **Epic 2 — Signaux de fin (archétype A)** : bulk import background, loading states, step indicators, draft auto-save. ~3-4 semaines. Inclut le seul item infra (BG function) → à isoler.
   - **Epic 3 — Limites silencieuses (archétype B)** : pagination serveur (E-Learning + Programmes), batch ops confirmations. ~1-2 semaines. Clôture.

4. **Séquencement vs RLS V2/V3** :
   - Si RLS V2/V3 non démarré et Wissam doit choisir : **recommandation RLS V2/V3 d'abord** (5-7 jours pour clore sécurité), puis UX Epic (6-8 semaines).
   - Si RLS V2/V3 déjà assigné en parallèle : UX Epic peut démarrer immédiatement post-validations §8.A.
   - Risque : si RLS V2/V3 introduit changements de schéma, re-estimer stories UX impactées.

---

## ⚠ Issues non résolues (décision Wissam requise)

La review completeness (verdict : major-rework) signale 2 points qui requièrent un signoff explicite avant gel du brief :

1. **Signoff Scope IN** : les 14 items §5 sont la **proposition Mary**, pas un signoff Wissam confirmé. → Wissam doit explicitement valider (ou amender) cette liste avant kickoff PRD. Modalité suggérée : commit/issue/email avec liste émargée.

2. **Items sécurité V1.1-V1.3, V1.8, V1.9, V1.11, V1.12** : ce brief les transfère à l'epic RLS V2/V3 (§6). → Wissam doit confirmer que cet epic RLS V2/V3 est bien planifié et "ownerisé", sinon ces 7 items risquent de tomber entre les chaises.

Les autres "major" des reviews ont été résolus dans le corps du brief v2 (cf. §Changements vs draft v1).

---

## Changements vs draft v1

- **§ Status of RLS Work ajouté** (Review 1, issue "branche fix/rls-multi-tenant-v1-p0 mergée") : clarification upfront sur statut RLS V1/V2/V3 et exclusion explicite des 7 items sécurité.
- **§1 reframé** (Review 2, issue "Problématique conflate technique et business") : passage d'un constat technique à un cost-of-inaction orienté utilisateur + window Q3 onboarding.
- **§2 cost of inaction ajouté** (Review 2, issue "preventive vs reactive") : baseline tickets estimée + projection Q3 + window opportunité.
- **§3 footnote validation gate** (Review 1 + Review 2, issue "volumes non validés") : méthode query prod + trigger re-estimation si >2x.
- **§4 en-tête traçabilité cross-check** (Review 1 issue "sources sub-agents non documentées" + Review 2 nit "lineage") : référence audit + méthodologie cross-check inline.
- **§4 snippet inline dropdown** (Review 1 minor "exemples sans snippet") : extrait de code pour dropdown inerte.
- **§5 disclaimer signoff Wissam** (Review 1 blocker "items non confirmés") : marquage "PROPOSÉ" + déplacement vers Issues non résolues.
- **§5 footnote échelle effort** (Review 1 minor + Review 2 minor "T-shirt sans contexte") : définition S/M/L en jours + bilan total réaliste 4 semaines.
- **§6 colonne Risque résiduel** (Review 2 issue "refactoring justifié par tolérance") : trade-off explicite, vérification que Scope IN n'est pas bloqué par taille composants.
- **§6 ligne items sécurité V1.X transférés RLS V2/V3** (Review 1 major "contradiction sécurité") : exclusion documentée avec rationale.
- **§7 KPIs avec baseline + méthode + owner** (Review 1 + Review 2, issues "KPIs aspirationnels") : tableau structuré, fenêtre 60j vs 30j pour cohorte restreinte, méthodes mesurables.
- **§8 reframé "hypothèses" → "Décisions de design + confirmations PRD"** (Review 1 major "hypothèses vagues") : 2 catégories avec owners, inputs, critères, deadlines.
- **§8 item bulk import volume = pre-PRD gate** (Review 2 issue "architectural decision deferred") : validation déplacée avant PRD pour verrouiller choix infra.
- **§9 plan Netlify précisé** (Review 1 minor "Netlify timeout context") : plan actuel + escalade conditionnelle.
- **§10 PRD entry/exit criteria** (Review 2 issue "PRD recommandé mais non gated") : owners, durée, gates explicites.
- **§10 séquencement RLS vs UX explicite** (Review 1 nit "punt sur la décision") : recommandation conditionnelle au lieu de "Wissam choisit".

Minor/nits non intégrés (jugés cosmétiques sans valeur ajoutée pour le sponsor) : reformulations stylistiques mineures et expansion appendix A cross-check matrix (jugée trop lourde pour brief exécutif).

## Reviews adversariales

- **Review completeness (Mary)** : verdict **major-rework** → traité dans v2 (signoff explicite reframe, sécurité documentée, hypothèses restructurées). Items résiduels listés en §Issues non résolues pour décision Wissam.
- **Review business framing** : verdict **minor-tweaks** → traité dans v2 (problématique reframe, cost of inaction, KPIs measurables, PRD gates).

## Prochaine étape recommandée

**PRD** avec les pré-conditions suivantes :

1. **Signoff Wissam sur les 14 items Scope IN** (§5) — bloquant.
2. **Confirmation epic RLS V2/V3 owné et planifié** (transfert des 7 items sécurité confirmé) — bloquant.
3. **Validations §8.A items 1 (volume bulk import) et 2 (volumes utilisateurs)** via query prod — bloquant.
4. **Estimation 1 semaine pour ces 3 pré-conditions**, puis kickoff PRD 1 semaine, puis sprint planning Epic 1 (Promesses cassées).

**Justification** : 14 items × 5 sous-systèmes × 3 personas + 1 item infra (BG function bulk import) → sans PRD, risque élevé de dérive scope et de mauvaise architecture infra. Le sprint direct serait acceptable uniquement pour les items archétype C les plus simples (refetch mutations, enums alignés), mais le mélange A/B/C + infra justifie un PRD structurant. Recommandation forte : ne pas court-circuiter le PRD malgré la fenêtre opportune.