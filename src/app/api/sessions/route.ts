import { createClient } from "@/lib/supabase/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { parsePagination, createSessionSchema } from "@/lib/validations";
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

    if (!["admin", "trainer"].includes(profile.role)) {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const sessionStatus = searchParams.get("status") ?? "";
    const mode = searchParams.get("mode") ?? "";
    const trainingId = searchParams.get("training_id") ?? "";
    const trainerId = searchParams.get("trainer_id") ?? "";
    const clientId = searchParams.get("client_id") ?? "";
    const dateFrom = searchParams.get("date_from") ?? "";
    const dateTo = searchParams.get("date_to") ?? "";
    const { page, perPage, offset } = parsePagination(searchParams);

    let query = supabase
      .from("sessions")
      .select(
        `
        *,
        trainings (id, title, duration_hours),
        trainers (id, first_name, last_name, email),
        clients (id, company_name),
        enrollments (count)
      `,
        { count: "exact" }
      )
      .eq("entity_id", profile.entity_id)
      .order("start_date", { ascending: true })
      .range(offset, offset + perPage - 1);

    if (sessionStatus) {
      query = query.eq("status", sessionStatus);
    }

    if (mode) {
      query = query.eq("mode", mode);
    }

    if (trainingId) {
      query = query.eq("training_id", trainingId);
    }

    if (trainerId) {
      query = query.eq("trainer_id", trainerId);
    }

    if (clientId) {
      query = query.eq("client_id", clientId);
    }

    if (dateFrom) {
      query = query.gte("start_date", dateFrom);
    }

    if (dateTo) {
      query = query.lte("start_date", dateTo);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { data: null, error: sanitizeDbError(error, "fetch sessions") },
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
    return NextResponse.json({ data: null, error: sanitizeError(err, "fetch sessions") }, { status: 500 });
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

    const parsed = createSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { training_id, trainer_id, client_id, start_date, end_date, location, status, max_participants, notes } = parsed.data;

    const { data, error } = await supabase
      .from("sessions")
      .insert({
        entity_id: profile.entity_id,
        training_id,
        trainer_id: trainer_id ?? null,
        client_id: client_id ?? null,
        start_date: start_date ?? null,
        end_date: end_date ?? null,
        mode: body.mode ?? "presentiel",
        location: location ?? null,
        address: body.address ?? null,
        city: body.city ?? null,
        postal_code: body.postal_code ?? null,
        max_participants: max_participants ?? null,
        status: status ?? "upcoming",
        notes: notes ?? null,
        price: body.price ?? null,
        internal_notes: body.internal_notes ?? null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { data: null, error: sanitizeDbError(error, "create session") },
        { status: 500 }
      );
    }

    logAudit({
      supabase,
      entityId: profile.entity_id,
      userId: user.id,
      action: "create",
      resourceType: "session",
      resourceId: data.id,
      details: { name: data.title ?? body.title },
    });

    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ data: null, error: sanitizeError(err, "create session") }, { status: 500 });
  }
}
