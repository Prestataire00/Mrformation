import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { calculateProspectScore } from "@/lib/ai/prospect-scoring";
import { sanitizeError } from "@/lib/api-error";

export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const { prospect_id } = await request.json();

    if (!prospect_id) {
      return NextResponse.json({ error: "prospect_id requis" }, { status: 400 });
    }

    // Fetch prospect
    const { data: prospect } = await auth.supabase
      .from("crm_prospects")
      .select("id, siret, email, phone, naf_code, source, amount, notes")
      .eq("id", prospect_id)
      .single();

    if (!prospect) {
      return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });
    }

    // Fetch interaction counts
    const { count: emailsCount } = await auth.supabase
      .from("email_history")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", prospect_id);

    const { data: actions } = await auth.supabase
      .from("crm_commercial_actions")
      .select("id, created_at")
      .eq("prospect_id", prospect_id)
      .order("created_at", { ascending: false });

    const lastContactDate = actions && actions.length > 0 ? actions[0].created_at : null;

    // Check quotes
    const { data: quotes } = await auth.supabase
      .from("crm_quotes")
      .select("status")
      .eq("prospect_id", prospect_id);

    const quoteSent = (quotes || []).some((q) => q.status === "sent" || q.status === "accepted");
    const quoteAccepted = (quotes || []).some((q) => q.status === "accepted");

    // Calculate score
    const { score, details } = calculateProspectScore({
      siret: prospect.siret,
      email: prospect.email,
      phone: prospect.phone,
      naf_code: prospect.naf_code,
      source: prospect.source,
      amount: prospect.amount,
      employees: null, // Would come from Pappers enrichment
      emailsSentCount: emailsCount || 0,
      actionsCount: actions?.length || 0,
      lastContactDate,
      quoteSent,
      quoteAccepted,
    });

    // Update score in DB
    await auth.supabase
      .from("crm_prospects")
      .update({ score, updated_at: new Date().toISOString() })
      .eq("id", prospect_id);

    return NextResponse.json({ score, details });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "score-prospect") },
      { status: 500 }
    );
  }
}
