import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";

interface RouteContext {
  params: { id: string };
}

// GET: Preview what would be generated (no side effects)
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  const sessionId = context.params.id;
  const entityId = auth.profile.entity_id;

  try {
    const { preview, warnings, error } = await buildInvoicePreview(auth.supabase, sessionId, entityId);
    if (error) return NextResponse.json({ error }, { status: 400 });
    return NextResponse.json({ preview, warnings });
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err, "invoice preview") }, { status: 500 });
  }
}

// POST: Actually generate the invoices
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  const sessionId = context.params.id;
  const entityId = auth.profile.entity_id;

  try {
    const { preview, error: previewError } = await buildInvoicePreview(auth.supabase, sessionId, entityId);
    if (previewError) return NextResponse.json({ error: previewError }, { status: 400 });
    if (!preview || preview.length === 0) {
      return NextResponse.json({ error: "Aucune facture à générer." }, { status: 400 });
    }

    // Fetch session title for notes
    const { data: session } = await auth.supabase
      .from("sessions")
      .select("title, end_date")
      .eq("id", sessionId)
      .single();

    const fiscalYear = new Date().getFullYear();
    const dueDate = new Date(session?.end_date || new Date());
    dueDate.setDate(dueDate.getDate() + 30);
    const dueDateStr = dueDate.toISOString().split("T")[0];

    const createdInvoices: Array<Record<string, unknown>> = [];

    // Helper: get next global number
    const getNextNumber = async (prefix: string): Promise<number> => {
      const { data: maxRow } = await auth.supabase
        .from("formation_invoices")
        .select("global_number")
        .eq("entity_id", entityId)
        .eq("fiscal_year", fiscalYear)
        .eq("prefix", prefix)
        .order("global_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (maxRow?.global_number ?? 0) + 1;
    };

    for (const item of preview) {
      const nextNum = await getNextNumber("FAC");
      const { data: inv, error } = await auth.supabase
        .from("formation_invoices")
        .insert({
          entity_id: entityId,
          session_id: sessionId,
          recipient_type: item.recipientType,
          recipient_id: item.recipientId,
          recipient_name: item.recipientName,
          amount: item.amount,
          prefix: "FAC",
          number: nextNum,
          global_number: nextNum,
          fiscal_year: fiscalYear,
          due_date: dueDateStr,
          auto_generated: true,
          notes: `Formation : ${session?.title || "—"}${item.detail ? ` — ${item.detail}` : ""}`,
        })
        .select()
        .single();
      if (!error && inv) createdInvoices.push(inv);
    }

    // Mark session as invoiced
    await auth.supabase
      .from("sessions")
      .update({ invoice_generated: true })
      .eq("id", sessionId);

    logAudit({
      supabase: auth.supabase,
      entityId,
      userId: auth.user.id,
      action: "create",
      resourceType: "formation_invoices_auto",
      resourceId: sessionId,
      details: {
        count: createdInvoices.length,
        total: createdInvoices.reduce((s, i) => s + Number(i.amount), 0),
        session_title: session?.title,
      },
    });

    return NextResponse.json({
      success: true,
      invoices: createdInvoices,
      count: createdInvoices.length,
    });
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err, "auto-generate invoices") }, { status: 500 });
  }
}

// ── Build invoice preview (shared between GET and POST) ──

interface PreviewItem {
  recipientType: string;
  recipientId: string;
  recipientName: string;
  amount: number;
  detail: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildInvoicePreview(supabase: any, sessionId: string, entityId: string): Promise<{
  preview: PreviewItem[];
  warnings: string[];
  error: string | null;
}> {
  const warnings: string[] = [];

  // 1. Fetch session
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select(`
      id, title, start_date, end_date, total_price, type, status,
      invoice_generated, entity_id,
      formation_companies(id, client_id, amount, client:clients(id, company_name)),
      formation_financiers(id, name, type, amount, amount_granted, status),
      enrollments(id, learner_id, client_id, learner:learners(id, first_name, last_name), client:clients(id, company_name))
    `)
    .eq("id", sessionId)
    .eq("entity_id", entityId)
    .single();

  if (sessionError || !session) return { preview: [], warnings: [], error: "Session introuvable." };
  if (session.status !== "completed") return { preview: [], warnings: [], error: "La formation doit être terminée (statut 'completed')." };
  if (session.invoice_generated) return { preview: [], warnings: [], error: "Les factures ont déjà été générées." };

  // Check existing invoices
  const { count } = await supabase
    .from("formation_invoices")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("entity_id", entityId);
  if (count && count > 0) return { preview: [], warnings: [], error: `${count} facture(s) existent déjà. Supprimez-les ou utilisez la création manuelle.` };

  const companies = session.formation_companies || [];
  const financiers = session.formation_financiers || [];
  const enrollments = session.enrollments || [];
  const totalPrice = Number(session.total_price) || 0;

  if (totalPrice <= 0) warnings.push("Le prix total de la formation est à 0€. Les factures seront à 0€.");
  if (enrollments.length === 0) warnings.push("Aucun apprenant inscrit.");

  const preview: PreviewItem[] = [];

  // ── FINANCEURS (both INTRA and INTER) ──
  let financeurTotal = 0;
  for (const fin of financiers) {
    // Use amount_granted if accepted, else amount
    const finAmount = Number(fin.amount_granted) || Number(fin.amount) || 0;
    if (finAmount <= 0) continue;
    // Skip refused financiers
    if (fin.status === "refusee") continue;

    preview.push({
      recipientType: "financier",
      recipientId: fin.id,
      recipientName: fin.name,
      amount: finAmount,
      detail: `Financeur ${fin.type || ""}`.trim(),
    });
    financeurTotal += finAmount;
  }

  // ── INTRA: 1 facture entreprise ──
  if (session.type === "intra") {
    // Find the company: formation_companies first, then enrollment clients
    let companyId: string | null = null;
    let companyName: string | null = null;

    // Try formation_companies
    if (companies.length > 0) {
      const clientArr = companies[0].client as unknown as Array<{ id: string; company_name: string }> | null;
      const client = Array.isArray(clientArr) ? clientArr[0] : (companies[0].client as unknown as { id: string; company_name: string } | null);
      if (client) {
        companyId = client.id;
        companyName = client.company_name;
      }
    }

    // Fallback: find company from enrollments
    if (!companyId) {
      for (const e of enrollments) {
        if (e.client_id) {
          const enrollClient = Array.isArray(e.client) ? e.client[0] : e.client;
          if (enrollClient) {
            companyId = (enrollClient as { id: string; company_name: string }).id;
            companyName = (enrollClient as { id: string; company_name: string }).company_name;
            warnings.push(`Entreprise "${companyName}" détectée depuis les inscriptions (pas dans les entreprises liées).`);
            break;
          }
        }
      }
    }

    if (companyId && companyName) {
      const companyAmount = Math.max(0, totalPrice - financeurTotal);
      if (companyAmount > 0) {
        preview.push({
          recipientType: "company",
          recipientId: companyId,
          recipientName: companyName,
          amount: companyAmount,
          detail: financeurTotal > 0 ? `Total ${totalPrice}€ - Financeurs ${financeurTotal}€` : "",
        });
      }
    } else if (enrollments.length > 0) {
      // No company found — generate per-learner invoices
      warnings.push("Aucune entreprise trouvée pour cette formation intra. Factures générées par apprenant.");
      const pricePerLearner = enrollments.length > 0 ? Math.max(0, totalPrice - financeurTotal) / enrollments.length : 0;
      for (const e of enrollments) {
        const learner = Array.isArray(e.learner) ? e.learner[0] : e.learner;
        if (!learner || pricePerLearner <= 0) continue;
        preview.push({
          recipientType: "learner",
          recipientId: learner.id,
          recipientName: `${(learner as { last_name: string }).last_name?.toUpperCase()} ${(learner as { first_name: string }).first_name}`,
          amount: Math.round(pricePerLearner * 100) / 100,
          detail: "Particulier",
        });
      }
    } else {
      return { preview: [], warnings, error: "Aucune entreprise ni apprenant lié à cette formation. Ajoutez une entreprise dans l'onglet Vue d'ensemble ou inscrivez des apprenants." };
    }
  }

  // ── INTER: 1 facture par groupe d'apprenants ──
  if (session.type !== "intra") {
    if (enrollments.length === 0) {
      return { preview: [], warnings, error: "Aucun apprenant inscrit. Ajoutez des apprenants pour générer les factures." };
    }

    const remainingAmount = Math.max(0, totalPrice - financeurTotal);
    const pricePerLearner = enrollments.length > 0 ? remainingAmount / enrollments.length : 0;

    // Group by client
    const groups: Record<string, { id: string; name: string; count: number }> = {};
    for (const e of enrollments) {
      const clientId = e.client_id || "individual";
      if (!groups[clientId]) {
        let clientName = "Particulier";
        if (e.client_id) {
          const enrollClient = Array.isArray(e.client) ? e.client[0] : e.client;
          if (enrollClient) clientName = (enrollClient as { company_name: string }).company_name;
        }
        groups[clientId] = { id: clientId, name: clientName, count: 0 };
      }
      groups[clientId].count++;
    }

    for (const group of Object.values(groups)) {
      const amount = Math.round(pricePerLearner * group.count * 100) / 100;
      if (amount <= 0) continue;

      preview.push({
        recipientType: group.id === "individual" ? "learner" : "company",
        recipientId: group.id === "individual" ? (enrollments.find((e: Record<string, unknown>) => !e.client_id)?.learner_id as string || "individual") : group.id,
        recipientName: group.name,
        amount,
        detail: `${group.count} apprenant(s)`,
      });
    }
  }

  return { preview, warnings, error: null };
}
