import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";
import { sanitizeSignatureSvg } from "@/lib/utils/sanitize-svg";
import { isValidAdminBulkSignature } from "@/lib/utils/validate-bulk-signature";
import { isTrainerAssignedToSession } from "@/lib/auth/trainer-session-access";
import { isLearnerEnrolledInSession } from "@/lib/auth/learner-session-access";

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

    // SÉCURITÉ : sanitize le SVG côté écriture (défense en profondeur).
    // Le rendu fait aussi sanitize, mais ne pas stocker de payload XSS en DB
    // est préférable (audit, exports SQL, lectures futures).
    const sanitized_signature = sanitizeSignatureSvg(signature_data);
    if (!sanitized_signature || typeof sanitized_signature !== "string") {
      return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
    }

    // Défense en profondeur : refuser toute signature non-image (e.g. string
    // littérale "admin_bulk" du bug historique pré-fix Volet A Émargement).
    // Voir docs/deep-dive-tab-emargements.md § P0-2.
    if (!isValidAdminBulkSignature(sanitized_signature)) {
      return NextResponse.json(
        { error: "Signature invalide : format non utilisable pour Qualiopi." },
        { status: 400 },
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
      // Admin signe pour quelqu'un d'autre : DOIT fournir bodySignerId + bodySignerType
      // explicitement (pas de fallback silencieux vers admin's userId/'learner' qui
      // créerait des signatures orphelines incohérentes — voir spec § 4.4).
      if (!bodySignerId || !bodySignerType) {
        return NextResponse.json(
          { error: "Pour signer en tant qu'administrateur, signer_id et signer_type sont obligatoires." },
          { status: 400 },
        );
      }
      if (bodySignerType !== "learner" && bodySignerType !== "trainer") {
        return NextResponse.json(
          { error: "signer_type doit être 'learner' ou 'trainer'." },
          { status: 400 },
        );
      }
      signerType = bodySignerType;
    } else {
      return NextResponse.json({ error: "Rôle non autorisé" }, { status: 403 });
    }

    // Verify the user is linked to this session
    if (role === "learner") {
      // Résout learners.id depuis profile_id (auth.uid()) puis vérifie une
      // inscription non annulée. `userId` est un profile_id ≠ learners.id ;
      // le comparer à enrollments.learner_id (+ statut 'active' inexistant)
      // était le bug P0 côté apprenant.
      const enrolled = await isLearnerEnrolledInSession(auth.supabase, userId, session_id);
      if (!enrolled) {
        return NextResponse.json(
          { error: "Vous n'êtes pas inscrit à cette session." },
          { status: 403 }
        );
      }
    } else if (role === "trainer") {
      // Résout trainers.id depuis profile_id (auth.uid()) puis vérifie
      // l'assignation via formation_trainers (source canonique). `userId` est
      // un profile_id, jamais un trainers.id — le comparer directement à
      // sessions.trainer_id était le bug P0 (et sessions.trainer_id est souvent NULL).
      const assigned = await isTrainerAssignedToSession(auth.supabase, userId, session_id);
      if (!assigned) {
        return NextResponse.json(
          { error: "Vous n'êtes pas assigné à cette session." },
          { status: 403 }
        );
      }
    }

    // bodySignerId est garanti non-null pour les admin (validé plus haut).
    // Pour learner/trainer, on utilise userId (ils signent pour eux-mêmes).
    const effectiveSignerId = ["admin", "super_admin"].includes(role) ? bodySignerId : userId;

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
        signature_data: sanitized_signature,
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
