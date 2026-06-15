import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient, type User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  updateTaskSchema,
  uuidParamSchema,
} from "@/lib/validations/crm-tasks";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";
import { logCommercialAction } from "@/lib/crm/log-commercial-action";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role configuration");
  return createSupabaseClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getAuthenticatedUser(supabase: ReturnType<typeof createClient>) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("entity_id, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.entity_id) {
    return { error: NextResponse.json({ data: null, error: "Profile or entity not found" }, { status: 403 }) };
  }

  if (!["super_admin", "admin", "trainer", "commercial"].includes(profile.role)) {
    return { error: NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 }) };
  }

  return { user, profile };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();

    const idParsed = uuidParamSchema.safeParse(params.id);
    if (!idParsed.success) {
      return NextResponse.json(
        { data: null, error: "Identifiant de tâche invalide" },
        { status: 400 }
      );
    }

    const auth = await getAuthenticatedUser(supabase);
    if ("error" in auth && auth.error) return auth.error;
    const { user, profile } = auth as { user: User; profile: { entity_id: string; role: string } };

    let dbClient;
    try { dbClient = createServiceClient(); } catch { dbClient = supabase; }

    const body = await request.json();
    const parsed = updateTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // Verify task exists. Recherche par PK seule : l'autorisation par
    // entité est faite ensuite (un super_admin agit cross-entité).
    let findQuery = dbClient
      .from("crm_tasks")
      .select("id, assigned_to, entity_id")
      .eq("id", params.id);

    // Trainers can only modify their own tasks
    if (profile.role === "trainer") {
      findQuery = findQuery.eq("assigned_to", user.id);
    }

    const { data: existing, error: findError } = await findQuery.single();

    if (findError || !existing) {
      return NextResponse.json(
        { data: null, error: "Tâche non trouvée" },
        { status: 404 }
      );
    }

    // Autorisation entité : super_admin cross-entité ; les autres rôles
    // restent cloisonnés à l'entité de leur profil.
    if (profile.role !== "super_admin" && existing.entity_id !== profile.entity_id) {
      return NextResponse.json(
        { data: null, error: "Accès non autorisé à cette tâche" },
        { status: 403 }
      );
    }
    // Entité effective = celle de la tâche (pas du profil, pour super_admin).
    const taskEntityId = existing.entity_id as string;

    // Trainers cannot reassign tasks to others
    const updateData: Record<string, unknown> = { ...parsed.data, updated_at: new Date().toISOString() };
    if (parsed.data.status === "completed") {
      updateData.completed_at = new Date().toISOString();
    }
    if (profile.role === "trainer") {
      delete updateData.assigned_to;
    }

    const { data, error } = await dbClient
      .from("crm_tasks")
      .update(updateData)
      .eq("id", params.id)
      .eq("entity_id", taskEntityId)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { data: null, error: sanitizeDbError(error, "updating task") },
        { status: 500 }
      );
    }

    logAudit({
      supabase,
      entityId: taskEntityId,
      userId: user.id,
      action: "update",
      resourceType: "task",
      resourceId: params.id,
      details: { name: data?.title },
    });

    // Notify new assignee if task reassigned
    if (data.assigned_to && data.assigned_to !== existing.assigned_to && data.assigned_to !== user.id) {
      try {
        const notifClient = createServiceClient();
        await notifClient.from("crm_notifications").insert({
          entity_id: taskEntityId,
          user_id: data.assigned_to,
          type: "general",
          title: "Tâche réassignée",
          message: `"${data.title}" vous a été assignée`,
          link: "/admin/crm/tasks",
          resource_type: "task",
          resource_id: data.id,
        });
      } catch (err) {
        // Notification non-bloquante : on log pour diagnostiquer un échec silencieux.
        console.error("[PATCH /api/crm/tasks/[id]] Notification reassignment failed:", err);
      }
    }

    // Log to prospect timeline when task completed
    if (parsed.data.status === "completed" && data.prospect_id) {
      logCommercialAction({
        supabase,
        entityId: taskEntityId,
        authorId: user.id,
        actionType: "task_created",
        prospectId: data.prospect_id,
        subject: `Tâche terminée: ${data.title}`,
        content: parsed.data.completion_notes || null,
      });
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    return NextResponse.json({ data: null, error: sanitizeError(err, "updating task") }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();

    const idParsed = uuidParamSchema.safeParse(params.id);
    if (!idParsed.success) {
      return NextResponse.json(
        { data: null, error: "Identifiant de tâche invalide" },
        { status: 400 }
      );
    }

    const auth = await getAuthenticatedUser(supabase);
    if ("error" in auth && auth.error) return auth.error;
    const { user, profile } = auth as { user: User; profile: { entity_id: string; role: string } };

    let dbClient;
    try { dbClient = createServiceClient(); } catch { dbClient = supabase; }

    // Verify task exists. Recherche par PK seule : l'autorisation par
    // entité est faite ensuite (un super_admin agit cross-entité).
    let delFindQuery = dbClient
      .from("crm_tasks")
      .select("id, entity_id")
      .eq("id", params.id);

    // Trainers can only delete their own tasks
    if (profile.role === "trainer") {
      delFindQuery = delFindQuery.eq("assigned_to", user.id);
    }

    const { data: existing, error: findError } = await delFindQuery.single();

    if (findError || !existing) {
      return NextResponse.json(
        { data: null, error: "Tâche non trouvée" },
        { status: 404 }
      );
    }

    // Autorisation entité : super_admin cross-entité ; les autres rôles
    // restent cloisonnés à l'entité de leur profil.
    if (profile.role !== "super_admin" && existing.entity_id !== profile.entity_id) {
      return NextResponse.json(
        { data: null, error: "Accès non autorisé à cette tâche" },
        { status: 403 }
      );
    }
    const taskEntityId = existing.entity_id as string;

    const { error } = await dbClient
      .from("crm_tasks")
      .delete()
      .eq("id", params.id)
      .eq("entity_id", taskEntityId);

    if (error) {
      return NextResponse.json(
        { data: null, error: sanitizeDbError(error, "deleting task") },
        { status: 500 }
      );
    }

    logAudit({
      supabase,
      entityId: taskEntityId,
      userId: user.id,
      action: "delete",
      resourceType: "task",
      resourceId: params.id,
    });

    return NextResponse.json({ data: null, error: null });
  } catch (err) {
    return NextResponse.json({ data: null, error: sanitizeError(err, "deleting task") }, { status: 500 });
  }
}
