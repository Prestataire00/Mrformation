import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";
import { resolveActiveEntityId } from "@/lib/crm/active-entity";
import { refreshInvoiceStatus } from "@/lib/services/abby-status";

// Actualisation MANUELLE du statut Abby (AD-22 : geste explicite).
// POST car la route écrit un cache (abby_*) — jamais status/paid_at LMS (AD-11).
// Pas de logAudit : l'audit est réservé aux ACTES (finalisation 3.3,
// enregistrement de paiement 4.2), pas au rafraîchissement d'un cache.

interface RouteContext {
  params: { id: string };
}

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const entityId = resolveActiveEntityId(auth.profile);
    const result = await refreshInvoiceStatus(
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

    // ⚠️ `notFound: true` est un SUCCÈS métier (constat daté), pas un 404 :
    // la facture LMS existe, c'est son pendant Abby qui a disparu
    return NextResponse.json({ status: result.status });
  } catch (err) {
    return NextResponse.json(
      { error: { message: sanitizeError(err, "abby invoice status POST") } },
      { status: 500 }
    );
  }
}
