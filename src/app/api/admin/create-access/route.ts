import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/require-role";

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

    // 3. Link profile to entity record
    if (entity_type === "learner" && entity_type_id) {
      await adminClient.from("learners")
        .update({ profile_id: authUser.user.id })
        .eq("id", entity_type_id);
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
