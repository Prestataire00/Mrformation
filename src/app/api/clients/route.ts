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
    const search = searchParams.get("search") ?? "";
    const status = searchParams.get("status") ?? "";
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const perPage = parseInt(searchParams.get("per_page") ?? "20", 10);
    const offset = (page - 1) * perPage;

    let query = supabase
      .from("clients")
      .select("*", { count: "exact" })
      .eq("entity_id", profile.entity_id)
      .order("company_name", { ascending: true })
      .range(offset, offset + perPage - 1);

    if (search) {
      query = query.ilike("company_name", `%${search}%`);
    }

    if (status) {
      query = query.eq("status", status);
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
      name,
      siret,
      address,
      city,
      postal_code,
      country,
      phone,
      email,
      website,
      status,
      notes,
      opco,
      funding_type,
    } = body;

    if (!name) {
      return NextResponse.json(
        { data: null, error: "Le nom du client est requis" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("clients")
      .insert({
        entity_id: profile.entity_id,
        company_name: name,
        siret: siret ?? null,
        address: address ?? null,
        city: city ?? null,
        postal_code: postal_code ?? null,
        country: country ?? "France",
        phone: phone ?? null,
        email: email ?? null,
        website: website ?? null,
        status: status ?? "active",
        notes: notes ?? null,
        opco: opco ?? null,
        funding_type: funding_type ?? null,
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
