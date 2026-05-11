import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { claudeChat } from "@/lib/ai/claude-client";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { sanitizeError } from "@/lib/api-error";
import { wrapUserData, escapeForPrompt, PROMPT_INJECTION_GUARDRAIL } from "@/lib/ai/sanitize-prompt";

const SYSTEM_PROMPT = `Tu es un expert en réglementation de la formation professionnelle en France (Qualiopi, BPF, OPCO, CPF, Code du travail L6353, RGPD). Tu analyses pour un ORGANISME DE FORMATION. Réponds TOUJOURS en JSON strict, SANS markdown, SANS backticks.\n\n${PROMPT_INJECTION_GUARDRAIL}`;

async function analyzeSingle(article: { title: string; description?: string; source?: string }) {
  // Le contenu RSS de l'article est non-trusted (sites externes peuvent injecter
  // du markup ou du texte de prompt injection). On l'encapsule dans des balises XML.
  const prompt = `Analyse cet article pour un organisme de formation français :
TITRE : ${wrapUserData("article_title", article.title)}
${article.description ? `DESCRIPTION : ${wrapUserData("article_description", article.description)}` : ""}
${article.source ? `SOURCE : ${wrapUserData("article_source", article.source)}` : ""}

JSON strict :
{"relevance_score":0-100,"category":"reglementation"|"qualiopi"|"bpf"|"financement_opco"|"rgpd"|"secteur"|"autre","priority":"urgent"|"high"|"medium"|"low","summary":"2 phrases max","impact":"1-2 phrases impact concret","actions":[{"title":"action","description":"détail","priority":"high|medium|low"}],"deadline":"YYYY-MM-DD"|null}

Si relevance_score < 40, actions: []. Sois strict, pas de généralités.`;

  const response = await claudeChat(
    [{ role: "user", content: prompt }],
    { system: SYSTEM_PROMPT, maxTokens: 1000, temperature: 0.2 }
  );
  const cleaned = response.content.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

async function synthesize(items: Array<{ title: string; ai_summary?: string; priority?: string }>) {
  const top = items.filter(i => i.priority === "urgent" || i.priority === "high").slice(0, 10);
  if (top.length === 0) {
    return { synthesis: "Aucun élément urgent ou prioritaire cette semaine.", top_3_actions: [] };
  }

  const prompt = `${top.length} éléments prioritaires pour un OF :
${top.map((i, idx) => `${idx + 1}. [${escapeForPrompt(i.priority || "medium").toUpperCase()}] ${escapeForPrompt(i.title)}${i.ai_summary ? ` — ${escapeForPrompt(i.ai_summary)}` : ""}`).join("\n")}

JSON strict :
{"synthesis":"3-5 phrases synthèse hebdo","top_3_actions":[{"title":"action","why":"pourquoi prioritaire"}],"next_deadline":"YYYY-MM-DD"|null}`;

  const response = await claudeChat(
    [{ role: "user", content: prompt }],
    { system: SYSTEM_PROMPT, maxTokens: 1000, temperature: 0.3 }
  );
  const cleaned = response.content.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  const { allowed, resetAt } = checkRateLimit(`veille-ai-${auth.user.id}`, { limit: 20, windowSeconds: 3600 });
  if (!allowed) return rateLimitResponse(resetAt);

  try {
    const body = await request.json();
    const { mode, article, items, notes, articles } = body;

    // Mode structuré (nouveau)
    if (mode === "single" && article) {
      const result = await analyzeSingle(article);
      return NextResponse.json(result);
    }
    if (mode === "synthesis" && items) {
      const result = await synthesize(items);
      return NextResponse.json(result);
    }

    // Mode legacy (rétrocompatible avec l'ancien endpoint)
    if (notes || articles) {
      const content: string[] = [];
      if (articles?.length > 0) {
        content.push("## Articles :");
        for (const a of articles.slice(0, 15)) content.push(`- ${wrapUserData("article", a)}`);
      }
      if (notes?.length > 0) {
        content.push("\n## Notes :");
        for (const n of notes.slice(0, 10)) content.push(`- ${wrapUserData("note", n)}`);
      }
      if (content.length === 0) return NextResponse.json({ error: "Aucun contenu" }, { status: 400 });

      const response = await claudeChat(
        [{ role: "user", content: content.join("\n") }],
        { system: SYSTEM_PROMPT.replace("JSON strict", "texte structuré"), maxTokens: 2000, temperature: 0.3 }
      );
      return NextResponse.json({ analysis: response.content });
    }

    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ error: sanitizeError(err, "analyze-veille") }, { status: 500 });
  }
}
