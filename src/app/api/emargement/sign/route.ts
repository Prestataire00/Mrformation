import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role configuration");
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// POST: Submit a signature with a token (public, no auth required)
export async function POST(request: NextRequest) {
  try {
    const { token, signature_data, learner_id } = await request.json();

    if (!token || !signature_data) {
      return NextResponse.json(
        { error: "Token et signature_data requis" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Validate token
    const { data: tokenData, error: tokenError } = await supabase
      .from("signing_tokens")
      .select("*")
      .eq("token", token)
      .single();

    if (tokenError || !tokenData) {
      return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
    }

    if (new Date(tokenData.expires_at) < new Date()) {
      return NextResponse.json({ error: "Ce lien a expiré" }, { status: 410 });
    }

    if (tokenData.token_type === "individual" && tokenData.used_at) {
      return NextResponse.json({ error: "Ce lien a déjà été utilisé" }, { status: 410 });
    }

    // Determine the signer and signer type
    const signerType: "learner" | "trainer" = tokenData.signer_type || "learner";
    let signerId: string;

    if (signerType === "trainer" && tokenData.trainer_id) {
      // Trainer token
      signerId = tokenData.trainer_id;
    } else if (tokenData.token_type === "individual") {
      signerId = tokenData.learner_id;
    } else {
      // Session token — learner_id must be provided
      if (!learner_id) {
        return NextResponse.json(
          { error: "Veuillez sélectionner votre nom" },
          { status: 400 }
        );
      }
      signerId = learner_id;

      // Verify learner is enrolled in this session
      const { data: enrollment } = await supabase
        .from("enrollments")
        .select("id")
        .eq("session_id", tokenData.session_id)
        .eq("learner_id", signerId)
        .in("status", ["registered", "confirmed"])
        .maybeSingle();

      if (!enrollment) {
        return NextResponse.json(
          { error: "Vous n'êtes pas inscrit à cette session" },
          { status: 403 }
        );
      }
    }

    // Check if already signed (slot-aware)
    let existingQuery = supabase
      .from("signatures")
      .select("id")
      .eq("session_id", tokenData.session_id)
      .eq("signer_id", signerId)
      .eq("signer_type", signerType);

    if (tokenData.time_slot_id) {
      existingQuery = existingQuery.eq("time_slot_id", tokenData.time_slot_id);
    }

    const { data: existing } = await existingQuery.maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: tokenData.time_slot_id
            ? "Vous avez déjà signé pour ce créneau"
            : "Vous avez déjà signé pour cette session"
        },
        { status: 409 }
      );
    }

    // Capture IP + UA for legal evidence
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const userAgent = request.headers.get("user-agent") || null;

    // Insert signature (with time_slot_id if present)
    const { data: signature, error: sigError } = await supabase
      .from("signatures")
      .insert({
        session_id: tokenData.session_id,
        signer_id: signerId,
        signer_type: signerType,
        signature_data,
        signed_at: new Date().toISOString(),
        time_slot_id: tokenData.time_slot_id || null,
        ip_address: ipAddress,
        user_agent: userAgent,
        signature_method: "handwritten",
      })
      .select()
      .single();

    if (sigError) {
      return NextResponse.json(
        { error: sanitizeDbError(sigError, "emargement/sign insert") },
        { status: 500 }
      );
    }

    // Log signature evidence
    if (signature) {
      await supabase.from("signature_evidence").insert({
        signature_id: signature.id,
        evidence_type: "signature_captured",
        data: { signer_type: signerType, signer_id: signerId, session_id: tokenData.session_id, time_slot_id: tokenData.time_slot_id || null },
        ip_address: ipAddress,
        user_agent: userAgent,
      });
    }

    // Mark individual token as used
    if (tokenData.token_type === "individual") {
      await supabase
        .from("signing_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("id", tokenData.id);
    }

    // Get session title and time slot info for confirmation
    const { data: session } = await supabase
      .from("sessions")
      .select("title")
      .eq("id", tokenData.session_id)
      .single();

    let timeSlotInfo: { start_time: string; end_time: string } | null = null;
    if (tokenData.time_slot_id) {
      const { data: slot } = await supabase
        .from("formation_time_slots")
        .select("start_time, end_time")
        .eq("id", tokenData.time_slot_id)
        .single();
      timeSlotInfo = slot || null;
    }

    return NextResponse.json({
      success: true,
      signature,
      session_title: session?.title || "Session",
      time_slot: timeSlotInfo,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "emargement/sign") },
      { status: 500 }
    );
  }
}
