# Rapport d'audit V1 — MR Formation

**Date** : 19 avril 2026 à 23:05
**Commit** : `8c84cb7`
**Script** : `scripts/audit-v1.js`

---

## Structure du projet

| Métrique | Nombre |
|----------|--------|
| Routes API | 114 |
| Pages | 100 |
| Migrations SQL | 100 |
| Composants/fichiers TS | 185 |
| **Total fichiers** | **405** |

---

## :green_circle: Points OK (12)

- Toutes les routes API ont une vérification d'auth ou sont publiques documentées
- RLS activée sur toutes les tables du schema
- Aucune clé API hardcodée détectée dans le code source
- Aucun console.log avec données sensibles détecté
- Aucune erreur TypeScript (tsc --noEmit)
- Aucun bouton avec onClick vide ou console.log-only
- Aucun TODO/FIXME/XXX/HACK dans le code
- 13 endpoint(s) cron documenté(s)
- Tous les endpoints cron vérifient CRON_SECRET ou auth
- 12 endpoint(s) IA détecté(s)
- Tous les endpoints IA ont un try/catch
- Toutes les routes API filtrent par entity_id ou sont user-scoped

## :yellow_circle: Points à surveiller (6)

### 28 policy(ies) USING (TRUE) trouvée(s) — vérifier si intentionnel

### 1 lien(s) potentiellement cassé(s)
- `/docs/ dans src/lib/services/gamma.ts`

### 1 variable(s) env référencée(s) absente(s) de .env.example
- `URL`

### 4 table(s) référencée(s) absente(s) du schema.sql
- `activity_logs`
- `documents`
- `invoices`
- `avatars`

### 32 console.log dans 11 fichier(s)
- `src/app/(dashboard)/admin/programs/import/page.tsx (4)`
- `src/app/api/crm/quotes/process-reminders/route.ts (1)`
- `src/app/api/crm/quotes/sign-request/route.ts (2)`
- `src/app/api/documents/process-sign-reminders/route.ts (1)`
- `src/app/api/emails/process-scheduled/route.ts (2)`
- `src/app/api/formations/automation-rules/run/route.ts (1)`
- `src/app/api/formations/automation-rules/run-cron/route.ts (4)`
- `src/app/api/invoices/process-reminders/route.ts (2)`
- `src/app/api/programs/import-pdf/route.ts (4)`
- `src/app/api/questionnaires/auto-send/route.ts (1)`
- `src/lib/services/gamma.ts (10)`

### 128 utilisation(s) de type "any" (top 10)
- `src/app/(dashboard)/admin/clients/[id]/page.tsx:211`
- `src/app/(dashboard)/admin/clients/[id]/page.tsx:363`
- `src/app/(dashboard)/admin/clients/[id]/page.tsx:666`
- `src/app/(dashboard)/admin/clients/[id]/page.tsx:667`
- `src/app/(dashboard)/admin/clients/[id]/page.tsx:668`
- `src/app/(dashboard)/admin/clients/[id]/page.tsx:669`
- `src/app/(dashboard)/admin/clients/[id]/page.tsx:670`
- `src/app/(dashboard)/admin/clients/[id]/page.tsx:671`
- `src/app/(dashboard)/admin/clients/[id]/page.tsx:1490`
- `src/app/(dashboard)/admin/clients/[id]/page.tsx:1503`

## :red_circle: Points critiques (0)

Aucun point critique détecté.
---

> Rapport généré automatiquement par `scripts/audit-v1.js`