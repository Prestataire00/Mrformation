import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { claudeChat, extractJSON } from "@/lib/ai/claude-client";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { sanitizeError } from "@/lib/api-error";

export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  const { allowed, resetAt } = checkRateLimit(`ai-enrich:${auth.profile.id}`, { limit: 5, windowSeconds: 60 });
  if (!allowed) return rateLimitResponse(resetAt);

  try {
    const { company_name, siret, naf_code, naf_label, employees, notes, sector } = await request.json();

    if (!company_name) {
      return NextResponse.json({ error: "company_name requis" }, { status: 400 });
    }

    const prompt = `Tu es un assistant commercial expert pour un organisme de formation professionnelle français (MR FORMATION).

Voici les informations sur un prospect :
- Entreprise : ${company_name}
- SIRET : ${siret || "non renseigné"}
- Code NAF : ${naf_code || "non renseigné"} ${naf_label ? `(${naf_label})` : ""}
- Secteur : ${sector || "non précisé"}
- Effectif : ${employees || "non renseigné"}
- Besoin exprimé : ${notes || "aucun besoin précisé"}

Génère une analyse commerciale en JSON strict (pas de texte autour) :
{
  "suggested_trainings": ["3 thématiques de formation pertinentes pour ce type d'entreprise"],
  "sales_pitch": "un argument commercial en 2-3 phrases pour accrocher ce prospect, personnalisé à son secteur",
  "estimated_budget": "estimation du budget formation annuel (fourchette en euros)",
  "key_contact_role": "le poste idéal à contacter dans cette entreprise (ex: DRH, Dirigeant, Responsable formation...)",
  "opco_tips": "conseil pratique sur le financement OPCO pour ce secteur d'activité"
}`;

    const result = await claudeChat(
      [{ role: "user", content: prompt }],
      {
        system: "Tu es un expert en formation professionnelle et développement commercial B2B en France. Réponds uniquement en JSON valide.",
        temperature: 0.7,
        maxTokens: 1000,
      }
    );

    const insights = extractJSON(result.content);

    return NextResponse.json({
      insights,
      usage: result.usage,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "enrich-prospect") },
      { status: 500 }
    );
  }
}
