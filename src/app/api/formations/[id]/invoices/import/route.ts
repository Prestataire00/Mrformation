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

    // Numérotation atomique via la RPC (advisory lock par entité/année/préfixe
    // dans la même transaction que l'INSERT) — élimine la race condition du
    // SELECT MAX + INSERT séparés, qui pouvait produire des doublons de numéro.
    const fiscalYear = new Date().getFullYear();

    // `amount` est stocké en HT (convention du module — la TVA est recalculée
    // au rendu PDF). On prend le HT saisi ; repli : si seul le TTC est connu,
    // on dérive le HT depuis le taux de TVA.
    const amountHt = parseFloat(payload.amount_ht) || 0;
    const amountTtc = parseFloat(payload.amount_ttc) || 0;
    const vatRate = parseFloat(payload.vat_rate);
    const amount = amountHt > 0
      ? amountHt
      : Number.isFinite(vatRate) && vatRate > 0
        ? Math.round((amountTtc / (1 + vatRate / 100)) * 100) / 100
        : amountTtc;

    const { data: invoice, error: rpcErr } = await auth.supabase.rpc("create_invoice_with_atomic_number", {
      p_entity_id: entityId,
      p_session_id: sessionId,
      p_recipient_type: payload.recipient_type || "company",
      p_recipient_id: crypto.randomUUID(),
      p_recipient_name: payload.recipient_name || "Inconnu",
      p_amount: amount,
      p_prefix: "FAC",
      p_fiscal_year: fiscalYear,
      p_due_date: payload.due_date || null,
      p_notes: payload.description || `Facture importée — ${session.title}`,
      p_is_avoir: false,
      p_parent_invoice_id: null,
      p_external_reference: payload.external_ref || null,
      p_recipient_siret: payload.recipient_siret || null,
      p_recipient_address: payload.recipient_address || null,
      p_funding_type: null,
    });

    if (rpcErr || !invoice) {
      await auth.supabase.storage.from("invoices").remove([filePath]);
      return NextResponse.json(
        { error: rpcErr?.message || "Création de la facture échouée" },
        { status: 500 },
      );
    }

    // Champs propres aux factures externes — non couverts par la RPC.
    const { error: extErr } = await auth.supabase
      .from("formation_invoices")
      .update({
        is_external: true,
        external_pdf_url: pdfUrl,
        external_source: payload.ai_parsed ? "ai_parsed" : "upload",
        recipient_postal_code: payload.recipient_postal_code || null,
        recipient_city: payload.recipient_city || null,
      })
      .eq("id", invoice.id);
    if (extErr) {
      // Non bloquant : la facture est créée et numérotée. On loggue l'écart.
      console.error("[invoice-import] external fields update failed:", extErr.message);
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
