import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NEXT_PUBLIC_APP_ENV || "production",
  enabled: process.env.NODE_ENV === "production",

  beforeSend(event) {
    // Scrubber : ne jamais envoyer les clés API / cookies dans les logs
    if (event.request?.headers) {
      delete event.request.headers["authorization"];
      delete event.request.headers["cookie"];
      delete event.request.headers["x-api-key"];
    }

    // Ne pas envoyer les erreurs 401/403 (normal en RLS)
    if (event.tags?.status === "401" || event.tags?.status === "403") {
      return null;
    }

    return event;
  },
});
