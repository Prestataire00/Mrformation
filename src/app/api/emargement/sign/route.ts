import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

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
  // Rate limit : route publique sensible (service role + signatures légales)
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { allowed, resetAt } = checkRateLimit(`emargement-sign:${ip}`, { limit: 10, windowSeconds: 60 });
  if (!allowed) return rateLimitResponse(resetAt);

  try {
    const { token, signature_data, learner_id } = await request.json();

    // ── Validation des inputs ──
    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Token requis" }, { status: 400 });
    }
    if (!signature_data || typeof signature_data !== "string") {
      return NextResponse.json({ error: "Signature requise" }, { status: 400 });
    }
    // Format SVG attendu (vérification basique mais bloque les payloads garbage)
    if (!signature_data.includes("<svg") && !signature_data.startsWith("data:image/")) {
      return NextResponse.json({ error: "Format de signature invalide" }, { status: 400 });
    }
    // Limite de taille (évite les 413 silencieux)
    if (signature_data.length > 600_000) {
      return NextResponse.json(
        { error: "Signature trop volumineuse. Effacez et réessayez avec un trait plus simple." },
        { status: 413 }
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
      // Trainer token : signer_id vient du token uniquement (pas du body → anti-tampering)
      signerId = tokenData.trainer_id;
    } else if (tokenData.token_type === "individual") {
      // Token individuel : signer_id vient du token (anti-tampering)
      signerId = tokenData.learner_id;
    } else {
      // Session token — learner_id est passé en body, MAIS on vérifie l'enrollment
      // ce qui empêche un attaquant de signer pour un autre apprenant non-inscrit
      if (!learner_id || typeof learner_id !== "string") {
        return NextResponse.json(
          { error: "Veuillez sélectionner votre nom" },
          { status: 400 }
        );
      }
      signerId = learner_id;

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

    // ── INSERT atomique : on n'utilise plus de pre-check (évite race condition).
    // Le UNIQUE constraint (session_id, signer_id, signer_type, time_slot_id)
    // garantit l'unicité. Si déjà signé → erreur 23505 catchée → 409 enrichi.

    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const userAgent = request.headers.get("user-agent") || null;

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
      // Cas 23505 = signature déjà existante (UNIQUE constraint).
      // Réponse 409 avec already_signed:true → le client traite comme succès silencieux
      // (la signature précédente est valide, l'utilisateur a probablement re-cliqué).
      if (sigError.code === "23505") {
        console.info("[emargement/sign] Duplicate ignored", {
          sessionId: tokenData.session_id,
          signerId,
          signerType,
          timeSlotId: tokenData.time_slot_id,
        });
        return NextResponse.json(
          {
            already_signed: true,
            message: tokenData.time_slot_id
              ? "Vous avez déjà signé pour ce créneau"
              : "Vous avez déjà signé pour cette session",
          },
          { status: 409 }
        );
      }
      console.error("[emargement/sign] Insert failed:", {
        code: sigError.code,
        message: sigError.message,
        sessionId: tokenData.session_id,
        signerId,
        signerType,
      });
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
    console.error("[emargement/sign] Unexpected error:", err instanceof Error ? { message: err.message, stack: err.stack } : err);
    return NextResponse.json(
      { error: sanitizeError(err, "emargement/sign") },
      { status: 500 }
    );
  }
}
