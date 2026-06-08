/**
 * POST /api/learners/batch-create-credentials
 *
 * Crée des accès plateforme en masse pour N apprenants (max 100).
 * Reproduit le flow de /api/admin/create-access en séquentiel.
 * Génère un PDF combiné credentials + upload Storage avec signed URL 24h.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/require-role";
import { logAudit } from "@/lib/audit-log";
import { buildSyntheticEmail, isSyntheticEmail } from "@/lib/utils/learner-email-synthetic";
import {
  generateLearnerCredentialsPDF,
  type LearnerCredentialsRow,
  type LearnerCredentialsEntitySlug,
} from "@/lib/services/learner-credentials-pdf";

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

interface BatchResultItem {
  learnerId: string;
  fullName: string;
  success: boolean;
  username: string | null;
  email: string | null;
  password: string | null;
  syntheticEmailUsed: boolean;
  error: string | null;
  skipped: boolean;
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const learnerIds: string[] = body.learner_ids;

    if (!Array.isArray(learnerIds) || learnerIds.length === 0) {
      return NextResponse.json({ error: "learner_ids requis (tableau non vide)" }, { status: 400 });
    }
    if (learnerIds.length > 100) {
      return NextResponse.json({ error: "Maximum 100 apprenants par requête" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const entityId = auth.profile.entity_id;
    const isSuperAdmin = auth.profile.role === "super_admin";

    // Fetch entity slug for synthetic emails
    const { data: entityRow } = await adminClient
      .from("entities")
      .select("slug, name")
      .eq("id", entityId)
      .single();
    const entitySlug = (entityRow?.slug ?? "mr-formation") as LearnerCredentialsEntitySlug;
    const entityName = entityRow?.name ?? "MR FORMATION";

    // Fetch all target learners at once
    let learnersQuery = adminClient
      .from("learners")
      .select("id, entity_id, first_name, last_name, email, username, profile_id, client_id")
      .in("id", learnerIds);
    if (!isSuperAdmin) {
      learnersQuery = learnersQuery.eq("entity_id", entityId);
    }
    const { data: learnersData, error: learnersErr } = await learnersQuery;

    if (learnersErr) {
      return NextResponse.json({ error: "Erreur lecture apprenants", details: learnersErr.message }, { status: 500 });
    }

    const learnersMap = new Map((learnersData ?? []).map((l) => [l.id, l]));
    const results: BatchResultItem[] = [];
    const pdfRows: LearnerCredentialsRow[] = [];
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://mrformationcrm.netlify.app";

    // Process sequentially (avoid auth race conditions)
    for (const learnerId of learnerIds) {
      const learner = learnersMap.get(learnerId);

      if (!learner) {
        results.push({
          learnerId, fullName: "?", success: false, username: null,
          email: null, password: null, syntheticEmailUsed: false,
          error: "Apprenant introuvable ou hors entité", skipped: false,
        });
        continue;
      }

      const fullName = `${learner.first_name} ${learner.last_name}`;

      // Skip if already has access
      if (learner.profile_id) {
        results.push({
          learnerId, fullName, success: true, username: learner.username,
          email: learner.email, password: null, syntheticEmailUsed: false,
          error: null, skipped: true,
        });
        continue;
      }

      const username = learner.username as string;
      const hasRealEmail = !!learner.email && !isSyntheticEmail(learner.email);
      const resolvedEmail = hasRealEmail
        ? (learner.email as string).trim().toLowerCase()
        : buildSyntheticEmail(username, entitySlug);
      const syntheticUsed = !hasRealEmail;

      try {
        const password = generatePassword();

        // Create auth user
        const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
          email: resolvedEmail,
          password,
          email_confirm: true,
          user_metadata: { first_name: learner.first_name, last_name: learner.last_name },
        });

        if (authError || !authUser?.user) {
          results.push({
            learnerId, fullName, success: false, username, email: resolvedEmail,
            password: null, syntheticEmailUsed: syntheticUsed,
            error: authError?.message ?? "Création auth échouée", skipped: false,
          });
          continue;
        }

        // Upsert profile
        await adminClient.from("profiles").upsert({
          id: authUser.user.id,
          email: resolvedEmail,
          first_name: learner.first_name,
          last_name: learner.last_name,
          role: "learner",
          entity_id: learner.entity_id,
          is_active: true,
        }, { onConflict: "id" });

        // Update learner
        const learnerUpdate: Record<string, unknown> = {
          profile_id: authUser.user.id,
          temp_password: password,
          password_must_change: true,
          synthetic_email_used: syntheticUsed,
        };
        if (syntheticUsed) {
          learnerUpdate.email = resolvedEmail;
        }

        await adminClient
          .from("learners")
          .update(learnerUpdate)
          .eq("id", learnerId)
          .eq("entity_id", learner.entity_id);

        results.push({
          learnerId, fullName, success: true, username, email: resolvedEmail,
          password, syntheticEmailUsed: syntheticUsed, error: null, skipped: false,
        });

        pdfRows.push({
          fullName,
          identifier: username,
          password,
          isSynthetic: syntheticUsed,
        });
      } catch (err) {
        results.push({
          learnerId, fullName, success: false, username, email: resolvedEmail,
          password: null, syntheticEmailUsed: syntheticUsed,
          error: err instanceof Error ? err.message : String(err), skipped: false,
        });
      }
    }

    // Generate PDF if any credentials were created
    let pdfSignedUrl: string | null = null;
    if (pdfRows.length > 0) {
      try {
        const loginUrl = `${baseUrl.replace(/\/$/, "")}/login`;
        const pdfBlob = await generateLearnerCredentialsPDF({
          entityName,
          entitySlug,
          sessionTitle: "Batch credentials",
          loginUrl,
          generatedAt: new Date(),
          rows: pdfRows,
        });

        const storagePath = `batch-credentials/${entityId}/${Date.now()}_batch_${pdfRows.length}.pdf`;
        const { error: uploadErr } = await adminClient.storage
          .from("learner-credentials")
          .upload(storagePath, pdfBlob, { contentType: "application/pdf", upsert: false });

        if (!uploadErr) {
          const { data: signed } = await adminClient.storage
            .from("learner-credentials")
            .createSignedUrl(storagePath, 86400); // 24h
          pdfSignedUrl = signed?.signedUrl ?? null;
        }
      } catch (pdfErr) {
        console.error("[batch-create-credentials] PDF generation/upload failed:", pdfErr);
      }
    }

    // Audit log
    const successCount = results.filter((r) => r.success && !r.skipped).length;
    const skippedCount = results.filter((r) => r.skipped).length;
    const failureCount = results.filter((r) => !r.success).length;

    logAudit({
      supabase: adminClient,
      entityId,
      userId: auth.user.id,
      action: "create",
      resourceType: "learners.batch_credentials",
      resourceId: `batch_${learnerIds.length}`,
      details: { successCount, skippedCount, failureCount, totalRequested: learnerIds.length },
    });

    return NextResponse.json({
      ok: true,
      results,
      summary: { successCount, skippedCount, failureCount, total: learnerIds.length },
      pdfSignedUrl,
    });
  } catch (err) {
    console.error("[batch-create-credentials] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur interne" },
      { status: 500 },
    );
  }
}
