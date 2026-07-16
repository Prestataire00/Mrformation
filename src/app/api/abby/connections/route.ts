import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";
import { resolveActiveEntityId } from "@/lib/crm/active-entity";
import {
  getConnectionState,
  testAndStoreApiKey,
} from "@/lib/services/abby-connections";
import { testConnectionSchema } from "@/lib/validations/abby";

// La connexion Abby est résolue par entité active côté serveur (AD-3) :
// le client ne transmet jamais entity_id, et aucune colonne chiffrée ne
// transite vers lui (AD-18).

export async function GET() {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const entityId = resolveActiveEntityId(auth.profile);
    const result = await getConnectionState(auth.supabase, entityId);

    if (!result.ok) {
      return NextResponse.json(
        { error: { message: result.error.message } },
        { status: 500 }
      );
    }

    return NextResponse.json({ state: result.state });
  } catch (err) {
    return NextResponse.json(
      { error: { message: sanitizeError(err, "abby connections GET") } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const parsed = testConnectionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { message: "Clé API invalide", code: "abby_validation" } },
        { status: 400 }
      );
    }

    const entityId = resolveActiveEntityId(auth.profile);
    const result = await testAndStoreApiKey(
      auth.supabase,
      entityId,
      parsed.data.apiKey
    );

    if (!result.ok) {
      // Code typé = échec du test Abby (422) ; pas de code = erreur interne (500)
      return NextResponse.json(
        { error: { message: result.error.message, code: result.error.code } },
        { status: result.error.code ? 422 : 500 }
      );
    }

    // Trace du stockage/remplacement de clé — JAMAIS la clé dans details
    logAudit({
      supabase: auth.supabase,
      entityId,
      userId: auth.user.id,
      action: "abby_key_stored",
      resourceType: "abby_connection",
      resourceId: entityId,
      details: { company_siret: result.identity.companySiret },
    });

    return NextResponse.json({
      companyName: result.identity.companyName,
      companySiret: result.identity.companySiret,
      isInTestMode: result.identity.isInTestMode,
    });
  } catch (err) {
    return NextResponse.json(
      { error: { message: sanitizeError(err, "abby connections POST") } },
      { status: 500 }
    );
  }
}
