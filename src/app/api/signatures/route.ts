import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";

export async function GET(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin", "trainer", "learner"]);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.json(
      { error: "Le paramètre session_id est requis." },
      { status: 400 }
    );
  }

  const { data, error } = await auth.supabase
    .from("signatures")
    .select("*")
    .eq("session_id", sessionId);

  if (error) {
    return NextResponse.json({ error: sanitizeDbError(error, "signatures GET") }, { status: 500 });
  }

  return NextResponse.json({ signatures: data });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin", "trainer", "learner"]);
  if (auth.error) return auth.error;

  try {
    const { session_id, signature_data, time_slot_id, signer_id: bodySignerId, signer_type: bodySignerType } = await request.json();

    if (!session_id || !signature_data) {
      return NextResponse.json(
        { error: "Les champs session_id et signature_data sont requis." },
        { status: 400 }
      );
    }

    const role = auth.profile.role;
    const userId = auth.user.id;

    // Determine signer_type from role
    let signerType: "learner" | "trainer";
    if (role === "learner") {
      signerType = "learner";
    } else if (role === "trainer") {
      signerType = "trainer";
    } else if (["admin", "super_admin"].includes(role)) {
      // Admin can sign on behalf — use signer_type from body
      signerType = bodySignerType || "learner";
    } else {
      return NextResponse.json({ error: "Rôle non autorisé" }, { status: 403 });
    }

    // Verify the user is linked to this session
    if (role === "learner") {
      const { data: enrollment } = await auth.supabase
        .from("enrollments")
        .select("id")
        .eq("session_id", session_id)
        .eq("learner_id", userId)
        .eq("status", "active")
        .single();

      if (!enrollment) {
        return NextResponse.json(
          { error: "Vous n'êtes pas inscrit à cette session." },
          { status: 403 }
        );
      }
    } else if (role === "trainer") {
      const { data: session } = await auth.supabase
        .from("sessions")
        .select("trainer_id")
        .eq("id", session_id)
        .eq("trainer_id", userId)
        .single();

      if (!session) {
        return NextResponse.json(
          { error: "Vous n'êtes pas assigné à cette session." },
          { status: 403 }
        );
      }
    }

    // Admin can sign on behalf of a specific person
    const effectiveSignerId = (["admin", "super_admin"].includes(role) && bodySignerId)
      ? bodySignerId
      : userId;

    // Check if already signed (slot-aware)
    let existingQuery = auth.supabase
      .from("signatures")
      .select("id")
      .eq("session_id", session_id)
      .eq("signer_id", effectiveSignerId)
      .eq("signer_type", signerType);

    if (time_slot_id) {
      existingQuery = existingQuery.eq("time_slot_id", time_slot_id);
    }

    const { data: existing } = await existingQuery.maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: time_slot_id
            ? "Déjà signé pour ce créneau."
            : "Déjà signé pour cette session."
        },
        { status: 409 }
      );
    }

    const { data, error } = await auth.supabase
      .from("signatures")
      .insert({
        session_id,
        signer_id: effectiveSignerId,
        signer_type: signerType,
        signature_data,
        signed_at: new Date().toISOString(),
        time_slot_id: time_slot_id || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: sanitizeDbError(error, "signatures POST") }, { status: 500 });
    }

    logAudit({
      supabase: auth.supabase,
      entityId: auth.profile.entity_id,
      userId: auth.user.id,
      action: "create",
      resourceType: "signature",
      resourceId: data.id,
      details: { name: `Signature session ${session_id}` },
    });

    return NextResponse.json({
      success: true,
      signature: data,
      message: "Signature enregistrée. Elle vaut validation des heures de formation réalisées.",
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: sanitizeError(err, "signatures POST") },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const signatureId = searchParams.get("id");

  if (!signatureId) {
    return NextResponse.json(
      { error: "Le paramètre id est requis." },
      { status: 400 }
    );
  }

  const { error } = await auth.supabase
    .from("signatures")
    .delete()
    .eq("id", signatureId);

  if (error) {
    return NextResponse.json({ error: sanitizeDbError(error, "signatures DELETE") }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "Signature supprimée." });
}
