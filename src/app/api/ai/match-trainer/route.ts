import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { claudeChat } from "@/lib/ai/claude-client";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { wrapUserData, escapeForPrompt, PROMPT_INJECTION_GUARDRAIL } from "@/lib/ai/sanitize-prompt";

export async function POST(req: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  const { allowed, resetAt } = checkRateLimit(`match-trainer-${auth.user.id}`, { limit: 20, windowSeconds: 3600 });
  if (!allowed) return rateLimitResponse(resetAt);

  try {
    const { need, session_id } = await req.json();

    const { data: trainers } = await auth.supabase
      .from("trainers")
      .select("id, first_name, last_name, bio, experience_years, seniority_level, formation_domains, ai_keywords, avg_satisfaction, total_sessions, competencies:trainer_competencies(competency, level)")
      .eq("entity_id", auth.profile.entity_id);

    if (!trainers?.length) return NextResponse.json({ matches: [] });

    let actualNeed = need;
    if (session_id && !need) {
      const { data: session } = await auth.supabase
        .from("sessions")
        .select("title, description, domain, training:trainings(title, category, description)")
        .eq("id", session_id)
        .single();
      const training = session?.training as unknown as { title?: string; category?: string; description?: string } | null;
      actualNeed = { title: session?.title, description: session?.description || training?.description, domain: session?.domain || training?.category };
    }

    // Échappe les contenus user-controlled (bio, formation_domains, competencies)
    // pour empêcher prompt injection via le contenu DB.
    const trainerList = trainers.map(t =>
      `ID:${escapeForPrompt(t.id)} | ${escapeForPrompt(t.first_name)} ${escapeForPrompt(t.last_name)} | ${escapeForPrompt(t.seniority_level || "N/A")} ${t.experience_years || 0}ans | Domaines:${escapeForPrompt((t.formation_domains || []).join(","))} | Compét:${escapeForPrompt((t.competencies || []).map((c: Record<string, string>) => c.competency).join(","))} | Sat:${t.avg_satisfaction || "N/A"}% | Sessions:${t.total_sessions}`
    ).join("\n");

    const response = await claudeChat(
      [{ role: "user", content: `BESOIN:\n${wrapUserData("need", JSON.stringify(actualNeed))}\n\nFORMATEURS:\n${wrapUserData("trainer_list", trainerList)}\n\nClasse par pertinence. JSON strict:\n{"matches":[{"trainer_id":"uuid","score":0-100,"reasons_match":["..."],"gaps":["..."]}],"top_pick_reasoning":"..."}` }],
      { system: `Expert staffing formateurs. JSON strict.\n\n${PROMPT_INJECTION_GUARDRAIL}`, maxTokens: 2000, temperature: 0.2 }
    );

    const result = JSON.parse(response.content.replace(/```json|```/g, "").trim());
    const enriched = (result.matches || []).map((m: Record<string, unknown>) => {
      const t = trainers.find(tr => tr.id === m.trainer_id);
      return { ...m, trainer_name: t ? `${t.first_name} ${t.last_name}` : "Inconnu" };
    });

    return NextResponse.json({ matches: enriched, top_pick_reasoning: result.top_pick_reasoning });
  } catch (err) {
    console.error("[match-trainer]", err);
    return NextResponse.json({ error: "Matching échoué" }, { status: 500 });
  }
}
