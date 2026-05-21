/**
 * POST /api/auth/switch-entity
 *
 * Met à jour `profiles.entity_id` du user connecté vers une autre entité.
 *
 * Body : `{ entityId: UUID }`.
 *
 * **Pourquoi cet endpoint** : le rôle authenticated n'a pas le droit
 * UPDATE sur la colonne `entity_id` de `profiles` (cf
 * `supabase/fix_rls_security.sql` — sécurité contre auto-promotion).
 * Donc les pages côté client (/select-entity, EntityContext switcher) ne
 * peuvent pas faire le UPDATE directement. On utilise le service_role ici
 * pour bypass RLS, après vérification du rôle super_admin.
 *
 * Autorisé pour : `super_admin` et `commercial` — les deux rôles cross-entité
 * (le commercial gère le CRM des deux entités, MR FORMATION et C3V FORMATION).
 * Les autres rôles (admin, trainer, client, learner) restent rattachés à leur
 * entité et ne peuvent pas basculer (cloisonnement).
 */

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    // super_admin ET commercial sont cross-entité : ils peuvent basculer
    // entre MR FORMATION et C3V FORMATION. Les autres rôles restent rattachés.
    if (profile?.role !== "super_admin" && profile?.role !== "commercial") {
      return NextResponse.json(
        { error: "Vous n'êtes pas autorisé à changer d'entité" },
        { status: 403 },
      );
    }

    const body = (await request.json()) as { entityId?: string };
    if (!body.entityId) {
      return NextResponse.json({ error: "entityId requis" }, { status: 400 });
    }

    // Vérifie que l'entité existe
    const { data: entity } = await supabase
      .from("entities")
      .select("id, name, slug")
      .eq("id", body.entityId)
      .maybeSingle();
    if (!entity) {
      return NextResponse.json({ error: "Entité introuvable" }, { status: 404 });
    }

    // UPDATE via service_role (bypass RLS column GRANT)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Service role non configuré (env manquante)" },
        { status: 500 },
      );
    }
    const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: updateErr } = await admin
      .from("profiles")
      .update({ entity_id: body.entityId })
      .eq("id", user.id);

    if (updateErr) {
      return NextResponse.json(
        { error: `UPDATE profile : ${updateErr.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      entity: { id: entity.id, name: entity.name, slug: entity.slug },
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "switching entity") },
      { status: 500 },
    );
  }
}
