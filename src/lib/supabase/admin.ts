/**
 * Pédagogie V2 Epic 2.5 — Point d'entrée stable pour les admin tools.
 *
 * Ré-exporte `createServiceRoleClient` de `server.ts` sous le nom
 * `createAdminClient` pour fournir un import unique aux routes admin et
 * Background Functions qui ont besoin de bypass RLS (auth.admin.*, bulk
 * create learners, etc.).
 *
 * À utiliser UNIQUEMENT dans :
 *  - Routes API admin (auth via session admin → action service_role pour
 *    bypass RLS)
 *  - Cron jobs / Netlify Background Functions
 *  - JAMAIS dans un Client Component ni un Server Component public
 *
 * Le helper sous-jacent `createServiceRoleClient` throw si
 * `SUPABASE_SERVICE_ROLE_KEY` ou `NEXT_PUBLIC_SUPABASE_URL` ne sont pas set.
 */
export { createServiceRoleClient as createAdminClient } from "./server";
