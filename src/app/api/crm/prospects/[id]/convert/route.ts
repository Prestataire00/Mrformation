import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { logAudit } from "@/lib/audit-log";
import { sanitizeError } from "@/lib/api-error";

/**
 * POST /api/crm/prospects/[id]/convert
 *
 * Story h-23 (Epic H) — refactor conversion prospect → client.
 *
 * Remplace l'ancien `handleConvertToClient` client-side (3 inserts inline
 * dans `[id]/page.tsx`) par un appel RPC à la fonction SQL
 * `fn_convert_prospect_to_client` qui exécute INSERT clients +
 * INSERT contact (si contact_name) + UPDATE prospect en TRANSACTION
 * NATIVE PostgreSQL (rollback atomique si une étape échoue).
 *
 * Mappings ERRCODE → HTTP :
 *  - P0001 (prospect introuvable)             → 404
 *  - P0002 (company_name vide)                → 400
 *  - P0003 (doublon ILIKE company_name/siret) → 409 + hint=existing_client_id
 *  - 42883 (fonction SQL absente)             → 500 avec message explicite
 *
 * Sécurité : admin + super_admin uniquement, entity_id vérifié sur le
 * prospect avant le RPC.
 *
 * Décisions résolues code review h-23 (cf §9) :
 *  - Q1 → fonction SQL (transaction atomique)
 *  - Q2 → ILIKE (case-insensitive doublon)
 */

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const prospectId = params.id;

  if (!prospectId || typeof prospectId !== "string") {
    return NextResponse.json(
      { error: "ID prospect manquant ou invalide" },
      { status: 400 },
    );
  }

  // UUID basique check (la fonction SQL throw P0001 sinon, donc défense légère ici).
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(prospectId)) {
    return NextResponse.json(
      { error: "ID prospect doit être un UUID" },
      { status: 400 },
    );
  }

  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  const { user, profile, supabase } = auth;

  try {
    // Vérifier que le prospect appartient bien à l'entité du user
    // (défense en profondeur, en plus du SECURITY DEFINER de la fonction).
    const { data: prospectRow, error: fetchErr } = await supabase
      .from("crm_prospects")
      .select("id, company_name, entity_id, converted_client_id")
      .eq("id", prospectId)
      .eq("entity_id", profile.entity_id)
      .single();

    if (fetchErr || !prospectRow) {
      return NextResponse.json(
        { error: "Prospect introuvable ou hors de votre entité" },
        { status: 404 },
      );
    }

    if (prospectRow.converted_client_id) {
      return NextResponse.json(
        {
          error: "Ce prospect a déjà été converti en client",
          existingClientId: prospectRow.converted_client_id,
        },
        { status: 409 },
      );
    }

    // RPC vers la fonction SQL — vraie transaction atomique côté PostgreSQL.
    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      "fn_convert_prospect_to_client",
      { p_prospect_id: prospectId },
    );

    if (rpcErr) {
      const errCode = (rpcErr as { code?: string }).code;
      const errHint = (rpcErr as { hint?: string }).hint;
      const errMessage =
        (rpcErr as { message?: string }).message || "Erreur conversion";

      if (errCode === "42883") {
        // Fonction SQL absente en prod → migration pas exécutée.
        console.error(
          "[convert-prospect] fn_convert_prospect_to_client absente. " +
            "Exécuter `supabase/migrations/add_convert_prospect_function.sql` " +
            "dans Supabase Dashboard.",
        );
        return NextResponse.json(
          {
            error:
              "Configuration serveur incomplète (fonction SQL manquante). " +
              "Contacte l'administrateur.",
          },
          { status: 500 },
        );
      }

      if (errCode === "P0001") {
        return NextResponse.json({ error: errMessage }, { status: 404 });
      }
      if (errCode === "P0002") {
        return NextResponse.json({ error: errMessage }, { status: 400 });
      }
      if (errCode === "P0003") {
        return NextResponse.json(
          {
            error: errMessage,
            existingClientId: errHint || null,
          },
          { status: 409 },
        );
      }

      console.error("[convert-prospect] RPC error:", rpcErr);
      throw rpcErr;
    }

    // rpcData est un array (RETURNS TABLE). On prend la première ligne.
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    const newClientId = row?.client_id;
    const newContactId = row?.contact_id ?? null;

    if (!newClientId) {
      console.error(
        "[convert-prospect] RPC OK mais client_id absent dans la réponse",
        rpcData,
      );
      return NextResponse.json(
        { error: "Erreur conversion : ID client manquant" },
        { status: 500 },
      );
    }

    // Audit log (sync void avec error-handling interne, cf src/lib/audit-log.ts)
    logAudit({
      supabase,
      entityId: profile.entity_id,
      userId: user.id,
      action: "create",
      resourceType: "clients",
      resourceId: newClientId,
      details: {
        kind: "prospect_converted",
        prospect_id: prospectId,
        prospect_company: prospectRow.company_name,
        contact_created: Boolean(newContactId),
      },
    });

    return NextResponse.json({
      clientId: newClientId,
      contactId: newContactId,
      prospectId,
    });
  } catch (err) {
    console.error("[convert-prospect] error:", err);
    return NextResponse.json(
      { error: sanitizeError(err, "convert-prospect") },
      { status: 500 },
    );
  }
}
