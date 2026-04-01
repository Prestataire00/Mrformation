import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createTaskSchema } from "@/lib/validations/crm-tasks";
import { parsePagination } from "@/lib/validations";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";
import { logCommercialAction } from "@/lib/crm/log-commercial-action";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role configuration");
  return createSupabaseClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

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

    if (!["super_admin", "admin", "trainer", "commercial"].includes(profile.role)) {
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
    const { page, perPage, offset } = parsePagination(searchParams);

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

    // Trainers can only see their own tasks
    if (profile.role === "trainer") {
      query = query.eq("assigned_to", user.id);
    }

    if (taskStatus) {
      query = query.eq("status", taskStatus);
    }

    if (priority) {
      query = query.eq("priority", priority);
    }

    if (assignedTo && profile.role === "admin") {
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
        { data: null, error: sanitizeDbError(error, "fetching tasks") },
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
    return NextResponse.json({ data: null, error: sanitizeError(err, "fetching tasks") }, { status: 500 });
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

    if (!["super_admin", "admin", "trainer", "commercial"].includes(profile.role)) {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const body = await request.json();

    const parsed = createTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { title, description, status, priority, due_date, reminder_at, assigned_to, prospect_id, client_id } = parsed.data;

    // Try service-role first (bypasses RLS), fallback to authenticated client
    let dbClient;
    try {
      dbClient = createServiceClient();
    } catch {
      dbClient = supabase;
    }
    const { data, error } = await dbClient
      .from("crm_tasks")
      .insert({
        entity_id: profile.entity_id,
        title,
        description: description ?? null,
        status,
        priority,
        due_date: due_date ?? null,
        reminder_at: reminder_at ?? null,
        assigned_to: profile.role === "trainer" ? user.id : (assigned_to ?? user.id),
        prospect_id: prospect_id ?? null,
        client_id: client_id ?? null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("[POST /api/crm/tasks] Insert error:", error);
      return NextResponse.json(
        { data: null, error: `Erreur création tâche: ${error.message || error.code || "unknown"}` },
        { status: 500 }
      );
    }

    logAudit({
      supabase,
      entityId: profile.entity_id,
      userId: user.id,
      action: "create",
      resourceType: "task",
      resourceId: data.id,
      details: { name: data.title },
    });

    // Log commercial action if linked to a prospect
    if (data.prospect_id) {
      logCommercialAction({
        supabase,
        entityId: profile.entity_id,
        authorId: user.id,
        actionType: "task_created",
        prospectId: data.prospect_id,
        subject: data.title,
      });
    }

    // Notify assignee if assigned to someone else
    if (data.assigned_to && data.assigned_to !== user.id) {
      try {
        const notifClient = createServiceClient();
        await notifClient.from("crm_notifications").insert({
          entity_id: profile.entity_id,
          user_id: data.assigned_to,
          type: "general",
          title: "Nouvelle tâche assignée",
          message: `"${data.title}" vous a été assignée`,
          link: "/admin/crm/tasks",
          resource_type: "task",
          resource_id: data.id,
        });
      } catch { /* silent */ }
    }

    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/crm/tasks] Catch error:", err);
    return NextResponse.json({ data: null, error: err instanceof Error ? err.message : "Une erreur interne est survenue" }, { status: 500 });
  }
}
