import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Status Auto-Transitions ────────────────────────────────────────────────

/**
 * Evaluate prospect status based on its quotes.
 * - All quotes accepted → prospect "won"
 * - All quotes rejected → prospect "lost"
 * - First quote created on "new" prospect → prospect "contacted"
 * Returns the new status or null if no change.
 */
export async function evaluateProspectStatusFromQuotes(
  supabase: SupabaseClient,
  prospectId: string,
  entityId: string
): Promise<string | null> {
  // Fetch current prospect
  const { data: prospect } = await supabase
    .from("crm_prospects")
    .select("status")
    .eq("id", prospectId)
    .single();

  if (!prospect) return null;

  // Fetch all quotes for this prospect
  const { data: quotes } = await supabase
    .from("crm_quotes")
    .select("status")
    .eq("prospect_id", prospectId)
    .eq("entity_id", entityId);

  if (!quotes || quotes.length === 0) {
    // First quote just created → move from "new" to "contacted"
    if (prospect.status === "new") {
      await supabase
        .from("crm_prospects")
        .update({ status: "contacted", updated_at: new Date().toISOString() })
        .eq("id", prospectId);
      return "contacted";
    }
    return null;
  }

  const allAccepted = quotes.every((q) => q.status === "accepted");
  const allRejected = quotes.every((q) => q.status === "rejected");

  if (allAccepted && prospect.status !== "won") {
    await supabase
      .from("crm_prospects")
      .update({ status: "won", updated_at: new Date().toISOString() })
      .eq("id", prospectId);
    return "won";
  }

  if (allRejected && prospect.status !== "lost") {
    await supabase
      .from("crm_prospects")
      .update({ status: "lost", updated_at: new Date().toISOString() })
      .eq("id", prospectId);
    return "lost";
  }

  return null;
}

/**
 * Mark prospects as dormant if they haven't been updated in 30+ days.
 * Only affects prospects not already in won/lost/dormant status.
 */
export async function checkDormantProspects(
  supabase: SupabaseClient,
  entityId: string
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString();

  const { data, error } = await supabase
    .from("crm_prospects")
    .update({ status: "dormant", updated_at: new Date().toISOString() })
    .eq("entity_id", entityId)
    .lt("updated_at", cutoffStr)
    .not("status", "in", '("won","lost","dormant")')
    .select("id");

  if (error) {
    console.error("checkDormantProspects error:", error);
    return 0;
  }
  return data?.length ?? 0;
}

/**
 * Find prospects with no crm_commercial_actions in the last 30 days
 * whose status is NOT won/lost/dormant. Create a "Relancer" task
 * with due_date = today + 3 days, and notify the assigned user
 * (or all admins if no assignee).
 */
export async function relanceInactiveProspects(
  supabase: SupabaseClient,
  entityId: string
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString();

  const today = new Date();
  const dueDate = new Date();
  dueDate.setDate(today.getDate() + 3);
  const dueDateStr = dueDate.toISOString().split("T")[0];

  // Fetch active prospects (not won/lost/dormant)
  const { data: prospects } = await supabase
    .from("crm_prospects")
    .select("id, company_name, assigned_to")
    .eq("entity_id", entityId)
    .not("status", "in", '("won","lost","dormant")');

  if (!prospects || prospects.length === 0) return 0;

  // Pre-fetch admins for notification fallback
  const { data: admins } = await supabase
    .from("profiles")
    .select("id")
    .eq("entity_id", entityId)
    .in("role", ["admin", "super_admin"]);

  let created = 0;
  for (const p of prospects) {
    // Check if any commercial action exists in the last 30 days
    const { data: recentActions } = await supabase
      .from("crm_commercial_actions")
      .select("id")
      .eq("prospect_id", p.id)
      .gte("created_at", cutoffStr)
      .limit(1);

    if (recentActions && recentActions.length > 0) continue;

    // Check if a relance task already exists (avoid duplicates)
    const taskTitle = `Relancer ${p.company_name}`;
    const { data: existingTask } = await supabase
      .from("crm_tasks")
      .select("id")
      .eq("entity_id", entityId)
      .eq("title", taskTitle)
      .in("status", ["pending", "in_progress"])
      .limit(1);

    if (existingTask && existingTask.length > 0) continue;

    // Create relance task
    const assignee = p.assigned_to || (admins && admins.length > 0 ? admins[0].id : null);
    await supabase.from("crm_tasks").insert({
      entity_id: entityId,
      title: taskTitle,
      description: `Aucune action commerciale depuis 30 jours pour ${p.company_name}. Relancer le prospect.`,
      due_date: dueDateStr,
      priority: "medium",
      status: "pending",
      assigned_to: assignee,
      prospect_id: p.id,
      created_by: assignee,
    });

    // Create notifications
    const notifyUsers = p.assigned_to
      ? [p.assigned_to]
      : (admins ?? []).map((a) => a.id);

    for (const userId of notifyUsers) {
      await supabase.from("crm_notifications").insert({
        entity_id: entityId,
        user_id: userId,
        type: "prospect_inactive",
        title: "Prospect inactif — relance créée",
        message: `Aucune action depuis 30 jours pour ${p.company_name}. Une tâche de relance a été créée.`,
        link: `/admin/crm/prospects/${p.id}`,
        resource_type: "prospect",
        resource_id: p.id,
      });
    }

    created++;
  }
  return created;
}

// ─── Automated Task Creation ────────────────────────────────────────────────

/**
 * Create a "Premier contact" task when a prospect is created.
 */
export async function createFirstContactTask(
  supabase: SupabaseClient,
  prospectId: string,
  companyName: string,
  entityId: string,
  assignedTo: string | null,
  createdBy: string
): Promise<void> {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 2);

  await supabase.from("crm_tasks").insert({
    entity_id: entityId,
    title: `Premier contact — ${companyName}`,
    description: `Prendre contact avec le prospect ${companyName} dans les 48h.`,
    due_date: dueDate.toISOString().split("T")[0],
    priority: "medium",
    status: "pending",
    assigned_to: assignedTo || createdBy,
    prospect_id: prospectId,
    created_by: createdBy,
  });
}

/**
 * Create a "Préparer proposition" task when prospect moves to "qualified".
 */
export async function createProposalPrepTask(
  supabase: SupabaseClient,
  prospectId: string,
  companyName: string,
  entityId: string,
  assignedTo: string | null,
  createdBy: string
): Promise<void> {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 5);

  await supabase.from("crm_tasks").insert({
    entity_id: entityId,
    title: `Préparer proposition — ${companyName}`,
    description: `Le prospect ${companyName} est qualifié. Préparer une proposition commerciale.`,
    due_date: dueDate.toISOString().split("T")[0],
    priority: "high",
    status: "pending",
    assigned_to: assignedTo || createdBy,
    prospect_id: prospectId,
    created_by: createdBy,
  });
}

/**
 * Create tasks for quotes expiring within 3 days.
 * Also creates notifications for the assigned user (or all admins).
 * Returns the number of tasks created.
 */
export async function createExpiringQuoteTasks(
  supabase: SupabaseClient,
  entityId: string
): Promise<number> {
  const today = new Date();
  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(today.getDate() + 3);

  const todayStr = today.toISOString().split("T")[0];
  const thresholdStr = threeDaysFromNow.toISOString().split("T")[0];

  // Fetch sent quotes expiring soon, include prospect info
  const { data: quotes } = await supabase
    .from("crm_quotes")
    .select("id, reference, prospect_id, client_id, created_by, valid_until, prospect:crm_prospects(company_name)")
    .eq("entity_id", entityId)
    .eq("status", "sent")
    .gte("valid_until", todayStr)
    .lte("valid_until", thresholdStr);

  if (!quotes || quotes.length === 0) return 0;

  // Pre-fetch admins for notification fallback
  const { data: admins } = await supabase
    .from("profiles")
    .select("id")
    .eq("entity_id", entityId)
    .in("role", ["admin", "super_admin"]);

  let created = 0;
  for (const q of quotes) {
    const prospectRaw = q.prospect as unknown;
    const prospectData = Array.isArray(prospectRaw)
      ? (prospectRaw[0] as { company_name: string } | undefined)
      : (prospectRaw as { company_name: string } | null);
    const companyName = prospectData?.company_name ?? "client";
    const taskTitle = `Devis ${q.reference} expire bientôt — relancer ${companyName}`;

    // Check if task already exists for this quote
    const { data: existing } = await supabase
      .from("crm_tasks")
      .select("id")
      .eq("entity_id", entityId)
      .like("title", `%${q.reference}%expire%`)
      .limit(1);

    if (existing && existing.length > 0) continue;

    await supabase.from("crm_tasks").insert({
      entity_id: entityId,
      title: taskTitle,
      description: `Le devis ${q.reference} expire le ${q.valid_until}. Relancer ${companyName}.`,
      due_date: q.valid_until,
      priority: "high",
      status: "pending",
      assigned_to: q.created_by,
      prospect_id: q.prospect_id,
      client_id: q.client_id,
      created_by: q.created_by,
    });

    // Create notifications
    const notifyUsers = q.created_by
      ? [q.created_by]
      : (admins ?? []).map((a) => a.id);

    for (const userId of notifyUsers) {
      await supabase.from("crm_notifications").insert({
        entity_id: entityId,
        user_id: userId,
        type: "quote_expiring",
        title: "Devis expirant bientôt",
        message: `Le devis ${q.reference} expire le ${q.valid_until}. Pensez à relancer ${companyName}.`,
        link: q.prospect_id ? `/admin/crm/prospects/${q.prospect_id}` : "/admin/crm/quotes",
        resource_type: "quote",
        resource_id: q.id,
      });
    }

    created++;
  }
  return created;
}

/**
 * Create notifications for tasks overdue by 3+ days.
 */
export async function notifyOverdueTasks(
  supabase: SupabaseClient,
  entityId: string
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 3);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  const { data: tasks } = await supabase
    .from("crm_tasks")
    .select("id, title, assigned_to, prospect_id")
    .eq("entity_id", entityId)
    .in("status", ["pending", "in_progress"])
    .lt("due_date", cutoffStr);

  if (!tasks || tasks.length === 0) return 0;

  // Get admin users for this entity
  const { data: admins } = await supabase
    .from("profiles")
    .select("id")
    .eq("entity_id", entityId)
    .eq("role", "admin");

  if (!admins || admins.length === 0) return 0;

  let created = 0;
  for (const task of tasks) {
    for (const admin of admins) {
      // Check for existing unread notification
      const { data: existing } = await supabase
        .from("crm_notifications")
        .select("id")
        .eq("entity_id", entityId)
        .eq("user_id", admin.id)
        .eq("resource_id", task.id)
        .eq("type", "task_overdue")
        .eq("is_read", false)
        .limit(1);

      if (existing && existing.length > 0) continue;

      await supabase.from("crm_notifications").insert({
        entity_id: entityId,
        user_id: admin.id,
        type: "task_overdue",
        title: "Tâche en retard (3j+)",
        message: `La tâche "${task.title}" est en retard depuis plus de 3 jours.`,
        link: "/admin/crm/tasks",
        resource_type: "task",
        resource_id: task.id,
      });
      created++;
    }
  }
  return created;
}

// ─── Instant Notifications ──────────────────────────────────────────────────

/**
 * Create an instant notification for quote status change.
 */
export async function notifyQuoteStatusChange(
  supabase: SupabaseClient,
  entityId: string,
  quoteReference: string,
  quoteId: string,
  newStatus: string,
  assignedTo: string | null,
  prospectId: string | null
): Promise<void> {
  if (!assignedTo) return;

  const typeMap: Record<string, string> = {
    accepted: "quote_accepted",
    rejected: "quote_rejected",
  };
  const notifType = typeMap[newStatus];
  if (!notifType) return;

  const titleMap: Record<string, string> = {
    accepted: "Devis accepté",
    rejected: "Devis refusé",
  };

  await supabase.from("crm_notifications").insert({
    entity_id: entityId,
    user_id: assignedTo,
    type: notifType,
    title: titleMap[newStatus],
    message: `Le devis ${quoteReference} a été ${newStatus === "accepted" ? "accepté" : "refusé"}.`,
    link: prospectId ? `/admin/crm/prospects/${prospectId}` : "/admin/crm/quotes",
    resource_type: "quote",
    resource_id: quoteId,
  });
}

/**
 * Create notification when a prospect is won.
 */
export async function notifyProspectWon(
  supabase: SupabaseClient,
  entityId: string,
  prospectId: string,
  companyName: string,
  assignedTo: string | null
): Promise<void> {
  if (!assignedTo) return;

  await supabase.from("crm_notifications").insert({
    entity_id: entityId,
    user_id: assignedTo,
    type: "prospect_won",
    title: "Prospect gagné",
    message: `Le prospect ${companyName} est passé en "Gagné" !`,
    link: `/admin/crm/prospects/${prospectId}`,
    resource_type: "prospect",
    resource_id: prospectId,
  });
}
