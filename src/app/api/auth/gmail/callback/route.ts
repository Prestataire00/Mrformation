import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { exchangeCodeForTokens } from "@/lib/gmail/client";
import { encryptToken } from "@/lib/gmail/encryption";

function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const error = searchParams.get("error");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // User denied access
  if (error) {
    return NextResponse.redirect(
      `${baseUrl}/trainer/profile?gmail=error&reason=denied`
    );
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(
      `${baseUrl}/trainer/profile?gmail=error&reason=missing_params`
    );
  }

  // Validate state against cookie
  const cookieState = request.cookies.get("gmail_oauth_state")?.value;
  if (!cookieState || cookieState !== stateParam) {
    return NextResponse.redirect(
      `${baseUrl}/trainer/profile?gmail=error&reason=invalid_state`
    );
  }

  // Verify HMAC
  let stateData: { data: string; hmac: string };
  try {
    stateData = JSON.parse(
      Buffer.from(stateParam, "base64url").toString("utf8")
    );
  } catch {
    return NextResponse.redirect(
      `${baseUrl}/trainer/profile?gmail=error&reason=invalid_state`
    );
  }

  const hmacKey = process.env.GMAIL_TOKEN_ENCRYPTION_KEY || "";
  const expectedHmac = crypto
    .createHmac("sha256", hmacKey)
    .update(stateData.data)
    .digest("hex");

  if (stateData.hmac !== expectedHmac) {
    return NextResponse.redirect(
      `${baseUrl}/trainer/profile?gmail=error&reason=invalid_state`
    );
  }

  // Check state TTL (10 minutes)
  const { profileId, trainerId, ts } = JSON.parse(stateData.data);
  if (Date.now() - ts > 10 * 60 * 1000) {
    return NextResponse.redirect(
      `${baseUrl}/trainer/profile?gmail=error&reason=expired`
    );
  }

  try {
    // Exchange code for tokens
    const { refreshToken, email } = await exchangeCodeForTokens(code);

    // Encrypt the refresh token
    const { encrypted, iv, authTag } = encryptToken(refreshToken);

    // Upsert into gmail_connections
    const supabase = createServiceClient();
    const { error: dbError } = await supabase.from("gmail_connections").upsert(
      {
        trainer_id: trainerId,
        profile_id: profileId,
        gmail_address: email,
        encrypted_refresh_token: encrypted,
        token_iv: iv,
        token_auth_tag: authTag,
        is_active: true,
        connected_at: new Date().toISOString(),
        last_error: null,
      },
      { onConflict: "trainer_id" }
    );

    if (dbError) {
      console.error("[gmail/callback] DB error:", dbError.message);
      return NextResponse.redirect(
        `${baseUrl}/trainer/profile?gmail=error&reason=db_error`
      );
    }

    // Clear the state cookie and redirect
    const response = NextResponse.redirect(
      `${baseUrl}/trainer/profile?gmail=connected`
    );
    response.cookies.delete("gmail_oauth_state");
    return response;
  } catch (err) {
    console.error("[gmail/callback] Token exchange error:", err);
    return NextResponse.redirect(
      `${baseUrl}/trainer/profile?gmail=error&reason=token_exchange`
    );
  }
}
