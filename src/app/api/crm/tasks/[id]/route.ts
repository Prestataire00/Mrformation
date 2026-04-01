import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  updateTaskSchema,
  uuidParamSchema,
} from "@/lib/validations/crm-tasks";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";

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
    const { user, profile } = auth as { user: any; profile: { entity_id: string; role: string } };

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

    // Verify task exists and belongs to entity
    let findQuery = dbClient
      .from("crm_tasks")
      .select("id, assigned_to")
      .eq("id", params.id)
      .eq("entity_id", profile.entity_id);

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

    // Trainers cannot reassign tasks to others
    const updateData = { ...parsed.data, updated_at: new Date().toISOString() };
    if (profile.role === "trainer") {
      delete updateData.assigned_to;
    }

    const { data, error } = await dbClient
      .from("crm_tasks")
      .update(updateData)
      .eq("id", params.id)
      .eq("entity_id", profile.entity_id)
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
      entityId: profile.entity_id,
      userId: user.id,
      action: "update",
      resourceType: "task",
      resourceId: params.id,
      details: { name: data?.title },
    });

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
    const { user, profile } = auth as { user: any; profile: { entity_id: string; role: string } };

    let dbClient;
    try { dbClient = createServiceClient(); } catch { dbClient = supabase; }

    // Verify task exists and belongs to entity
    let delFindQuery = dbClient
      .from("crm_tasks")
      .select("id")
      .eq("id", params.id)
      .eq("entity_id", profile.entity_id);

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

    const { error } = await dbClient
      .from("crm_tasks")
      .delete()
      .eq("id", params.id)
      .eq("entity_id", profile.entity_id);

    if (error) {
      return NextResponse.json(
        { data: null, error: sanitizeDbError(error, "deleting task") },
        { status: 500 }
      );
    }

    logAudit({
      supabase,
      entityId: profile.entity_id,
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
