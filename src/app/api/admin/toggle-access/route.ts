import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/require-role";

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role configuration");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * POST /api/admin/toggle-access
 *
 * Suspend or reactivate a user's platform access.
 * Body: { profile_id: string, is_active: boolean }
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const { profile_id, is_active } = await request.json();

    if (!profile_id || typeof is_active !== "boolean") {
      return NextResponse.json({ error: "profile_id et is_active requis" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // 1. Update profile.is_active
    const { error: profileError } = await adminClient
      .from("profiles")
      .update({ is_active })
      .eq("id", profile_id)
      .eq("entity_id", auth.profile.entity_id);

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    // 2. Ban/unban auth user (prevents login at Supabase level)
    if (!is_active) {
      await adminClient.auth.admin.updateUserById(profile_id, {
        ban_duration: "876000h", // ~100 years = effectively permanent
      });
    } else {
      await adminClient.auth.admin.updateUserById(profile_id, {
        ban_duration: "none",
      });
    }

    return NextResponse.json({
      success: true,
      is_active,
      message: is_active ? "Accès réactivé" : "Accès suspendu",
    });
  } catch (err) {
    console.error("[toggle-access] Error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur interne" }, { status: 500 });
  }
}
