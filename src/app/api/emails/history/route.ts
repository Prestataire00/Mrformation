import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@supabase/supabase-js";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role configuration");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const recipientType = searchParams.get("recipient_type");
  const recipientId = searchParams.get("recipient_id");

  if (!recipientType || !recipientId) {
    return NextResponse.json({ error: "recipient_type et recipient_id requis" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("email_history")
    .select("id, recipient_email, subject, body, status, sent_at, template_id")
    .eq("entity_id", auth.profile.entity_id)
    .eq("recipient_type", recipientType)
    .eq("recipient_id", recipientId)
    .order("sent_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: "Erreur de chargement" }, { status: 500 });
  }

  return NextResponse.json({ history: data ?? [] });
}
