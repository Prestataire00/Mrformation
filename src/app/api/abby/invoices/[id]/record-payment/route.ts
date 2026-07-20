import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";
import { resolveActiveEntityId } from "@/lib/crm/active-entity";
import { recordPaymentInLms } from "@/lib/services/abby-status";

// Enregistrement du paiement dans le LMS (FR-18, AD-11) : SEULE route Abby
// autorisée à écrire `status='paid'` + `paid_at`, sur relecture live.
// C'est un ACTE (contrairement à l'actualisation 4.1) → logAudit.

interface RouteContext {
  params: { id: string };
}

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const entityId = resolveActiveEntityId(auth.profile);
    const result = await recordPaymentInLms(
      auth.supabase,
      entityId,
      context.params.id
    );

    if (!result.ok) {
      const status =
        result.error.code === "abby_invalid_state"
          ? 409
          : result.error.code === "abby_not_found"
            ? 404
            : result.error.code
              ? 422
              : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    logAudit({
      supabase: auth.supabase,
      entityId,
      userId: auth.user.id,
      action: "abby_payment_recorded",
      resourceType: "formation_invoice",
      resourceId: context.params.id,
      details: { paid_at: result.payment.paidAt },
    });

    return NextResponse.json({ payment: result.payment });
  } catch (err) {
    return NextResponse.json(
      { error: { message: sanitizeError(err, "abby record payment POST") } },
      { status: 500 }
    );
  }
}
