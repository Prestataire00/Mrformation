/**
 * Scheduler cron IN-PROCESS pour Railway (remplace les 7 fonctions planifiées
 * Netlify `netlify/functions/process-*.mts` + `auto-send-questionnaires.mts`).
 *
 * Pourquoi (DUAL-MODE Netlify / Railway) :
 *   - Sur Netlify, les crons sont des Scheduled Functions (`export const config
 *     = { schedule }`), déclenchées par la plateforme.
 *   - Sur Railway (conteneur long-lived), il n'y a pas de scheduler natif simple
 *     sans configurer des services cron à la main. On démarre donc un petit
 *     scheduler dans le process du serveur Next (via `instrumentation.ts`), qui
 *     n'est activé QUE sur Railway (cf. `isRailway()` côté instrumentation).
 *
 * Toute la logique métier vit déjà dans des routes API — ce scheduler n'est
 * qu'un « pinger » interne : il tape les mêmes routes que les `.mts`, avec le
 * même header `Authorization: Bearer CRON_SECRET` (le middleware bypasse dessus),
 * en loopback (`getInternalBaseUrl()`), aux mêmes cadences.
 *
 * ⚠️ Fuseau : on évalue les cadences en **UTC** pour reproduire EXACTEMENT le
 * comportement Netlify (les Scheduled Functions Netlify tournent en UTC).
 * ⚠️ Instance unique : ce scheduler suppose UN SEUL réplica du service web. En
 * cas de scaling multi-réplicas, chaque instance tirerait les crons → risque de
 * double exécution (les routes cibles ont toutefois leur propre déduplication).
 */

import { isRailway } from "@/lib/platform";
import { getInternalBaseUrl } from "@/lib/platform";
import { createServiceRoleClient } from "@/lib/supabase/server";

/** POST une route interne avec le Bearer CRON_SECRET (self-call loopback). */
async function callRoute(path: string): Promise<void> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[railway-cron] CRON_SECRET manquant — job ignoré:", path);
    return;
  }
  try {
    const res = await fetch(`${getInternalBaseUrl()}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      console.error(`[railway-cron] ${path} → HTTP ${res.status}`);
    }
  } catch (err) {
    console.error(`[railway-cron] ${path} a échoué:`, err);
  }
}

/**
 * Job #task-reminders : pré-étape multi-entité. On liste les entités
 * (service_role) puis on tape `/api/crm/notifications/generate` une fois par
 * entité (payload `{ entity_id }`), comme le faisait `process-task-reminders.mts`.
 */
async function runTaskReminders(): Promise<void> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return;
  const supabase = createServiceRoleClient();
  const { data: entities, error } = await supabase
    .from("entities")
    .select("id, slug");
  if (error || !entities) {
    console.error("[railway-cron] task-reminders: liste entités:", error?.message);
    return;
  }
  for (const e of entities as { id: string; slug: string }[]) {
    try {
      await fetch(`${getInternalBaseUrl()}/api/crm/notifications/generate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cronSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ entity_id: e.id }),
      });
    } catch (err) {
      console.error(`[railway-cron] notifications/generate (${e.slug}):`, err);
    }
  }
}

interface CronJob {
  name: string;
  /** Vrai si le job doit tourner à cette heure/minute UTC. */
  isDue: (utcHours: number, utcMinutes: number) => boolean;
  run: () => Promise<void>;
}

/**
 * Les 7 crons Netlify, avec leurs cadences d'origine (relevées dans les `.mts`).
 * Cadences (UTC) : voir `schedule` de chaque `.mts`.
 */
const JOBS: CronJob[] = [
  // process-scheduled-emails.mts — */5 * * * *
  {
    name: "scheduled-emails",
    isDue: (_h, m) => m % 5 === 0,
    run: () => callRoute("/api/emails/process-scheduled"),
  },
  // process-task-reminders.mts — */15 * * * * (multi-entité)
  {
    name: "task-reminders",
    isDue: (_h, m) => m % 15 === 0,
    run: runTaskReminders,
  },
  // process-qualiopi-snapshots.mts — 0 3 * * *
  {
    name: "qualiopi-snapshots",
    isDue: (h, m) => h === 3 && m === 0,
    run: () => callRoute("/api/qualiopi/snapshots"),
  },
  // process-automation-rules.mts — 0 7 * * * (3 routes indépendantes)
  {
    name: "automation-rules",
    isDue: (h, m) => h === 7 && m === 0,
    run: async () => {
      await Promise.allSettled([
        callRoute("/api/formations/automation-rules/run-cron"),
        callRoute("/api/documents/process-sign-reminders"),
        callRoute("/api/crm/automations/run"),
      ]);
    },
  },
  // process-invoice-reminders.mts — 0 8 * * *
  {
    name: "invoice-reminders",
    isDue: (h, m) => h === 8 && m === 0,
    run: () => callRoute("/api/invoices/process-reminders"),
  },
  // auto-send-questionnaires.mts — 0 8 * * *
  {
    name: "auto-send-questionnaires",
    isDue: (h, m) => h === 8 && m === 0,
    run: () => callRoute("/api/questionnaires/auto-send"),
  },
  // process-quote-reminders.mts — 0 9 * * *
  {
    name: "quote-reminders",
    isDue: (h, m) => h === 9 && m === 0,
    run: () => callRoute("/api/crm/quotes/process-reminders"),
  },
];

let started = false;

/**
 * Démarre le scheduler (idempotent — un seul timer même si appelé plusieurs
 * fois). À n'appeler que sur Railway (garde `isRailway()` en défense) et côté
 * runtime Node (jamais edge). Un tick toutes les 30 s évalue l'horloge UTC ; une
 * clé « minute » par job empêche toute double exécution dans la même minute.
 */
export function startRailwayCron(): void {
  if (started) return;
  if (!isRailway()) return; // défense : jamais côté Netlify/dev
  started = true;
  console.log("[railway-cron] scheduler démarré (évaluation UTC, tick 30s)");

  const lastRun: Record<string, string> = {};
  const tick = (): void => {
    const now = new Date();
    const h = now.getUTCHours();
    const m = now.getUTCMinutes();
    const minuteKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}T${h}:${m}`;
    for (const job of JOBS) {
      if (job.isDue(h, m) && lastRun[job.name] !== minuteKey) {
        lastRun[job.name] = minuteKey;
        void job.run().catch((err) => {
          console.error(`[railway-cron] ${job.name} a levé:`, err);
        });
      }
    }
  };

  // Timer non bloquant, ne retient pas le process de se fermer proprement.
  const timer = setInterval(tick, 30_000);
  if (typeof timer.unref === "function") timer.unref();
}
