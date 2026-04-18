import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@supabase/supabase-js";

type RouteContext = { params: { id: string } };

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase config");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireRole(["super_admin", "admin"]);
    if (auth.error) return auth.error;

    const sessionId = context.params.id;
    const { action_type } = await request.json();

    if (!action_type) {
      return NextResponse.json({ error: "action_type requis" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Load session
    const { data: session } = await supabase
      .from("sessions")
      .select("id, title, entity_id")
      .eq("id", sessionId)
      .single();

    if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });

    // Log the manual trigger
    await supabase.from("session_automation_logs").insert({
      session_id: sessionId,
      rule_name: action_type,
      trigger_type: "manual_bulk",
      recipient_count: 0,
      status: "success",
      is_manual: true,
      executed_by: auth.user.id,
      details: { action_type },
    });

    return NextResponse.json({ success: true, action_type, sent: 0 });
  } catch (err) {
    console.error("[automation-trigger]", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
