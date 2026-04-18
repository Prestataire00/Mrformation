import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { claudeChat } from "@/lib/ai/claude-client";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  const { allowed, resetAt } = checkRateLimit(`search-trainers-${auth.user.id}`, { limit: 20, windowSeconds: 3600 });
  if (!allowed) return rateLimitResponse(resetAt);

  try {
    const { query } = await req.json();
    if (!query || query.length < 3) return NextResponse.json({ trainers: [] });

    const { data: trainers } = await auth.supabase
      .from("trainers")
      .select("id, first_name, last_name, bio, seniority_level, formation_domains, ai_keywords, ai_target_audience, languages, competencies:trainer_competencies(competency, level)")
      .eq("entity_id", auth.profile.entity_id);

    if (!trainers?.length) return NextResponse.json({ trainers: [] });

    const list = trainers.map(t =>
      `ID:${t.id}|${t.first_name} ${t.last_name}|Bio:${t.bio || ""}|Compét:${(t.competencies || []).map((c: Record<string, string>) => c.competency).join(",")}|Domaines:${(t.formation_domains || []).join(",")}|Keywords:${(t.ai_keywords || []).join(",")}|Langues:${JSON.stringify(t.languages || [])}|Séniorité:${t.seniority_level || ""}`
    ).join("\n");

    const response = await claudeChat(
      [{ role: "user", content: `REQUÊTE:"${query}"\n\nFORMATEURS:\n${list}\n\nSélection sémantique (pas juste keyword). JSON strict:\n{"matches":[{"trainer_id":"uuid","relevance":0-100,"why":"raison courte"}]}\nRègles: relevance>=50, max 10, tri desc.` }],
      { maxTokens: 1000, temperature: 0.1 }
    );

    const { matches } = JSON.parse(response.content.replace(/```json|```/g, "").trim());
    const results = (matches || []).map((m: Record<string, unknown>) => {
      const t = trainers.find(tr => tr.id === m.trainer_id);
      return t ? { ...t, relevance: m.relevance, why: m.why } : null;
    }).filter(Boolean);

    return NextResponse.json({ trainers: results });
  } catch (err) {
    console.error("[search-trainers]", err);
    return NextResponse.json({ error: "Recherche échouée" }, { status: 500 });
  }
}
