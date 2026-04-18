import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { logAudit } from "@/lib/audit-log";

type RouteContext = { params: { id: string } };

export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const payloadStr = formData.get("payload") as string;

    if (!file || !payloadStr) {
      return NextResponse.json({ error: "Fichier et données requis" }, { status: 400 });
    }

    const payload = JSON.parse(payloadStr);
    const sessionId = context.params.id;
    const entityId = auth.profile.entity_id;

    // Vérifier session
    const { data: session } = await auth.supabase
      .from("sessions")
      .select("id, title")
      .eq("id", sessionId)
      .eq("entity_id", entityId)
      .maybeSingle();

    if (!session) {
      return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    }

    // Upload dans Storage
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${entityId}/${sessionId}/${Date.now()}_${safeName}`;
    const buffer = await file.arrayBuffer();

    const { error: uploadErr } = await auth.supabase.storage
      .from("invoices")
      .upload(filePath, buffer, { contentType: file.type, upsert: false });

    if (uploadErr) {
      return NextResponse.json({ error: `Upload échoué : ${uploadErr.message}` }, { status: 500 });
    }

    // URL signée 1 an
    const { data: signed } = await auth.supabase.storage
      .from("invoices")
      .createSignedUrl(filePath, 60 * 60 * 24 * 365);

    const pdfUrl = signed?.signedUrl || filePath;

    // Numérotation
    const fiscalYear = new Date().getFullYear();
    const { data: maxRow } = await auth.supabase
      .from("formation_invoices")
      .select("global_number")
      .eq("entity_id", entityId)
      .eq("fiscal_year", fiscalYear)
      .eq("prefix", "FAC")
      .order("global_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextNumber = (maxRow?.global_number ?? 0) + 1;

    // Insérer
    const { data: invoice, error: insertErr } = await auth.supabase
      .from("formation_invoices")
      .insert({
        session_id: sessionId,
        entity_id: entityId,
        is_external: true,
        external_pdf_url: pdfUrl,
        external_source: payload.ai_parsed ? "ai_parsed" : "upload",
        external_reference: payload.external_ref || null,
        recipient_type: payload.recipient_type || "company",
        recipient_id: crypto.randomUUID(),
        recipient_name: payload.recipient_name || "Inconnu",
        recipient_siret: payload.recipient_siret || null,
        recipient_address: payload.recipient_address || null,
        recipient_postal_code: payload.recipient_postal_code || null,
        recipient_city: payload.recipient_city || null,
        amount: parseFloat(payload.amount_ttc) || 0,
        due_date: payload.due_date || null,
        notes: payload.description || `Facture importée — ${session.title}`,
        status: "pending",
        prefix: "FAC",
        number: nextNumber,
        global_number: nextNumber,
        fiscal_year: fiscalYear,
      })
      .select()
      .single();

    if (insertErr) {
      await auth.supabase.storage.from("invoices").remove([filePath]);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    logAudit({
      supabase: auth.supabase,
      entityId,
      userId: auth.user.id,
      action: "create",
      resourceType: "invoice_import",
      resourceId: invoice.id,
      details: { source: payload.ai_parsed ? "ai_parsed" : "upload" },
    });

    return NextResponse.json({ invoice });
  } catch (err) {
    console.error("[invoice-import]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}
