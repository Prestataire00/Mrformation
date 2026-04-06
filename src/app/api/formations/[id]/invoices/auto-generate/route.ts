import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";

interface RouteContext {
  params: { id: string };
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  const sessionId = context.params.id;
  const entityId = auth.profile.entity_id;

  try {
    // 1. Fetch session with all related data
    const { data: session, error: sessionError } = await auth.supabase
      .from("sessions")
      .select(`
        id, title, start_date, end_date, total_price, type, status,
        invoice_generated, planned_hours, entity_id,
        formation_companies(id, client_id, amount, client:clients(id, company_name, siret, address, city, postal_code)),
        formation_financiers(id, name, type, amount),
        enrollments(id, learner_id, client_id, learner:learners(id, first_name, last_name))
      `)
      .eq("id", sessionId)
      .eq("entity_id", entityId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    }

    // 2. Vérifications
    if (session.status !== "completed") {
      return NextResponse.json({
        error: "La formation doit être terminée (statut 'completed') pour générer les factures.",
      }, { status: 400 });
    }

    if (session.invoice_generated) {
      return NextResponse.json({
        error: "Les factures ont déjà été générées pour cette formation.",
      }, { status: 400 });
    }

    // Check if invoices already exist
    const { count } = await auth.supabase
      .from("formation_invoices")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("entity_id", entityId);

    if (count && count > 0) {
      return NextResponse.json({
        error: `${count} facture(s) existent déjà pour cette formation. Supprimez-les d'abord ou utilisez la création manuelle.`,
      }, { status: 400 });
    }

    // 3. Préparer les données
    const companies = session.formation_companies || [];
    const financiers = session.formation_financiers || [];
    const enrollments = session.enrollments || [];
    const totalPrice = Number(session.total_price) || 0;
    const fiscalYear = new Date().getFullYear();
    const dueDate = new Date(session.end_date);
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

    // 4. Logique de génération
    if (session.type === "intra" && companies.length > 0) {
      // INTRA : 1 facture vers l'entreprise principale
      const mainCompany = companies[0];
      const clientArr = mainCompany.client as unknown as Array<{ id: string; company_name: string }> | null;
      const client = clientArr?.[0] || null;
      if (!client) {
        return NextResponse.json({ error: "Aucune entreprise liée à cette formation intra." }, { status: 400 });
      }

      // Montant financeur à déduire
      let financeurTotal = 0;

      // Factures financeurs d'abord
      for (const fin of financiers) {
        if (fin.amount && fin.amount > 0) {
          const nextNum = await getNextNumber("FAC");
          const { data: inv, error } = await auth.supabase
            .from("formation_invoices")
            .insert({
              entity_id: entityId,
              session_id: sessionId,
              recipient_type: "financier",
              recipient_id: fin.id,
              recipient_name: fin.name,
              amount: fin.amount,
              prefix: "FAC",
              number: nextNum,
              global_number: nextNum,
              fiscal_year: fiscalYear,
              due_date: dueDateStr,
              auto_generated: true,
              notes: `Formation : ${session.title}`,
            })
            .select()
            .single();
          if (!error && inv) createdInvoices.push(inv);
          financeurTotal += Number(fin.amount);
        }
      }

      // Facture entreprise (total - financeurs)
      const companyAmount = Math.max(0, totalPrice - financeurTotal);
      if (companyAmount > 0) {
        const nextNum = await getNextNumber("FAC");
        const { data: inv, error } = await auth.supabase
          .from("formation_invoices")
          .insert({
            entity_id: entityId,
            session_id: sessionId,
            recipient_type: "company",
            recipient_id: client.id,
            recipient_name: client.company_name,
            amount: companyAmount,
            prefix: "FAC",
            number: nextNum,
            global_number: nextNum,
            fiscal_year: fiscalYear,
            due_date: dueDateStr,
            auto_generated: true,
            notes: `Formation : ${session.title}`,
          })
          .select()
          .single();
        if (!error && inv) createdInvoices.push(inv);
      }
    } else {
      // INTER : 1 facture par entreprise proportionnelle au nombre d'apprenants
      const pricePerLearner = enrollments.length > 0 ? totalPrice / enrollments.length : totalPrice;

      // Grouper les apprenants par client_id
      const learnersByClient: Record<string, { clientId: string; clientName: string; count: number }> = {};

      for (const enrollment of enrollments) {
        const clientId = enrollment.client_id || "individual";
        if (!learnersByClient[clientId]) {
          // Find company name
          const company = companies.find((c) => c.client_id === clientId);
          const clientArr = company?.client as unknown as Array<{ id: string; company_name: string }> | null;
          const clientObj = clientArr?.[0] || null;
          learnersByClient[clientId] = {
            clientId,
            clientName: clientObj?.company_name || "Particulier",
            count: 0,
          };
        }
        learnersByClient[clientId].count++;
      }

      for (const group of Object.values(learnersByClient)) {
        const amount = Math.round(pricePerLearner * group.count * 100) / 100;
        if (amount <= 0) continue;

        const recipientType = group.clientId === "individual" ? "learner" : "company";
        const nextNum = await getNextNumber("FAC");

        const { data: inv, error } = await auth.supabase
          .from("formation_invoices")
          .insert({
            entity_id: entityId,
            session_id: sessionId,
            recipient_type: recipientType,
            recipient_id: group.clientId === "individual" ? (enrollments[0]?.learner_id || group.clientId) : group.clientId,
            recipient_name: group.clientName,
            amount,
            prefix: "FAC",
            number: nextNum,
            global_number: nextNum,
            fiscal_year: fiscalYear,
            due_date: dueDateStr,
            auto_generated: true,
            notes: `Formation : ${session.title} — ${group.count} apprenant(s)`,
          })
          .select()
          .single();
        if (!error && inv) createdInvoices.push(inv);
      }
    }

    // 5. Marquer la session comme facturée
    await auth.supabase
      .from("sessions")
      .update({ invoice_generated: true })
      .eq("id", sessionId);

    // 6. Audit
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
        session_title: session.title,
      },
    });

    return NextResponse.json({
      success: true,
      invoices: createdInvoices,
      count: createdInvoices.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "auto-generate invoices") },
      { status: 500 }
    );
  }
}
