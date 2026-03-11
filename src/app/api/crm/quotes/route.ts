import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

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

    if (profile.role !== "admin") {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const quoteStatus = searchParams.get("status") ?? "";
    const clientId = searchParams.get("client_id") ?? "";
    const prospectId = searchParams.get("prospect_id") ?? "";
    const dateFrom = searchParams.get("date_from") ?? "";
    const dateTo = searchParams.get("date_to") ?? "";
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const perPage = parseInt(searchParams.get("per_page") ?? "20", 10);
    const offset = (page - 1) * perPage;

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
        { data: null, error: error.message },
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
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
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

    if (profile.role !== "admin") {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const body = await request.json();

    const {
      reference,
      client_id,
      prospect_id,
      amount,
      status,
      valid_until,
      notes,
    } = body;

    if (!client_id && !prospect_id) {
      return NextResponse.json(
        { data: null, error: "Un client ou un prospect est requis" },
        { status: 400 }
      );
    }

    if (!reference) {
      return NextResponse.json(
        { data: null, error: "La référence du devis est requise" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("crm_quotes")
      .insert({
        entity_id: profile.entity_id,
        reference,
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
        { data: null, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
