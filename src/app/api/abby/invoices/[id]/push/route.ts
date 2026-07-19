import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";
import { resolveActiveEntityId } from "@/lib/crm/active-entity";
import { advancePushStep } from "@/lib/services/abby-push";

// Route avance-saga (AD-8) : POST = UNE étape depuis l'état persisté, le
// client boucle jusqu'à done. Entité résolue serveur (AD-3). Le logAudit de
// finalisation vit ICI (le service n'a pas de userId — pattern connections).

interface RouteContext {
  params: { id: string };
}

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const entityId = resolveActiveEntityId(auth.profile);
    const result = await advancePushStep(
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

    if (result.step.done) {
      // Finalisation = acte d'émission légale (Consistency) — jamais de
      // montant ni de clé dans details
      logAudit({
        supabase: auth.supabase,
        entityId,
        userId: auth.user.id,
        action: "abby_invoice_finalized",
        resourceType: "formation_invoice",
        resourceId: context.params.id,
        details: { abby_invoice_number: result.step.abbyInvoiceNumber ?? null },
      });
    }

    return NextResponse.json({ step: result.step });
  } catch (err) {
    return NextResponse.json(
      { error: { message: sanitizeError(err, "abby invoice push POST") } },
      { status: 500 }
    );
  }
}
