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
      amount,
      prefix = "FAC",
      due_date,
      notes,
      is_avoir = false,
      parent_invoice_id,
    } = body;

    if (!recipient_type || !recipient_id || !recipient_name) {
      return NextResponse.json(
        { error: "Les champs recipient_type, recipient_id et recipient_name sont requis." },
        { status: 400 }
      );
    }

    // Auto-increment number per session + prefix
    const { data: maxRow } = await auth.supabase
      .from("formation_invoices")
      .select("number")
      .eq("session_id", sessionId)
      .eq("prefix", prefix)
      .order("number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextNumber = (maxRow?.number ?? 0) + 1;

    const { data, error } = await auth.supabase
      .from("formation_invoices")
      .insert({
        entity_id: auth.profile.entity_id,
        session_id: sessionId,
        recipient_type,
        recipient_id,
        recipient_name,
        amount: amount ?? 0,
        prefix,
        number: nextNumber,
        due_date: due_date || null,
        notes: notes || null,
        is_avoir,
        parent_invoice_id: parent_invoice_id || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: sanitizeDbError(error, "invoices POST") },
        { status: 500 }
      );
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
    const { invoice_id, status, paid_at } = body;

    if (!invoice_id || !status) {
      return NextResponse.json(
        { error: "Les champs invoice_id et status sont requis." },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === "paid") {
      updateData.paid_at = paid_at || new Date().toISOString();
    }

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

    logAudit({
      supabase: auth.supabase,
      entityId: auth.profile.entity_id,
      userId: auth.user.id,
      action: "update",
      resourceType: "formation_invoice",
      resourceId: invoice_id,
      details: { status, reference: data.reference },
    });

    return NextResponse.json({ invoice: data });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: sanitizeError(err, "invoices PATCH") },
      { status: 500 }
    );
  }
}
