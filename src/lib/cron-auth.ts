import { NextRequest } from "next/server";

/**
 * Vérifie l'auth pour les endpoints cron.
 * Accepte un header `Authorization: Bearer <CRON_SECRET>`.
 */
export function verifyCronAuth(request: NextRequest | Request): boolean {
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.CRON_SECRET;

  if (!expectedToken) {
    console.error("[CRON] CRON_SECRET non configuré");
    return false;
  }

  return authHeader === `Bearer ${expectedToken}`;
}

export function unauthorizedCronResponse() {
  return new Response("Unauthorized", {
    status: 401,
    headers: { "Content-Type": "text/plain" },
  });
}
