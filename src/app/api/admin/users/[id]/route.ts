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

  const validRoles = ["admin", "commercial", "trainer", "client", "learner"];
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
  const isSuperAdmin = callerProfile.role === "super_admin";

  // Fix P0 audit RLS 2026-06-05 (PR #201) + review adversariale :
  //   1. Pré-valider que le profile cible existe ET appartient bien à
  //      l'entité du caller (sauf super_admin qui cross-entity légitimement).
  //      Sans cette pré-validation, les unlink/delete renvoient un succès
  //      avec 0 rows affected — faux positif qui masque un cross-tenant
  //      attempt et empêche tout audit/alerte.
  //   2. Scope les unlink learners/trainers par entity_id pour empêcher un
  //      admin de l'entité A d'unlinker silencieusement des ressources de
  //      l'entité B juste en devinant un profile_id.
  //   3. Si la suppression auth.admin.deleteUser échoue, on retourne 500
  //      (ne plus juste console.error) car le profile est déjà supprimé →
  //      état incohérent à signaler.
  const { data: targetProfile, error: targetProfileErr } = await adminClient
    .from("profiles")
    .select("id, entity_id")
    .eq("id", userId)
    .maybeSingle();

  if (targetProfileErr) {
    return NextResponse.json(
      { error: sanitizeDbError(targetProfileErr, "load target profile") },
      { status: 500 },
    );
  }
  if (!targetProfile) {
    return NextResponse.json({ error: "Profil introuvable" }, { status: 404 });
  }
  if (
    !isSuperAdmin &&
    targetProfile.entity_id !== callerProfile.entity_id
  ) {
    return NextResponse.json(
      { error: "Profil rattaché à une autre entité (accès refusé)" },
      { status: 403 },
    );
  }
  const targetEntityId = targetProfile.entity_id;

  // Unlink from learners/trainers (set profile_id to null).
  // Scope par entity_id du caller pour empêcher l'unlink cross-tenant
  // (sauf super_admin qui peut cross-entity).
  let learnersUnlink = adminClient
    .from("learners")
    .update({ profile_id: null })
    .eq("profile_id", userId);
  if (!isSuperAdmin) {
    learnersUnlink = learnersUnlink.eq("entity_id", callerProfile.entity_id);
  }
  const { error: learnersUnlinkErr } = await learnersUnlink;
  if (learnersUnlinkErr) {
    return NextResponse.json(
      { error: sanitizeDbError(learnersUnlinkErr, "unlink learners") },
      { status: 500 },
    );
  }

  let trainersUnlink = adminClient
    .from("trainers")
    .update({ profile_id: null })
    .eq("profile_id", userId);
  if (!isSuperAdmin) {
    trainersUnlink = trainersUnlink.eq("entity_id", callerProfile.entity_id);
  }
  const { error: trainersUnlinkErr } = await trainersUnlink;
  if (trainersUnlinkErr) {
    return NextResponse.json(
      { error: sanitizeDbError(trainersUnlinkErr, "unlink trainers") },
      { status: 500 },
    );
  }

  // Delete the profile row. Pour super_admin, on n'applique pas le filtre
  // entity_id (un super_admin a entity_id NULL sur sa ligne profiles,
  // donc .eq("entity_id", NULL) matchait 0 rows et faisait échouer le
  // delete silencieusement — blocker review adversariale).
  let profileDelete = adminClient.from("profiles").delete().eq("id", userId);
  if (!isSuperAdmin) {
    profileDelete = profileDelete.eq("entity_id", callerProfile.entity_id);
  }
  const { error: profileError } = await profileDelete;

  if (profileError) {
    return NextResponse.json({ error: sanitizeDbError(profileError, "delete user profile") }, { status: 500 });
  }

  // Delete the auth user. Si l'auth deletion échoue, le profile est déjà
  // supprimé → état incohérent qu'il faut signaler explicitement.
  const { error: authError } = await adminClient.auth.admin.deleteUser(userId);
  if (authError) {
    console.error("Failed to delete auth user:", authError.message);
    return NextResponse.json(
      {
        error:
          "Profil supprimé mais utilisateur auth persiste — état incohérent à corriger manuellement",
        details: authError.message,
      },
      { status: 500 },
    );
  }

  logAudit({
    supabase,
    entityId: callerProfile.entity_id,
    userId: user.id,
    action: "delete",
    resourceType: "profiles",
    resourceId: userId,
    details: {
      target_entity_id: targetEntityId,
      was_super_admin_action: isSuperAdmin,
    },
  });

  return NextResponse.json({ success: true });
}
