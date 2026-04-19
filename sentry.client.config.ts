import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance monitoring (sample 10% des transactions)
  tracesSampleRate: 0.1,

  // Replay sessions (2% des sessions, 100% des sessions avec erreur)
  replaysSessionSampleRate: 0.02,
  replaysOnErrorSampleRate: 1.0,

  // Environment
  environment: process.env.NEXT_PUBLIC_APP_ENV || "production",

  // Ne pas envoyer les erreurs en développement local
  enabled: process.env.NODE_ENV === "production",

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Ignorer certaines erreurs non-actionnables
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "Non-Error promise rejection captured",
    "Network request failed",
  ],

  beforeSend(event) {
    // Ne pas envoyer les erreurs de magic link expiré
    if (event.exception?.values?.[0]?.value?.includes("Token expired")) {
      return null;
    }
    return event;
  },
});
