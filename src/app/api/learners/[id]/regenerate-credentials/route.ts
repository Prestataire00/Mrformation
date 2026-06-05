import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateTempPassword } from "@/lib/services/learner-account";
import { logAudit } from "@/lib/audit-log";

/**
 * Pédagogie V2 Epic 2.5 — POST /api/learners/[id]/regenerate-credentials
 *
 * Régénère un mot de passe temporaire pour un apprenant existant. Cas d'usage :
 *  - l'admin a perdu le PDF de credentials initial
 *  - l'apprenant ne sait plus son temp_password (et n'a pas changé)
 *  - sécurité (suspicion compromission)
 *
 * Renvoie le tempPassword en clair UNIQUEMENT dans cette réponse (jamais
 * persisté en DB). L'admin doit le copier / régénérer un PDF mono-row.
 *
 * Permissions : admin, super_admin (et seulement dans son entité — vérifié
 * par croisement learner.entity_id === profile.entity_id).
 */
export async function POST(
  _request: NextRequest,
  context: { params: { id: string } },
) {
  const auth = await requireRole(["admin", "super_admin"]);
  if (auth.error) return auth.error;

  const learnerId = context.params.id;
  if (!learnerId) {
    return NextResponse.json({ error: "missing_learner_id" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: learner, error: learnerErr } = await admin
    .from("learners")
    .select(
      "id, entity_id, first_name, last_name, email, username, profile_id, synthetic_email_used",
    )
    .eq("id", learnerId)
    .maybeSingle();

  if (learnerErr || !learner) {
    return NextResponse.json({ error: "learner_not_found" }, { status: 404 });
  }

  // Isolation entity (super_admin lecture cross-entité acceptée, mais
  // l'action d'écriture reste rattachée à l'entité de l'admin courant
  // pour traçabilité audit).
  if (
    auth.profile.role !== "super_admin" &&
    learner.entity_id !== auth.profile.entity_id
  ) {
    return NextResponse.json({ error: "forbidden_other_entity" }, { status: 403 });
  }

  if (!learner.profile_id) {
    return NextResponse.json(
      {
        error: "no_auth_account",
        details:
          "Cet apprenant n'a pas encore de compte Auth. Utilisez bulk-import-learners pour en créer un.",
      },
      { status: 409 },
    );
  }

  // 1. Génère nouveau temp_password.
  const newTempPassword = generateTempPassword();

  // 2. Update Supabase Auth (bypass via service_role).
  const { error: updErr } = await admin.auth.admin.updateUserById(
    learner.profile_id,
    {
      password: newTempPassword,
      user_metadata: {
        password_must_change: true,
      },
    },
  );
  if (updErr) {
    return NextResponse.json(
      { error: "auth_update_failed", details: updErr.message },
      { status: 500 },
    );
  }

  // 3. Reset learners.password_must_change=true (force change prochaine
  //    connexion) + invalide first_login_at (l'apprenant repasse par la
  //    procédure first-login).
  await admin
    .from("learners")
    .update({
      password_must_change: true,
      first_login_at: null,
    })
    .eq("id", learner.id);

  // 4. Audit log.
  logAudit({
    supabase: admin,
    entityId: learner.entity_id,
    userId: auth.user.id,
    action: "update",
    resourceType: "learner.credentials_regenerated",
    resourceId: learner.id,
    details: {
      regenerated_by: auth.user.id,
      regenerated_by_role: auth.profile.role,
    },
  });

  return NextResponse.json(
    {
      learnerId: learner.id,
      username: learner.username,
      email: learner.email,
      syntheticEmailUsed: learner.synthetic_email_used ?? false,
      tempPassword: newTempPassword,
      fullName: `${learner.first_name} ${learner.last_name}`.trim(),
    },
    { status: 200 },
  );
}
