# Audit Quick Wins — Espace Admin (75 pages)

> 2026-06-18 · 6 lots audités en parallèle, inventaire sourcé du code, chaque finding cité `fichier:ligne`.
> Effort : **XS** < 15 min · **S** < 1h. Hors tooling dev (`migration`, `library-migration`, `test-convention`).
> `planning/` traité à part (bug vue Jour corrigé, PR #304).

~58 quick wins vérifiés. Beaucoup relèvent de **patterns transverses** (gros levier). Trois items sortent du cadre quick-win (persistance backend) et sont isolés en fin de doc.

---

## P0 — Bugs de correction (XS, fort) — à faire en premier

### P0.1 — `SlotEditDialog` : offset DST calculé "à la main" → créneaux décalés d'1h aux bords
- `admin/formations/[id]/_components/SlotEditDialog.tsx:86-92` : offset Paris = `month>=4 && month<=10 ? 120 : 60`. Faux fin mars / fin octobre. **Même famille que le bug créneaux déjà corrigé.** → utiliser `toUtcIsoFromParisTime` de `@/lib/timezone`. **Impact fort** (émargement/Qualiopi).

### P0.2 — Littéraux `è`/`é` affichés bruts ("Accès", "trouvé")
- `admin/clients/apprenants/page.tsx:219-220, 241-242, 315` : séquences d'échappement dans du JSX simple → affichées littéralement. Régression visuelle sur une page très visitée. → remettre les caractères accentués.

### P0.3 — Entité codée en dur "MR FORMATION" dans l'export PDF d'émargement
- `admin/signatures/page.tsx:606` : `entityName: "MR FORMATION"` même en contexte C3V (multi-tenant) → document Qualiopi au mauvais en-tête. → `entity?.name` via `useEntity()`.

---

## A — Patterns transverses (traiter en lot)

### A1. Échecs réseau avalés / comptés comme succès (le plus répandu)
`catch {}` silencieux ou pas de test `res.ok`/`error` → l'utilisateur croit l'action réussie/les données absentes.
- `admin/sessions/page.tsx:370-388` (auto-envoi questionnaires — **fort**)
- `admin/formations/[id]/_components/TabEmargements.tsx:283-294` (envoi QR — échecs comptés en succès)
- `admin/ma-semaine/page.tsx:148` (envoi sans test `res.ok`)
- `admin/crm/suivi/page.tsx:192-193, 237-243, 255-260` (fetch + create + delete silencieux — **fort** sur le fetch)
- `admin/crm/prospects/page.tsx:373,432,445` (kanban add/edit/delete sans toast)
- `admin/crm/sequences/page.tsx:138-163, 186-208` (save/enroll → faux toast succès)
- `admin/users/page.tsx:340-350` (suppression user optimiste sans gestion d'erreur — **fort**)
- `admin/notifications/page.tsx:77,99,113` (3 catch silencieux + état optimiste)
- `admin/clients/apprenants/liste/page.tsx:187-196` (email masse, échecs non comptés)
**Quick win commun** : tester `res.ok`/`error`, toast destructif sur échec, n'incrémenter les compteurs que sur succès. **Effort** : XS–S chacun.

### A2. Heures non ancrées en Europe/Paris
- `admin/formations/[id]/_components/SlotEditDialog.tsx:86` (cf. P0.1)
- `admin/formations/[id]/_components/TabMessagerie.tsx:314-316` (programmation email : concat locale sans fuseau — **fort**)
- `admin/ma-semaine/page.tsx:255` (label jour sans `timeZone`)
**Quick win** : util Paris→UTC + affichage `{ timeZone: "Europe/Paris" }`.

### A3. Actions destructives sans confirmation
- `admin/sessions/page.tsx:1140` (retrait d'inscription en 1 clic)
- `admin/crm/sequences/page.tsx:281` (suppression séquence)
- `admin/signatures/page.tsx:422` (suppression signature émargement — **fort**, donnée Qualiopi)
- `admin/questionnaires/page.tsx:352` (suppression question)
**Quick win** : `useConfirmDialog`/AlertDialog (déjà utilisé ailleurs) avant l'appel.

### A4. Boutons morts / liens cul-de-sac (libellé qui ment)
- `admin/formations/[id]/page.tsx:318,322` ("Dupliquer" / "Supprimer la formation" sans handler — **fort** pour Supprimer)
- `admin/formations/[id]/_components/TabProgramme.tsx:206-219` ("Détails" et "Fichiers" → même URL)
- `admin/clients/page.tsx:604` ("Modifier" = "Voir le détail")
- `admin/crm/formulaires/page.tsx:494` ("Résultats" → dashboard global sans contexte)
- `admin/questionnaires/dashboard/page.tsx:473` ("Voir résultats →" → liste générique — **fort**)
- `admin/programs/page.tsx:839` ("Nouvelle version" ouvre l'historique)
- `admin/reports/incidents/page.tsx:310` + `admin/reports/amelioration/page.tsx:183` (boutons "Filtrer" sans `onClick`)
**Quick win** : câbler le bon handler/href, `disabled`+tooltip, ou corriger le libellé.

### A5. Dates affichées en ISO brut (au lieu de FR `dd/MM/yyyy`)
- `admin/reports/absences/page.tsx:230,236,149` · `admin/reports/amelioration/page.tsx:217` · `admin/reports/incidents/page.tsx:343` · `admin/formations/[id]/_components/TabElearning.tsx:524` · `admin/sessions/page.tsx:666` (dates sans heure)
**Quick win** : `formatDate`/`formatDateTime` (déjà dispo).

### A6. Toasts de succès manquants (action réussie sans retour)
- `admin/questionnaires/page.tsx:292,352` (toggle / suppression question)
- `admin/users/page.tsx:225-257` (changement mot de passe)
- `admin/formations/[id]/_components/TabElearning.tsx:257` (switch validation admin)

### A7. Défense en profondeur : `entity_id` absent sur DELETE/UPDATE
- `admin/clients/financeurs/page.tsx:127-142,157` · `admin/clients/apprenants/liste/page.tsx:145` · `admin/clients/page.tsx:264`
**Quick win** : ajouter `.eq("entity_id", entityId)` (cohérent avec le standard déjà appliqué aux formateurs).

### A8. Coquilles / libellés
- `admin/questionnaires/page.tsx:561` (export PDF : `${i+1}& =${c}` — `&` parasite)
- `admin/documents/variables/page.tsx:42` ("Copie"/"copie" → accents) · `admin/documents/import/page.tsx:184` (syntaxe `{{xxx}}` vs `[%...%]` officielle)
- `admin/reports/commercial/page.tsx:185,307` ("Totals") · `admin/reports/incidents/page.tsx:326` ("Status")
- `components/ProfilePage.tsx:427` (placeholder "6 caractères" alors que la règle = 12)

---

## B — Spécifiques (impact moyen/faible) — extrait

| Lot | Finding | Fichier:ligne | Effort | Impact |
|---|---|---|---|---|
| A | Programmation email sans date/heure → envoi immédiat silencieux | `formations/[id]/_components/TabMessagerie.tsx:314,689` | XS | moyen |
| A | Auto-fill planning : `confirm()` natif (écrase contenu pédago) | `formations/[id]/_components/TabPlanning.tsx:361` | S | moyen |
| C | Filtre entreprise appliqué APRÈS pagination → résultats manquants | `clients/apprenants/page.tsx:100` + `liste:209` | S | fort |
| C | Recherche IA formateurs sans sortie rapide (badge non cliquable) | `trainers/page.tsx:389` | XS | moyen |
| D | Export XLSX sans garde "0 ligne" ni toast | `questionnaires/dashboard/page.tsx:199` | XS | moyen |
| D | Réordonnancement question : pas de try/catch (échec silencieux) | `questionnaires/page.tsx:419` | S | moyen |
| D | `console.log` debug laissés (payload template) | `documents/page.tsx:827,845` | XS | faible |
| E | Montants `fmtEur` maison au lieu de `formatCurrency` | `reports/commercial/page.tsx:176` | XS | faible |
| E | Taux acceptation OPCO peut afficher `Infinity%` | `reports/opco/page.tsx:121` | XS | faible |
| E | Commercial sans skeleton (incohérent avec factures) | `reports/commercial/page.tsx:251` | XS | moyen |
| F | Suppression user via `window.confirm` natif (pas shadcn) | `users/page.tsx:342` | S | moyen |
| F | Suppression note veille sans loading (double-clic) | `veille/page.tsx:130,474` | XS | faible |
| F | ProfilePage adresse marquée `*` mais non validée | `ProfilePage.tsx:377` | XS | faible |

---

## Hors quick win — à arbitrer (persistance backend, > 1h)

⚠️ Ces 3 points donnent une UX "qui marche" mais **ne persistent rien** — à remonter au client :
- `admin/reports/amelioration/page.tsx` + `admin/reports/incidents/page.tsx` : registres Qualiopi (critère 32 / réclamations) **100 % en mémoire** → perdus au refresh. Nécessite table Supabase.
- `admin/lieux/page.tsx` : lieux stockés en **localStorage** (par navigateur, non multi-tenant, invisibles aux autres admins).

---

## Zones propres (RAS quick win)
Dashboard admin · TabResume/TabFinances/TabDocsPartages/TabAbsences · BulkSlotCreator · crm (dashboard, campaigns, automations, quotes, prospects/liste+portfolio, tasks) · trainings (toutes) · trainers/liste+cvtheque · programs/catalogue+import · elearning/create · documents/how-to · reports (factures, qualité, opco, activity) · affacturage · certificateurs · emails · settings/organization · support · contact-conseils.

---

## Lot recommandé "salve admin 1" (≈ une journée, zéro risque)
1. **P0.1/P0.2/P0.3** (3 bugs de correction XS, fort).
2. **A1** échecs réseau (le plus impactant — fiabilité perçue).
3. **A3** confirmations destructives + **A4** boutons morts/cul-de-sac.
4. **A5/A6/A7/A8** (dates FR, toasts, entity_id, coquilles) — XS en série.
Puis salve 2 : B (spécifiques) + décision client sur les 3 points de persistance.
