/**
 * POST /api/trainers/batch-create-credentials
 *
 * Crée des accès plateforme en masse pour des formateurs.
 * Calque le flow apprenant (/api/learners/batch-create-credentials) mais pour le rôle `trainer`.
 *
 * Corps :
 *   - { trainer_ids: string[] }                  → cible explicite (max 100)
 *   - {} ou { scope: "active_without_access" }   → tous les formateurs de l'entité reliés à
 *                                                   ≥1 session (formation_trainers) et sans compte.
 *
 * Spécificités formateur (vs apprenant) :
 *   - login par email (pas de `username`). Formateur sans email réel (ou email en doublon) →
 *     email synthétique non-routable `<slug>.<id8>@trainer.<entity_slug>.local`.
 *   - `trainers` n'a pas de colonne temp_password : le mot de passe est renvoyé dans la réponse
 *     (affiché une fois pour distribution), pas persisté.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/require-role";
import { logAudit } from "@/lib/audit-log";

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

function slugify(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "formateur";
}

function buildTrainerSyntheticEmail(trainer: { id: string; first_name?: string | null; last_name?: string | null }, entitySlug: string): string {
  const name = slugify(`${trainer.last_name ?? ""}-${trainer.first_name ?? ""}`);
  return `${name}.${trainer.id.slice(0, 8)}@trainer.${entitySlug}.local`;
}

interface TrainerLite {
  id: string;
  entity_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  profile_id: string | null;
}

interface BatchResultItem {
  trainerId: string;
  fullName: string;
  success: boolean;
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
    const body = await request.json().catch(() => ({}));
    const explicitIds: string[] | undefined = Array.isArray(body.trainer_ids) ? body.trainer_ids : undefined;

    if (explicitIds && explicitIds.length > 100) {
      return NextResponse.json({ error: "Maximum 100 formateurs par requête" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const entityId = auth.profile.entity_id;
    const isSuperAdmin = auth.profile.role === "super_admin";

    // Slug entité (emails synthétiques)
    const { data: entityRow } = await adminClient
      .from("entities")
      .select("slug")
      .eq("id", entityId)
      .single();
    const entitySlug = entityRow?.slug ?? "mr-formation";

    // ── Résolution des cibles ────────────────────────────────────────────
    let targets: TrainerLite[] = [];
    if (explicitIds && explicitIds.length > 0) {
      let q = adminClient
        .from("trainers")
        .select("id, entity_id, first_name, last_name, email, profile_id")
        .in("id", explicitIds);
      if (!isSuperAdmin) q = q.eq("entity_id", entityId);
      const { data, error } = await q;
      if (error) {
        return NextResponse.json({ error: "Erreur lecture formateurs", details: error.message }, { status: 500 });
      }
      targets = (data ?? []) as TrainerLite[];
    } else {
      // scope par défaut : formateurs de l'entité, sans compte, reliés à ≥1 session
      const { data: ftRows } = await adminClient
        .from("formation_trainers")
        .select("trainer_id");
      const activeIds = Array.from(new Set((ftRows ?? []).map((r) => r.trainer_id))).filter(Boolean);
      if (activeIds.length === 0) {
        return NextResponse.json({ ok: true, results: [], summary: { successCount: 0, skippedCount: 0, failureCount: 0, total: 0 } });
      }
      const { data, error } = await adminClient
        .from("trainers")
        .select("id, entity_id, first_name, last_name, email, profile_id")
        .eq("entity_id", entityId)
        .is("profile_id", null)
        .in("id", activeIds);
      if (error) {
        return NextResponse.json({ error: "Erreur lecture formateurs", details: error.message }, { status: 500 });
      }
      targets = (data ?? []) as TrainerLite[];
    }

    const results: BatchResultItem[] = [];
    const usedEmails = new Set<string>();

    for (const trainer of targets) {
      const fullName = `${trainer.first_name ?? ""} ${trainer.last_name ?? ""}`.trim() || "Formateur";

      if (trainer.profile_id) {
        results.push({
          trainerId: trainer.id, fullName, success: true, email: trainer.email,
          password: null, syntheticEmailUsed: false, error: null, skipped: true,
        });
        continue;
      }

      const realEmail = (trainer.email ?? "").trim().toLowerCase();
      const hasUsableEmail = !!realEmail && realEmail.includes("@") && !realEmail.endsWith(".local") && !usedEmails.has(realEmail);
      let resolvedEmail = hasUsableEmail ? realEmail : buildTrainerSyntheticEmail(trainer, entitySlug);
      let syntheticUsed = !hasUsableEmail;

      try {
        const password = generatePassword();

        let { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
          email: resolvedEmail,
          password,
          email_confirm: true,
          user_metadata: { first_name: trainer.first_name, last_name: trainer.last_name },
        });

        // Email déjà pris dans Auth → repli sur synthétique (une fois)
        if (authError && !syntheticUsed) {
          resolvedEmail = buildTrainerSyntheticEmail(trainer, entitySlug);
          syntheticUsed = true;
          ({ data: authUser, error: authError } = await adminClient.auth.admin.createUser({
            email: resolvedEmail,
            password,
            email_confirm: true,
            user_metadata: { first_name: trainer.first_name, last_name: trainer.last_name },
          }));
        }

        if (authError || !authUser?.user) {
          results.push({
            trainerId: trainer.id, fullName, success: false, email: resolvedEmail,
            password: null, syntheticEmailUsed: syntheticUsed,
            error: authError?.message ?? "Création auth échouée", skipped: false,
          });
          continue;
        }

        usedEmails.add(resolvedEmail);

        await adminClient.from("profiles").upsert({
          id: authUser.user.id,
          email: resolvedEmail,
          first_name: trainer.first_name,
          last_name: trainer.last_name,
          role: "trainer",
          entity_id: trainer.entity_id,
          is_active: true,
        }, { onConflict: "id" });

        // Lier le compte + enregistrer l'email de connexion (réel ou synthétique)
        await adminClient
          .from("trainers")
          .update({ profile_id: authUser.user.id, email: resolvedEmail })
          .eq("id", trainer.id)
          .eq("entity_id", trainer.entity_id);

        results.push({
          trainerId: trainer.id, fullName, success: true, email: resolvedEmail,
          password, syntheticEmailUsed: syntheticUsed, error: null, skipped: false,
        });
      } catch (err) {
        results.push({
          trainerId: trainer.id, fullName, success: false, email: resolvedEmail,
          password: null, syntheticEmailUsed: syntheticUsed,
          error: err instanceof Error ? err.message : String(err), skipped: false,
        });
      }
    }

    const successCount = results.filter((r) => r.success && !r.skipped).length;
    const skippedCount = results.filter((r) => r.skipped).length;
    const failureCount = results.filter((r) => !r.success).length;

    logAudit({
      supabase: adminClient,
      entityId,
      userId: auth.user.id,
      action: "create",
      resourceType: "trainers.batch_credentials",
      resourceId: `batch_${targets.length}`,
      details: { successCount, skippedCount, failureCount, totalRequested: targets.length },
    });

    return NextResponse.json({
      ok: true,
      results,
      summary: { successCount, skippedCount, failureCount, total: targets.length },
    });
  } catch (err) {
    console.error("[trainers/batch-create-credentials] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur interne" },
      { status: 500 },
    );
  }
}
