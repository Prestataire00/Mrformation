import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";

export async function GET() {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const { data: lots, error } = await auth.supabase
      .from("affacturage_lots")
      .select("*")
      .eq("entity_id", auth.profile.entity_id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: sanitizeDbError(error, "affacturage GET") }, { status: 500 });
    }

    // Get invoice counts per lot
    const lotIds = (lots ?? []).map((l) => l.id);
    let invoiceCounts: Record<string, number> = {};

    if (lotIds.length > 0) {
      const { data: pivots } = await auth.supabase
        .from("affacturage_lot_invoices")
        .select("lot_id")
        .in("lot_id", lotIds);

      if (pivots) {
        invoiceCounts = pivots.reduce<Record<string, number>>((acc, p) => {
          acc[p.lot_id] = (acc[p.lot_id] || 0) + 1;
          return acc;
        }, {});
      }
    }

    const lotsWithCount = (lots ?? []).map((lot) => ({
      ...lot,
      invoice_count: invoiceCounts[lot.id] || 0,
    }));

    return NextResponse.json({ lots: lotsWithCount });
  } catch (err: unknown) {
    return NextResponse.json({ error: sanitizeError(err, "affacturage GET") }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const { factor_name, lot_reference, advance_rate = 90, notes, invoice_ids } = await request.json();

    if (!factor_name?.trim()) {
      return NextResponse.json({ error: "Le nom du factor est requis." }, { status: 400 });
    }
    if (!Array.isArray(invoice_ids) || invoice_ids.length === 0) {
      return NextResponse.json({ error: "Sélectionnez au moins une facture." }, { status: 400 });
    }

    // Fetch selected invoices to compute total
    const { data: invoices, error: invError } = await auth.supabase
      .from("formation_invoices")
      .select("id, amount")
      .in("id", invoice_ids)
      .eq("entity_id", auth.profile.entity_id)
      .eq("is_factored", false)
      .eq("is_avoir", false);

    if (invError) {
      return NextResponse.json({ error: sanitizeDbError(invError, "affacturage invoices") }, { status: 500 });
    }

    if (!invoices || invoices.length === 0) {
      return NextResponse.json({ error: "Aucune facture éligible trouvée." }, { status: 400 });
    }

    const totalAmount = invoices.reduce((sum, inv) => sum + Number(inv.amount), 0);
    const advanceAmount = Math.round(totalAmount * (advance_rate / 100) * 100) / 100;

    // Create lot
    const { data: lot, error: lotError } = await auth.supabase
      .from("affacturage_lots")
      .insert({
        entity_id: auth.profile.entity_id,
        lot_reference: lot_reference?.trim() || `AFF-${Date.now()}`,
        factor_name: factor_name.trim(),
        total_amount: totalAmount,
        advance_rate,
        advance_amount: advanceAmount,
        notes: notes || null,
        created_by: auth.user.id,
      })
      .select()
      .single();

    if (lotError) {
      return NextResponse.json({ error: sanitizeDbError(lotError, "affacturage lot INSERT") }, { status: 500 });
    }

    // Link invoices to lot
    const pivotRows = invoices.map((inv) => ({
      lot_id: lot.id,
      invoice_id: inv.id,
    }));

    const { error: pivotError } = await auth.supabase
      .from("affacturage_lot_invoices")
      .insert(pivotRows);

    if (pivotError) {
      return NextResponse.json({ error: sanitizeDbError(pivotError, "affacturage pivot INSERT") }, { status: 500 });
    }

    // Mark invoices as factored
    const { error: updateError } = await auth.supabase
      .from("formation_invoices")
      .update({
        is_factored: true,
        factored_at: new Date().toISOString(),
        factor_name: factor_name.trim(),
      })
      .in("id", invoices.map((inv) => inv.id));

    if (updateError) {
      return NextResponse.json({ error: sanitizeDbError(updateError, "affacturage invoices UPDATE") }, { status: 500 });
    }

    logAudit({
      supabase: auth.supabase,
      entityId: auth.profile.entity_id,
      userId: auth.user.id,
      action: "create",
      resourceType: "affacturage_lot",
      resourceId: lot.id,
      details: {
        lot_reference: lot.lot_reference,
        factor_name: factor_name.trim(),
        invoice_count: invoices.length,
        total_amount: totalAmount,
        advance_amount: advanceAmount,
      },
    });

    return NextResponse.json({ lot: { ...lot, invoice_count: invoices.length } });
  } catch (err: unknown) {
    return NextResponse.json({ error: sanitizeError(err, "affacturage POST") }, { status: 500 });
  }
}
