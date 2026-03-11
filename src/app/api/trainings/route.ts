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
    const domainId = searchParams.get("domain_id") ?? "";
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const perPage = parseInt(searchParams.get("per_page") ?? "20", 10);
    const offset = (page - 1) * perPage;

    let query = supabase
      .from("trainings")
      .select(
        `
        *,
        training_domains (id, name),
        sessions (count)
      `,
        { count: "exact" }
      )
      .eq("entity_id", profile.entity_id)
      .order("title", { ascending: true })
      .range(offset, offset + perPage - 1);

    if (search) {
      query = query.ilike("title", `%${search}%`);
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (domainId) {
      query = query.eq("training_domain_id", domainId);
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
      title,
      description,
      objectives,
      prerequisites,
      duration_hours,
      duration_days,
      max_participants,
      min_participants,
      price,
      certification,
      certification_name,
      training_domain_id,
      status,
      mode,
      program,
    } = body;

    if (!title) {
      return NextResponse.json(
        { data: null, error: "Le titre de la formation est requis" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("trainings")
      .insert({
        entity_id: profile.entity_id,
        title,
        description: description ?? null,
        objectives: objectives ?? null,
        prerequisites: prerequisites ?? null,
        duration_hours: duration_hours ?? null,
        duration_days: duration_days ?? null,
        max_participants: max_participants ?? null,
        min_participants: min_participants ?? null,
        price: price ?? null,
        certification: certification ?? null,
        certification_name: certification_name ?? null,
        training_domain_id: training_domain_id ?? null,
        status: status ?? "active",
        mode: mode ?? null,
        program: program ?? null,
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
