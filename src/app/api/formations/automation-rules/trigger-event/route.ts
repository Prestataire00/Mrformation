import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";

/**
 * POST /api/formations/automation-rules/trigger-event
 *
 * Client-side proxy to trigger automation rules.
 * Protected by user auth (not CRON_SECRET) so it can be called
 * from browser components like TabParcours.
 *
 * Body: { session_id: string, trigger_type?: string, rule_id?: string }
 * Either trigger_type or rule_id must be provided (not necessarily both).
 */
export async function POST(request: NextRequest) {
  const authResult = await requireRole(["admin", "super_admin", "trainer"]);
  if (authResult.error) return authResult.error;

  try {
    const { trigger_type, session_id, rule_id } = await request.json();

    if (!session_id || (!trigger_type && !rule_id)) {
      return NextResponse.json({ error: "session_id et (trigger_type ou rule_id) requis" }, { status: 400 });
    }

    // Isolation entité (défense en profondeur — la RLS plateforme est allow-all) :
    // un appelant non-super_admin ne peut déclencher que sur les sessions de sa propre entité.
    if (authResult.profile.role !== "super_admin") {
      const { data: sessionRow } = await authResult.supabase
        .from("sessions")
        .select("entity_id")
        .eq("id", session_id)
        .maybeSingle();
      if (!sessionRow) {
        return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
      }
      if (sessionRow.entity_id !== authResult.profile.entity_id) {
        return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
      }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.URL || "https://mrformationcrm.netlify.app";

    const res = await fetch(`${appUrl}/api/formations/automation-rules/run-cron`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.CRON_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(rule_id ? { rule_id, session_id } : { trigger_type, session_id }),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
