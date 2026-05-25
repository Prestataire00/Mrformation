/**
 * POST /api/documents/send-avis-habilitation-electrique-batch-email
 *
 * Thin-wrapper Story F2.x — délègue à batchSendDocsEmail.
 * Couvre les 9 variantes d'avis d'habilitation électrique via un Zod enum strict
 * sur le champ `docType` du body (1 route pour 9 doc_types).
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { batchSendDocsEmail } from "@/lib/services/batch-email-handler";

const Body = z.object({
  sessionId: z.string().uuid(),
  docType: z.enum([
    "avis_hab_elec_generique",
    "avis_hab_elec_b0_bf_bs",
    "avis_hab_elec_b1v_b2v_br",
    "avis_hab_elec_bf_hf",
    "avis_hab_elec_bt",
    "avis_hab_elec_bt_ht",
    "avis_hab_elec_h0_b0",
    "avis_hab_elec_h0_b0_bf_hf_bs",
    "avis_hab_elec_h0_b0_initial",
  ]),
});

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

    const parsed = Body.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors.map((e) => e.message).join(", ") },
        { status: 400 },
      );
    }

    const result = await batchSendDocsEmail(
      supabase,
      profile.entity_id,
      parsed.data.sessionId,
      parsed.data.docType,
      profile.id,
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ ...result, totalLatencyMs: Date.now() - t0 });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "sending avis habilitation electrique batch email") },
      { status: 500 },
    );
  }
}
