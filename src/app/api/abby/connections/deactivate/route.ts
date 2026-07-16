import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";
import { resolveActiveEntityId } from "@/lib/crm/active-entity";
import {
  deactivateConnection,
  getConnectionState,
} from "@/lib/services/abby-connections";

// Désactivation explicite de la connexion Abby de l'entité active (FR-4).
// La clé reste enregistrée ; l'état dérivé devient « désactivée ».

export async function POST() {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const entityId = resolveActiveEntityId(auth.profile);
    const result = await deactivateConnection(auth.supabase, entityId);

    if (!result.ok) {
      const status =
        result.error.code === "abby_invalid_state"
          ? 409
          : result.error.code
            ? 422
            : 500;
      return NextResponse.json(
        { error: { message: result.error.message, code: result.error.code } },
        { status }
      );
    }

    logAudit({
      supabase: auth.supabase,
      entityId,
      userId: auth.user.id,
      action: "abby_connection_deactivated",
      resourceType: "abby_connection",
      resourceId: entityId,
      details: { company_siret: result.companySiret },
    });

    const stateRes = await getConnectionState(auth.supabase, entityId);
    return NextResponse.json({ state: stateRes.ok ? stateRes.state : null });
  } catch (err) {
    return NextResponse.json(
      { error: { message: sanitizeError(err, "abby connections deactivate POST") } },
      { status: 500 }
    );
  }
}
