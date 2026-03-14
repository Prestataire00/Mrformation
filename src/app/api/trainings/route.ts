import { createClient } from "@/lib/supabase/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { parsePagination, createTrainingSchema } from "@/lib/validations";
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

    if (profile.role !== "admin") {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? "";
    const status = searchParams.get("status") ?? "";
    const domainId = searchParams.get("domain_id") ?? "";
    const { page, perPage, offset } = parsePagination(searchParams);

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
        { data: null, error: sanitizeDbError(error, "fetch trainings") },
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
    return NextResponse.json({ data: null, error: sanitizeError(err, "fetch trainings") }, { status: 500 });
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

    const parsed = createTrainingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { title, description, duration_hours, price, status, prerequisites } = parsed.data;

    const { data, error } = await supabase
      .from("trainings")
      .insert({
        entity_id: profile.entity_id,
        title,
        description: description ?? null,
        objectives: body.objectives ?? null,
        prerequisites: prerequisites ?? null,
        duration_hours: duration_hours ?? null,
        duration_days: body.duration_days ?? null,
        max_participants: body.max_participants ?? null,
        min_participants: body.min_participants ?? null,
        price: price ?? null,
        certification: body.certification ?? null,
        certification_name: body.certification_name ?? null,
        training_domain_id: body.training_domain_id ?? null,
        status: status ?? "active",
        mode: body.mode ?? null,
        program: body.program ?? null,
        program_id: body.program_id ?? null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { data: null, error: sanitizeDbError(error, "create training") },
        { status: 500 }
      );
    }

    logAudit({
      supabase,
      entityId: profile.entity_id,
      userId: user.id,
      action: "create",
      resourceType: "training",
      resourceId: data.id,
      details: { name: data.title },
    });

    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ data: null, error: sanitizeError(err, "create training") }, { status: 500 });
  }
}
