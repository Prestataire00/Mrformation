/**
 * GET /api/elearning/openai-health
 *
 * Diagnostic OpenAI : fait un appel minimal (1 token) pour vérifier que
 * OPENAI_API_KEY est configurée et que l'API répond. Permet de distinguer
 * "clé invalide" vs "timeout Netlify Functions sur le pipeline complet".
 *
 * Utilise le SDK existant via un appel chat.completions.create court.
 * Pas de tokens consommés au-delà du strict minimum (max_tokens=1).
 */

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";

export const maxDuration = 10;

export async function GET() {
  const auth = await requireRole(["admin", "super_admin"]);
  if (auth.error) return auth.error;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        ok: false,
        reason: "missing_key",
        message:
          "OPENAI_API_KEY non définie. Ajoutez la variable dans .env.local (dev) ou Netlify Dashboard > Environment variables (prod), puis redémarrez/redéployez.",
      },
      { status: 503 },
    );
  }

  const started = Date.now();
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      }),
    });
    const latencyMs = Date.now() - started;

    if (res.status === 401 || res.status === 403) {
      return NextResponse.json(
        {
          ok: false,
          reason: "auth_failed",
          latencyMs,
          message: "Clé OPENAI_API_KEY rejetée (401/403). Vérifiez sur platform.openai.com → API keys.",
        },
        { status: 502 },
      );
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return NextResponse.json(
        {
          ok: false,
          reason: "api_error",
          latencyMs,
          status: res.status,
          message: body.slice(0, 300),
        },
        { status: 502 },
      );
    }
    return NextResponse.json({
      ok: true,
      latencyMs,
      message: "OpenAI répond. Si le pipeline e-learning échoue malgré tout, le problème est ailleurs (timeout Netlify Functions sur le pipeline long, voir maxDuration vs plan Netlify).",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json(
      {
        ok: false,
        reason: "network",
        latencyMs: Date.now() - started,
        message: `Appel API OpenAI échoué : ${message}`,
      },
      { status: 502 },
    );
  }
}
