import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
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

  if (!profile || profile.role !== "admin") {
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
    return NextResponse.json({ error: profilesRes.error.message }, { status: 500 });
  }

  // Start with profiles (auth users)
  const allUsers: Array<{
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    role: string;
    avatar_url: string | null;
    created_at: string;
    source: string;
  }> = (profilesRes.data ?? []).map((p) => ({
    ...p,
    source: "profile",
  }));

  // Track emails already present from profiles to avoid duplicates
  const existingEmails = new Set(allUsers.map((u) => u.email?.toLowerCase()));

  // Add learners not already in profiles
  for (const l of learnersRes.data ?? []) {
    if (l.email && existingEmails.has(l.email.toLowerCase())) continue;
    allUsers.push({
      id: l.id,
      first_name: l.first_name,
      last_name: l.last_name,
      email: l.email ?? "",
      phone: l.phone ?? null,
      role: "learner",
      avatar_url: null,
      created_at: l.created_at,
      source: "learner",
    });
    if (l.email) existingEmails.add(l.email.toLowerCase());
  }

  // Add trainers not already in profiles
  for (const t of trainersRes.data ?? []) {
    if (t.email && existingEmails.has(t.email.toLowerCase())) continue;
    allUsers.push({
      id: t.id,
      first_name: t.first_name,
      last_name: t.last_name,
      email: t.email ?? "",
      phone: t.phone ?? null,
      role: "trainer",
      avatar_url: null,
      created_at: t.created_at,
      source: "trainer",
    });
    if (t.email) existingEmails.add(t.email.toLowerCase());
  }

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

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
  }

  const body = await request.json();
  const { email, password, first_name, last_name, role, phone } = body;

  if (!email || !password || !first_name || !last_name || !role) {
    return NextResponse.json(
      { error: "Tous les champs obligatoires doivent être remplis (email, mot de passe, prénom, nom, rôle)" },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "Le mot de passe doit contenir au moins 6 caractères" },
      { status: 400 }
    );
  }

  const validRoles = ["admin", "trainer", "client", "learner"];
  if (!validRoles.includes(role)) {
    return NextResponse.json(
      { error: `Rôle invalide. Rôles acceptés : ${validRoles.join(", ")}` },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();

  // Create the auth user
  const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 500 });
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
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

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
}
