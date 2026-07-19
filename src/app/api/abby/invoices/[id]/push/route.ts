import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";
import { resolveActiveEntityId } from "@/lib/crm/active-entity";
import { advancePushStep } from "@/lib/services/abby-push";
import { pushRequestSchema } from "@/lib/validations/abby";

// Route avance-saga (AD-8) : POST = UNE étape depuis l'état persisté, le
// client boucle jusqu'à done. Entité résolue serveur (AD-3). Le logAudit de
// finalisation vit ICI (le service n'a pas de userId — pattern connections).

interface RouteContext {
  params: { id: string };
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    // Body optionnel (la boucle nominale n'en envoie pas — request.json()
    // jette sur un body vide) ; restartFromZero = consentement AD-8
    let rawBody: unknown = {};
    try {
      rawBody = await request.json();
    } catch {
      rawBody = {};
    }
    const parsed = pushRequestSchema.safeParse(rawBody ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: { message: "Requête invalide", code: "abby_validation" } },
        { status: 400 }
      );
    }

    const entityId = resolveActiveEntityId(auth.profile);
    const result = await advancePushStep(
      auth.supabase,
      entityId,
      context.params.id,
      { restartFromZero: parsed.data.restartFromZero === true }
    );

    if (!result.ok) {
      // abby_draft_missing = état métier (409), comme abby_invalid_state
      const status =
        result.error.code === "abby_invalid_state" ||
        result.error.code === "abby_draft_missing"
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
