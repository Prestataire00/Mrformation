import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { computeSessionEvents } from "@/lib/automation/compute-events";

interface RouteContext { params: { id: string } }

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  const result = await computeSessionEvents(auth.supabase, context.params.id, auth.profile.entity_id);

  if (!result) {
    return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
  }

  return NextResponse.json({
    session: result.session,
    events: result.events,
    now: new Date().toISOString(),
  });
}
