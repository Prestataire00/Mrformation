import * as Sentry from "@sentry/nextjs";

type LogLevel = "debug" | "info" | "warn" | "error";

const isDev = process.env.NODE_ENV === "development";

function log(level: LogLevel, message: string, data?: unknown) {
  if (isDev) {
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    fn(`[${level.toUpperCase()}] ${message}`, data !== undefined ? data : "");
  } else if (level === "error") {
    console.error(`[ERROR] ${message}`, data !== undefined ? data : "");
  }
}

/**
 * Émet un événement métier structuré (JSON sur une ligne) via `console.log`.
 *
 * Contrairement à `logger.info` (silencieux en production), `logEvent` émet
 * TOUJOURS — en dev comme en prod — afin que l'événement remonte dans les
 * Netlify Logs. À réserver aux événements métier diagnostiquables (cascade de
 * prix, mutations multi-entreprises, échecs de rollback), pas aux erreurs
 * techniques : pour ces dernières, utiliser `logger.error` (qui notifie Sentry).
 *
 * Ne jamais y mettre de données personnelles — uniquement des IDs et compteurs.
 */
export function logEvent(event: string, context: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ts: new Date().toISOString(), ...context }));
}

export const logger = {
  debug: (msg: string, data?: unknown) => log("debug", msg, data),
  info: (msg: string, data?: unknown) => log("info", msg, data),
  warn: (msg: string, data?: unknown) => log("warn", msg, data),
  error: (msg: string, error?: unknown, extra?: Record<string, unknown>) => {
    log("error", msg, error);

    // Envoyer à Sentry en production
    if (process.env.NODE_ENV === "production") {
      if (error instanceof Error) {
        Sentry.captureException(error, {
          tags: { source: "logger" },
          extra: { message: msg, ...extra },
        });
      } else {
        Sentry.captureMessage(msg, {
          level: "error",
          extra: { error, ...extra },
        });
      }
    }
  },
};
