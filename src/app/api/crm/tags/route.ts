import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { isCrmAuthorized } from "@/lib/auth/permissions";

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
      return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("entity_id, role, has_crm_access")
      .eq("id", user.id)
      .single();

    if (!profile?.entity_id) {
      return NextResponse.json({ data: null, error: "Profile not found" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("crm_tags")
      .select("*")
      .eq("entity_id", profile.entity_id)
      .order("name");

    if (error) {
      return NextResponse.json({ data: null, error: sanitizeDbError(error, "fetching tags") }, { status: 500 });
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    return NextResponse.json({ data: null, error: sanitizeError(err, "fetching tags") }, { status: 500 });
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
      return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("entity_id, role, has_crm_access")
      .eq("id", user.id)
      .single();

    // h-17 : helper centralisé (admin/super_admin/commercial + trainer avec has_crm_access)
    if (!profile?.entity_id || !isCrmAuthorized(profile)) {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const body = await request.json();
    const { name, color } = body;

    if (!name?.trim()) {
      return NextResponse.json({ data: null, error: "Le nom du tag est requis" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("crm_tags")
      .insert({
        entity_id: profile.entity_id,
        name: name.trim(),
        color: color || "#6B7280",
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ data: null, error: "Ce tag existe déjà" }, { status: 409 });
      }
      return NextResponse.json({ data: null, error: sanitizeDbError(error, "creating tag") }, { status: 500 });
    }

    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ data: null, error: sanitizeError(err, "creating tag") }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("entity_id, role, has_crm_access")
      .eq("id", user.id)
      .single();

    // h-17 : helper centralisé (admin/super_admin/commercial + trainer avec has_crm_access)
    if (!profile?.entity_id || !isCrmAuthorized(profile)) {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const tagId = searchParams.get("id");

    if (!tagId) {
      return NextResponse.json({ data: null, error: "ID du tag requis" }, { status: 400 });
    }

    let dbClient;
    try { dbClient = createServiceClient(); } catch { dbClient = supabase; }

    // Recherche par PK seule, puis autorisation par rôle : super_admin
    // agit cross-entité, les autres rôles restent cloisonnés.
    const { data: existing, error: findError } = await dbClient
      .from("crm_tags")
      .select("id, entity_id")
      .eq("id", tagId)
      .single();

    if (findError || !existing) {
      return NextResponse.json({ data: null, error: "Tag non trouvé" }, { status: 404 });
    }

    if (profile.role !== "super_admin" && existing.entity_id !== profile.entity_id) {
      return NextResponse.json({ data: null, error: "Accès non autorisé à ce tag" }, { status: 403 });
    }

    const { error } = await dbClient
      .from("crm_tags")
      .delete()
      .eq("id", tagId)
      .eq("entity_id", existing.entity_id);

    if (error) {
      return NextResponse.json({ data: null, error: sanitizeDbError(error, "deleting tag") }, { status: 500 });
    }

    return NextResponse.json({ data: { deleted: true }, error: null });
  } catch (err) {
    return NextResponse.json({ data: null, error: sanitizeError(err, "deleting tag") }, { status: 500 });
  }
}
