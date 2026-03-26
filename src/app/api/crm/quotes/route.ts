import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { evaluateProspectStatusFromQuotes } from "@/lib/crm/automations";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { parsePagination, createQuoteSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit-log";

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { data: null, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("entity_id, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.entity_id) {
      return NextResponse.json(
        { data: null, error: "Profile or entity not found" },
        { status: 403 }
      );
    }

    if (!["admin","super_admin"].includes(profile.role)) {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const quoteStatus = searchParams.get("status") ?? "";
    const clientId = searchParams.get("client_id") ?? "";
    const prospectId = searchParams.get("prospect_id") ?? "";
    const dateFrom = searchParams.get("date_from") ?? "";
    const dateTo = searchParams.get("date_to") ?? "";
    const { page, perPage, offset } = parsePagination(searchParams);

    let query = supabase
      .from("crm_quotes")
      .select(
        `
        *,
        client:clients (id, company_name, email),
        prospect:crm_prospects (id, company_name, contact_name, email),
        creator:profiles!crm_quotes_created_by_fkey (id, first_name, last_name)
      `,
        { count: "exact" }
      )
      .eq("entity_id", profile.entity_id)
      .order("created_at", { ascending: false })
      .range(offset, offset + perPage - 1);

    if (quoteStatus) {
      query = query.eq("status", quoteStatus);
    }

    if (clientId) {
      query = query.eq("client_id", clientId);
    }

    if (prospectId) {
      query = query.eq("prospect_id", prospectId);
    }

    if (dateFrom) {
      query = query.gte("created_at", dateFrom);
    }

    if (dateTo) {
      query = query.lte("created_at", dateTo);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { data: null, error: sanitizeDbError(error, "fetching quotes") },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data,
      error: null,
      meta: {
        total: count ?? 0,
        page,
        per_page: perPage,
        total_pages: Math.ceil((count ?? 0) / perPage),
      },
    });
  } catch (err) {
    return NextResponse.json({ data: null, error: sanitizeError(err, "fetching quotes") }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { data: null, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("entity_id, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.entity_id) {
      return NextResponse.json(
        { data: null, error: "Profile or entity not found" },
        { status: 403 }
      );
    }

    if (!["admin","super_admin"].includes(profile.role)) {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const body = await request.json();

    const parsed = createQuoteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { client_id, prospect_id, title, amount, status, valid_until, notes } = parsed.data;

    const { data, error } = await supabase
      .from("crm_quotes")
      .insert({
        entity_id: profile.entity_id,
        reference: body.reference ?? title,
        client_id: client_id ?? null,
        prospect_id: prospect_id ?? null,
        amount: amount ?? null,
        status: status ?? "draft",
        valid_until: valid_until ?? null,
        notes: notes ?? null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { data: null, error: sanitizeDbError(error, "creating quote") },
        { status: 500 }
      );
    }

    // Auto-transition prospect status when a quote is created
    if (data && prospect_id && profile.entity_id) {
      await evaluateProspectStatusFromQuotes(supabase, prospect_id, profile.entity_id);
    }

    logAudit({
      supabase,
      entityId: profile.entity_id,
      userId: user.id,
      action: "create",
      resourceType: "quote",
      resourceId: data.id,
      details: { name: data.reference ?? title },
    });

    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ data: null, error: sanitizeError(err, "creating quote") }, { status: 500 });
  }
}
