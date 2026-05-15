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
 * Émet un événement métier structuré, TOUJOURS visible (dev + prod) — distinct
 * du `logger.info/debug/warn` qui est silencieux en prod.
 *
 * Format : `console.log(JSON.stringify({ event, ts, ...context }))`.
 * Grep-able dans Netlify Logs (`event="document_generated"`) pour diagnostic
 * et alerting.
 *
 * Aucun appel Sentry — réservé aux erreurs via `logger.error`.
 */
export function logEvent(event: string, context: Record<string, unknown> = {}): void {
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
