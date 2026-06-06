import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/require-role";
import { logAudit } from "@/lib/audit-log";

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
  // Ensure at least 1 uppercase, 1 lowercase, 1 digit
  return pwd.charAt(0).toUpperCase() + pwd.slice(1, 8) + "a1";
}

/**
 * POST /api/admin/create-access
 *
 * Crée un accès plateforme pour un apprenant ou un client.
 * - Crée un compte auth Supabase
 * - Crée/met à jour le profil
 * - Lie le profil à l'entité (learner.profile_id ou client)
 * - Retourne les identifiants + URL de connexion pour QR code
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { email, first_name, last_name, role, entity_type, entity_type_id } = body;

    // entity_type: "learner" | "client"
    // entity_type_id: UUID of the learner or client record

    if (!email || !first_name || !last_name || !role) {
      return NextResponse.json({ error: "Email, prénom, nom et rôle sont requis" }, { status: 400 });
    }

    if (!["learner", "client"].includes(role)) {
      return NextResponse.json({ error: "Rôle invalide (learner ou client)" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const password = generatePassword();

    // 1. Create auth user
    const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { first_name, last_name },
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

    // 2. Create/upsert profile
    const { error: profileError } = await adminClient.from("profiles").upsert({
      id: authUser.user.id,
      email: email.trim().toLowerCase(),
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      role,
      entity_id: auth.profile.entity_id,
      is_active: true,
    }, { onConflict: "id" });

    if (profileError) {
      console.error("[create-access] Profile error:", profileError);
    }

    // 3. Link profile to entity record.
    //
    // Fix P0 audit RLS 2026-06-05 (PR #201) + review adversariale :
    //   1. Pré-validation entity_id du learner cible (anti cross-tenant)
    //   2. Defense-in-depth : second filtre .eq("entity_id", ...) sur l'UPDATE
    //      lui-même (au cas où le SELECT et l'UPDATE seraient séparés par une
    //      modif concurrente de learner.entity_id — race condition)
    //   3. Splitter 404 (learner introuvable) vs 500 (erreur SQL)
    //   4. Si linkErr après création auth user + profile, rollback applicatif
    //      pour ne pas laisser de compte orphelin
    //   5. logAudit explicite (auditabilité multi-tenant)
    //   6. entity_type === "client" non supporté pour l'instant — rejet 400
    if (entity_type === "client") {
      return NextResponse.json(
        {
          error:
            "entity_type 'client' non supporté actuellement — créer le client séparément puis utiliser entity_type 'learner'",
        },
        { status: 400 },
      );
    }

    if (entity_type === "learner" && entity_type_id) {
      const { data: targetLearner, error: learnerLoadErr } = await adminClient
        .from("learners")
        .select("id, entity_id")
        .eq("id", entity_type_id)
        .maybeSingle();

      if (learnerLoadErr) {
        return NextResponse.json(
          { error: "Erreur lecture apprenant", details: learnerLoadErr.message },
          { status: 500 },
        );
      }
      if (!targetLearner) {
        return NextResponse.json(
          { error: "Apprenant introuvable" },
          { status: 404 },
        );
      }
      if (!targetLearner.entity_id) {
        return NextResponse.json(
          { error: "Apprenant sans entity_id — état incohérent" },
          { status: 500 },
        );
      }

      const isSuperAdmin = auth.profile.role === "super_admin";
      if (!isSuperAdmin && targetLearner.entity_id !== auth.profile.entity_id) {
        return NextResponse.json(
          { error: "Apprenant rattaché à une autre entité (accès refusé)" },
          { status: 403 },
        );
      }

      // Defense-in-depth : second filtre entity_id sur l'UPDATE pour fermer
      // la fenêtre race (cas où learner.entity_id changerait entre le SELECT
      // ci-dessus et ce UPDATE — improbable mais gratuit).
      let linkUpdate = adminClient
        .from("learners")
        .update({ profile_id: authUser.user.id })
        .eq("id", entity_type_id);
      if (!isSuperAdmin) {
        linkUpdate = linkUpdate.eq("entity_id", auth.profile.entity_id);
      }
      const { error: linkErr } = await linkUpdate;

      if (linkErr) {
        console.error("[create-access] Link learner error:", linkErr);
        // Rollback applicatif : delete auth user + profile orphelins.
        // Si rollback échoue, on log mais on retourne quand même 500 pour
        // signaler l'état incohérent.
        const { error: rollbackAuthErr } =
          await adminClient.auth.admin.deleteUser(authUser.user.id);
        if (rollbackAuthErr) {
          console.error("[create-access] Rollback auth user failed:", rollbackAuthErr);
        }
        await adminClient.from("profiles").delete().eq("id", authUser.user.id);
        return NextResponse.json(
          {
            error:
              "Échec du lien apprenant — compte créé puis nettoyé (rollback applicatif)",
            details: linkErr.message,
          },
          { status: 500 },
        );
      }

      // Audit log explicite (auditabilité multi-tenant, CLAUDE.md règle #10).
      logAudit({
        supabase: adminClient,
        entityId: auth.profile.entity_id,
        userId: auth.user.id,
        action: "update",
        resourceType: "learners.profile_link",
        resourceId: entity_type_id,
        details: {
          profile_id: authUser.user.id,
          target_entity_id: targetLearner.entity_id,
          was_super_admin_action: isSuperAdmin,
        },
      });
    }

    // 4. Build login URL for QR code
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://mrformationcrm.netlify.app";
    const loginUrl = `${baseUrl}/login?email=${encodeURIComponent(email.trim().toLowerCase())}`;

    return NextResponse.json({
      success: true,
      user_id: authUser.user.id,
      email: email.trim().toLowerCase(),
      password,
      login_url: loginUrl,
      message: `Accès créé pour ${first_name} ${last_name}`,
    });
  } catch (err) {
    console.error("[create-access] Error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur interne" }, { status: 500 });
  }
}
