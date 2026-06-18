# Audit Quick Wins — Portails utilisateurs (Apprenant / Formateur / Client)

> 2026-06-18 · Périmètre : 28 pages des 3 portails utilisateurs · Seuil quick win : < ~1h chacun.
> Méthode : inventaire sourcé depuis le code, 3 audits parallèles, chaque finding cité `fichier:ligne`.
> Effort : **XS** < 15 min · **S** < 1h. Impact = effet sur la fluidité du parcours.

**28 quick wins identifiés.** Aucun ne touche l'archi ni le backend. Les pages suivantes sont **propres** : apprenant `change-password`, `sessions/[id]/sign`, `courses/[courseId]` ; formateur `courses`, `contracts`, `profile` ; client `profile`.

---

## A. Patterns transverses (à traiter en lot — meilleur ratio impact/effort)

Ces frictions reviennent sur plusieurs portails ; un même correctif les règle d'un coup.

### A1. Heures non forcées en Europe/Paris (régression possible post-fix créneaux)
- `learner/calendar/page.tsx:226` (fallback `"9"` + `getHours()` navigateur)
- `trainer/planning/page.tsx:161` (`format(parseISO(...), "HH:mm")` sans timeZone)
- **Friction** : heure décalée d'1h selon le fuseau du poste — incohérent avec les pages qui forcent déjà `timeZone: "Europe/Paris"` (`sign`).
- **Quick win** : utiliser `toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit", timeZone:"Europe/Paris" })` partout.
- **Effort** : XS×2 — **Impact** : moyen (cohérence avec le fix créneaux qu'on vient de livrer)

### A2. Padding racine incohérent d'une page à l'autre
- Apprenant : `questionnaires/page.tsx:192`, `my-trainings/page.tsx:335` (nus) vs autres en `p-6`
- Formateur : `sessions/page.tsx:113`, `planning/page.tsx:96` (nus) vs `tasks/evaluations/contracts` en `p-6`
- Client : `documents/page.tsx:68` (`p-6` peut-être redondant avec le layout parent)
- **Quick win** : harmoniser le wrapper racine de chaque portail (vérifier le `layout.tsx` parent, appliquer `p-6` ou le retirer partout de façon cohérente).
- **Effort** : XS — **Impact** : moyen

### A3. Erreurs Supabase avalées silencieusement (`catch {}` / pas de test `error`)
- `learner/courses/page.tsx:131`, `learner/documents/page.tsx:144` (`catch {}`)
- `trainer/evaluations/page.tsx:163` (`catch {}` "silently fail", pas de `useToast`)
- `trainer/sessions/[id]/sign/page.tsx:94-201` (erreurs de chargement non remontées → compteurs "0/0" trompeurs)
- **Friction** : en cas d'échec réseau/RLS, l'utilisateur voit "aucune donnée" au lieu d'une erreur → croit que c'est vide.
- **Quick win** : ajouter `if (error) toast(...)` + distinguer état d'erreur de l'état vide.
- **Effort** : S — **Impact** : moyen

### A4. Édition de profil sans validation (hors règle projet RHF+Zod)
- `learner/page.tsx:328-364` (+ email `:691`)
- `trainer/page.tsx:584-677` (+ email `:618`)
- **Friction** : email vide/malformé enregistré sans message sous le champ.
- **Quick win** : valider l'email avant submit + afficher l'erreur sous le champ (idéalement RHF+Zod).
- **Effort** : S — **Impact** : moyen

### A5. États vides non contextualisés par le filtre actif
- `trainer/sessions/page.tsx:142` ("Aucune session" quel que soit le filtre)
- `client/formations/page.tsx:178` ("Aucune formation" même quand d'autres onglets ont des données)
- **Quick win** : message selon le filtre ("Aucune session à venir / terminée") + éventuel bouton "Voir tout".
- **Effort** : XS — **Impact** : moyen

### A6. Affordance trompeuse : éléments avec hover mais non cliquables
- `learner/page.tsx:865` ("Certificats disponibles / Téléchargeable" sans href) + `:178` (carte certif)
- `client/formations/page.tsx:186`, `client/learners/page.tsx:128` (cartes `hover:shadow` sans onClick)
- **Friction** : l'utilisateur clique, rien ne se passe (cul-de-sac).
- **Quick win** : soit pointer vers la bonne destination (`/learner/documents`), soit retirer l'effet hover / ajuster le libellé.
- **Effort** : XS — **Impact** : moyen

---

## B. Frictions à fort impact (spécifiques)

### B1. Profil apprenant non configuré → page blanche silencieuse (4 pages)
- `learner/contacts/page.tsx:63`, `my-trainings/page.tsx:148`, `questionnaires/page.tsx:78`, `calendar/page.tsx:163`
- **Friction** : `setLoading(false); return;` sans rien afficher → page vide sans explication. Le pattern correct existe déjà (`learner/page.tsx:388` "Profil apprenant non configuré").
- **Quick win** : réutiliser cet empty state ("Profil non configuré — contactez l'administrateur") dans les 4 pages.
- **Effort** : S — **Impact** : **fort**

---

## C. Autres quick wins (impact moyen/faible, spécifiques)

| Portail | Finding | Fichier:ligne | Effort | Impact |
|---|---|---|---|---|
| Apprenant | Catalogue/cours assignés sans loading ni empty state | `learner/courses/page.tsx:530` | S | moyen |
| Apprenant | Pas de feedback global si validation questionnaire échoue (scroll + toast) | `learner/questionnaires/[id]/page.tsx:292` | S | moyen |
| Apprenant | Jour calendrier vide : aucun retour visuel | `learner/calendar/page.tsx:557` | XS | faible |
| Apprenant | Module manuel sans URL = `<a href="#">` trompeur | `learner/courses/page.tsx:487` | XS | faible |
| Formateur | Planning : pas d'état vide pour semaine libre | `trainer/planning/page.tsx:181` | XS | faible |
| Formateur | Questionnaire : `session_id` manquant détecté trop tard (effort perdu) | `trainer/questionnaires/[id]/fill/page.tsx:166` | S | moyen |
| Formateur | Signature : vérifier validation explicite avant `onSign` | `trainer/sessions/[id]/sign/page.tsx:336` | S | moyen |
| Client | Page formations n'affiche que la date de début (pas la plage) | `client/formations/page.tsx:197` | XS | moyen |
| Client | "Contactez votre organisme" sans lien mailto | `client/documents/page.tsx:177` | XS | moyen |
| Client | Incohérence design system (couleurs brutes vs tokens shadcn) | `client/formations/page.tsx:154`, `learners/page.tsx:98` | S | moyen |
| Client | Carte "Documents" : compteur figé à `3` en dur | `client/page.tsx:326` | XS | faible |
| Client | Filtres en `<button>` natif au lieu de shadcn | `client/formations/page.tsx:162` | S | faible |

---

## Lot recommandé "première salve" (≈ une demi-journée, zéro risque)
1. **A1** Heures Europe/Paris (cohérence avec le fix créneaux) — XS
2. **A2** Padding harmonisé — XS
3. **A5** États vides contextualisés — XS
4. **A6** Affordance / éléments cliquables — XS
5. **B1** Profil non configuré → empty state (fort impact) — S
6. **A3** Erreurs Supabase non avalées — S

Puis seconde salve : A4 (validation profils), C (le reste par portail).
