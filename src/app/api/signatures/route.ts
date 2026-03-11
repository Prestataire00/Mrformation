import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";

export async function GET(request: NextRequest) {
  const auth = await requireRole(["admin", "trainer", "learner"]);
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ signatures: data });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(["admin", "trainer", "learner"]);
  if (auth.error) return auth.error;

  try {
    const { session_id, signature_data } = await request.json();

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
    } else if (role === "admin") {
      // Admin can sign on behalf — require signer_type in body
      const body = await request.clone().json();
      signerType = body.signer_type || "learner";
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

    // Check if already signed
    if (role !== "admin") {
      const { data: existing } = await auth.supabase
        .from("signatures")
        .select("id")
        .eq("session_id", session_id)
        .eq("signer_id", userId)
        .eq("signer_type", signerType)
        .single();

      if (existing) {
        return NextResponse.json(
          { error: "Vous avez déjà signé pour cette session." },
          { status: 409 }
        );
      }
    }

    const { data, error } = await auth.supabase
      .from("signatures")
      .insert({
        session_id,
        signer_id: userId,
        signer_type: signerType,
        signature_data,
        signed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      signature: data,
      message: "Signature enregistrée. Elle vaut validation des heures de formation réalisées.",
    });
  } catch (err: unknown) {
    console.error("[signatures] Unexpected error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur interne du serveur" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRole(["admin"]);
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "Signature supprimée." });
}
