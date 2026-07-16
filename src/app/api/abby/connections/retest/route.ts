import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";
import { resolveActiveEntityId } from "@/lib/crm/active-entity";
import {
  retestConnection,
  getConnectionState,
} from "@/lib/services/abby-connections";

// Health-check de la clé Abby stockée (FR-4) — geste explicite (AD-22),
// ne modifie jamais l'état d'activation ; pas de logAudit (lecture de santé).

export async function POST() {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const entityId = resolveActiveEntityId(auth.profile);
    const result = await retestConnection(auth.supabase, entityId);

    if (!result.ok) {
      return NextResponse.json(
        { error: { message: result.error.message, code: result.error.code } },
        { status: result.error.code ? 422 : 500 }
      );
    }

    const stateRes = await getConnectionState(auth.supabase, entityId);
    return NextResponse.json({ state: stateRes.ok ? stateRes.state : null });
  } catch (err) {
    return NextResponse.json(
      { error: { message: sanitizeError(err, "abby connections retest POST") } },
      { status: 500 }
    );
  }
}
