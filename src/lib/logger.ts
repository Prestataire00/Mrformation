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
