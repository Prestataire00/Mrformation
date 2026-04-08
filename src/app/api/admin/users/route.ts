import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { createUserSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit-log";
import { NextRequest, NextResponse } from "next/server";

function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// GET: List all users (profiles + learners + trainers) for the current entity
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, entity_id")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin","super_admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
  }

  const entityId = profile.entity_id;

  // Fetch all 3 sources in parallel
  const [profilesRes, learnersRes, trainersRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, first_name, last_name, email, phone, role, avatar_url, created_at")
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false }),
    supabase
      .from("learners")
      .select("id, first_name, last_name, email, phone, created_at")
      .eq("entity_id", entityId)
      .order("last_name", { ascending: true }),
    supabase
      .from("trainers")
      .select("id, first_name, last_name, email, phone, created_at")
      .eq("entity_id", entityId)
      .order("last_name", { ascending: true }),
  ]);

  if (profilesRes.error) {
    return NextResponse.json({ error: sanitizeDbError(profilesRes.error, "fetch users") }, { status: 500 });
  }

  // Only return auth users (profiles) — learners/trainers without accounts
  // are managed from their own dedicated pages (Apprenants, Formateurs)
  const allUsers = (profilesRes.data ?? []).map((p) => ({
    ...p,
    source: "profile" as const,
    // Enrich with learner/trainer link info
    linked_learner: (learnersRes.data ?? []).find((l) => l.email && l.email.toLowerCase() === p.email?.toLowerCase()),
    linked_trainer: (trainersRes.data ?? []).find((t) => t.email && t.email.toLowerCase() === p.email?.toLowerCase()),
  }));

  return NextResponse.json({ data: allUsers });
}

// POST: Create a new user with Supabase Auth + profile
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, entity_id")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin","super_admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }
    const { email, password, first_name, last_name, role, phone } = parsed.data;

    const adminClient = createAdminClient();

    // Create the auth user
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) {
      console.error("[Create User Auth Error]:", createError.message, createError);
      const msg = createError.message || "";
      let userMessage = "Erreur lors de la création du compte";
      if (msg.includes("already been registered") || msg.includes("already exists")) {
        userMessage = "Un utilisateur avec cet email existe déjà";
      } else if (msg.includes("invalid") && msg.includes("email")) {
        userMessage = "Adresse email invalide";
      } else if (msg.includes("password")) {
        userMessage = "Mot de passe invalide : " + msg;
      } else {
        userMessage = "Erreur Supabase Auth : " + msg;
      }
      return NextResponse.json({ error: userMessage }, { status: 400 });
    }

    if (!newUser.user) {
      return NextResponse.json({ error: "Erreur lors de la création de l'utilisateur" }, { status: 500 });
    }

    // Create/update the profile
    const { error: profileError } = await adminClient
      .from("profiles")
      .upsert({
        id: newUser.user.id,
        email,
        first_name,
        last_name,
        role,
        phone: phone || null,
        entity_id: profile.entity_id,
      });

    if (profileError) {
      // Try to clean up the auth user if profile creation fails
      await adminClient.auth.admin.deleteUser(newUser.user.id);
      console.error("[Create User Profile Error]:", profileError.message, profileError);
      return NextResponse.json({ error: "Erreur lors de la création du profil : " + profileError.message }, { status: 500 });
    }

    logAudit({
      supabase,
      entityId: profile.entity_id,
      userId: user.id,
      action: "create",
      resourceType: "profiles",
      resourceId: newUser.user.id,
      details: { email, role, first_name, last_name },
    });

    return NextResponse.json({
      data: {
        id: newUser.user.id,
        email,
        first_name,
        last_name,
        role,
        phone: phone || null,
      },
    }, { status: 201 });
  } catch (err) {
    console.error("[Create User Unexpected Error]:", err);
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: "Erreur serveur : " + message }, { status: 500 });
  }
}
