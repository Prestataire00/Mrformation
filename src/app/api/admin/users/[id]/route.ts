import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";
import { NextRequest, NextResponse } from "next/server";

function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// PATCH: Update user info (first_name, last_name, email, phone, role)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role, entity_id")
    .eq("id", user.id)
    .single();

  if (!callerProfile || callerProfile.role !== "admin") {
    return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
  }

  const body = await request.json();
  const { first_name, last_name, email, phone, role, source } = body;

  if (!first_name || !last_name || !email) {
    return NextResponse.json(
      { error: "Prénom, nom et email sont obligatoires" },
      { status: 400 }
    );
  }

  const validRoles = ["admin", "trainer", "client", "learner"];
  if (role && !validRoles.includes(role)) {
    return NextResponse.json(
      { error: `Rôle invalide. Rôles acceptés : ${validRoles.join(", ")}` },
      { status: 400 }
    );
  }

  const userId = params.id;
  const adminClient = createAdminClient();

  if (source === "profile") {
    // Update profiles table
    const { error: profileError } = await adminClient
      .from("profiles")
      .update({ first_name, last_name, email, phone: phone || null, role })
      .eq("id", userId)
      .eq("entity_id", callerProfile.entity_id);

    if (profileError) {
      return NextResponse.json({ error: sanitizeDbError(profileError, "update user profile") }, { status: 500 });
    }

    // Also update the auth user's email if it changed
    const { error: authError } = await adminClient.auth.admin.updateUserById(userId, {
      email,
    });

    if (authError) {
      // Non-blocking: profile was updated, just log the auth error
      console.error("Failed to update auth email:", authError.message);
    }
  } else if (source === "learner") {
    const { error } = await adminClient
      .from("learners")
      .update({ first_name, last_name, email, phone: phone || null })
      .eq("id", userId)
      .eq("entity_id", callerProfile.entity_id);

    if (error) {
      return NextResponse.json({ error: sanitizeDbError(error, "update learner") }, { status: 500 });
    }
  } else if (source === "trainer") {
    const { error } = await adminClient
      .from("trainers")
      .update({ first_name, last_name, email, phone: phone || null })
      .eq("id", userId)
      .eq("entity_id", callerProfile.entity_id);

    if (error) {
      return NextResponse.json({ error: sanitizeDbError(error, "update trainer user") }, { status: 500 });
    }
  } else {
    return NextResponse.json({ error: "Source inconnue" }, { status: 400 });
  }

  logAudit({
    supabase,
    entityId: callerProfile.entity_id,
    userId: user.id,
    action: "update",
    resourceType: source === "profile" ? "profiles" : source === "learner" ? "learners" : "trainers",
    resourceId: userId,
    details: { email, role, source },
  });

  return NextResponse.json({ success: true });
}

// DELETE: Delete user
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role, entity_id")
    .eq("id", user.id)
    .single();

  if (!callerProfile || !["admin", "super_admin"].includes(callerProfile.role)) {
    return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
  }

  const userId = params.id;
  const adminClient = createAdminClient();

  // Unlink from learners/trainers first (set profile_id to null)
  await adminClient.from("learners").update({ profile_id: null }).eq("profile_id", userId);
  await adminClient.from("trainers").update({ profile_id: null }).eq("profile_id", userId);

  // Delete from profiles (auth account too)
  const { error: profileError } = await adminClient
    .from("profiles")
    .delete()
    .eq("id", userId)
    .eq("entity_id", callerProfile.entity_id);

  if (profileError) {
    return NextResponse.json({ error: sanitizeDbError(profileError, "delete user profile") }, { status: 500 });
  }

  // Delete the auth user
  const { error: authError } = await adminClient.auth.admin.deleteUser(userId);
  if (authError) {
    console.error("Failed to delete auth user:", authError.message);
  }

  logAudit({
    supabase,
    entityId: callerProfile.entity_id,
    userId: user.id,
    action: "delete",
    resourceType: "profiles",
    resourceId: userId,
  });

  return NextResponse.json({ success: true });
}
