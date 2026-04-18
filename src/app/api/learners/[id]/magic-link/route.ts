import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { randomBytes } from "crypto";

type RouteContext = { params: { id: string } };

export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const learnerId = context.params.id;
    const { session_id, purpose = "access", validity_days = 90 } = await req.json();

    const { data: learner } = await auth.supabase
      .from("learners")
      .select("id, first_name, last_name, email, entity_id")
      .eq("id", learnerId)
      .eq("entity_id", auth.profile.entity_id)
      .single();

    if (!learner) return NextResponse.json({ error: "Apprenant introuvable" }, { status: 404 });
    if (!learner.email) return NextResponse.json({ error: "Apprenant sans email" }, { status: 400 });

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + validity_days * 24 * 60 * 60 * 1000);

    const { error } = await auth.supabase.from("learner_access_tokens").insert({
      token,
      learner_id: learnerId,
      entity_id: auth.profile.entity_id,
      session_id: session_id || null,
      purpose,
      expires_at: expiresAt.toISOString(),
      created_by: auth.user.id,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://mrformationcrm.netlify.app").replace(/\/+$/, "");
    const magic_url = `${baseUrl}/access/${token}`;

    return NextResponse.json({
      token,
      magic_url,
      expires_at: expiresAt.toISOString(),
      learner: { id: learner.id, name: `${learner.first_name} ${learner.last_name}`, email: learner.email },
    });
  } catch (err) {
    console.error("[magic-link]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
