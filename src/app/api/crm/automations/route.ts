import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";

const DEFAULT_RULES = [
  {
    name: "Prospect gagné (tous devis acceptés)",
    description: "Passe automatiquement un prospect en \"Gagné\" lorsque tous ses devis sont acceptés.",
    trigger_type: "quote_all_accepted",
    action_type: "update_prospect_status",
  },
  {
    name: "Prospect perdu (tous devis refusés)",
    description: "Passe automatiquement un prospect en \"Perdu\" lorsque tous ses devis sont refusés.",
    trigger_type: "quote_all_rejected",
    action_type: "update_prospect_status",
  },
  {
    name: "Nouveau devis → Contacté",
    description: "Passe un prospect de \"Lead\" à \"Contacté\" quand un premier devis est créé.",
    trigger_type: "quote_created_for_new",
    action_type: "update_prospect_status",
  },
  {
    name: "Prospects inactifs → Dormant",
    description: "Passe en \"Dormant\" les prospects sans activité depuis 30 jours.",
    trigger_type: "prospect_inactive_30d",
    action_type: "update_prospect_status",
  },
  {
    name: "Tâche premier contact",
    description: "Crée automatiquement une tâche \"Premier contact\" à J+2 pour chaque nouveau prospect.",
    trigger_type: "prospect_created",
    action_type: "create_task",
  },
  {
    name: "Tâche préparer proposition",
    description: "Crée une tâche \"Préparer proposition\" à J+5 quand un prospect passe en \"Qualifié\".",
    trigger_type: "prospect_qualified",
    action_type: "create_task",
  },
  {
    name: "Relance devis expirant",
    description: "Crée une tâche de relance quand un devis expire dans les 3 prochains jours.",
    trigger_type: "quote_expiring_3d",
    action_type: "create_task",
  },
  {
    name: "Alerte tâches en retard (3j+)",
    description: "Notifie les admins quand des tâches sont en retard depuis plus de 3 jours.",
    trigger_type: "task_overdue_3d",
    action_type: "create_notification",
  },
  {
    name: "Résumé quotidien",
    description: "Envoie un résumé quotidien avec les tâches en retard, devis expirants et nouveaux leads.",
    trigger_type: "daily_digest",
    action_type: "create_notification",
  },
  {
    name: "Bilan hebdomadaire",
    description: "Envoie un bilan hebdomadaire de la performance commerciale.",
    trigger_type: "weekly_summary",
    action_type: "create_notification",
  },
  {
    name: "Recalcul des scores leads",
    description: "Recalcule les scores de tous les prospects actifs.",
    trigger_type: "recalculate_scores",
    action_type: "update_scores",
  },
];

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("entity_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.entity_id || !["admin","super_admin"].includes(profile.role)) {
      return NextResponse.json({ data: null, error: "Admin access required" }, { status: 403 });
    }

    // Check if rules exist, if not seed them
    const { data: existing, count } = await supabase
      .from("crm_automation_rules")
      .select("id", { count: "exact", head: true })
      .eq("entity_id", profile.entity_id);

    if (!count || count === 0) {
      const seeds = DEFAULT_RULES.map((rule) => ({
        ...rule,
        entity_id: profile.entity_id,
        is_enabled: true,
      }));
      await supabase.from("crm_automation_rules").insert(seeds);
    }

    // Fetch all rules
    const { data: rules, error } = await supabase
      .from("crm_automation_rules")
      .select("*")
      .eq("entity_id", profile.entity_id)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ data: null, error: sanitizeDbError(error, "fetching automation rules") }, { status: 500 });
    }

    return NextResponse.json({ data: rules, error: null });
  } catch (err) {
    return NextResponse.json({ data: null, error: sanitizeError(err, "fetching automation rules") }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("entity_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.entity_id || !["admin","super_admin"].includes(profile.role)) {
      return NextResponse.json({ data: null, error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const { id, is_enabled } = body;

    if (!id || typeof is_enabled !== "boolean") {
      return NextResponse.json({ data: null, error: "id and is_enabled required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("crm_automation_rules")
      .update({ is_enabled, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("entity_id", profile.entity_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ data: null, error: sanitizeDbError(error, "updating automation rule") }, { status: 500 });
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    return NextResponse.json({ data: null, error: sanitizeError(err, "updating automation rule") }, { status: 500 });
  }
}
