"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            fontFamily: "system-ui, -apple-system, sans-serif",
            background: "#f9fafb",
          }}
        >
          <div style={{ maxWidth: "500px", textAlign: "center" }}>
            <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem", color: "#111827" }}>
              Oups, une erreur est survenue
            </h1>
            <p style={{ color: "#6b7280", marginBottom: "1.5rem" }}>
              L&apos;équipe technique a été notifiée et corrigera le problème rapidement.
            </p>
            <button
              onClick={reset}
              style={{
                padding: "0.5rem 1.5rem",
                background: "#374151",
                color: "white",
                border: "none",
                borderRadius: "0.5rem",
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
            >
              Réessayer
            </button>
            {error.digest && (
              <p style={{ marginTop: "1rem", fontSize: "0.75rem", color: "#9ca3af" }}>
                Code erreur : {error.digest}
              </p>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
