import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET() {
  const auth = await requireRole(["trainer", "admin"]);
  if (auth.error) return auth.error;

  const supabase = createServiceClient();

  // Find trainer for this profile
  const { data: trainer } = await supabase
    .from("trainers")
    .select("id")
    .eq("profile_id", auth.profile.id)
    .single();

  if (!trainer) {
    return NextResponse.json({
      connected: false,
      gmail_address: null,
      connected_at: null,
    });
  }

  const { data: connection } = await supabase
    .from("gmail_connections")
    .select("gmail_address, is_active, connected_at, last_error")
    .eq("trainer_id", trainer.id)
    .single();

  if (!connection || !connection.is_active) {
    return NextResponse.json({
      connected: false,
      gmail_address: null,
      connected_at: null,
      last_error: connection?.last_error ?? null,
    });
  }

  return NextResponse.json({
    connected: true,
    gmail_address: connection.gmail_address,
    connected_at: connection.connected_at,
    last_error: null,
  });
}
