# Quick Wins Portails — Salve 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps en checkbox.

**Goal:** Livrer la seconde salve de quick wins UX des 3 portails (A4 validation des formulaires profil + Section C des findings spécifiques).

**Architecture:** Correctifs front, organisés par portail (fichiers disjoints). Source : audit `bmad_output/planning-artifacts/2026-06-18-audit-quick-wins-portails-utilisateurs.md`. La salve 1 (A1/A2/A3/A5/A6/B1 + mailto client) est déjà mergée.

**Tech Stack:** Next.js 14, TypeScript strict, shadcn/ui, React Hook Form + Zod, tokens shadcn (`text-foreground`, `bg-card`, `text-muted-foreground`, `Card`, `Badge`, `Button`).

**Vérif commune par tâche :** `npx tsc --noEmit` (0 erreur).

---

### Task 1: Portail Apprenant

**Files (Modify) :**
- `src/app/(dashboard)/learner/page.tsx`
- `src/app/(dashboard)/learner/courses/page.tsx`
- `src/app/(dashboard)/learner/questionnaires/[id]/page.tsx`
- `src/app/(dashboard)/learner/calendar/page.tsx`

- [ ] **Step 1 — A4 : validation du formulaire profil (accueil).**
  Dans `learner/page.tsx`, le mini-formulaire profil (prénom, nom, email, téléphone) utilise `useState` manuel sans validation. Avant `handleSaveProfile`, valider l'email avec un schéma Zod (`z.object({ email: z.string().email("Email invalide"), first_name: z.string().min(1, "Prénom requis"), last_name: z.string().min(1, "Nom requis") })`), et afficher le message d'erreur sous le champ concerné (state `errors` simple `Record<string,string>`). Bloquer la sauvegarde si invalide. (Migration RHF complète NON requise — validation Zod + affichage inline suffit, YAGNI.)

- [ ] **Step 2 — C : loading + empty state du catalogue e-learning.**
  `learner/courses/page.tsx` : le `loading` et l'empty state ne couvrent que le bloc "Mes Cours". Englober les sections secondaires (Catalogue, "Cours assignés via mes formations", "Cours & Supports") sous le même garde `!loading`, et si les listes principales sont toutes vides, garder l'empty state global visible (ne pas laisser un grand vide pendant/après le fetch).

- [ ] **Step 3 — C : feedback global si validation questionnaire échoue.**
  `learner/questionnaires/[id]/page.tsx` : au retour `false` de `validate()` (dans le handler d'envoi), afficher `toast({ variant: "destructive", title: "Veuillez répondre aux questions obligatoires" })` et scroller vers la première question en erreur (`document.querySelector` sur l'ancre/erreur, ou ref de la première question invalide → `scrollIntoView({ behavior: "smooth", block: "center" })`).

- [ ] **Step 4 — C : module manuel sans URL = lien mort.**
  `learner/courses/page.tsx` : un module sans `content_url` est rendu en `<a href="#">` (cursor-default). Le remplacer par un `<div>` (pas d'ancre `#`) et ajouter un badge "Bientôt disponible" pour signaler l'indisponibilité.

- [ ] **Step 5 — C : jour de calendrier vide sans retour.**
  `learner/calendar/page.tsx` : en vue mois, le panneau détail n'apparaît que si `selectedDaySessions.length > 0`. Le rendre visible dès qu'un jour est sélectionné, avec un empty state "Aucune session ce jour-là" si vide.

- [ ] **Step 6 — Vérifier + commit.**
  `npx tsc --noEmit` → 0 erreur.
  ```bash
  git add "src/app/(dashboard)/learner"
  git commit -m "fix(learner): quick wins salve 2 (validation profil, loading catalogue, feedback questionnaire, module sans url, jour vide)"
  ```

---

### Task 2: Portail Formateur

**Files (Modify) :**
- `src/app/(dashboard)/trainer/page.tsx`
- `src/app/(dashboard)/trainer/planning/page.tsx`
- `src/app/(dashboard)/trainer/questionnaires/[id]/fill/page.tsx`
- `src/app/(dashboard)/trainer/sessions/[id]/sign/page.tsx`

- [ ] **Step 1 — A4 : validation du formulaire profil.**
  Dans `trainer/page.tsx`, le formulaire profil (prénom, nom, email, téléphone) n'a aucune validation. Même approche que côté apprenant : schéma Zod (`email`, `first_name`, `last_name`), affichage de l'erreur sous le champ, blocage si invalide avant `handleSaveProfile`. (Pas de migration RHF complète requise.)

- [ ] **Step 2 — C : état vide pour une semaine libre.**
  `trainer/planning/page.tsx` : quand `weekSessions.length === 0`, la grille s'affiche avec des "—" mais aucun message. Ajouter sous la grille (ou dans le bloc "Détail de la semaine") un message "Aucune session planifiée cette semaine." quand `weekSessions.length === 0`.

- [ ] **Step 3 — C : `session_id` manquant détecté trop tôt (questionnaire).**
  `trainer/questionnaires/[id]/fill/page.tsx` : si `sessionId` est absent de l'URL, le questionnaire est remplissable et n'échoue qu'à l'envoi ("Contexte manquant"). Au rendu : si `!sessionId`, afficher un bandeau d'avertissement en haut ("Lien incomplet : ce questionnaire doit être ouvert depuis une session.") et désactiver le bouton "Envoyer" dès le départ.

- [ ] **Step 4 — C : confirmation de signature (à vérifier d'abord).**
  `trainer/sessions/[id]/sign/page.tsx` : vérifier le composant `SignaturePad` utilisé (cherche son fichier). S'il exige DÉJÀ une validation explicite (bouton "Valider la signature" avant d'appeler `onSign`), NE RIEN changer et le noter. Sinon, ajouter une étape de confirmation explicite avant l'enregistrement définitif de la signature (qui engage juridiquement). Ne pas sur-concevoir.

- [ ] **Step 5 — Vérifier + commit.**
  `npx tsc --noEmit` → 0 erreur.
  ```bash
  git add "src/app/(dashboard)/trainer"
  git commit -m "fix(trainer): quick wins salve 2 (validation profil, semaine vide, session_id manquant, signature)"
  ```

---

### Task 3: Portail Client

**Files (Modify) :**
- `src/app/(dashboard)/client/formations/page.tsx`
- `src/app/(dashboard)/client/learners/page.tsx`
- `src/app/(dashboard)/client/page.tsx`

- [ ] **Step 1 — C : afficher la plage de dates des formations.**
  `client/formations/page.tsx` : la liste n'affiche que `formatDate(session.start_date)` (icône horloge). Afficher `{formatDate(session.start_date)} — {formatDate(session.end_date)}` (comme le dashboard `client/page.tsx`) et utiliser l'icône `CalendarDays` au lieu de `Clock`.

- [ ] **Step 2 — C : compteur "Documents" figé en dur.**
  `client/page.tsx` : la `QuickActionCard` "Documents" affiche `count: 3` codé en dur (faux). Retirer le `count` de cette carte (afficher juste icône + libellé) pour ne pas promettre un nombre erroné.

- [ ] **Step 3 — C : migration vers les tokens shadcn (cohérence design system).**
  `client/formations/page.tsx` et `client/learners/page.tsx` utilisent des couleurs Tailwind brutes (`text-gray-900`, `bg-white border-gray-200`) et du HTML natif (`<div>` cards, `<button>` filtres). Remplacer :
  - les `<div>` cards par `<Card>/<CardContent>` (shadcn) ;
  - `text-gray-900`→`text-foreground`, `text-gray-500/600`→`text-muted-foreground`, `bg-white`→`bg-card`, `border-gray-200`→`border-border` ;
  - les filtres `<button>` natifs de `formations/page.tsx` par des `Button` shadcn (`variant={active ? "default" : "outline"}`) ou un `Tabs`/`ToggleGroup`. Conserver le comportement de filtrage existant à l'identique.

- [ ] **Step 4 — Vérifier + commit.**
  `npx tsc --noEmit` → 0 erreur.
  ```bash
  git add "src/app/(dashboard)/client"
  git commit -m "fix(client): quick wins salve 2 (plage de dates, compteur documents, tokens shadcn + filtres)"
  ```

---

### Task 4: Validation finale + PR

- [ ] **Step 1 :** `npx vitest run` (tout vert) + `npx tsc --noEmit` (0 erreur).
- [ ] **Step 2 :** `git push -u origin <branche>` puis `gh pr create --fill --base main`.

---

## Self-Review
- **A4** → T1.S1 (apprenant), T2.S1 (formateur). ✓
- **C apprenant** : catalogue loading (T1.S2), feedback questionnaire (T1.S3), module sans url (T1.S4), jour vide (T1.S5). ✓
- **C formateur** : semaine vide (T2.S2), session_id (T2.S3), signature (T2.S4). ✓
- **C client** : plage dates (T3.S1), compteur documents (T3.S2), tokens shadcn + filtres (T3.S3). ✓
- **Placeholders** : aucun ; chaque step donne le quoi/où + le schéma Zod exact + les correspondances de tokens.
- **Note** : T2.S4 est conditionnel (vérifier avant d'agir) — anti sur-conception. Aucun test unitaire ajouté (JSX/handlers, gate = tsc + revue).
