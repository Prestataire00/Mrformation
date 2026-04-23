import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";

interface RouteContext {
  params: { id: string };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  const sessionId = context.params.id;

  try {
    // Fetch invoices
    const { data: invoices, error: invError } = await auth.supabase
      .from("formation_invoices")
      .select("*")
      .eq("session_id", sessionId)
      .eq("entity_id", auth.profile.entity_id)
      .order("created_at", { ascending: true });

    if (invError) {
      return NextResponse.json(
        { error: sanitizeDbError(invError, "invoices GET") },
        { status: 500 }
      );
    }

    // Fetch charges
    const { data: charges, error: chargesError } = await auth.supabase
      .from("formation_charges")
      .select("*")
      .eq("session_id", sessionId)
      .eq("entity_id", auth.profile.entity_id)
      .order("created_at", { ascending: true });

    if (chargesError) {
      return NextResponse.json(
        { error: sanitizeDbError(chargesError, "charges GET") },
        { status: 500 }
      );
    }

    // Compute stats from invoices (exclude avoirs from totals)
    const realInvoices = (invoices ?? []).filter((i) => !i.is_avoir);
    const total_invoiced = realInvoices.reduce((sum, i) => sum + Number(i.amount), 0);
    const total_paid = realInvoices
      .filter((i) => i.status === "paid")
      .reduce((sum, i) => sum + Number(i.amount), 0);
    const total_pending = realInvoices
      .filter((i) => i.status === "pending" || i.status === "sent")
      .reduce((sum, i) => sum + Number(i.amount), 0);
    const total_late = realInvoices
      .filter((i) => i.status === "late")
      .reduce((sum, i) => sum + Number(i.amount), 0);
    const total_charges = (charges ?? []).reduce((sum, c) => sum + Number(c.amount), 0);

    return NextResponse.json({
      invoices: invoices ?? [],
      charges: charges ?? [],
      stats: { total_invoiced, total_paid, total_pending, total_late, total_charges },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: sanitizeError(err, "invoices GET") },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  const sessionId = context.params.id;

  try {
    const body = await request.json();
    const {
      recipient_type,
      recipient_id,
      recipient_name,
      recipient_siret,
      recipient_address,
      amount,
      prefix = "FAC",
      due_date,
      notes,
      is_avoir = false,
      parent_invoice_id,
      external_reference,
      lines,
    } = body;

    if (!recipient_type || !recipient_id || !recipient_name) {
      return NextResponse.json(
        { error: "Les champs recipient_type, recipient_id et recipient_name sont requis." },
        { status: 400 }
      );
    }

    // Global sequential numbering per (entity_id, fiscal_year, prefix)
    const fiscalYear = new Date().getFullYear();
    const entityId = auth.profile.entity_id;
    const invoicePrefix = is_avoir ? "AV" : (prefix || "FAC");

    const { data: maxRow } = await auth.supabase
      .from("formation_invoices")
      .select("global_number")
      .eq("entity_id", entityId)
      .eq("fiscal_year", fiscalYear)
      .eq("prefix", invoicePrefix)
      .order("global_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextGlobalNumber = (maxRow?.global_number ?? 0) + 1;

    const { data, error } = await auth.supabase
      .from("formation_invoices")
      .insert({
        entity_id: entityId,
        session_id: sessionId,
        recipient_type,
        recipient_id,
        recipient_name,
        amount: amount ?? 0,
        prefix: invoicePrefix,
        number: nextGlobalNumber, // legacy field, kept for backward compat
        global_number: nextGlobalNumber,
        fiscal_year: fiscalYear,
        due_date: due_date || null,
        notes: notes || null,
        is_avoir,
        parent_invoice_id: parent_invoice_id || null,
        external_reference: external_reference || null,
        recipient_siret: recipient_siret || null,
        recipient_address: recipient_address || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: sanitizeDbError(error, "invoices POST") },
        { status: 500 }
      );
    }

    // Insert invoice lines if provided
    if (lines && Array.isArray(lines) && lines.length > 0) {
      const lineRows = lines.map((l: { description: string; quantity: number; unit_price: number }) => ({
        invoice_id: data.id,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
      }));
      await auth.supabase.from("formation_invoice_lines").insert(lineRows);
    }

    logAudit({
      supabase: auth.supabase,
      entityId: auth.profile.entity_id,
      userId: auth.user.id,
      action: "create",
      resourceType: is_avoir ? "formation_avoir" : "formation_invoice",
      resourceId: data.id,
      details: { reference: data.reference, amount, recipient_name },
    });

    return NextResponse.json({ invoice: data });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: sanitizeError(err, "invoices POST") },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { invoice_id, status, paid_at, recipient_name, recipient_type, recipient_siret, recipient_address, due_date, notes, external_reference, amount, lines } = body;

    if (!invoice_id) {
      return NextResponse.json(
        { error: "Le champ invoice_id est requis." },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    // Status update
    if (status) updateData.status = status;
    if (status === "paid") updateData.paid_at = paid_at || new Date().toISOString();

    // Full edit fields (only for pending invoices)
    if (recipient_name !== undefined) updateData.recipient_name = recipient_name;
    if (recipient_type !== undefined) updateData.recipient_type = recipient_type;
    if (due_date !== undefined) updateData.due_date = due_date;
    if (notes !== undefined) updateData.notes = notes;
    if (external_reference !== undefined) updateData.external_reference = external_reference;
    if (recipient_siret !== undefined) updateData.recipient_siret = recipient_siret;
    if (recipient_address !== undefined) updateData.recipient_address = recipient_address;
    if (amount !== undefined) updateData.amount = amount;

    const { data, error } = await auth.supabase
      .from("formation_invoices")
      .update(updateData)
      .eq("id", invoice_id)
      .eq("entity_id", auth.profile.entity_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: sanitizeDbError(error, "invoices PATCH") },
        { status: 500 }
      );
    }

    // Update lines if provided (delete + re-insert)
    if (lines && Array.isArray(lines)) {
      await auth.supabase
        .from("formation_invoice_lines")
        .delete()
        .eq("invoice_id", invoice_id);

      if (lines.length > 0) {
        const lineInserts = lines.map((l: { description: string; quantity: number; unit_price: number }, idx: number) => ({
          invoice_id,
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          order_index: idx,
        }));
        await auth.supabase.from("formation_invoice_lines").insert(lineInserts);
      }
    }

    logAudit({
      supabase: auth.supabase,
      entityId: auth.profile.entity_id,
      userId: auth.user.id,
      action: "update",
      resourceType: "formation_invoice",
      resourceId: invoice_id,
      details: { status: status || data.status, reference: data.reference },
    });

    return NextResponse.json({ invoice: data });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: sanitizeError(err, "invoices PATCH") },
      { status: 500 }
    );
  }
}
