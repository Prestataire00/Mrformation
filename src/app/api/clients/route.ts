import { createClient } from "@/lib/supabase/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { parsePagination, createClientSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit-log";
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

    if (!["admin","super_admin"].includes(profile.role)) {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? "";
    const status = searchParams.get("status") ?? "";
    const { page, perPage, offset } = parsePagination(searchParams);

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
        { data: null, error: sanitizeDbError(error, "fetch clients") },
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
    return NextResponse.json({ data: null, error: sanitizeError(err, "fetch clients") }, { status: 500 });
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

    const parsed = createClientSchema.safeParse({
      ...body,
      company_name: body.company_name ?? body.name,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { company_name, siret, address, city, postal_code, phone, email, website, status, notes } = parsed.data;

    const { data, error } = await supabase
      .from("clients")
      .insert({
        entity_id: profile.entity_id,
        company_name,
        siret: siret ?? null,
        address: address ?? null,
        city: city ?? null,
        postal_code: postal_code ?? null,
        country: body.country ?? "France",
        phone: phone ?? null,
        email: email ?? null,
        website: website ?? null,
        status: status ?? "active",
        notes: notes ?? null,
        opco: body.opco ?? null,
        funding_type: body.funding_type ?? null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { data: null, error: sanitizeDbError(error, "create client") },
        { status: 500 }
      );
    }

    logAudit({
      supabase,
      entityId: profile.entity_id,
      userId: user.id,
      action: "create",
      resourceType: "clients",
      resourceId: data.id,
      details: { company_name: data.company_name },
    });

    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ data: null, error: sanitizeError(err, "create client") }, { status: 500 });
  }
}
