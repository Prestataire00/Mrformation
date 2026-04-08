# LMS MR Formation / C3V Formation

## 🎯 Identité
Plateforme de gestion de formation professionnelle (LMS + CRM + BPF/Qualiopi).
Contact support : acces.prestataires@i-a-infinity.com

## 📐 Stack
- Next.js 14 (App Router), TypeScript strict
- Supabase (PostgreSQL, Auth, Storage, RLS)
- TailwindCSS + Shadcn/ui (Radix)
- React Hook Form + Zod pour les formulaires
- TanStack Table, Recharts, date-fns
- Resend + Gmail OAuth pour les emails
- jsPDF + html2canvas pour les exports PDF
- react-signature-canvas pour les émargements
- Déploiement : Netlify (main = prod, develop = dev)

## 🏢 Entités (multi-tenant)
| Entité | Slug | Couleur |
|--------|------|---------|
| MR FORMATION | mr-formation | #374151 |
| C3V FORMATION | c3v-formation | #2563EB |
⚠️ CHAQUE requête Supabase DOIT filtrer par entity_id. Aucune exception.

## 👤 Rôles & Permissions
- super_admin : accès total cross-entité
- admin : accès total dans son entité
- trainer : ses sessions, ses documents, ses émargements
- client : ses formations achetées
- learner : ses cours, ses attestations
⚠️ Chaque page doit vérifier le rôle via middleware + RLS Supabase.

## 📁 Structure du projet
- src/app/(auth)/ → login, register
- src/app/(dashboard)/admin/ → modules admin (clients, trainers, trainings, sessions, programs, questionnaires, documents, emails, signatures, reports, crm, formations/[id])
- src/app/api/ → routes API
- src/components/ui/ → composants Shadcn/ui
- src/lib/services/ → logique métier (CRUD Supabase)
- src/lib/validations/ → schémas Zod
- src/lib/types/ → interfaces TypeScript
- src/lib/supabase/ → client Supabase
- src/lib/auth/ → helpers auth
- src/lib/crm/ → logique CRM
- src/lib/gmail/ → intégration Gmail
- src/lib/utils/ → fonctions utilitaires
- supabase/schema.sql → ~30+ tables avec RLS

## 🎓 Module Formation (module central)
Architecture en 3 couches :
- Hub : src/app/(dashboard)/admin/trainings/page.tsx (liste cards)
- Cœur : src/app/(dashboard)/admin/formations/[id]/page.tsx (détail, 13 tabs)
- Satellites : sessions/, programs/, questionnaires/, signatures/

Les 13 tabs du détail formation :
TabResume, TabPlanning, TabParcours, TabEmargements, TabAbsences, TabElearning, TabMessagerie, TabEvaluation, TabSatisfaction, TabConventionDocs, TabDocsPartages, TabProgramme, TabFinances

Tables Supabase liées : sessions, trainings, programs, enrollments, learners, trainers, signatures, questionnaires, questions, questionnaire_responses, generated_documents, email_history

## Branches Git
- develop : développement actif
- main : production Netlify

## Migrations SQL
Exécuter dans l'ordre dans Supabase Dashboard :
1. add_formation_automation_rules.sql
2. add_formation_finances.sql
3. add_veille_notes.sql
4. add_affacturage.sql
5. add_certificateurs.sql

## Variables d'environnement
Voir .env.example

---

# 🔍 SKILL : AUDIT AUTOMATIQUE

## Quand l'utilisateur demande un audit, une vérification, ou un review d'un module ou d'une page, TOUJOURS appliquer cette procédure complète :

### Étape 1 — Inventaire
- Lister TOUS les fichiers du module concerné
- Identifier chaque composant, chaque page, chaque sous-composant (tabs, dialogs, modals)

### Étape 2 — Vérification des boutons et actions
Pour CHAQUE bouton, lien, et élément interactif :
- [ ] A un onClick, onSubmit, ou handler défini
- [ ] Le handler contient une implémentation réelle (pas vide, pas juste console.log)
- [ ] Le handler a un try/catch avec toast d'erreur
- [ ] Un état loading est géré pendant l'action async
- [ ] Un toast de succès confirme l'action
- [ ] Les données se rafraîchissent après l'action (refetch)

### Étape 3 — Vérification des formulaires
Pour CHAQUE formulaire :
- [ ] Utilise React Hook Form + Zod (pas de validation manuelle)
- [ ] Le schéma Zod couvre tous les champs
- [ ] Les erreurs de validation s'affichent sous chaque champ
- [ ] Le bouton submit est désactivé pendant le loading
- [ ] Les champs obligatoires sont marqués
- [ ] Le formulaire se reset après soumission réussie

### Étape 4 — Vérification Supabase
Pour CHAQUE appel Supabase :
- [ ] Filtre par entity_id (OBLIGATOIRE)
- [ ] Gestion d'erreur (if error) avec toast
- [ ] Les données sensibles ne sont pas exposées côté client
- [ ] Les requêtes SELECT utilisent .select() avec colonnes explicites (pas *)
- [ ] Les relations sont jointes correctement

### Étape 5 — Vérification des rôles et sécurité
- [ ] La page vérifie le rôle utilisateur
- [ ] Les actions admin ne sont pas accessibles aux autres rôles
- [ ] Les RLS policies existent dans schema.sql pour les tables utilisées

### Étape 6 — Vérification UX
- [ ] État vide (empty state) quand pas de données
- [ ] État de chargement (skeleton/spinner) pendant le fetch
- [ ] Responsive (mobile/tablet)
- [ ] Cohérence avec shadcn/ui
- [ ] Feedback visuel sur chaque action utilisateur
- [ ] Les modals/dialogs se ferment après action réussie
- [ ] Les tableaux ont pagination si > 20 lignes
- [ ] Les filtres et recherche fonctionnent

### Étape 7 — Vérification TypeScript
- [ ] Aucun type `any` utilisé
- [ ] Interfaces/types définis dans src/lib/types/
- [ ] Props typées pour chaque composant

### Étape 8 — Rapport
Générer un rapport structuré :


---

# 🛠️ SKILL : CORRECTION AUTOMATIQUE

## Quand l'utilisateur demande de corriger, fixer, ou améliorer après un audit :
1. Prendre chaque problème du rapport dans l'ordre de criticité
2. Appliquer la correction directement dans le code
3. Vérifier que la correction ne casse pas autre chose
4. Résumer ce qui a été changé

---

# 🧪 SKILL : GÉNÉRATION DE TESTS

## Quand l'utilisateur demande de générer des tests pour un module :
1. Tests unitaires Vitest dans src/lib/__tests__/[module].test.ts
   - Tester chaque fonction de service
   - Tester les schémas Zod
   - Tester l'isolation entity_id
2. Nommer clairement chaque test en français

---

# ✅ RÈGLES ABSOLUES (ne jamais enfreindre)

1. Jamais de type `any` en TypeScript
2. Jamais d'appel Supabase sans filtre entity_id
3. Jamais de table sans RLS
4. Jamais de bouton sans handler
5. Jamais d'action async sans try/catch + toast
6. Jamais de formulaire sans React Hook Form + Zod
7. Jamais de modification de schema.sql sans fichier de migration séparé
9. Toujours utiliser les composants shadcn/ui (pas de HTML natif pour les UI)
10. Toujours utiliser src/lib/services/ pour la logique Supabase (pas d'appels inline dans les composants)

