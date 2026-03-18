import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireRole } from "@/lib/auth/require-role";
import { getAuthorizationUrl } from "@/lib/gmail/client";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin", "trainer"]);
  if (auth.error) return auth.error;

  // Find the trainer record for this profile
  const supabase = createServiceClient();
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

  // Create HMAC-signed state to prevent CSRF
  const stateData = JSON.stringify({
    profileId: auth.profile.id,
    trainerId: trainer.id,
    ts: Date.now(),
  });
  const hmacKey = process.env.GMAIL_TOKEN_ENCRYPTION_KEY || "";
  const hmac = crypto
    .createHmac("sha256", hmacKey)
    .update(stateData)
    .digest("hex");
  const state = Buffer.from(JSON.stringify({ data: stateData, hmac })).toString(
    "base64url"
  );

  // Store state in httpOnly cookie (10 min TTL)
  const authUrl = getAuthorizationUrl(state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("gmail_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  return response;
}
