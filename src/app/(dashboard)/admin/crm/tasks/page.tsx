"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Filter,
  CalendarDays,
  AlertCircle,
  CheckCircle2,
  Clock,
  Bell,
  MoreHorizontal,
  Calendar,
  Building2,
  User,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import {
  cn,
  formatDate,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_COLORS,
  STATUS_COLORS,
} from "@/lib/utils";
import type { CrmTask, Profile, CrmProspect, Client, TaskPriority, TaskStatus } from "@/lib/types";

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "En attente",
  in_progress: "En cours",
  completed: "Terminée",
  cancelled: "Annulée",
};

const PRIORITY_BORDER: Record<TaskPriority, string> = {
  high: "border-l-red-500",
  medium: "border-l-yellow-500",
  low: "border-l-green-500",
};

interface TaskFormData {
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string;
  assigned_to: string;
  prospect_id: string;
  client_id: string;
}

const EMPTY_FORM: TaskFormData = {
  title: "",
  description: "",
  priority: "medium",
  status: "pending",
  due_date: "",
  assigned_to: "",
  prospect_id: "",
  client_id: "",
};

interface TaskStats {
  dueToday: number;
  overdue: number;
  activeReminders: number;
  completedThisWeek: number;
}

export default function TasksPage() {
  const supabase = createClient();
  const { toast } = useToast();
  const { entityId } = useEntity();

  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [prospects, setProspects] = useState<CrmProspect[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [stats, setStats] = useState<TaskStats>({ dueToday: 0, overdue: 0, activeReminders: 0, completedThisWeek: 0 });

  // Filters
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("pending");

  // Dialogs
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<CrmTask | null>(null);

  // Form
  const [formData, setFormData] = useState<TaskFormData>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof TaskFormData, string>>>({});

  useEffect(() => {
    if (entityId === undefined) return;
    fetchTasks();
    fetchProfiles();
    fetchProspects();
    fetchClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, search, priorityFilter, statusFilter]);

  const fetchProfiles = useCallback(async () => {
    let query = supabase.from("profiles").select("id, first_name, last_name, email, role").in("role", ["admin", "trainer"]).order("first_name");
    if (entityId) query = query.eq("entity_id", entityId);
    const { data } = await query;
    setProfiles((data as Profile[]) ?? []);
  }, [supabase, entityId]);

  const fetchProspects = useCallback(async () => {
    let query = supabase.from("crm_prospects").select("id, company_name, contact_name").order("company_name");
    if (entityId) query = query.eq("entity_id", entityId);
    const { data } = await query;
    setProspects((data as CrmProspect[]) ?? []);
  }, [supabase, entityId]);

  const fetchClients = useCallback(async () => {
    let query = supabase.from("clients").select("id, company_name").order("company_name");
    if (entityId) query = query.eq("entity_id", entityId);
    const { data } = await query;
    setClients((data as Client[]) ?? []);
  }, [supabase, entityId]);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("crm_tasks")
        .select(`
          *,
          assignee:profiles!crm_tasks_assigned_to_fkey(id, first_name, last_name, email),
          prospect:crm_prospects!crm_tasks_prospect_id_fkey(id, company_name),
          client:clients!crm_tasks_client_id_fkey(id, company_name)
        `)
        .order("due_date", { ascending: true, nullsFirst: false });

      if (entityId) query = query.eq("entity_id", entityId);
      if (priorityFilter !== "all") query = query.eq("priority", priorityFilter);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (search.trim()) query = query.ilike("title", `%${search.trim()}%`);

      const { data, error } = await query;
      if (error) throw error;
      const list = (data as CrmTask[]) ?? [];
      setTasks(list);

      // Compute stats (from all tasks, not filtered)
      let allQuery = supabase.from("crm_tasks").select("status, due_date, priority, reminder_at");
      if (entityId) allQuery = allQuery.eq("entity_id", entityId);
      const { data: allData } = await allQuery;
      if (allData) {
        const now = new Date();
        const todayStr = now.toISOString().split("T")[0];
        const nowIso = now.toISOString();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        const startOfWeekStr = startOfWeek.toISOString().split("T")[0];

        const dueToday = allData.filter(
          (t) => t.due_date === todayStr && t.status !== "completed" && t.status !== "cancelled"
        ).length;
        const overdue = allData.filter(
          (t) => t.due_date && t.due_date < todayStr && t.status !== "completed" && t.status !== "cancelled"
        ).length;
        const activeReminders = allData.filter(
          (t) => t.reminder_at && t.reminder_at <= nowIso && t.status !== "completed" && t.status !== "cancelled"
        ).length;
        const completedThisWeek = allData.filter(
          (t) => t.status === "completed" && t.due_date && t.due_date >= startOfWeekStr
        ).length;
        setStats({ dueToday, overdue, activeReminders, completedThisWeek });
      }
    } catch (err) {
      console.error("fetchTasks error:", err);
      toast({ title: "Erreur", description: "Impossible de charger les tâches.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [supabase, entityId, priorityFilter, statusFilter, search, toast]);

  function validateForm(): boolean {
    const errors: Partial<Record<keyof TaskFormData, string>> = {};
    if (!formData.title.trim()) errors.title = "Le titre est requis.";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleCreate() {
    if (!validateForm()) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        priority: formData.priority,
        status: formData.status,
        due_date: formData.due_date || null,
        assigned_to: formData.assigned_to || null,
        prospect_id: formData.prospect_id || null,
        client_id: formData.client_id || null,
      };
      if (entityId) payload.entity_id = entityId;

      const { error } = await supabase.from("crm_tasks").insert([payload]);
      if (error) throw error;

      toast({ title: "Tâche créée", description: `"${formData.title}" a été ajoutée.` });
      setAddDialogOpen(false);
      setFormData(EMPTY_FORM);
      fetchTasks();
    } catch (err) {
      console.error("handleCreate error:", err);
      toast({ title: "Erreur", description: "Impossible de créer la tâche.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!selectedTask || !validateForm()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/crm/tasks/${selectedTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title.trim(),
          description: formData.description.trim() || null,
          priority: formData.priority,
          status: formData.status,
          due_date: formData.due_date || null,
          assigned_to: formData.assigned_to || null,
          prospect_id: formData.prospect_id || null,
          client_id: formData.client_id || null,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erreur serveur");

      toast({ title: "Tâche modifiée", description: `"${formData.title}" a été mise à jour.` });
      setEditDialogOpen(false);
      setSelectedTask(null);
      setFormData(EMPTY_FORM);
      fetchTasks();
    } catch (err) {
      console.error("handleUpdate error:", err);
      toast({ title: "Erreur", description: "Impossible de modifier la tâche.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedTask) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/crm/tasks/${selectedTask.id}`, { method: "DELETE" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erreur serveur");
      toast({ title: "Tâche supprimée" });
      setDeleteDialogOpen(false);
      setSelectedTask(null);
      fetchTasks();
    } catch (err) {
      console.error("handleDelete error:", err);
      toast({ title: "Erreur", description: "Impossible de supprimer la tâche.", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  async function handleToggleComplete(task: CrmTask) {
    const newStatus: TaskStatus = task.status === "completed" ? "pending" : "completed";
    try {
      const res = await fetch(`/api/crm/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erreur serveur");
      setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: newStatus } : t));
      fetchTasks(); // refresh stats
    } catch (err) {
      console.error("handleToggleComplete error:", err);
      toast({ title: "Erreur", description: "Impossible de mettre à jour la tâche.", variant: "destructive" });
    }
  }

  function openEditDialog(task: CrmTask) {
    setSelectedTask(task);
    setFormData({
      title: task.title,
      description: task.description ?? "",
      priority: task.priority,
      status: task.status,
      due_date: task.due_date ?? "",
      assigned_to: task.assigned_to ?? "",
      prospect_id: task.prospect_id ?? "",
      client_id: task.client_id ?? "",
    });
    setFormErrors({});
    setEditDialogOpen(true);
  }

  function openDeleteDialog(task: CrmTask) {
    setSelectedTask(task);
    setDeleteDialogOpen(true);
  }

  function openAddDialog() {
    setFormData(EMPTY_FORM);
    setFormErrors({});
    setAddDialogOpen(true);
  }

  function updateField(field: keyof TaskFormData, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) setFormErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  const getProfileName = (profileId: string | null | undefined) => {
    if (!profileId) return null;
    const p = profiles.find((pr) => pr.id === profileId);
    if (!p) return null;
    return [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || null;
  };

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  const todayTasks = tasks.filter(
    (t) => t.due_date === todayStr && t.status !== "cancelled"
  );
  const upcomingTasks = tasks.filter(
    (t) => (!t.due_date || t.due_date > todayStr) && t.status !== "cancelled"
  );
  const overdueTasks = tasks.filter(
    (t) => t.due_date && t.due_date < todayStr && t.status !== "completed" && t.status !== "cancelled"
  );
  const nowIso = now.toISOString();
  const reminderTasks = tasks.filter(
    (t) => t.reminder_at && t.reminder_at <= nowIso && t.status !== "completed" && t.status !== "cancelled"
  );

  const hasActiveFilters = search || priorityFilter !== "all" || statusFilter !== "all";

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Tâches CRM</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organisez et suivez vos actions commerciales
          </p>
        </div>
        <Button onClick={openAddDialog} className="gap-2">
          <Plus className="h-4 w-4" />
          Ajouter une tâche
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
              <CalendarDays className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">À faire aujourd&apos;hui</p>
              <p className="text-2xl font-bold text-gray-900">{stats.dueToday}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
              <AlertCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">En retard</p>
              <p className="text-2xl font-bold text-red-600">{stats.overdue}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Terminées cette semaine</p>
              <p className="text-2xl font-bold text-green-600">{stats.completedThisWeek}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Rechercher une tâche…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as TaskPriority | "all")}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Priorité" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes priorités</SelectItem>
                  <SelectItem value="high">Haute</SelectItem>
                  <SelectItem value="medium">Moyenne</SelectItem>
                  <SelectItem value="low">Basse</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TaskStatus | "all")}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous statuts</SelectItem>
                  <SelectItem value="pending">En attente</SelectItem>
                  <SelectItem value="in_progress">En cours</SelectItem>
                  <SelectItem value="completed">Terminée</SelectItem>
                  <SelectItem value="cancelled">Annulée</SelectItem>
                </SelectContent>
              </Select>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setPriorityFilter("all"); setStatusFilter("all"); }}>
                  Réinitialiser
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Task list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" />
        </div>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <ClipboardList className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium text-gray-700">Aucune tâche trouvée</p>
            <p className="text-sm text-muted-foreground mt-1">
              {hasActiveFilters ? "Modifiez vos filtres ou créez une nouvelle tâche." : "Commencez par créer votre première tâche."}
            </p>
            <Button onClick={openAddDialog} className="mt-4 gap-2">
              <Plus className="h-4 w-4" />
              Ajouter une tâche
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Overdue */}
          {overdueTasks.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <h2 className="text-sm font-semibold text-red-600">En retard ({overdueTasks.length})</h2>
              </div>
              <div className="space-y-2">
                {overdueTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    getProfileName={getProfileName}
                    onToggleComplete={() => handleToggleComplete(task)}
                    onEdit={() => openEditDialog(task)}
                    onDelete={() => openDeleteDialog(task)}
                    isOverdue
                  />
                ))}
              </div>
            </div>
          )}

          {/* Reminders */}
          {reminderTasks.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-amber-600">Rappels</h2>
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 text-xs">
                  {reminderTasks.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {reminderTasks.map((task) => (
                  <TaskRow
                    key={`reminder-${task.id}`}
                    task={task}
                    getProfileName={getProfileName}
                    onToggleComplete={() => handleToggleComplete(task)}
                    onEdit={() => openEditDialog(task)}
                    onDelete={() => openDeleteDialog(task)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Today */}
          {todayTasks.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-500" />
                <h2 className="text-sm font-semibold text-blue-600">Aujourd&apos;hui ({todayTasks.length})</h2>
              </div>
              <div className="space-y-2">
                {todayTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    getProfileName={getProfileName}
                    onToggleComplete={() => handleToggleComplete(task)}
                    onEdit={() => openEditDialog(task)}
                    onDelete={() => openDeleteDialog(task)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Upcoming */}
          {upcomingTasks.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-500" />
                <h2 className="text-sm font-semibold text-gray-600">À venir ({upcomingTasks.length})</h2>
              </div>
              <div className="space-y-2">
                {upcomingTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    getProfileName={getProfileName}
                    onToggleComplete={() => handleToggleComplete(task)}
                    onEdit={() => openEditDialog(task)}
                    onDelete={() => openDeleteDialog(task)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Tasks with no due date that don't fit above buckets */}
          {(() => {
            const others = tasks.filter(
              (t) =>
                !t.due_date &&
                t.status !== "cancelled" &&
                !todayTasks.find((x) => x.id === t.id) &&
                !upcomingTasks.find((x) => x.id === t.id) &&
                !overdueTasks.find((x) => x.id === t.id)
            );
            if (others.length === 0) return null;
            return (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-gray-400" />
                  <h2 className="text-sm font-semibold text-gray-500">Sans échéance ({others.length})</h2>
                </div>
                <div className="space-y-2">
                  {others.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      getProfileName={getProfileName}
                      onToggleComplete={() => handleToggleComplete(task)}
                      onEdit={() => openEditDialog(task)}
                      onDelete={() => openDeleteDialog(task)}
                    />
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ajouter une tâche</DialogTitle>
            <DialogDescription>Créez une nouvelle tâche ou action commerciale.</DialogDescription>
          </DialogHeader>
          <TaskForm formData={formData} formErrors={formErrors} onUpdate={updateField} profiles={profiles} prospects={prospects} clients={clients} />
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" disabled={saving}>Annuler</Button></DialogClose>
            <Button onClick={handleCreate} disabled={saving} className="gap-2">
              {saving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Créer la tâche
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier la tâche</DialogTitle>
            <DialogDescription>Mettez à jour les informations de cette tâche.</DialogDescription>
          </DialogHeader>
          <TaskForm formData={formData} formErrors={formErrors} onUpdate={updateField} profiles={profiles} prospects={prospects} clients={clients} />
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" disabled={saving}>Annuler</Button></DialogClose>
            <Button onClick={handleUpdate} disabled={saving} className="gap-2">
              {saving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Supprimer la tâche</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer{" "}
              <span className="font-semibold text-gray-900">&quot;{selectedTask?.title}&quot;</span> ?
              Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" disabled={deleting}>Annuler</Button></DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="gap-2">
              {deleting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---- Sub-components ----

interface TaskRowProps {
  task: CrmTask;
  getProfileName: (id: string | null | undefined) => string | null;
  onToggleComplete: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isOverdue?: boolean;
}

function TaskRow({ task, getProfileName, onToggleComplete, onEdit, onDelete, isOverdue }: TaskRowProps) {
  const isCompleted = task.status === "completed";
  const profileName = getProfileName(task.assigned_to);

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border bg-white p-4 border-l-4 shadow-sm hover:shadow-md transition-shadow",
        PRIORITY_BORDER[task.priority],
        isCompleted && "opacity-60"
      )}
    >
      <Checkbox
        checked={isCompleted}
        onCheckedChange={onToggleComplete}
        className="mt-0.5 flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className={cn("font-medium text-gray-900", isCompleted && "line-through text-gray-500")}>
              {task.title}
            </p>
            {task.description && (
              <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge className={cn("border-0 text-xs", TASK_PRIORITY_COLORS[task.priority])}>
              {TASK_PRIORITY_LABELS[task.priority]}
            </Badge>
            <Badge className={cn("border-0 text-xs", STATUS_COLORS[task.status])}>
              {task.status === "pending" ? "En attente" : task.status === "in_progress" ? "En cours" : task.status === "completed" ? "Terminée" : "Annulée"}
            </Badge>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
          {task.due_date && (
            <span className={cn("flex items-center gap-1", isOverdue && !isCompleted && "text-red-600 font-medium")}>
              <Calendar className="h-3 w-3" />
              {isOverdue && !isCompleted && "En retard · "}
              {formatDate(task.due_date)}
            </span>
          )}
          {profileName && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {profileName}
            </span>
          )}
          {task.prospect && (
            <span className="flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              {task.prospect.company_name}
            </span>
          )}
          {task.client && (
            <span className="flex items-center gap-1">
              <Building2 className="h-3 w-3 text-green-600" />
              {task.client.company_name}
            </span>
          )}
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={onToggleComplete} className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            {isCompleted ? "Rouvrir" : "Marquer terminée"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onEdit} className="gap-2">
            <Pencil className="h-4 w-4" />
            Modifier
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onDelete} className="gap-2 text-red-600 focus:text-red-600">
            <Trash2 className="h-4 w-4" />
            Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

interface TaskFormProps {
  formData: TaskFormData;
  formErrors: Partial<Record<keyof TaskFormData, string>>;
  onUpdate: (field: keyof TaskFormData, value: string) => void;
  profiles: Profile[];
  prospects: CrmProspect[];
  clients: Client[];
}

function TaskForm({ formData, formErrors, onUpdate, profiles, prospects, clients }: TaskFormProps) {
  return (
    <div className="space-y-4 py-2">
      <div className="space-y-1.5">
        <Label htmlFor="title">Titre <span className="text-red-500">*</span></Label>
        <Input
          id="title"
          value={formData.title}
          onChange={(e) => onUpdate("title", e.target.value)}
          placeholder="Ex : Rappeler M. Dupont"
          className={cn(formErrors.title && "border-red-500")}
        />
        {formErrors.title && <p className="text-xs text-red-500">{formErrors.title}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" value={formData.description} onChange={(e) => onUpdate("description", e.target.value)} placeholder="Détails de la tâche…" rows={3} className="resize-none" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="priority">Priorité</Label>
          <Select value={formData.priority} onValueChange={(v) => onUpdate("priority", v)}>
            <SelectTrigger id="priority"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="high">Haute</SelectItem>
              <SelectItem value="medium">Moyenne</SelectItem>
              <SelectItem value="low">Basse</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="status">Statut</Label>
          <Select value={formData.status} onValueChange={(v) => onUpdate("status", v)}>
            <SelectTrigger id="status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">En attente</SelectItem>
              <SelectItem value="in_progress">En cours</SelectItem>
              <SelectItem value="completed">Terminée</SelectItem>
              <SelectItem value="cancelled">Annulée</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="due_date">Date d&apos;échéance</Label>
          <Input id="due_date" type="date" value={formData.due_date} onChange={(e) => onUpdate("due_date", e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="assigned_to">Assigné à</Label>
          <Select value={formData.assigned_to || "_none"} onValueChange={(v) => onUpdate("assigned_to", v === "_none" ? "" : v)}>
            <SelectTrigger id="assigned_to"><SelectValue placeholder="Choisir" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Non assigné</SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {[p.first_name, p.last_name].filter(Boolean).join(" ") || p.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="prospect_id">Prospect lié</Label>
          <Select value={formData.prospect_id || "_none"} onValueChange={(v) => onUpdate("prospect_id", v === "_none" ? "" : v)}>
            <SelectTrigger id="prospect_id"><SelectValue placeholder="Aucun" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Aucun</SelectItem>
              {prospects.map((p) => <SelectItem key={p.id} value={p.id}>{p.company_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="client_id">Client lié</Label>
          <Select value={formData.client_id || "_none"} onValueChange={(v) => onUpdate("client_id", v === "_none" ? "" : v)}>
            <SelectTrigger id="client_id"><SelectValue placeholder="Aucun" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Aucun</SelectItem>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
