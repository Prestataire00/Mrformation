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
      funding_type,
      lines,
    } = body;

    if (!recipient_type || !recipient_id || !recipient_name) {
      return NextResponse.json(
        { error: "Les champs recipient_type, recipient_id et recipient_name sont requis." },
        { status: 400 }
      );
    }

    // Numérotation séquentielle globale par (entity_id, fiscal_year, prefix).
    // On délègue à une fonction SQL qui prend un advisory lock + read MAX +
    // INSERT dans la même transaction → atomicité garantie côté Postgres,
    // pas de race condition possible entre 2 admins concurrents.
    const fiscalYear = new Date().getFullYear();
    const entityId = auth.profile.entity_id;
    const invoicePrefix = is_avoir ? "AV" : (prefix || "FAC");

    const { data, error } = await auth.supabase.rpc("create_invoice_with_atomic_number", {
      p_entity_id: entityId,
      p_session_id: sessionId,
      p_recipient_type: recipient_type,
      p_recipient_id: recipient_id,
      p_recipient_name: recipient_name,
      p_amount: amount ?? 0,
      p_prefix: invoicePrefix,
      p_fiscal_year: fiscalYear,
      p_due_date: due_date || null,
      p_notes: notes || null,
      p_is_avoir: is_avoir,
      p_parent_invoice_id: parent_invoice_id || null,
      p_external_reference: external_reference || null,
      p_recipient_siret: recipient_siret || null,
      p_recipient_address: recipient_address || null,
      p_funding_type: funding_type || null,
    });

    if (error) {
      return NextResponse.json(
        { error: sanitizeDbError(error, "invoices POST") },
        { status: 500 }
      );
    }

    // Insert invoice lines if provided
    let lineWarning: string | null = null;
    if (lines && Array.isArray(lines) && lines.length > 0) {
      const lineRows = lines.map((l: { description: string; quantity: number; unit_price: number }, idx: number) => ({
        invoice_id: data.id,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
        order_index: idx,
      }));
      const { error: lineError } = await auth.supabase.from("formation_invoice_lines").insert(lineRows);
      if (lineError) {
        // La facture est créée (RPC atomique) — on ne masque pas l'échec des
        // lignes derrière un faux succès : on le remonte au client.
        console.error("[invoices POST] lines insert failed:", lineError);
        lineWarning = sanitizeDbError(lineError, "invoice lines INSERT");
      }
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

    return NextResponse.json({
      invoice: data,
      ...(lineWarning
        ? { warning: `Facture créée, mais l'enregistrement des lignes a échoué : ${lineWarning}` }
        : {}),
    });
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
    const { invoice_id, status, paid_at, recipient_name, recipient_type, recipient_siret, recipient_address, due_date, notes, external_reference, amount, funding_type, lines } = body;

    if (!invoice_id) {
      return NextResponse.json(
        { error: "Le champ invoice_id est requis." },
        { status: 400 }
      );
    }

    // H7 — garde anti-altération : une facture déjà émise (sent/paid/late/
    // cancelled) ne peut plus voir son contenu modifié (montant, lignes,
    // destinataire, dates…). Seul un changement de statut reste autorisé.
    const contentEdit =
      recipient_name !== undefined ||
      recipient_type !== undefined ||
      recipient_siret !== undefined ||
      recipient_address !== undefined ||
      due_date !== undefined ||
      notes !== undefined ||
      external_reference !== undefined ||
      amount !== undefined ||
      funding_type !== undefined ||
      lines !== undefined;

    if (contentEdit) {
      const { data: current, error: currentErr } = await auth.supabase
        .from("formation_invoices")
        .select("status")
        .eq("id", invoice_id)
        .eq("entity_id", auth.profile.entity_id)
        .maybeSingle();
      if (currentErr) {
        return NextResponse.json(
          { error: sanitizeDbError(currentErr, "invoices PATCH lookup") },
          { status: 500 }
        );
      }
      if (!current) {
        return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
      }
      if (current.status !== "pending") {
        return NextResponse.json(
          { error: "Cette facture est déjà émise : seul son statut peut encore être modifié, pas son contenu." },
          { status: 409 }
        );
      }
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
    if (funding_type !== undefined) updateData.funding_type = funding_type || null;

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

    // Update lines if provided. INSERT-puis-DELETE-par-id : on ne purge
    // l'ancien détail QU'APRÈS une ré-insertion réussie — un échec d'INSERT
    // ne perd plus les lignes (l'ancien DELETE-puis-INSERT le faisait).
    if (lines && Array.isArray(lines)) {
      const { data: oldLines } = await auth.supabase
        .from("formation_invoice_lines")
        .select("id")
        .eq("invoice_id", invoice_id);
      const oldLineIds = (oldLines ?? []).map((l) => l.id as string);

      if (lines.length > 0) {
        const lineInserts = lines.map((l: { description: string; quantity: number; unit_price: number }, idx: number) => ({
          invoice_id,
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          order_index: idx,
        }));
        const { error: lineInsertErr } = await auth.supabase
          .from("formation_invoice_lines")
          .insert(lineInserts);
        if (lineInsertErr) {
          // INSERT échoué → on NE supprime PAS l'ancien détail (pas de perte).
          return NextResponse.json(
            { error: sanitizeDbError(lineInsertErr, "invoice lines INSERT") },
            { status: 500 }
          );
        }
      }
      // Ré-insertion OK (ou plus aucune ligne voulue) → purge de l'ancien détail.
      if (oldLineIds.length > 0) {
        await auth.supabase
          .from("formation_invoice_lines")
          .delete()
          .in("id", oldLineIds);
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
