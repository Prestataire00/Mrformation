# Résumé — Tests anti-régression (QA Automation)

**Date :** 2026-06-24
**Module :** Documents / Attestations (prioritaire) — puis E-learning (à venir)
**Objectif :** réduire les bugs récurrents en prod via un filet de tests contrat exécutable.
**Framework :** Vitest (env `node`, déjà en place — 156 fichiers existants).

---

## Tests générés

### Tests contrat (couche données)
- [x] `src/lib/templates/__tests__/document-variables-invariant.test.ts` — **41 tests**
  - **Invariant « aucune variable de document non câblée »** sur les **37 doc_types** du registre (`SYSTEM_TEMPLATES_BY_DOC_TYPE`).
  - Détecte les **2 modes de panne**, indépendamment des données :
    - (A) `{{cle_technique}}` inconnue du resolver → subsiste après résolution à contexte vide.
    - (B) `[%Libellé Sellsy%]` absent de `ALIAS_TO_VARIABLE_KEY` → jamais converti.
  - 1 cas **par doc_type** : un échec **nomme le document fautif**.
  - 3 **méta-tests** prouvant que le détecteur attrape réellement une variable cassée (anti « test toujours vert »).

- [x] `src/lib/utils/__tests__/resolve-variables-attestations.test.ts` — **12 tests** (correctness)
  - **Assiduité (présence 0/100)** : apprenant présent (a signé) → heures = `planned_hours`, taux = `100.00` ; absent → `0.00` / `0.00` ; `signedLearnerIds` non fourni → présent par défaut ; `planned_hours` absent → `0.00` (pas de NaN) ; formatage 2 décimales.
  - **AIPR** : `resultat_examen_aipr` (success → « a réussi cet examen. », echec → « a échoué cet examen. », défaut = réussi) ; `ville_naissance_apprenant` (valeur ou placeholder d'audit).
  - **Compétences** : `signature_intervenant` (`<img>` si formateur signé, sinon zone vide).
  - **Preuve destructive** : bug injecté (absent → 100 %) → le test « ABSENT » échoue (`expected '100.00' to be '0.00'`) ; revert propre.

- [x] `src/lib/utils/__tests__/resolve-variables-timezone.test.ts` — **13 tests** (classe dates/fuseau)
  - **Helpers Paris indépendants du fuseau du process** : `formatTimeParis` / `getHourParis` / `formatYmdParis` restent en heure Paris même avec `process.env.TZ` = UTC / America-New_York / Asia-Tokyo (garde anti-retour à `getHours()`).
  - **Resolver** : `{{dates_detail}}` rend **09:00 / 12:00 (Paris)**, pas 07:00 / 10:00 (UTC) — verrouille le bug convocation, y compris sous fuseaux hostiles.
  - **Preuve destructive** : `formatTimeParis` repassé en `getHours()` → 7 tests échouent (UTC→07:00, NY→03:00) ; revert propre. Les tests forçant `TZ=UTC` attraperaient le bug **même si la CI tournait en Europe/Paris**.

### Tests E2E (navigateur)
- (aucun pour l'instant — décision : tests contrat d'abord ; E2E Playwright sur 2-3 flux UI critiques dans un second temps, une fois l'environnement de test cadré.)

---

## Couverture & vérification

- **État actuel des templates : propre** — 0 violation sur les 37 doc_types (les PDF partent sans placeholder visible aujourd'hui).
- **Rôle du test : filet anti-régression** — il cassera dès qu'un template introduira une variable non branchée (cause n°1 des « variables vides » signalées par le client, ex. `generate-from-template`).
- **Preuve de robustesse (vérif destructive)** : injection d'un `[%Variable Bidon%]` dans `attestation-assiduite.ts` → seul le test `attestation_assiduite` passe au rouge en nommant la variable ; revert propre ensuite.
- **Suite complète :** 159 fichiers / 1825 tests **verts**, 0 régression.

### ✅ Finding CORRIGÉ — `formatDate` TZ-naïf dans les documents
- **Cause** : `formatDate` (`src/lib/utils.ts`, date-fns local) rendait les dates documents dans le fuseau du process. En prod UTC, une date `22:00Z` (= 15/06 00:00 Paris) sortait **`14/06/2026`** au lieu de `15/06/2026` (off-by-one minuit).
- **Fix** : nouveau `formatDateParis` (TZ-safe, `src/lib/utils/paris-time.ts`) + routage des **11 call-sites de date** du resolver (`{{date_debut}}`, `{{date_fin}}`, `{{date_formation}}`, `{{date_today}}`, `{{dates_formation}}`, tableaux…). Import `formatDate` naïf retiré.
- **TDD** : 3 tests rouges (date_debut → 14/06) → verts après fix. Dates diurnes inchangées (non-régression). Snapshots inchangés.

### ✅ Émargement individuel — heures de créneaux en Paris (CORRIGÉ)
- [x] `src/lib/utils/__tests__/resolve-variables-emargement.test.ts` — **5 tests**.
- **Cause** : `{{tableau_signature_individuel}}` rendait les heures de vrais créneaux via `getUTCHours()`/`getUTCMinutes()` (heure affichée + libellé MATIN/APRÈS-MIDI) → **UTC, pas Paris**. Un créneau 11:00Z (= 13:00 Paris) sortait « 11:00 » et « MATIN ».
- **Fix** : `fmtTime` → `formatTimeParis`, bucket horaire → `getHourParis`. Branche fallback legacy préservée (libellés horaires fixes 09:00/12:00/13:00/17:00, non routés via fmtTime).
- **TDD** : 4 tests rouges (07:00/11:00, APRES MIDI manquant) → verts. Snapshot `emargement-individuel` régénéré (fixture rendue réaliste : créneaux 09:00-17:00 Paris stockés en 07:00Z-15:00Z). Plus aucun `getUTCHours` dans le resolver.

---

## Prochaines étapes (boucle anti-bugs)

1. ~~**Tests de correctness de résolution** (assiduité, compétences, AIPR)~~ ✅ **FAIT** (`resolve-variables-attestations.test.ts`).
2. **Classe « dates / fuseau »** : invariant sur les dates de documents (cf. `TIMEZONE.md`) — UTC serveur vs client.
3. **Classe « émargements / signatures »** : présence 0/100, convention `signer_id` formateur/apprenant.
4. **E-learning** : même approche (scoper la couche génération IA : outline / chapter / quiz / exam).
5. **CI** : brancher `npx vitest run` en gate de PR pour que le filet protège chaque livraison.
6. **Boucle par bug client** : `bmad-investigate` (cause racine) → fix → test contrat qui verrouille → `bmad-code-review` avant deploy.

> Checklist skill : `.claude/skills/bmad-qa-generate-e2e-tests/checklist.md`.
