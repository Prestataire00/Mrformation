# Quick Wins Admin — Salve 1 — Implementation Plan

> REQUIRED SUB-SKILL: subagent-driven-development. Source = `bmad_output/planning-artifacts/2026-06-18-audit-quick-wins-admin.md`.

**Goal:** P0 (3 bugs de correction) + patterns transverses A1–A8 de l'audit admin. Front uniquement, zéro backend/archi.
**Hors scope (décision client) :** persistance Amélioration/Incidents/Lieux.
**Vérif par tâche :** `npx tsc --noEmit` = 0 erreur.

Référence transverse : heure murale Paris → UTC = `toUtcIsoFromParisTime(dateStr, timeStr)` de `@/lib/timezone` ; affichage heure = `toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit", timeZone:"Europe/Paris" })` ; dates FR = `formatDate`/`formatDateTime` de `@/lib/utils` ; confirmations = `useConfirmDialog` / AlertDialog shadcn ; toasts = `useToast`.

---

### Task 1 — Cœur formation (formations/[id], sessions, ma-semaine)
Fichiers : `admin/formations/[id]/_components/{SlotEditDialog,TabEmargements,TabMessagerie,TabProgramme,TabElearning}.tsx`, `admin/formations/[id]/page.tsx`, `admin/sessions/page.tsx`, `admin/ma-semaine/page.tsx`.
- **P0.1** `SlotEditDialog.tsx:86-92` : remplacer l'offset DST maison par `toUtcIsoFromParisTime`.
- **A1** `TabEmargements.tsx:283-294` : `if (res.ok) sent++` + compter les échecs (toast différencié). `sessions/page.tsx:370-388` : tester `res.ok`, toast destructif si échecs. `ma-semaine/page.tsx:148` : idem.
- **A2** `TabMessagerie.tsx:314-316` : ancrer `sent_at` en Europe/Paris ; `ma-semaine/page.tsx:255` : `timeZone:"Europe/Paris"` sur le label.
- **A3** `sessions/page.tsx:1140` : confirmation avant retrait d'inscription.
- **A4** `formations/[id]/page.tsx:318,322` : "Dupliquer"/"Supprimer" → `disabled` + tooltip "Bientôt disponible" (pas de handler à inventer). `TabProgramme.tsx:206-219` : différencier "Détails" vs "Fichiers" (ou fusionner en "Voir le programme").
- **A5** `sessions/page.tsx:666` : `formatDateTime` (avec heure). `TabElearning.tsx:524` : `formatDate`.
- **A6** `TabElearning.tsx:257` : toast succès sur le switch validation admin.
- **B** `TabMessagerie.tsx:314,689` : si mode "Programmer" sans date/heure → bloquer + toast (pas d'envoi immédiat silencieux).
- Commit : `fix(admin-formation): quick wins salve 1 (DST creneaux, echecs reseau, confirmations, libelles)`.

### Task 2 — CRM (suivi, prospects, sequences, formulaires)
Fichiers : `admin/crm/{suivi,prospects,sequences,formulaires}/page.tsx`.
- **A1** `suivi/page.tsx:192-193,237-243,255-260` : toast erreur sur fetch/create/delete (et toast succès création) ; re-fetch sur échec delete. `prospects/page.tsx:373,432,445` : importer `useToast`, toasts succès+erreur sur add/edit/delete. `sequences/page.tsx:138-163,186-208` : tester `error` avant le toast succès (pas de faux succès).
- **A3** `sequences/page.tsx:281` : confirmation avant suppression de séquence.
- **A4** `formulaires/page.tsx:494` : passer `?questionnaire_id=${q.id}` (ou libellé "Ouvrir dans Questionnaires").
- Commit : `fix(admin-crm): quick wins salve 1 (feedback erreurs, confirmation, lien resultats)`.

### Task 3 — Entités (clients, financeurs, trainers)
Fichiers : `admin/clients/{page,apprenants/page,apprenants/liste/page,financeurs/page}.tsx`, `admin/trainers/page.tsx`.
- **P0.2** `clients/apprenants/page.tsx:219-220,241-242,315` : remplacer les littéraux `è`/`é` par les caractères accentués réels.
- **A7** `clients/financeurs/page.tsx:127-142,157`, `clients/apprenants/liste/page.tsx:145`, `clients/page.tsx:264` : ajouter `.eq("entity_id", entityId)` sur DELETE/UPDATE.
- **A4** `clients/page.tsx:604` : retirer l'item "Modifier" (doublon de "Voir le détail") OU pointer vers `?edit=1`.
- **A1** `clients/apprenants/liste/page.tsx:187-196` : compter et afficher les échecs dans le toast email de masse.
- **C(fort)** `clients/apprenants/page.tsx:100-103` & `liste/page.tsx:209-213` : le filtre entreprise s'applique APRÈS la pagination serveur → résultats manquants. Passer le filtre entreprise dans la requête Supabase (`.eq("client_id", …)` / jointure) ; si trop risqué, afficher un avertissement "filtre limité à la page courante". **À traiter prudemment.**
- **A4** `trainers/page.tsx:389` : rendre le badge "Résultats IA" cliquable → sortie du mode IA (`setAiMode(false); setSearch(""); fetchTrainers()`).
- Commit : `fix(admin-entites): quick wins salve 1 (accents, entity_id, filtres pagination, libelles)`.

### Task 4 — Pédagogie (questionnaires, programs, documents, signatures)
Fichiers : `admin/questionnaires/{page,dashboard/page}.tsx`, `admin/programs/page.tsx`, `admin/documents/{page,variables/page,import/page}.tsx`, `admin/signatures/page.tsx`.
- **P0.3** `signatures/page.tsx:606` : `entityName` depuis `useEntity()` (récupérer `entity?.name`) au lieu de "MR FORMATION" codé en dur.
- **A3** `signatures/page.tsx:422` : confirmation + toast succès sur suppression de signature. `questionnaires/page.tsx:352` : confirmation suppression question.
- **A4** `questionnaires/dashboard/page.tsx:473` : "Voir résultats" → contexte (`?stats=<id>`) ou libellé "Ouvrir dans Questionnaires". `programs/page.tsx:839` : renommer "Nouvelle version" → "Historique des versions".
- **A6** `questionnaires/page.tsx:292,352` : toast succès toggle/suppression.
- **A8** `questionnaires/page.tsx:561` : corriger `${i+1}& =${c}` → `${i+1} étoile(s): ${c}`. `documents/variables/page.tsx:42` : accents "Copié". `documents/import/page.tsx:184` : `{{xxx}}` → `[%...%]`. `documents/page.tsx:827,845` : retirer les `console.log`.
- **B** `questionnaires/dashboard/page.tsx:199` : garde `stats.length===0` + toast ; `questionnaires/page.tsx:419` : try/catch + toast + re-fetch sur réordonnancement.
- Commit : `fix(admin-pedagogie): quick wins salve 1 (entite signature, confirmations, libelles, coquilles)`.

### Task 5 — Reporting + Config (reports, users, notifications, veille, profile)
Fichiers : `admin/reports/{incidents,amelioration,absences,commercial,opco}/page.tsx`, `admin/users/page.tsx`, `admin/notifications/page.tsx`, `admin/veille/page.tsx`, `components/ProfilePage.tsx`.
- **A4** `reports/incidents/page.tsx:310` & `reports/amelioration/page.tsx:183` : boutons "Filtrer" morts → retirer OU convertir en "Réinitialiser" (vide les filtres).
- **A5** `reports/absences/page.tsx:230,236,149`, `reports/amelioration/page.tsx:217`, `reports/incidents/page.tsx:343` : `formatDate` (affichage + export).
- **A1** `users/page.tsx:340-350` : try/catch + `res.ok` + toast ; ne retirer de la liste que sur succès. `notifications/page.tsx:77,99,113` : toast erreur dans les catch (importer `useToast`).
- **A3** `users/page.tsx:342` : remplacer `confirm()` natif par `useConfirmDialog`.
- **A6** `users/page.tsx:225-257` : toast succès changement de mot de passe.
- **A8** `reports/commercial/page.tsx:185,307` ("Totals"→"Total"), `reports/incidents/page.tsx:326` ("Status"→"Statut"), `ProfilePage.tsx:427` (placeholder aligné sur la règle 12 car.).
- Petits : `reports/commercial/page.tsx:176` (`formatCurrency`), `reports/opco/page.tsx:121` (garder le dénominateur, tester `>0` pour éviter `Infinity%`), `veille/page.tsx:130,474` (state `deleting`+`disabled`), `ProfilePage.tsx:377` (retirer le `*` de l'adresse non validée).
- Commit : `fix(admin-reporting): quick wins salve 1 (boutons morts, dates FR, feedback erreurs, coquilles)`.

### Task 6 — Validation + PR
`npx vitest run` (vert) + `npx tsc --noEmit` (0). Puis `git push` + `gh pr create --fill --base main`.
