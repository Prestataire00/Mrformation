import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";

interface RouteContext {
  params: { id: string };
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  const lotId = context.params.id;

  try {
    const { status } = await request.json();

    if (!status) {
      return NextResponse.json({ error: "Le statut est requis." }, { status: 400 });
    }

    // Update lot status
    const { data: lot, error: lotError } = await auth.supabase
      .from("affacturage_lots")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", lotId)
      .eq("entity_id", auth.profile.entity_id)
      .select()
      .single();

    if (lotError) {
      return NextResponse.json({ error: sanitizeDbError(lotError, "affacturage PATCH") }, { status: 500 });
    }

    // If paid → mark all linked invoices as paid
    if (status === "paid") {
      const { data: pivots } = await auth.supabase
        .from("affacturage_lot_invoices")
        .select("invoice_id")
        .eq("lot_id", lotId);

      if (pivots && pivots.length > 0) {
        const invoiceIds = pivots.map((p) => p.invoice_id);
        await auth.supabase
          .from("formation_invoices")
          .update({ status: "paid", paid_at: new Date().toISOString() })
          .in("id", invoiceIds);
      }
    }

    logAudit({
      supabase: auth.supabase,
      entityId: auth.profile.entity_id,
      userId: auth.user.id,
      action: "update",
      resourceType: "affacturage_lot",
      resourceId: lotId,
      details: { status, lot_reference: lot.lot_reference },
    });

    return NextResponse.json({ lot });
  } catch (err: unknown) {
    return NextResponse.json({ error: sanitizeError(err, "affacturage PATCH") }, { status: 500 });
  }
}
