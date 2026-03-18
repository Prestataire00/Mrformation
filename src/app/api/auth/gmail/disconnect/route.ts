import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { decryptToken } from "@/lib/gmail/encryption";
import { getOAuth2Client } from "@/lib/gmail/client";

function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST() {
  const auth = await requireRole(["super_admin", "admin", "trainer"]);
  if (auth.error) return auth.error;

  const supabase = createServiceClient();

  // Find trainer for this profile
  const { data: trainer } = await supabase
    .from("trainers")
    .select("id")
    .eq("profile_id", auth.profile.id)
    .single();

  if (!trainer) {
    return NextResponse.json(
      { error: "Profil formateur introuvable" },
      { status: 404 }
    );
  }

  // Get the connection to revoke the token
  const { data: connection } = await supabase
    .from("gmail_connections")
    .select("encrypted_refresh_token, token_iv, token_auth_tag")
    .eq("trainer_id", trainer.id)
    .single();

  if (connection) {
    // Try to revoke the token with Google (best effort)
    try {
      const refreshToken = decryptToken(
        connection.encrypted_refresh_token,
        connection.token_iv,
        connection.token_auth_tag
      );
      const client = getOAuth2Client();
      await client.revokeToken(refreshToken);
    } catch (err) {
      console.warn("[gmail/disconnect] Token revocation failed:", err);
    }

    // Delete the connection
    await supabase
      .from("gmail_connections")
      .delete()
      .eq("trainer_id", trainer.id);
  }

  return NextResponse.json({ success: true });
}
