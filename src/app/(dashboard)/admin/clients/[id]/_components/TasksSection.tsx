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

interface TasksSectionProps {
  clientId: string;
  clientName: string;
}

export default function TasksSection({ clientId, clientName }: TasksSectionProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "completed">("active");
  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "medium" as TaskPriority,
    due_date: "",
  });

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("crm_tasks")
      .select(`*, assigned_profile:profiles!crm_tasks_assigned_to_fkey (id, first_name, last_name)`)
      .eq("client_id", clientId)
      .order("due_date", { ascending: true, nullsFirst: false });

    if (!error && data) {
      setTasks(data as Task[]);
    }
    setLoading(false);
  }, [supabase, clientId]);

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
          client_id: clientId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur");
      toast({ title: "Tâche créée" });
      setDialogOpen(false);
      setForm({ title: "", description: "", priority: "medium", due_date: "" });
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
        <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Nouvelle tâche
        </Button>
      </div>

      {/* Task list */}
      {filteredTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="font-medium text-gray-700">
            {filter === "completed" ? "Aucune tâche terminée" : "Aucune tâche en cours"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Créez des tâches pour suivre vos actions avec ce client.
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
            const StatusIcon = statusCfg.icon;

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

      {/* Create task dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nouvelle tâche</DialogTitle>
            <DialogDescription>
              Ajouter une tâche liée à {clientName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Titre <span className="text-red-500">*</span></Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Relancer pour le devis"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                className="resize-none"
                placeholder="Détails supplémentaires..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Priorité</Label>
                <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v as TaskPriority }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Basse</SelectItem>
                    <SelectItem value="medium">Moyenne</SelectItem>
                    <SelectItem value="high">Haute</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Échéance</Label>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleCreate} disabled={saving || !form.title.trim()} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Créer la tâche
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
