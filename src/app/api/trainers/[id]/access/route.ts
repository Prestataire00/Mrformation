import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/require-role";
import { logAudit } from "@/lib/audit-log";
import {
  ensureTrainerAccount,
  resetTrainerPassword,
  linkTrainerToProfile,
  unlinkTrainerProfile,
  type TrainerAccountRow,
} from "@/lib/services/trainer-account";

interface RouteContext {
  params: { id: string };
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role configuration");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Charge la fiche + garde cross-entité (super_admin bypass). Renvoie la fiche ou une réponse d'erreur. */
async function loadTrainerGuarded(
  admin: SupabaseClient,
  trainerId: string,
  auth: { profile: { role: string; entity_id: string | null } },
): Promise<{ trainer: TrainerAccountRow } | { error: NextResponse }> {
  const { data: trainer } = await admin
    .from("trainers")
    .select("id, entity_id, first_name, last_name, email, profile_id")
    .eq("id", trainerId)
    .single();
  if (!trainer) return { error: NextResponse.json({ error: "Formateur introuvable" }, { status: 404 }) };
  const isSuperAdmin = auth.profile.role === "super_admin";
  if (!isSuperAdmin && trainer.entity_id !== auth.profile.entity_id) {
    return { error: NextResponse.json({ error: "Accès refusé" }, { status: 403 }) };
  }
  return { trainer: trainer as TrainerAccountRow };
}

// POST : crée l'accès si la fiche n'a pas de compte, sinon réinitialise le mot de passe.
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  try {
    const admin = createAdminClient();
    const guard = await loadTrainerGuarded(admin, params.id, auth);
    if ("error" in guard) return guard.error;
    const { trainer } = guard;

    if (trainer.profile_id) {
      const res = await resetTrainerPassword(admin, { entityId: trainer.entity_id, trainerId: trainer.id });
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      logAudit({
        supabase: admin, entityId: trainer.entity_id, userId: auth.user.id,
        action: "update", resourceType: "trainers.access", resourceId: trainer.id, details: { verb: "reset" },
      });
      return NextResponse.json({ ok: true, action: "reset", email: res.email, password: res.password, synthetic_email_used: (res.email ?? "").endsWith(".local") });
    }

    const { data: entityRow } = await admin.from("entities").select("slug").eq("id", trainer.entity_id).single();
    const entitySlug = (entityRow?.slug as string | undefined) ?? "mr-formation";
    const res = await ensureTrainerAccount(admin, { trainer, entitySlug });
    if (res.status === "error") return NextResponse.json({ error: res.error }, { status: 400 });
    logAudit({
      supabase: admin, entityId: trainer.entity_id, userId: auth.user.id,
      action: "create", resourceType: "trainers.access", resourceId: trainer.id,
      details: { verb: "created", synthetic: res.syntheticEmailUsed },
    });
    return NextResponse.json({ ok: true, action: "created", email: res.email, password: res.password, synthetic_email_used: res.syntheticEmailUsed });
  } catch (err) {
    console.error("[trainers/[id]/access POST]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur interne" }, { status: 500 });
  }
}

// PATCH : relie la fiche à un compte orphelin existant.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  try {
    const body = await request.json().catch(() => ({}));
    const profileId: string | undefined = typeof body.profile_id === "string" ? body.profile_id : undefined;
    if (!profileId) return NextResponse.json({ error: "profile_id requis" }, { status: 400 });

    const admin = createAdminClient();
    const guard = await loadTrainerGuarded(admin, params.id, auth);
    if ("error" in guard) return guard.error;
    const { trainer } = guard;

    const res = await linkTrainerToProfile(admin, { entityId: trainer.entity_id, trainerId: trainer.id, profileId });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    logAudit({
      supabase: admin, entityId: trainer.entity_id, userId: auth.user.id,
      action: "update", resourceType: "trainers.access", resourceId: trainer.id, details: { verb: "linked", profileId },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[trainers/[id]/access PATCH]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur interne" }, { status: 500 });
  }
}

// DELETE : délie la fiche (le compte auth subsiste).
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  try {
    const admin = createAdminClient();
    const guard = await loadTrainerGuarded(admin, params.id, auth);
    if ("error" in guard) return guard.error;
    const { trainer } = guard;

    const res = await unlinkTrainerProfile(admin, { entityId: trainer.entity_id, trainerId: trainer.id });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    logAudit({
      supabase: admin, entityId: trainer.entity_id, userId: auth.user.id,
      action: "delete", resourceType: "trainers.access", resourceId: trainer.id, details: { verb: "unlinked" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[trainers/[id]/access DELETE]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur interne" }, { status: 500 });
  }
}
