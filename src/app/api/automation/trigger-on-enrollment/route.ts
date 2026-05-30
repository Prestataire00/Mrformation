import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Story aut-d-1 — POST /api/automation/trigger-on-enrollment
 *
 * Ping fire-and-forget admin-authentifié appelé par le client après la
 * création d'une inscription apprenant. Proxy interne vers
 * /api/formations/automation-rules/run-cron mode TARGETED avec body
 * `{ trigger_type: "on_enrollment", session_id, learner_id }` + Bearer
 * CRON_SECRET (le secret reste côté serveur).
 *
 * Body input : { session_id: string, learner_id: string }
 *
 * Auth : admin/super_admin. La session doit appartenir à l'entité du
 * user (admin) ou à n'importe laquelle (super_admin) — vérif d'appartenance
 * via la session, pas une rule (les rules sont chargées côté run-cron).
 *
 * Côté run-cron, le param learner_id restreint les destinataires de type
 * "learner" à ce learner uniquement (cf. resolveRecipients onlyLearnerId).
 * Les rules avec recipient_type "trainers"/"companies" envoient au pool
 * habituel — c'est l'inscription qui les concerne, pas l'apprenant inscrit.
 *
 * NFR-AUT-SEC-5 : aucun effet de bord direct dans cette route — le moteur
 * run-cron est responsable de l'enqueue email (ou pas, si aucune rule).
 */

export async function POST(request: NextRequest) {
  const supabase = createClient();

  // Auth admin
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { data: null, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("entity_id, role")
    .eq("id", user.id)
    .single();
  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return NextResponse.json(
      { data: null, error: "Admin access required" },
      { status: 403 },
    );
  }

  // Parse body
  let session_id: string | null = null;
  let learner_id: string | null = null;
  try {
    const body = await request.json();
    session_id = body.session_id ?? null;
    learner_id = body.learner_id ?? null;
  } catch {
    return NextResponse.json(
      { data: null, error: "Invalid JSON body" },
      { status: 400 },
    );
  }
  if (!session_id || !learner_id) {
    return NextResponse.json(
      { data: null, error: "session_id and learner_id are required" },
      { status: 400 },
    );
  }

  // Défense en profondeur : la session doit appartenir à l'entité du user
  // (admin). super_admin bypass. Évite qu'un admin entité A déclenche un
  // ping pour une session entité B en forgeant la requête.
  if (profile.role === "admin") {
    const { data: session } = await supabase
      .from("sessions")
      .select("entity_id")
      .eq("id", session_id)
      .maybeSingle();
    if (!session) {
      return NextResponse.json(
        { data: null, error: "Session introuvable" },
        { status: 404 },
      );
    }
    if (session.entity_id !== profile.entity_id) {
      return NextResponse.json(
        { data: null, error: "Session hors de l'entité" },
        { status: 403 },
      );
    }
  }

  // Proxy vers run-cron mode TARGETED avec Bearer CRON_SECRET
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.URL ||
    "http://localhost:3000";
  try {
    const res = await fetch(
      `${baseUrl}/api/formations/automation-rules/run-cron`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.CRON_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trigger_type: "on_enrollment",
          session_id,
          learner_id,
        }),
      },
    );
    const data = await res.json();
    return NextResponse.json({ data, error: null }, { status: res.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Proxy error";
    return NextResponse.json(
      { data: null, error: message },
      { status: 500 },
    );
  }
}
