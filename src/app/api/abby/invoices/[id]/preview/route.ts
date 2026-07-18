import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";
import { resolveActiveEntityId } from "@/lib/crm/active-entity";
import { buildInvoicePreview } from "@/lib/services/abby-invoice-preview";

// Prévisualisation du push (AD-21) : lecture pure — pas de logAudit, aucune
// écriture métier. L'entité est résolue côté serveur (AD-3), la réponse ne
// contient aucune colonne chiffrée ni abbyCustomerId (AD-18).

interface RouteContext {
  params: { id: string };
}

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const entityId = resolveActiveEntityId(auth.profile);
    const result = await buildInvoicePreview(
      auth.supabase,
      entityId,
      context.params.id
    );

    if (!result.ok) {
      // Convention 1.3 étendue : invalid_state→409, not_found→404,
      // autres codes typés→422 (abby_validation transporte missingFields),
      // sans code→500
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

    return NextResponse.json({ preview: result.preview });
  } catch (err) {
    return NextResponse.json(
      { error: { message: sanitizeError(err, "abby invoice preview GET") } },
      { status: 500 }
    );
  }
}
