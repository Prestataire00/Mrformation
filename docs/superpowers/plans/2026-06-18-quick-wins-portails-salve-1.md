# Quick Wins Portails — Salve 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer la première salve de quick wins UX des 3 portails utilisateurs (A1 fuseau horaire, A2 padding, A3 erreurs avalées, A5 états vides filtrés, A6 affordance cliquable, B1 profil non configuré).

**Architecture:** Corrections purement front (JSX/handlers), aucune touche backend/archi. Organisées **par portail** (fichiers disjoints) pour des tâches indépendantes et sans conflit. Source = audit `bmad_output/planning-artifacts/2026-06-18-audit-quick-wins-portails-utilisateurs.md`.

**Tech Stack:** Next.js 14, TypeScript, shadcn/ui, `useToast`, date `toLocaleTimeString(..., { timeZone: "Europe/Paris" })`.

**Vérification commune à chaque tâche :** `npx tsc --noEmit` (zéro erreur) après les edits.

---

## Fait établi (sourcé du code) — vaut pour A2 partout

`src/app/(dashboard)/layout.tsx:71` enveloppe DÉJÀ tout le contenu dans `<div className="p-4 md:p-6">`.
→ Toute page qui ajoute `p-6`/`px-…`/`py-…` sur son conteneur racine est en **double padding**.
**Correctif A2 = RETIRER** le padding racine redondant des pages qui en déclarent (garder uniquement `space-y-*`). Les pages sans padding racine sont déjà correctes — ne pas y toucher.

Snippet de référence A1 (formatage heure Paris, déjà utilisé dans `sessions/[id]/sign`) :
```ts
new Date(value).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })
```

---

### Task 1: Portail Apprenant

**Files (Modify) :**
- `src/app/(dashboard)/learner/calendar/page.tsx`
- `src/app/(dashboard)/learner/contacts/page.tsx`
- `src/app/(dashboard)/learner/my-trainings/page.tsx`
- `src/app/(dashboard)/learner/questionnaires/page.tsx`
- `src/app/(dashboard)/learner/courses/page.tsx`
- `src/app/(dashboard)/learner/documents/page.tsx`
- `src/app/(dashboard)/learner/page.tsx`

- [ ] **Step 1 — B1 : empty state "profil non configuré" sur 4 pages.**
  Le bon pattern existe déjà dans `learner/page.tsx` (~ligne 388, message "Profil apprenant non configuré"). Dans chacune des pages ci-dessous, là où le code fait actuellement `setLoading(false); return;` après une récupération de `learnerData` nulle/erreur, afficher à la place (au rendu) un état dédié quand `!learnerData` : un encart centré "Profil apprenant non configuré — contactez votre administrateur".
  - `learner/contacts/page.tsx` (~ligne 63)
  - `learner/my-trainings/page.tsx` (~ligne 148)
  - `learner/questionnaires/page.tsx` (~ligne 78)
  - `learner/calendar/page.tsx` (~ligne 163)
  Implémentation : ajouter un state `profileMissing` (bool) mis à `true` quand `learnerData` est absent ; au rendu, si `profileMissing`, retourner l'encart. Réutiliser le style/markup de `learner/page.tsx`.

- [ ] **Step 2 — A1 : heures du calendrier en Europe/Paris.**
  Dans `learner/calendar/page.tsx` : remplacer le calcul d'heure basé sur `getHours()` / fallback `"9"` (~ligne 226) et les affichages (~419, ~589) par le snippet `toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit", timeZone:"Europe/Paris" })` à partir de `start_time` du créneau. Si pas de créneau (pas d'heure connue), afficher "—" plutôt qu'une heure inventée.

- [ ] **Step 3 — A6 : "Certificats disponibles" / carte certif cliquables.**
  Dans `learner/page.tsx` : la `PriorityList` "Certificats disponibles" (~ligne 865) annonce "Téléchargeable" sans href → ajouter `href="/learner/documents"` sur ces items. La `CertificateCard` (~ligne 178, utilisée ~431) → l'envelopper dans `<Link href="/learner/documents">` (ou ajouter un lien "Voir mes documents").

- [ ] **Step 4 — A3 : ne plus avaler les erreurs Supabase.**
  - `learner/courses/page.tsx` (~131-160) : ajouter `if (error) toast({ variant: "destructive", title: "Erreur de chargement" })` sur les requêtes catalogue/programmes qui n'en ont pas.
  - `learner/documents/page.tsx` (~144) : remplacer le `catch {}` muet par un `catch (e) { toast(...) }` + un état d'erreur distinct de l'empty state ("Impossible de charger les documents").
  Vérifier que `useToast` est importé (sinon l'ajouter).

- [ ] **Step 5 — A2 : retirer le padding racine redondant.**
  Vérifier le conteneur racine de chaque page apprenant : si une page déclare `p-6`/`px-*`/`py-*` sur sa div racine, le retirer (garder `space-y-*`). Les pages `questionnaires` et `my-trainings` étaient "nues" (déjà correctes) — l'objectif est que TOUTES les pages apprenant aient le même comportement (aucun padding racine, hérité du layout).

- [ ] **Step 6 — Vérifier + commit.**
  `npx tsc --noEmit` → 0 erreur.
  ```bash
  git add "src/app/(dashboard)/learner"
  git commit -m "fix(learner): quick wins UX (profil non configuré, heures Paris, certificats cliquables, erreurs, padding)"
  ```

---

### Task 2: Portail Formateur

**Files (Modify) :**
- `src/app/(dashboard)/trainer/planning/page.tsx`
- `src/app/(dashboard)/trainer/sessions/page.tsx`
- `src/app/(dashboard)/trainer/evaluations/page.tsx`
- `src/app/(dashboard)/trainer/sessions/[id]/sign/page.tsx`

- [ ] **Step 1 — A1 : heures du planning en Europe/Paris.**
  `trainer/planning/page.tsx` (~ligne 161) : remplacer `format(parseISO(session.start_date), "HH:mm")` par `new Date(session.start_date).toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit", timeZone:"Europe/Paris" })`.

- [ ] **Step 2 — A5 : état vide contextualisé par filtre.**
  `trainer/sessions/page.tsx` (~ligne 142) : le message "Aucune session" doit dépendre du filtre actif → "Aucune session à venir" / "Aucune session terminée" / "Aucune session" (filtre "all").

- [ ] **Step 3 — A3 : remonter les erreurs de chargement.**
  - `trainer/evaluations/page.tsx` (~ligne 163) : remplacer le `catch {}` "silently fail" par un toast d'erreur (importer `useToast`) + état d'erreur avec bouton "Réessayer".
  - `trainer/sessions/[id]/sign/page.tsx` (~94-201) : capturer les `error` des requêtes `signatures`/`enrollments` et afficher un toast si l'une échoue (éviter les compteurs "0/0" trompeurs).

- [ ] **Step 4 — A2 : retirer le padding racine redondant.**
  `trainer/sessions/page.tsx` (~113) et `trainer/planning/page.tsx` (~96) étaient "nues" (déjà correctes). Vérifier que les autres pages formateur (`tasks`, `evaluations`, `contracts`) ne déclarent PAS `p-6` racine en double avec le layout ; si oui, le retirer (garder `space-y-*`). Objectif : cohérence (aucun padding racine).

- [ ] **Step 5 — Vérifier + commit.**
  `npx tsc --noEmit` → 0 erreur.
  ```bash
  git add "src/app/(dashboard)/trainer"
  git commit -m "fix(trainer): quick wins UX (heures Paris, état vide par filtre, erreurs remontées, padding)"
  ```

---

### Task 3: Portail Client

**Files (Modify) :**
- `src/app/(dashboard)/client/formations/page.tsx`
- `src/app/(dashboard)/client/learners/page.tsx`
- `src/app/(dashboard)/client/documents/page.tsx`

- [ ] **Step 1 — A5 : état vide contextualisé par filtre.**
  `client/formations/page.tsx` (~ligne 178) : message d'empty state selon le filtre actif (ne pas afficher "Aucune formation" si seul le filtre est vide) ; ajouter un bouton "Voir toutes" qui remet `filter` à `"all"` si `filter !== "all"`.

- [ ] **Step 2 — A6 : affordance des cartes.**
  `client/formations/page.tsx` (~ligne 186) et `client/learners/page.tsx` (~ligne 128) : les cartes ont `hover:shadow*` mais aucun `onClick`/lien → **retirer l'effet hover** (`hover:shadow-sm`/`hover:shadow`) pour ne pas suggérer une interactivité inexistante. (Pas de page détail client → on clarifie, on ne lie pas.)

- [ ] **Step 3 — A2 : padding racine.**
  `client/documents/page.tsx` (~ligne 68) déclare `space-y-6 p-6` → retirer `p-6` (garder `space-y-6`), car le layout fournit déjà `p-4 md:p-6`. Aligner sur `formations`/`learners`.

- [ ] **Step 4 — Bonus XS A6/UX : lien mailto Documents.**
  `client/documents/page.tsx` (~ligne 177) : "contactez votre organisme" → lien `mailto:acces.prestataires@i-a-infinity.com` (contact support du projet).

- [ ] **Step 5 — Vérifier + commit.**
  `npx tsc --noEmit` → 0 erreur.
  ```bash
  git add "src/app/(dashboard)/client"
  git commit -m "fix(client): quick wins UX (état vide par filtre, affordance cartes, padding, mailto)"
  ```

---

### Task 4: Validation finale + PR

- [ ] **Step 1 — Suite de tests + typecheck globaux.**
  `npx vitest run` → tout vert. `npx tsc --noEmit` → 0 erreur.

- [ ] **Step 2 — PR + merge.**
  ```bash
  git push -u origin <branche>
  gh pr create --fill --base main
  ```

---

## Self-Review

**Spec coverage (vs lot recommandé A1/A2/A5/A6/B1/A3) :**
- A1 → T1.Step2, T2.Step1. ✓
- A2 → T1.Step5, T2.Step4, T3.Step3 (avec correctif inversé : RETIRER le padding). ✓
- A3 → T1.Step4, T2.Step3. ✓
- A5 → T2.Step2, T3.Step1. ✓
- A6 → T1.Step3, T3.Step2 (+ mailto T3.Step4). ✓
- B1 → T1.Step1. ✓

**Placeholders :** les étapes pointent file:line + pattern de référence existant (learner/page.tsx pour B1, sign page pour A1) ; pas de "TBD".

**Cohérence :** A2 utilise partout le même fait (layout fournit `p-4 md:p-6` → retirer le padding racine). Le snippet Europe/Paris est identique à celui déjà en prod dans `sessions/[id]/sign`.

**Note :** ces correctifs sont du JSX/handler sans logique pure testable → vérification par `tsc` + revue ; pas de test unitaire ajouté (cohérent YAGNI).
