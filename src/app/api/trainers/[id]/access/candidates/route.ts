import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/require-role";
import { listOrphanTrainerAccounts } from "@/lib/services/trainer-account";

interface RouteContext {
  params: { id: string };
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role configuration");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// Liste les comptes formateur orphelins de l'entité de la fiche (pour le dialog de liaison).
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  try {
    const admin = createAdminClient();
    const { data: trainer } = await admin
      .from("trainers")
      .select("id, entity_id")
      .eq("id", params.id)
      .single();
    if (!trainer) return NextResponse.json({ error: "Formateur introuvable" }, { status: 404 });
    const isSuperAdmin = auth.profile.role === "super_admin";
    if (!isSuperAdmin && trainer.entity_id !== auth.profile.entity_id) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    const candidates = await listOrphanTrainerAccounts(admin, trainer.entity_id as string);
    return NextResponse.json({ ok: true, candidates });
  } catch (err) {
    console.error("[trainers/[id]/access/candidates GET]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur interne" }, { status: 500 });
  }
}
