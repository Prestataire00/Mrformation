/**
 * POST /api/sessions/[id]/ensure-learner-access
 *
 * Auto-crée les accès plateforme pour les apprenants d'une session qui n'en
 * ont pas encore (profile_id IS NULL). Appelé par TabConventionDocs avant
 * génération/envoi de convention pour garantir que les credentials sont
 * disponibles dans le PDF.
 *
 * Body optionnel : { client_id?: UUID } — filtre les apprenants d'un client spécifique.
 * Si omis, traite TOUS les apprenants de la session sans accès.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/require-role";
import { logAudit } from "@/lib/audit-log";
import { buildSyntheticEmail, isSyntheticEmail } from "@/lib/utils/learner-email-synthetic";

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role configuration");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pwd = "";
  for (let i = 0; i < 10; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  return pwd.charAt(0).toUpperCase() + pwd.slice(1, 8) + "a1";
}

interface EnsureResult {
  learnerId: string;
  username: string | null;
  status: "created" | "skipped" | "failed";
  error?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const sessionId = params.id;
    const body = await request.json().catch(() => ({}));
    const clientIdFilter: string | undefined = body.client_id;

    const adminClient = createAdminClient();
    const entityId = auth.profile.entity_id;
    const isSuperAdmin = auth.profile.role === "super_admin";

    // Fetch session with enrollments + learner data
    let sessionQuery = adminClient
      .from("sessions")
      .select("id, entity_id")
      .eq("id", sessionId);
    if (!isSuperAdmin) {
      sessionQuery = sessionQuery.eq("entity_id", entityId);
    }
    const { data: session, error: sessionErr } = await sessionQuery.single();

    if (sessionErr || !session) {
      return NextResponse.json({ error: "Session introuvable ou non autorisée" }, { status: 404 });
    }

    // Fetch enrollments for this session with learner info
    let enrollQuery = adminClient
      .from("enrollments")
      .select("learner_id, client_id, learner:learners!inner(id, email, profile_id, first_name, last_name, username, entity_id)")
      .eq("session_id", sessionId)
      .neq("status", "cancelled");

    if (clientIdFilter) {
      enrollQuery = enrollQuery.eq("client_id", clientIdFilter);
    }

    const { data: enrollments, error: enrollErr } = await enrollQuery;
    if (enrollErr) {
      return NextResponse.json({ error: "Erreur lecture inscriptions", details: enrollErr.message }, { status: 500 });
    }

    // Fetch entity slug for synthetic emails
    const { data: entityRow } = await adminClient
      .from("entities")
      .select("slug")
      .eq("id", session.entity_id)
      .single();
    const entitySlug = entityRow?.slug ?? "mr-formation";

    // Filter learners without access (profile_id IS NULL)
    type LearnerRow = { id: string; email: string | null; profile_id: string | null; first_name: string; last_name: string; username: string; entity_id: string };
    const learnersToActivate: LearnerRow[] = [];
    const seen = new Set<string>();

    for (const enroll of enrollments ?? []) {
      const learner = enroll.learner as unknown as LearnerRow | null;
      if (!learner || learner.profile_id || seen.has(learner.id)) continue;
      seen.add(learner.id);
      learnersToActivate.push(learner);
    }

    if (learnersToActivate.length === 0) {
      return NextResponse.json({ created: 0, skipped_already_active: (enrollments ?? []).length, failed: 0, results: [] });
    }

    const results: EnsureResult[] = [];

    // Process sequentially
    for (const learner of learnersToActivate) {
      const username = learner.username;
      const hasRealEmail = !!learner.email && !isSyntheticEmail(learner.email);
      const resolvedEmail = hasRealEmail
        ? learner.email!.trim().toLowerCase()
        : buildSyntheticEmail(username, entitySlug);
      const syntheticUsed = !hasRealEmail;

      try {
        const password = generatePassword();

        const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
          email: resolvedEmail,
          password,
          email_confirm: true,
          user_metadata: { first_name: learner.first_name, last_name: learner.last_name },
        });

        if (authError) {
          // If user already exists (race), try to find and link
          if (authError.message?.includes("already been registered")) {
            const { data: existingUsers } = await adminClient.auth.admin.listUsers();
            const existing = existingUsers?.users?.find((u) => u.email === resolvedEmail);
            if (existing) {
              await adminClient.from("profiles").upsert({
                id: existing.id, email: resolvedEmail,
                first_name: learner.first_name, last_name: learner.last_name,
                role: "learner", entity_id: learner.entity_id, is_active: true,
              }, { onConflict: "id" });
              await adminClient.from("learners").update({
                profile_id: existing.id, synthetic_email_used: syntheticUsed,
                ...(syntheticUsed ? { email: resolvedEmail } : {}),
              }).eq("id", learner.id);
              results.push({ learnerId: learner.id, username, status: "created" });
              continue;
            }
          }
          results.push({ learnerId: learner.id, username, status: "failed", error: authError.message });
          continue;
        }

        if (!authUser?.user) {
          results.push({ learnerId: learner.id, username, status: "failed", error: "Auth user null" });
          continue;
        }

        await adminClient.from("profiles").upsert({
          id: authUser.user.id, email: resolvedEmail,
          first_name: learner.first_name, last_name: learner.last_name,
          role: "learner", entity_id: learner.entity_id, is_active: true,
        }, { onConflict: "id" });

        const updatePayload: Record<string, unknown> = {
          profile_id: authUser.user.id,
          temp_password: password,
          password_must_change: true,
          synthetic_email_used: syntheticUsed,
        };
        if (syntheticUsed) updatePayload.email = resolvedEmail;

        await adminClient.from("learners").update(updatePayload).eq("id", learner.id);

        results.push({ learnerId: learner.id, username, status: "created" });
      } catch (err) {
        results.push({
          learnerId: learner.id, username, status: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const created = results.filter((r) => r.status === "created").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const skipped = (enrollments ?? []).length - learnersToActivate.length;

    logAudit({
      supabase: adminClient,
      entityId: session.entity_id,
      userId: auth.user.id,
      action: "create",
      resourceType: "learners.ensure_access",
      resourceId: sessionId,
      details: { created, failed, skipped, clientIdFilter: clientIdFilter ?? null },
    });

    return NextResponse.json({ created, skipped_already_active: skipped, failed, results });
  } catch (err) {
    console.error("[ensure-learner-access] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur interne" },
      { status: 500 },
    );
  }
}
