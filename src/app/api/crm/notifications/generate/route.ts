import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";

export async function POST(request: NextRequest) {
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

    if (!profile?.entity_id) {
      return NextResponse.json({ data: null, error: "Profile not found" }, { status: 403 });
    }

    const today = new Date().toISOString().split("T")[0];
    const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const notifications: Array<{
      entity_id: string;
      user_id: string;
      type: string;
      title: string;
      message: string;
      link: string;
      resource_type: string;
      resource_id: string;
    }> = [];

    // 1. Overdue tasks
    const { data: overdueTasks } = await supabase
      .from("crm_tasks")
      .select("id, title, due_date, assigned_to")
      .eq("entity_id", profile.entity_id)
      .lt("due_date", today)
      .in("status", ["pending", "in_progress"]);

    if (overdueTasks) {
      for (const task of overdueTasks) {
        const targetUser = task.assigned_to || user.id;
        // Check if we already have an unread notification for this task
        const { count } = await supabase
          .from("crm_notifications")
          .select("id", { count: "exact", head: true })
          .eq("resource_type", "task")
          .eq("resource_id", task.id)
          .eq("type", "task_overdue")
          .eq("user_id", targetUser)
          .eq("is_read", false);

        if (!count || count === 0) {
          notifications.push({
            entity_id: profile.entity_id,
            user_id: targetUser,
            type: "task_overdue",
            title: "Tâche en retard",
            message: `"${task.title}" devait être terminée le ${task.due_date}`,
            link: "/admin/crm/tasks",
            resource_type: "task",
            resource_id: task.id,
          });
        }
      }
    }

    // 2. Tasks due today
    const { data: todayTasks } = await supabase
      .from("crm_tasks")
      .select("id, title, assigned_to")
      .eq("entity_id", profile.entity_id)
      .eq("due_date", today)
      .in("status", ["pending", "in_progress"]);

    if (todayTasks) {
      for (const task of todayTasks) {
        const targetUser = task.assigned_to || user.id;
        const { count } = await supabase
          .from("crm_notifications")
          .select("id", { count: "exact", head: true })
          .eq("resource_type", "task")
          .eq("resource_id", task.id)
          .eq("type", "task_due_today")
          .eq("user_id", targetUser)
          .eq("is_read", false);

        if (!count || count === 0) {
          notifications.push({
            entity_id: profile.entity_id,
            user_id: targetUser,
            type: "task_due_today",
            title: "Tâche à faire aujourd'hui",
            message: `"${task.title}" est due aujourd'hui`,
            link: "/admin/crm/tasks",
            resource_type: "task",
            resource_id: task.id,
          });
        }
      }
    }

    // 3. Task reminders (reminder_at reached)
    const now = new Date().toISOString();
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: reminderTasks } = await supabase
      .from("crm_tasks")
      .select("id, title, due_date, assigned_to, prospect_id, reminder_at")
      .eq("entity_id", profile.entity_id)
      .not("reminder_at", "is", null)
      .lte("reminder_at", now)
      .in("status", ["pending", "in_progress"]);

    if (reminderTasks) {
      for (const task of reminderTasks) {
        const targetUser = task.assigned_to || user.id;

        // Deduplicate: skip if a task_reminder was created in the last 24h
        const { count } = await supabase
          .from("crm_notifications")
          .select("id", { count: "exact", head: true })
          .eq("resource_type", "task")
          .eq("resource_id", task.id)
          .eq("type", "task_reminder")
          .eq("user_id", targetUser)
          .gte("created_at", twentyFourHoursAgo);

        if (!count || count === 0) {
          const message = task.due_date
            ? `Rappel : "${task.title}" — échéance le ${task.due_date}`
            : `Rappel : "${task.title}"`;

          notifications.push({
            entity_id: profile.entity_id,
            user_id: targetUser,
            type: "task_reminder",
            title: "Rappel de tâche",
            message,
            link: task.prospect_id
              ? `/admin/crm/prospects/${task.prospect_id}`
              : "/admin/crm/tasks",
            resource_type: "task",
            resource_id: task.id,
          });
        }
      }
    }

    // 4. Quotes expiring soon (within 3 days)
    const { data: expiringQuotes } = await supabase
      .from("crm_quotes")
      .select("id, reference, valid_until, created_by")
      .eq("entity_id", profile.entity_id)
      .eq("status", "sent")
      .lte("valid_until", threeDaysFromNow)
      .gte("valid_until", today);

    if (expiringQuotes) {
      for (const quote of expiringQuotes) {
        const targetUser = quote.created_by || user.id;
        const { count } = await supabase
          .from("crm_notifications")
          .select("id", { count: "exact", head: true })
          .eq("resource_type", "quote")
          .eq("resource_id", quote.id)
          .eq("type", "quote_expiring")
          .eq("user_id", targetUser)
          .eq("is_read", false);

        if (!count || count === 0) {
          notifications.push({
            entity_id: profile.entity_id,
            user_id: targetUser,
            type: "quote_expiring",
            title: "Devis bientôt expiré",
            message: `Le devis "${quote.reference}" expire le ${quote.valid_until}`,
            link: "/admin/crm/quotes",
            resource_type: "quote",
            resource_id: quote.id,
          });
        }
      }
    }

    // 4. Quotes sent more than 7 days ago without response (follow-up reminder)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: followupQuotes } = await supabase
      .from("crm_quotes")
      .select("id, reference, created_by, created_at")
      .eq("entity_id", profile.entity_id)
      .eq("status", "sent")
      .lt("created_at", sevenDaysAgo);

    if (followupQuotes) {
      for (const quote of followupQuotes) {
        const targetUser = quote.created_by || user.id;
        const { count } = await supabase
          .from("crm_notifications")
          .select("id", { count: "exact", head: true })
          .eq("resource_type", "quote")
          .eq("resource_id", quote.id)
          .eq("type", "quote_followup")
          .eq("user_id", targetUser)
          .eq("is_read", false);

        if (!count || count === 0) {
          notifications.push({
            entity_id: profile.entity_id,
            user_id: targetUser,
            type: "quote_followup",
            title: "Relance devis nécessaire",
            message: `Le devis "${quote.reference}" est en attente depuis plus de 7 jours`,
            link: "/admin/crm/quotes",
            resource_type: "quote",
            resource_id: quote.id,
          });
        }
      }
    }

    // Insert all notifications
    if (notifications.length > 0) {
      const { error } = await supabase.from("crm_notifications").insert(notifications);
      if (error) {
        console.error("Failed to insert notifications:", error.message);
        return NextResponse.json({ data: null, error: sanitizeDbError(error, "inserting notifications") }, { status: 500 });
      }
    }

    // Cleanup: delete read notifications older than 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from("crm_notifications")
      .delete()
      .eq("is_read", true)
      .lt("created_at", thirtyDaysAgo);

    return NextResponse.json({
      data: { generated: notifications.length },
      error: null,
    });
  } catch (err) {
    return NextResponse.json({ data: null, error: sanitizeError(err, "generating notifications") }, { status: 500 });
  }
}
