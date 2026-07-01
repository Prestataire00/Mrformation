import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isTrainerAssignedToSession } from "@/lib/auth/trainer-session-access";
import { pickDerouleFields } from "@/lib/services/deroule";

type Ctx = { params: { id: string } };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user)
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    // Rôle
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    const role = profile?.role as string | undefined;
    if (!role || !["super_admin", "admin", "trainer"].includes(role)) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    // Récupère le créneau + sa session
    const { data: slot } = await supabase
      .from("formation_time_slots")
      .select("id, session_id")
      .eq("id", params.id)
      .maybeSingle();
    if (!slot) return NextResponse.json({ error: "Créneau introuvable" }, { status: 404 });

    // Garde d'assignation côté serveur — pour trainer ; admins passent directement.
    if (role === "trainer") {
      const assigned = await isTrainerAssignedToSession(
        supabase,
        user.id,
        (slot as { id: string; session_id: string }).session_id,
      );
      if (!assigned)
        return NextResponse.json(
          { error: "Vous n'êtes pas assigné à cette formation." },
          { status: 403 },
        );
    }

    // Whitelist stricte : seuls les 4 champs de déroulé (jamais horaires/couleur/titre).
    const fields = pickDerouleFields((await request.json()) as Record<string, unknown>);

    const { data, error } = await supabase
      .from("formation_time_slots")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", params.id)
      .select("id, module_title, module_objectives, module_themes, module_exercises")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ slot: data });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
