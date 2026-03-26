import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = createClient();

  // Verify the caller is an admin
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const { userId, newPassword } = await request.json();

  if (!userId || !newPassword || newPassword.length < 6) {
    return NextResponse.json(
      { error: "Paramètres invalides. Le mot de passe doit contenir au moins 6 caractères." },
      { status: 400 }
    );
  }

  // Vérifier la hiérarchie : un admin ne peut pas changer le mdp d'un admin ou super_admin
  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (targetProfile) {
    const targetRole = targetProfile.role;
    if (profile.role === "admin" && (targetRole === "admin" || targetRole === "super_admin")) {
      return NextResponse.json(
        { error: "Seul un organisme (super_admin) peut modifier le mot de passe d'un administrateur." },
        { status: 403 }
      );
    }
  }

  // Use the service role client to update another user's password
  const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (error) {
    return NextResponse.json({ error: sanitizeDbError(error, "change user password") }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
