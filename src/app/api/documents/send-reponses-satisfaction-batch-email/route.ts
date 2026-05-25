/**
 * POST /api/documents/send-reponses-satisfaction-batch-email
 *
 * Thin-wrapper Story F2.x — délègue à batchSendDocsEmail.
 * Génère et envoie les réponses de satisfaction de session par email à tous les destinataires.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import { batchSendDocsEmail } from "@/lib/services/batch-email-handler";

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, entity_id, role")
      .eq("id", user.id)
      .single();
    if (!profile?.entity_id)
      return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    if (!["admin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    const body = (await request.json()) as { sessionId?: string };
    if (!body.sessionId)
      return NextResponse.json({ error: "sessionId est obligatoire" }, { status: 400 });

    const result = await batchSendDocsEmail(
      supabase,
      profile.entity_id,
      body.sessionId,
      "reponses_satisfaction_session",
      profile.id,
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ ...result, totalLatencyMs: Date.now() - t0 });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "sending reponses satisfaction batch email") },
      { status: 500 },
    );
  }
}
