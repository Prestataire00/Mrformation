import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { claudeChat } from "@/lib/ai/claude-client";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { sanitizeError } from "@/lib/api-error";

const SYSTEM_PROMPT = `Tu es un expert en réglementation de la formation professionnelle en France. Analyse ces éléments de veille réglementaire et sectorielle recueillis par un organisme de formation. Pour chaque élément significatif, indique :
1. L'impact potentiel sur l'activité de l'organisme
2. Les actions à mettre en place
3. Le niveau d'urgence (immédiat / moyen terme / information)
Synthétise en un plan d'action concret et priorisé. Réponds en français. Sois concis et actionnable.`;

export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  const { allowed, resetAt } = checkRateLimit(`veille-ai-${auth.user.id}`, { limit: 5, windowSeconds: 3600 });
  if (!allowed) return rateLimitResponse(resetAt);

  try {
    const { notes, articles } = await request.json();

    const content: string[] = [];
    if (articles?.length > 0) {
      content.push("## Articles de veille récents :");
      for (const a of articles.slice(0, 15)) {
        content.push(`- ${a}`);
      }
    }
    if (notes?.length > 0) {
      content.push("\n## Notes de veille :");
      for (const n of notes.slice(0, 10)) {
        content.push(`- ${n}`);
      }
    }

    if (content.length === 0) {
      return NextResponse.json({ error: "Aucun contenu à analyser" }, { status: 400 });
    }

    const response = await claudeChat(
      [{ role: "user", content: content.join("\n") }],
      { system: SYSTEM_PROMPT, maxTokens: 2000, temperature: 0.3 }
    );

    return NextResponse.json({ analysis: response.content });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: sanitizeError(err, "analyze-veille") },
      { status: 500 }
    );
  }
}
