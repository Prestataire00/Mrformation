import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";

/**
 * POST /api/formations/automation-rules/trigger-event
 *
 * Client-side proxy to trigger automation rules.
 * Protected by user auth (not CRON_SECRET) so it can be called
 * from browser components like TabParcours.
 *
 * Body: { trigger_type: string, session_id: string }
 */
export async function POST(request: NextRequest) {
  const authResult = await requireRole(["admin", "super_admin", "trainer"]);
  if (authResult.error) return authResult.error;

  try {
    const { trigger_type, session_id } = await request.json();

    if (!trigger_type || !session_id) {
      return NextResponse.json({ error: "trigger_type et session_id requis" }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.URL || "https://mrformationcrm.netlify.app";

    const res = await fetch(`${appUrl}/api/formations/automation-rules/run-cron`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.CRON_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ trigger_type, session_id }),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
