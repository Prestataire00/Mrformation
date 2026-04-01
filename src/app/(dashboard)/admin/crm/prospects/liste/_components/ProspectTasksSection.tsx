"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  Trash2,
  Loader2,
  Flag,
  CalendarDays,
  Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { cn, formatDate } from "@/lib/utils";
import type { TaskStatus, TaskPriority } from "@/lib/types";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  reminder_at: string | null;
  assigned_to: string | null;
  created_at: string;
  assigned_profile?: { id: string; first_name: string; last_name: string } | null;
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; icon: typeof Circle; color: string }> = {
  pending: { label: "À faire", icon: Circle, color: "text-gray-400" },
  in_progress: { label: "En cours", icon: Clock, color: "text-blue-500" },
  completed: { label: "Terminée", icon: CheckCircle2, color: "text-green-500" },
  cancelled: { label: "Annulée", icon: Circle, color: "text-gray-300" },
};

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; bg: string }> = {
  low: { label: "Basse", color: "text-gray-600", bg: "bg-gray-100" },
  medium: { label: "Moyenne", color: "text-amber-700", bg: "bg-amber-50" },
  high: { label: "Haute", color: "text-red-700", bg: "bg-red-50" },
};

const REMINDER_PRESETS = [
  { label: "Aujourd'hui", days: 0 },
  { label: "Demain", days: 1 },
  { label: "3 jours", days: 3 },
  { label: "1 semaine", days: 7 },
  { label: "2 semaines", days: 14 },
  { label: "1 mois", days: 30 },
];

function computeReminderDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

function formatReminderLabel(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }) + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function getReminderStatus(isoStr: string): "past" | "today" | "future" {
  const now = new Date();
  const d = new Date(isoStr);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const reminderDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (reminderDay < today) return "past";
  if (reminderDay.getTime() === today.getTime()) return "today";
  return "future";
}

interface ProspectTasksSectionProps {
  prospectId: string;
  prospectName: string;
}

export default function ProspectTasksSection({ prospectId, prospectName }: ProspectTasksSectionProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "completed">("active");
  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "medium" as TaskPriority,
    due_date: "",
    reminder_at: "",
  });

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("crm_tasks")
      .select(`*, assigned_profile:profiles!crm_tasks_assigned_to_fkey (id, first_name, last_name)`)
      .eq("prospect_id", prospectId)
      .order("due_date", { ascending: true, nullsFirst: false });

    if (!error && data) {
      setTasks(data as Task[]);
    }
    setLoading(false);
  }, [supabase, prospectId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  async function handleCreate() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/crm/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
          priority: form.priority,
          due_date: form.due_date || null,
          reminder_at: form.reminder_at || null,
          prospect_id: prospectId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur");
      toast({ title: "Tâche créée" });
      setShowForm(false);
      setForm({ title: "", description: "", priority: "medium", due_date: "", reminder_at: "" });
      fetchTasks();
    } catch (err: unknown) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Erreur", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(task: Task) {
    const newStatus: TaskStatus = task.status === "completed" ? "pending" : "completed";
    const { error } = await supabase
      .from("crm_tasks")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", task.id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t))
      );
    }
  }

  async function handleDelete(taskId: string) {
    const { error } = await supabase.from("crm_tasks").delete().eq("id", taskId);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      toast({ title: "Tâche supprimée" });
    }
  }

  const filteredTasks = tasks.filter((t) => {
    if (filter === "active") return t.status !== "completed" && t.status !== "cancelled";
    if (filter === "completed") return t.status === "completed";
    return true;
  });

  const overdueTasks = tasks.filter(
    (t) => t.due_date && new Date(t.due_date) < new Date() && t.status !== "completed" && t.status !== "cancelled"
  );

  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const activeCount = tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-6 text-sm">
            <button
              onClick={() => setFilter("active")}
              className={cn(
                "flex items-center gap-1.5 pb-0.5 font-medium transition-colors",
                filter === "active" ? "text-blue-600 border-b-2 border-blue-600" : "text-muted-foreground hover:text-gray-700"
              )}
            >
              <Clock className="h-3.5 w-3.5" />
              En cours ({activeCount})
            </button>
            <button
              onClick={() => setFilter("completed")}
              className={cn(
                "flex items-center gap-1.5 pb-0.5 font-medium transition-colors",
                filter === "completed" ? "text-green-600 border-b-2 border-green-600" : "text-muted-foreground hover:text-gray-700"
              )}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Terminées ({completedCount})
            </button>
            <button
              onClick={() => setFilter("all")}
              className={cn(
                "flex items-center gap-1.5 pb-0.5 font-medium transition-colors",
                filter === "all" ? "text-gray-900 border-b-2 border-gray-900" : "text-muted-foreground hover:text-gray-700"
              )}
            >
              Toutes ({tasks.length})
            </button>
          </div>
          {overdueTasks.length > 0 && (
            <Badge variant="destructive" className="gap-1 text-xs">
              <AlertTriangle className="h-3 w-3" />
              {overdueTasks.length} en retard
            </Badge>
          )}
        </div>
        <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Nouvelle tâche
        </Button>
      </div>

      {/* Inline create form */}
      {showForm && (
        <div className="border rounded-lg p-4 mb-4 bg-gray-50/50 space-y-3">
          <Input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Titre de la tâche..."
            autoFocus
            className="text-sm"
            onKeyDown={(e) => { if (e.key === "Enter" && form.title.trim()) handleCreate(); if (e.key === "Escape") setShowForm(false); }}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v as TaskPriority }))}>
              <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Basse</SelectItem>
                <SelectItem value="medium">Moyenne</SelectItem>
                <SelectItem value="high">Haute</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              className="h-8 w-36 text-xs"
            />
            <div className="flex gap-1">
              {REMINDER_PRESETS.slice(0, 4).map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, reminder_at: computeReminderDate(preset.days) }))}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                    form.reminder_at === computeReminderDate(preset.days)
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setShowForm(false)}>Annuler</Button>
            <Button size="sm" className="text-xs h-7 gap-1" onClick={handleCreate} disabled={saving || !form.title.trim()}>
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              Créer
            </Button>
          </div>
        </div>
      )}

      {/* Task list */}
      {filteredTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="font-medium text-gray-700">
            {filter === "completed" ? "Aucune tâche terminée" : "Aucune tâche en cours"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Créez des tâches pour suivre vos actions avec ce prospect.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTasks.map((task) => {
            const isOverdue =
              task.due_date &&
              new Date(task.due_date) < new Date() &&
              task.status !== "completed" &&
              task.status !== "cancelled";
            const statusCfg = STATUS_CONFIG[task.status];
            const priorityCfg = PRIORITY_CONFIG[task.priority];

            return (
              <div
                key={task.id}
                className={cn(
                  "group flex items-start gap-3 rounded-lg border p-3.5 transition-all hover:shadow-sm",
                  task.status === "completed" && "opacity-60 bg-gray-50/50",
                  isOverdue && "border-red-200 bg-red-50/30"
                )}
              >
                <button
                  onClick={() => toggleStatus(task)}
                  className={cn(
                    "mt-0.5 flex-shrink-0 transition-colors hover:scale-110",
                    statusCfg.color
                  )}
                >
                  {task.status === "completed" ? (
                    <CheckCircle2 className="h-5 w-5 fill-green-100" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={cn(
                        "text-sm font-medium text-gray-900",
                        task.status === "completed" && "line-through text-gray-500"
                      )}
                    >
                      {task.title}
                    </p>
                    <button
                      onClick={() => handleDelete(task.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {task.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
                  )}

                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge className={cn("text-[10px] border-0 font-medium", priorityCfg.bg, priorityCfg.color)}>
                      <Flag className="h-2.5 w-2.5 mr-0.5" />
                      {priorityCfg.label}
                    </Badge>

                    {task.due_date && (
                      <span
                        className={cn(
                          "flex items-center gap-1 text-[11px]",
                          isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"
                        )}
                      >
                        <CalendarDays className="h-3 w-3" />
                        {formatDate(task.due_date)}
                        {isOverdue && " (en retard)"}
                      </span>
                    )}

                    {task.reminder_at && (
                      <span
                        className={cn(
                          "flex items-center gap-1 text-[11px]",
                          getReminderStatus(task.reminder_at) === "past"
                            ? "text-red-500"
                            : getReminderStatus(task.reminder_at) === "today"
                            ? "text-amber-600"
                            : "text-muted-foreground"
                        )}
                      >
                        <Bell className="h-3 w-3" />
                        {formatReminderLabel(task.reminder_at)}
                      </span>
                    )}

                    {task.assigned_profile && (
                      <span className="text-[11px] text-muted-foreground">
                        {task.assigned_profile.first_name} {task.assigned_profile.last_name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
