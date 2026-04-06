import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { claudeChat, extractJSON } from "@/lib/ai/claude-client";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { sanitizeError } from "@/lib/api-error";

type ContextType = "first_contact" | "quote_followup" | "quote_sent" | "post_meeting" | "reactivation" | "thank_you" | "custom";

const CONTEXT_PROMPTS: Record<ContextType, string> = {
  first_contact: "Rédige un email de première prise de contact professionnel pour un organisme de formation. Ton : professionnel mais chaleureux, pas commercial agressif. Mentionne le secteur d'activité du prospect si disponible. Propose un échange téléphonique de 15 minutes pour comprendre les besoins.",
  quote_followup: "Rédige un email de relance suite à l'envoi d'un devis. Ton : assertif mais courtois. Mentionne la référence et le montant du devis si disponibles. Propose de répondre aux questions et d'adapter l'offre si besoin.",
  quote_sent: "Rédige un email d'accompagnement pour l'envoi d'un devis de formation. Ton : professionnel. Résume brièvement la proposition et mets en avant les bénéfices pour l'entreprise.",
  post_meeting: "Rédige un email de suivi après un rendez-vous ou un appel téléphonique. Ton : chaleureux et proactif. Récapitule les points discutés et propose les prochaines étapes.",
  reactivation: "Rédige un email pour relancer un prospect dormant qui n'a pas donné de nouvelles depuis longtemps. Ton : léger et nouvelle approche. Mentionne une nouveauté (nouveau programme, actualité réglementaire formation, promotion).",
  thank_you: "Rédige un email de remerciement professionnel. Ton : sincère et court. Remercie pour le temps accordé et réaffirme la disponibilité.",
  custom: "Rédige un email professionnel personnalisé selon les instructions fournies.",
};

export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  const { allowed, resetAt } = checkRateLimit(`ai-email:${auth.profile.id}`, { limit: 5, windowSeconds: 60 });
  if (!allowed) return rateLimitResponse(resetAt);

  try {
    const { prospect_id, context_type, custom_instructions, quote_reference, quote_amount } = await request.json();

    if (!context_type) {
      return NextResponse.json({ error: "context_type requis" }, { status: 400 });
    }

    // Fetch prospect data
    let prospectInfo = "";
    if (prospect_id) {
      const { data: prospect } = await auth.supabase
        .from("crm_prospects")
        .select("company_name, contact_name, email, notes, status, naf_code, source")
        .eq("id", prospect_id)
        .single();

      if (prospect) {
        prospectInfo = `
Informations sur le prospect :
- Entreprise : ${prospect.company_name}
- Contact : ${prospect.contact_name || "non renseigné"}
- Statut : ${prospect.status}
- Code NAF : ${prospect.naf_code || "non renseigné"}
- Notes/besoin : ${prospect.notes || "aucun"}
- Source : ${prospect.source || "non précisée"}`;
      }

      // Fetch recent actions
      const { data: actions } = await auth.supabase
        .from("crm_commercial_actions")
        .select("type, notes, created_at")
        .eq("prospect_id", prospect_id)
        .order("created_at", { ascending: false })
        .limit(3);

      if (actions && actions.length > 0) {
        prospectInfo += `\n\nDernières interactions :`;
        for (const a of actions) {
          prospectInfo += `\n- ${a.type} le ${new Date(a.created_at).toLocaleDateString("fr-FR")} : ${a.notes || ""}`;
        }
      }
    }

    // Quote context
    let quoteInfo = "";
    if (quote_reference || quote_amount) {
      quoteInfo = `\nDevis concerné : ${quote_reference || ""}${quote_amount ? ` — ${quote_amount}€` : ""}`;
    }

    const contextPrompt = CONTEXT_PROMPTS[context_type as ContextType] || CONTEXT_PROMPTS.custom;

    const prompt = `${contextPrompt}

${prospectInfo}
${quoteInfo}
${custom_instructions ? `\nInstructions spécifiques : ${custom_instructions}` : ""}

L'email est envoyé par MR FORMATION, organisme de formation professionnelle basé à Marseille.
Le commercial signe "L'équipe MR FORMATION" ou son prénom si le contact est personnel.

Réponds en JSON strict :
{
  "subject": "objet de l'email (court et accrocheur)",
  "body": "corps de l'email (professionnel, 3-5 paragraphes, avec formule de politesse)"
}`;

    const result = await claudeChat(
      [{ role: "user", content: prompt }],
      {
        system: "Tu es un rédacteur commercial expert pour un organisme de formation professionnelle français. Tu rédiges des emails en français, professionnels mais humains. Réponds uniquement en JSON valide.",
        temperature: 0.8,
        maxTokens: 1000,
      }
    );

    const email = extractJSON(result.content) as { subject: string; body: string };

    return NextResponse.json({
      subject: email.subject,
      body: email.body,
      usage: result.usage,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "draft-email") },
      { status: 500 }
    );
  }
}
