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
    const taskStatus = searchParams.get("status") ?? "";
    const priority = searchParams.get("priority") ?? "";
    const assignedTo = searchParams.get("assigned_to") ?? "";
    const dueDateFrom = searchParams.get("due_date_from") ?? "";
    const dueDateTo = searchParams.get("due_date_to") ?? "";
    const overdue = searchParams.get("overdue") ?? "";
    const prospectId = searchParams.get("prospect_id") ?? "";
    const clientId = searchParams.get("client_id") ?? "";
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const perPage = parseInt(searchParams.get("per_page") ?? "20", 10);
    const offset = (page - 1) * perPage;

    let query = supabase
      .from("crm_tasks")
      .select(
        `
        *,
        assigned_profile:profiles!crm_tasks_assigned_to_fkey (id, first_name, last_name)
      `,
        { count: "exact" }
      )
      .eq("entity_id", profile.entity_id)
      .order("due_date", { ascending: true, nullsFirst: false })
      .range(offset, offset + perPage - 1);

    if (taskStatus) {
      query = query.eq("status", taskStatus);
    }

    if (priority) {
      query = query.eq("priority", priority);
    }

    if (assignedTo) {
      query = query.eq("assigned_to", assignedTo);
    }

    if (prospectId) {
      query = query.eq("prospect_id", prospectId);
    }

    if (clientId) {
      query = query.eq("client_id", clientId);
    }

    if (dueDateFrom) {
      query = query.gte("due_date", dueDateFrom);
    }

    if (dueDateTo) {
      query = query.lte("due_date", dueDateTo);
    }

    if (overdue === "true") {
      const today = new Date().toISOString().split("T")[0];
      query = query
        .lt("due_date", today)
        .neq("status", "completed")
        .neq("status", "cancelled");
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
      status,
      priority,
      due_date,
      assigned_to,
      prospect_id,
      client_id,
    } = body;

    if (!title) {
      return NextResponse.json(
        { data: null, error: "Le titre de la tâche est requis" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("crm_tasks")
      .insert({
        entity_id: profile.entity_id,
        title,
        description: description ?? null,
        status: status ?? "pending",
        priority: priority ?? "medium",
        due_date: due_date ?? null,
        assigned_to: assigned_to ?? user.id,
        prospect_id: prospect_id ?? null,
        client_id: client_id ?? null,
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
