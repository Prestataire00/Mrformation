import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit-log";
import { pickLearnerRecord } from "@/lib/learner/pick-learner-record";

/**
 * Pédagogie V2 Epic 2.5 — POST /api/learner/change-password
 *
 * Appelée par la page `/learner/change-password` (forcée par le middleware
 * quand `user.user_metadata.password_must_change === true`).
 *
 * Steps :
 *  1. Vérifier session authentifiée.
 *  2. Mettre à jour le mot de passe Supabase Auth + flag user_metadata
 *     `password_must_change = false`.
 *  3. UPDATE learners SET password_must_change = false,
 *     first_login_at = COALESCE(first_login_at, now()).
 *  4. Audit log `learner.password_changed`.
 *
 * On utilise le client server-side (session apprenant) pour `updateUser`
 * (la fonction met à jour SON propre password). Le UPDATE sur learners
 * bypass RLS via service_role (l'apprenant n'a pas le droit UPDATE direct
 * sur sa ligne en self-service).
 */

const BodySchema = z.object({
  newPassword: z
    .string()
    .min(12)
    .regex(/[A-Z]/)
    .regex(/[0-9]/)
    .regex(/[^A-Za-z0-9]/),
});

export async function POST(request: NextRequest) {
  let parsed: { newPassword: string };
  try {
    const raw = (await request.json()) as unknown;
    const result = BodySchema.safeParse(raw);
    if (!result.success) {
      return NextResponse.json({ error: "weak_password" }, { status: 400 });
    }
    parsed = result.data;
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // 1. updateUser dans la session courante (auth.users + JWT refresh inclus).
  const { error: updErr } = await supabase.auth.updateUser({
    password: parsed.newPassword,
    data: {
      ...(user.user_metadata ?? {}),
      password_must_change: false,
    },
  });
  if (updErr) {
    return NextResponse.json(
      { error: "auth_update_failed", details: updErr.message },
      { status: 500 },
    );
  }

  // 2. Synchroniser learners.password_must_change + first_login_at via admin
  //    (bypass RLS — l'apprenant n'a pas de policy UPDATE sur sa ligne).
  const admin = createAdminClient();
  // Multi-fiche (compte partagé apprenant sans email) : .maybeSingle() cassait
  // à ≥ 2 fiches. pickLearnerRecord = mono-fiche inchangé.
  const { data: learnerRows } = await admin
    .from("learners")
    .select("id, entity_id, first_login_at")
    .eq("profile_id", user.id);
  const learner = pickLearnerRecord(learnerRows);

  if (learner) {
    await admin
      .from("learners")
      .update({
        password_must_change: false,
        first_login_at: learner.first_login_at ?? new Date().toISOString(),
        // RGPD : purge le temp_password en clair une fois que l'apprenant a
        // défini son propre mot de passe. La convention papier devient
        // obsolète à ce moment-là (comportement attendu).
        temp_password: null,
      })
      .eq("id", learner.id);

    // 3. Audit log (fire-and-forget).
    logAudit({
      supabase: admin,
      entityId: learner.entity_id,
      userId: user.id,
      action: "update",
      resourceType: "learner.password_changed",
      resourceId: learner.id,
      details: { first_login_at_set: !learner.first_login_at },
    });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
