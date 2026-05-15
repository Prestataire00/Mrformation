import type { Config } from "@netlify/functions";

/**
 * Cron qui déclenche la génération des notifications CRM pour chaque entité.
 *
 * Sans ce cron, le endpoint `/api/crm/notifications/generate` n'est appelé
 * qu'au chargement du `NotificationPanel` côté UI (donc uniquement quand un
 * user ouvre l'app). Avec ce cron tous les quart d'heure, on garantit que :
 *   - Les rappels (reminder_at) sont générés en notif dans les 15 min suivant
 *     leur échéance, même si personne n'est connecté.
 *   - Les rappels de devis/tâches en retard, dormants, anniversaires de
 *     prospect, etc. sont mis à jour régulièrement.
 *
 * La déduplication 24h dans l'endpoint évite le doublon de notifs.
 *
 * Multi-entity : on liste les entités via Supabase REST (service-role) puis
 * on hit l'endpoint une fois par entité — l'endpoint en lui-même attend un
 * `entity_id` UUID en payload quand appelé en mode cron.
 */
export default async () => {
  const baseUrl = process.env.URL || "http://localhost:3000";
  const cronSecret = process.env.CRON_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!cronSecret) {
    console.error("[cron task-reminders] CRON_SECRET not configured");
    return new Response("CRON_SECRET not configured", { status: 500 });
  }
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("[cron task-reminders] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
    return new Response("Supabase config missing", { status: 500 });
  }

  // 1. Récupère la liste des entités via Supabase REST + service-role (bypass RLS).
  let entities: Array<{ id: string; slug: string }> = [];
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/entities?select=id,slug`, {
      headers: {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
    });
    if (!res.ok) {
      throw new Error(`Supabase REST failed: ${res.status}`);
    }
    entities = await res.json();
  } catch (err) {
    console.error("[cron task-reminders] failed to fetch entities:", err);
    return new Response("Failed to fetch entities", { status: 500 });
  }

  // 2. Pour chaque entité, hit l'endpoint /api/crm/notifications/generate.
  const results: Array<{ slug: string; ok: boolean; created?: number; error?: string }> = [];
  for (const e of entities) {
    try {
      const res = await fetch(`${baseUrl}/api/crm/notifications/generate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cronSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ entity_id: e.id }),
      });
      const data = await res.json();
      results.push({
        slug: e.slug,
        ok: res.ok,
        created: data?.data?.created ?? data?.created,
        error: res.ok ? undefined : data?.error,
      });
    } catch (err) {
      results.push({
        slug: e.slug,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log("[cron task-reminders] results:", JSON.stringify(results));
  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

// Tous les quart d'heure : suffisant pour les rappels CRM (l'utilisateur
// accepte une latence max de 15 min entre `reminder_at` et la notif). La
// déduplication 24h côté endpoint évite tout spam.
export const config: Config = {
  schedule: "*/15 * * * *",
};
