import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/require-role";
import { logAudit } from "@/lib/audit-log";
import { buildSyntheticEmail, isSyntheticEmail } from "@/lib/utils/learner-email-synthetic";

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role configuration");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pwd = "";
  for (let i = 0; i < 10; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  return pwd.charAt(0).toUpperCase() + pwd.slice(1, 8) + "a1";
}

/**
 * POST /api/admin/create-access
 *
 * Crée un accès plateforme pour un apprenant.
 * P0 refactor : email devient optionnel pour les apprenants sans email
 * (736 apprenants MR FORMATION). Si pas d'email, utilise synthetic_email
 * via buildSyntheticEmail(username, entity.slug).
 *
 * Retourne : { username, email, password, login_url, synthetic_email_used }
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { role, entity_type, entity_type_id } = body;

    if (!role || !["learner", "client"].includes(role)) {
      return NextResponse.json({ error: "Rôle invalide (learner ou client)" }, { status: 400 });
    }

    if (entity_type === "client") {
      return NextResponse.json(
        { error: "entity_type 'client' non supporté — utiliser entity_type 'learner'" },
        { status: 400 },
      );
    }

    if (entity_type !== "learner" || !entity_type_id) {
      return NextResponse.json({ error: "entity_type 'learner' et entity_type_id requis" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // 1. Fetch learner + entity info
    const { data: learnerRow, error: learnerLoadErr } = await adminClient
      .from("learners")
      .select("id, entity_id, first_name, last_name, email, username, profile_id")
      .eq("id", entity_type_id)
      .maybeSingle();

    if (learnerLoadErr) {
      return NextResponse.json({ error: "Erreur lecture apprenant", details: learnerLoadErr.message }, { status: 500 });
    }
    if (!learnerRow) {
      return NextResponse.json({ error: "Apprenant introuvable" }, { status: 404 });
    }
    if (!learnerRow.entity_id) {
      return NextResponse.json({ error: "Apprenant sans entity_id — état incohérent" }, { status: 500 });
    }

    // Cross-tenant check
    const isSuperAdmin = auth.profile.role === "super_admin";
    if (!isSuperAdmin && learnerRow.entity_id !== auth.profile.entity_id) {
      return NextResponse.json({ error: "Apprenant rattaché à une autre entité (accès refusé)" }, { status: 403 });
    }

    // Already has access?
    if (learnerRow.profile_id) {
      return NextResponse.json({ error: "Compte déjà existant. Utilise 'Régénérer credentials' pour reset." }, { status: 409 });
    }

    // Resolve email — real or synthetic
    const { data: entityRow } = await adminClient
      .from("entities")
      .select("slug")
      .eq("id", learnerRow.entity_id)
      .single();

    const entitySlug = entityRow?.slug ?? "mr-formation";
    const username = learnerRow.username as string;
    const hasRealEmail = !!learnerRow.email && !isSyntheticEmail(learnerRow.email);
    const resolvedEmail = hasRealEmail
      ? (learnerRow.email as string).trim().toLowerCase()
      : buildSyntheticEmail(username, entitySlug);
    const syntheticEmailUsed = !hasRealEmail;

    // 2. Create auth user
    const password = generatePassword();
    const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
      email: resolvedEmail,
      password,
      email_confirm: true,
      user_metadata: { first_name: learnerRow.first_name, last_name: learnerRow.last_name },
    });

    if (authError) {
      if (authError.message?.includes("already been registered")) {
        return NextResponse.json({ error: "Un compte existe déjà avec cet email" }, { status: 409 });
      }
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    if (!authUser?.user) {
      return NextResponse.json({ error: "Erreur lors de la création du compte" }, { status: 500 });
    }

    // 3. Create/upsert profile
    const { error: profileError } = await adminClient.from("profiles").upsert({
      id: authUser.user.id,
      email: resolvedEmail,
      first_name: learnerRow.first_name,
      last_name: learnerRow.last_name,
      role: "learner",
      entity_id: learnerRow.entity_id,
      is_active: true,
    }, { onConflict: "id" });

    if (profileError) {
      console.error("[create-access] Profile error:", profileError);
    }

    // 4. Link profile to learner + persist temp_password + update email if synthetic
    const learnerUpdate: Record<string, unknown> = {
      profile_id: authUser.user.id,
      temp_password: password,
      password_must_change: true,
      synthetic_email_used: syntheticEmailUsed,
    };
    if (syntheticEmailUsed) {
      learnerUpdate.email = resolvedEmail;
    }

    let linkUpdate = adminClient
      .from("learners")
      .update(learnerUpdate)
      .eq("id", entity_type_id);
    if (!isSuperAdmin) {
      linkUpdate = linkUpdate.eq("entity_id", auth.profile.entity_id);
    }
    const { error: linkErr } = await linkUpdate;

    if (linkErr) {
      console.error("[create-access] Link learner error:", linkErr);
      const { error: rollbackAuthErr } = await adminClient.auth.admin.deleteUser(authUser.user.id);
      if (rollbackAuthErr) {
        console.error("[create-access] Rollback auth user failed:", rollbackAuthErr);
      }
      await adminClient.from("profiles").delete().eq("id", authUser.user.id);
      return NextResponse.json(
        { error: "Échec du lien apprenant — compte nettoyé (rollback applicatif)", details: linkErr.message },
        { status: 500 },
      );
    }

    // 5. Audit log
    logAudit({
      supabase: adminClient,
      entityId: auth.profile.entity_id,
      userId: auth.user.id,
      action: "update",
      resourceType: "learners.profile_link",
      resourceId: entity_type_id,
      details: {
        profile_id: authUser.user.id,
        target_entity_id: learnerRow.entity_id,
        was_super_admin_action: isSuperAdmin,
        synthetic_email_used: syntheticEmailUsed,
      },
    });

    // 6. Build login URL (prefill username for synthetic users, email for real)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://mrformationcrm.netlify.app";
    const loginParam = syntheticEmailUsed
      ? `username=${encodeURIComponent(username)}`
      : `email=${encodeURIComponent(resolvedEmail)}`;
    const loginUrl = `${baseUrl}/login?${loginParam}`;

    return NextResponse.json({
      success: true,
      user_id: authUser.user.id,
      username,
      email: resolvedEmail,
      password,
      login_url: loginUrl,
      synthetic_email_used: syntheticEmailUsed,
      message: `Accès créé pour ${learnerRow.first_name} ${learnerRow.last_name}`,
    });
  } catch (err) {
    console.error("[create-access] Error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur interne" }, { status: 500 });
  }
}
