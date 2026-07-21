import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";
import { resolveActiveEntityId } from "@/lib/crm/active-entity";
import { getInvoicePdf } from "@/lib/services/abby-status";

// PDF Factur-X : proxy à la demande, JAMAIS stocké (AD-15).
// Pattern de réponse binaire repris verbatim d'`api/documents/generate`.

interface RouteContext {
  params: { id: string };
}

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const entityId = resolveActiveEntityId(auth.profile);
    const result = await getInvoicePdf(auth.supabase, entityId, context.params.id);

    if (!result.ok) {
      // Erreurs en JSON (jamais en binaire) — convention Epic 3/4
      const status =
        result.error.code === "abby_invalid_state" ||
        result.error.code === "abby_connection_inactive"
          ? 409
          : result.error.code === "abby_not_found"
            ? 404
            : result.error.code
              ? 422
              : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return new Response(new Uint8Array(result.pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Content-Length": String(result.pdf.byteLength),
        // Document légal : jamais de cache navigateur
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: { message: sanitizeError(err, "abby invoice pdf GET") } },
      { status: 500 }
    );
  }
}
