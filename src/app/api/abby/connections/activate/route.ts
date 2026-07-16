import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";
import { resolveActiveEntityId } from "@/lib/crm/active-entity";
import {
  activateConnection,
  getConnectionState,
} from "@/lib/services/abby-connections";

// Activation explicite de la connexion Abby de l'entité active (FR-2) —
// second clic après un test réussi ; re-vérifie le SIRET en live (AD-5).

export async function POST() {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const entityId = resolveActiveEntityId(auth.profile);
    const result = await activateConnection(auth.supabase, entityId);

    if (!result.ok) {
      // abby_invalid_state = rien à activer (409) ; autre code typé = échec
      // de la vérification Abby (422) ; sans code = erreur interne (500)
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

    const stateRes = await getConnectionState(auth.supabase, entityId);
    const state = stateRes.ok ? stateRes.state : null;

    logAudit({
      supabase: auth.supabase,
      entityId,
      userId: auth.user.id,
      action: "abby_connection_activated",
      resourceType: "abby_connection",
      resourceId: entityId,
      details: { company_siret: state?.companySiret ?? null },
    });

    return NextResponse.json({ state });
  } catch (err) {
    return NextResponse.json(
      { error: { message: sanitizeError(err, "abby connections activate POST") } },
      { status: 500 }
    );
  }
}
