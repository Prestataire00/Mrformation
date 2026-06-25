import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";
import {
  getCompaniesForFormation,
  validateCompanyExport,
  getAmountForCompany,
} from "@/lib/utils/formation-companies";
import { buildInvoiceLines } from "@/lib/utils/invoice-builder";
import { resolveActiveEntityId } from "@/lib/crm/active-entity";
import type { Session } from "@/lib/types";

type SupabaseServerClient = ReturnType<typeof createClient>;

interface RouteContext {
  params: { id: string };
}

// GET: Preview what would be generated (no side effects)
export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  const sessionId = context.params.id;
  // super_admin : entité active (cookie) ; autres rôles : profile.entity_id.
  // Aligné sur affacturage/CRM (sinon un super_admin ne peut pas facturer
  // l'entité active → « Session introuvable »).
  const entityId = resolveActiveEntityId(auth.profile);

  try {
    const { preview, warnings, error } = await buildInvoicePreview(auth.supabase, sessionId, entityId);
    if (error) return NextResponse.json({ error }, { status: 400 });
    return NextResponse.json({ preview, warnings });
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err, "invoice preview") }, { status: 500 });
  }
}

// POST: Actually generate the invoices
export async function POST(_request: NextRequest, context: RouteContext) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  const sessionId = context.params.id;
  // super_admin : entité active (cookie) ; autres rôles : profile.entity_id.
  // Aligné sur affacturage/CRM (sinon un super_admin ne peut pas facturer
  // l'entité active → « Session introuvable »).
  const entityId = resolveActiveEntityId(auth.profile);

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

    // Stratégie : abort on first error. Sans transaction SQL globale, le partial-write
    // est inévitable, mais on évite le pire : marquer invoice_generated=true alors qu'on
    // a échoué à mi-parcours. Le check `factures existent déjà` dans buildInvoicePreview
    // bloque alors la prochaine tentative et l'admin supprime les factures partielles.
    for (const item of preview) {
      // Crée la facture via la RPC atomique (anti-race-condition).
      // La RPC ne couvre pas auto_generated → on UPDATE après.
      const baseNotes = `Formation : ${session?.title || "—"}${item.detail ? ` — ${item.detail}` : ""}`;
      const { data: inv, error: rpcError } = await auth.supabase.rpc("create_invoice_with_atomic_number", {
        p_entity_id: entityId,
        p_session_id: sessionId,
        p_recipient_type: item.recipientType,
        p_recipient_id: item.recipientId,
        p_recipient_name: item.recipientName,
        p_amount: item.amount,
        p_prefix: "FAC",
        p_fiscal_year: fiscalYear,
        p_due_date: dueDateStr,
        p_notes: baseNotes,
        p_is_avoir: false,
        p_parent_invoice_id: null,
        p_external_reference: null,
        p_recipient_siret: null,
        p_recipient_address: null,
      });

      if (rpcError || !inv) {
        return NextResponse.json({
          error: `Échec création facture "${item.recipientName}": ${rpcError?.message || "résultat vide"}. ${createdInvoices.length} facture(s) déjà créée(s) — supprimez-les avant de retenter.`,
          partial: { count: createdInvoices.length, invoices: createdInvoices },
        }, { status: 500 });
      }

      // UPDATE auto_generated (non couvert par la RPC).
      const updates: Record<string, unknown> = { auto_generated: true };
      const { error: updateError } = await auth.supabase
        .from("formation_invoices")
        .update(updates)
        .eq("id", inv.id);
      if (updateError) {
        return NextResponse.json({
          error: `Échec mise à jour facture ${inv.reference}: ${updateError.message}. Supprimez les factures partielles avant de retenter.`,
          partial: { count: createdInvoices.length + 1, invoices: [...createdInvoices, inv] },
        }, { status: 500 });
      }

      // INSERT lignes de facture (1 par apprenant en INTER, 1 globale en INTRA).
      if (item.lines && item.lines.length > 0) {
        const { error: linesError } = await auth.supabase.from("formation_invoice_lines").insert(
          item.lines.map((l, idx) => ({
            invoice_id: inv.id,
            description: l.description,
            quantity: l.quantity,
            unit_price: l.unit_price,
            order_index: idx,
          }))
        );
        if (linesError) {
          return NextResponse.json({
            error: `Échec insertion lignes pour ${inv.reference}: ${linesError.message}. Supprimez les factures partielles avant de retenter.`,
            partial: { count: createdInvoices.length + 1, invoices: [...createdInvoices, inv] },
          }, { status: 500 });
        }
      }

      createdInvoices.push(inv);
    }

    // Mark session as invoiced — UNIQUEMENT si toutes les créations ont réussi
    // (les retours d'erreur ci-dessus court-circuitent cette ligne).
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

// ──────────────────────────────────────────────
// Build invoice preview (shared between GET and POST)
// ──────────────────────────────────────────────

interface PreviewLine {
  description: string;
  quantity: number;
  unit_price: number;
}

interface PreviewItem {
  recipientType: string;
  recipientId: string;
  recipientName: string;
  amount: number;
  detail: string;
  lines: PreviewLine[];
}

async function buildInvoicePreview(supabase: SupabaseServerClient, sessionId: string, entityId: string): Promise<{
  preview: PreviewItem[];
  warnings: string[];
  error: string | null;
}> {
  const warnings: string[] = [];

  // 1. Fetch session avec toutes les relations nécessaires aux helpers PR 13/14
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select(`
      id, title, start_date, end_date, total_price, type, status,
      invoice_generated, entity_id,
      formation_companies(id, session_id, client_id, amount, email, reference, created_at, client:clients(id, company_name)),
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
  if (count && count > 0) {
    return { preview: [], warnings: [], error: `${count} facture(s) existent déjà. Supprimez-les ou utilisez la création manuelle.` };
  }

  const formation = session as unknown as Session;
  const companies = getCompaniesForFormation(formation);
  const financiers = (session.formation_financiers as Array<{ id: string; name: string; type: string | null; amount: number | null; amount_granted: number | null; status: string | null }>) || [];
  const enrollments = session.enrollments || [];

  if (enrollments.length === 0) warnings.push("Aucun apprenant inscrit.");

  const preview: PreviewItem[] = [];

  // ── 1) FINANCEURS (logique inchangée — montant accordé > 0, status ≠ refusée)
  let financeurTotal = 0;
  for (const fin of financiers) {
    const finAmount = Number(fin.amount_granted) || Number(fin.amount) || 0;
    if (finAmount <= 0) continue;
    if (fin.status === "refusee") continue;

    const finBuilt = buildInvoiceLines(formation, {
      type: "financier",
      id: fin.id,
      amount: finAmount,
    });
    preview.push({
      recipientType: "financier",
      recipientId: fin.id,
      recipientName: fin.name,
      amount: finAmount,
      detail: `Financeur ${fin.type || ""}`.trim(),
      lines: finBuilt.lines,
    });
    financeurTotal += finAmount;
  }

  // ── 2) ENTREPRISES via helpers PR 13/14 (1 facture par entreprise)
  if (companies.length > 0) {
    // Validation amont : toutes les entreprises doivent avoir rattachement + montant OK
    for (const fc of companies) {
      const v = validateCompanyExport(formation, fc.client_id);
      if (!v.ok) {
        const cname = fc.client?.company_name || fc.client_id;
        return { preview: [], warnings, error: `Entreprise "${cname}" : ${v.reason}` };
      }
    }

    for (const fc of companies) {
      const amount = getAmountForCompany(formation, fc.client_id) ?? 0;
      const built = buildInvoiceLines(formation, {
        type: "company",
        id: fc.client_id,
        amount,
      });
      const cname = fc.client?.company_name || "Entreprise";
      preview.push({
        recipientType: "company",
        recipientId: fc.client_id,
        recipientName: cname,
        amount: built.amountHT,
        detail: financeurTotal > 0 ? `Co-financement (financeurs ${financeurTotal}€)` : "",
        lines: built.lines,
      });
    }

    return { preview, warnings, error: null };
  }

  // ── 3) FALLBACK : aucune entreprise rattachée → 1 facture par apprenant (legacy)
  const totalPrice = Number(session.total_price) || 0;
  const remainingAmount = Math.max(0, totalPrice - financeurTotal);
  const enrollmentList = enrollments as Array<{ id: string; learner_id: string | null; learner: { id: string; first_name: string; last_name: string } | { id: string; first_name: string; last_name: string }[] | null }>;

  if (enrollmentList.length === 0) {
    return { preview: [], warnings, error: "Aucune entreprise rattachée et aucun apprenant inscrit." };
  }

  const pricePerLearner = enrollmentList.length > 0 ? remainingAmount / enrollmentList.length : 0;
  warnings.push("Aucune entreprise rattachée — factures générées par apprenant (fallback legacy).");

  for (const e of enrollmentList) {
    const learner = Array.isArray(e.learner) ? e.learner[0] : e.learner;
    if (!learner || pricePerLearner <= 0) continue;
    const fullName = `${learner.last_name?.toUpperCase()} ${learner.first_name}`;
    const learnerAmount = Math.round(pricePerLearner * 100) / 100;
    const learnerBuilt = buildInvoiceLines(formation, {
      type: "learner",
      id: learner.id,
      amount: learnerAmount,
    });
    preview.push({
      recipientType: "learner",
      recipientId: learner.id,
      recipientName: fullName,
      amount: learnerAmount,
      detail: "Particulier",
      lines: learnerBuilt.lines,
    });
  }

  return { preview, warnings, error: null };
}
