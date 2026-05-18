"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import {
  crmTaskLabelStyle,
  isGenericTaskTitle,
  SELLSY_TASK_LABELS,
} from "@/lib/utils/crm-task-label-style";
import {
  computeReminderDate,
  formatReminderLabel,
  getReminderStatus,
  REMINDER_PRESETS,
} from "@/lib/utils/crm-task-reminder";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Bell,
  MoreHorizontal,
  Calendar,
  Building2,
  User,
  ClipboardList,
  List,
  LayoutGrid,
  CalendarDays,
  Sun,
  Mail,
  Download,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
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
  SelectLabel,
  SelectGroup,
  SelectSeparator,
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
} from "@/lib/utils";
import type { CrmTask, Profile, CrmProspect, Client, TaskPriority, TaskStatus, UserRole } from "@/lib/types";
import { TaskKanbanCard } from "./_components/TaskKanbanCard";
import { CalendarView } from "./_components/CalendarView";
import { TodayView } from "./_components/TodayView";

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
  reminder_at: string;
  assigned_to: string;
  prospect_id: string;
  client_id: string;
  label: string;
  contact_email: string;
}

const EMPTY_FORM: TaskFormData = {
  title: "",
  description: "",
  priority: "medium",
  status: "pending",
  due_date: "",
  reminder_at: "",
  assigned_to: "",
  prospect_id: "",
  client_id: "",
  label: "",
  contact_email: "",
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [viewMode, setViewMode] = useState<"list" | "kanban" | "calendar" | "today">("list");
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [prospects, setProspects] = useState<CrmProspect[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [stats, setStats] = useState<TaskStats>({ dueToday: 0, overdue: 0, activeReminders: 0, completedThisWeek: 0 });

  // h-20 : current user + counts par assignee pour le Select
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);
  const [assigneeCounts, setAssigneeCounts] = useState<Map<string, number>>(new Map());
  const [assigneeRoleDefaultApplied, setAssigneeRoleDefaultApplied] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("pending");
  // h-20 : init depuis URL (?assignee=me|unassigned|all|<uuid>). Le default
  // par rôle est appliqué après chargement du profile dans un useEffect dédié.
  const [assigneeFilter, setAssigneeFilter] = useState<string>(
    () => searchParams.get("assignee") ?? "all"
  );

  // Inline forms
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<CrmTask | null>(null);

  // Completion flow
  const [completingTask, setCompletingTask] = useState<CrmTask | null>(null);
  const [completionNotes, setCompletionNotes] = useState("");

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
  }, [entityId, search, priorityFilter, statusFilter, assigneeFilter, currentUserId]);

  // h-20 : charge le profile courant une seule fois pour résoudre "me" + appliquer
  // le default par rôle (commercial = "me", admin/super_admin = "all").
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", user.id)
        .single();
      if (cancelled) return;
      setCurrentUserId(user.id);
      if (profile?.role) setCurrentUserRole(profile.role as UserRole);

      // Default par rôle : seulement si l'URL n'a pas spécifié explicitement
      // d'assignee ET qu'on n'a jamais encore appliqué de default cette session.
      const urlAssignee = searchParams.get("assignee");
      if (!urlAssignee && !assigneeRoleDefaultApplied) {
        if (profile?.role === "commercial") setAssigneeFilter("me");
        setAssigneeRoleDefaultApplied(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  // h-20 : sync state assigneeFilter -> URL (?assignee=...). Utilise replace
  // pour ne pas polluer l'historique. "all" = pas de param (URL propre).
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (assigneeFilter === "all") {
      params.delete("assignee");
    } else {
      params.set("assignee", assigneeFilter);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assigneeFilter]);

  const fetchProfiles = useCallback(async () => {
    // h-20 : inclure 'super_admin' et 'commercial' (cf brainstorming Phase 4 #19/#20).
    // Sans ça, un commercial assigné à une tâche n'apparaissait pas dans le select.
    let query = supabase
      .from("profiles")
      .select("id, first_name, last_name, email, role")
      .in("role", ["admin", "super_admin", "trainer", "commercial"])
      .order("first_name");
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
          creator:profiles!crm_tasks_created_by_fkey(id, first_name, last_name),
          prospect:crm_prospects!crm_tasks_prospect_id_fkey(id, company_name),
          client:clients!crm_tasks_client_id_fkey(id, company_name)
        `)
        .order("due_date", { ascending: true, nullsFirst: false });

      if (entityId) query = query.eq("entity_id", entityId);
      if (priorityFilter !== "all") query = query.eq("priority", priorityFilter);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (search.trim()) query = query.ilike("title", `%${search.trim()}%`);
      // h-20 : "me" résolu à currentUserId, "unassigned" → is.null, sinon UUID exact.
      // Si currentUserId pas encore chargé, on skip pour éviter requête .eq(undefined).
      if (assigneeFilter === "me") {
        if (currentUserId) query = query.eq("assigned_to", currentUserId);
        else return; // attend que le profile charge → retrigger via dep currentUserId
      } else if (assigneeFilter === "unassigned") {
        query = query.is("assigned_to", null);
      } else if (assigneeFilter !== "all") {
        query = query.eq("assigned_to", assigneeFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      const list = (data as CrmTask[]) ?? [];
      setTasks(list);

      // Stats hero : appliquent le MEME filtre assignee pour rester cohérentes
      // avec ce que voit l'utilisateur. Sinon "12 aujourd'hui" mais la liste
      // n'en montre que 3 (= ses propres) = stats menteuses.
      let allQuery = supabase
        .from("crm_tasks")
        .select("status, due_date, priority, reminder_at, assigned_to");
      if (entityId) allQuery = allQuery.eq("entity_id", entityId);
      if (assigneeFilter === "me" && currentUserId) {
        allQuery = allQuery.eq("assigned_to", currentUserId);
      } else if (assigneeFilter === "unassigned") {
        allQuery = allQuery.is("assigned_to", null);
      } else if (assigneeFilter !== "all" && assigneeFilter !== "me") {
        allQuery = allQuery.eq("assigned_to", assigneeFilter);
      }
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

      // h-20 : counts par assignee (tâches actives uniquement, pas filtré par assignee).
      // Sert à enrichir le select "Marc (12) / Taline (8) / Non assigné (3)".
      let countsQuery = supabase
        .from("crm_tasks")
        .select("assigned_to, status");
      if (entityId) countsQuery = countsQuery.eq("entity_id", entityId);
      const { data: countsData } = await countsQuery;
      if (countsData) {
        const counts = new Map<string, number>();
        for (const t of countsData) {
          if (t.status === "completed" || t.status === "cancelled") continue;
          const key = t.assigned_to ?? "__unassigned__";
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        setAssigneeCounts(counts);
      }
    } catch (err) {
      console.error("fetchTasks error:", err);
      toast({ title: "Erreur", description: "Impossible de charger les tâches.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [supabase, entityId, priorityFilter, statusFilter, search, assigneeFilter, currentUserId, toast]);

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
        reminder_at: formData.reminder_at || null,
        assigned_to: formData.assigned_to || null,
        prospect_id: formData.prospect_id || null,
        client_id: formData.client_id || null,
        label: formData.label || null,
        contact_email: formData.contact_email.trim() || null,
      };
      if (entityId) payload.entity_id = entityId;

      const { error } = await supabase.from("crm_tasks").insert([payload]);
      if (error) throw error;

      toast({ title: "Tâche créée", description: `"${formData.title}" a été ajoutée.` });
      setShowAddForm(false);
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
          reminder_at: formData.reminder_at || null,
          assigned_to: formData.assigned_to || null,
          prospect_id: formData.prospect_id || null,
          client_id: formData.client_id || null,
          label: formData.label || null,
          contact_email: formData.contact_email.trim() || null,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erreur serveur");

      toast({ title: "Tâche modifiée", description: `"${formData.title}" a été mise à jour.` });
      setEditingTaskId(null);
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
    if (task.status === "completed") {
      // Reopen: just toggle back to pending, no notes needed
      try {
        const res = await fetch(`/api/crm/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "pending", completion_notes: null, completed_at: null }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Erreur serveur");
        setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: "pending" as TaskStatus, completion_notes: null, completed_at: null } : t));
        fetchTasks();
      } catch (err) {
        console.error("handleToggleComplete error:", err);
        toast({ title: "Erreur", description: "Impossible de mettre à jour la tâche.", variant: "destructive" });
      }
    } else {
      // Show inline completion form
      setCompletingTask(task);
      setCompletionNotes("");
    }
  }

  async function handleConfirmComplete() {
    if (!completingTask) return;
    try {
      const res = await fetch(`/api/crm/tasks/${completingTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "completed",
          completion_notes: completionNotes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("Erreur");
      setTasks(prev => prev.map(t => t.id === completingTask.id ? { ...t, status: "completed" as TaskStatus, completion_notes: completionNotes.trim() || null } : t));
      setCompletingTask(null);
      setCompletionNotes("");
      fetchTasks();
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  }

  function startEditingTask(task: CrmTask) {
    setSelectedTask(task);
    setFormData({
      title: task.title,
      description: task.description ?? "",
      priority: task.priority,
      status: task.status,
      due_date: task.due_date ?? "",
      reminder_at: task.reminder_at ?? "",
      assigned_to: task.assigned_to ?? "",
      prospect_id: task.prospect_id ?? "",
      client_id: task.client_id ?? "",
      label: task.label ?? "",
      contact_email: task.contact_email ?? "",
    });
    setFormErrors({});
    setEditingTaskId(task.id);
  }

  function openDeleteDialog(task: CrmTask) {
    setSelectedTask(task);
    setDeleteDialogOpen(true);
  }

  function toggleAddForm() {
    setFormData(EMPTY_FORM);
    setFormErrors({});
    setShowAddForm((prev) => !prev);
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
    (t) => t.due_date === todayStr && t.status !== "completed" && t.status !== "cancelled"
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

  // Kanban columns
  const kanbanOverdue = tasks.filter(t => t.status !== "completed" && t.status !== "cancelled" && t.due_date && t.due_date < todayStr);
  const kanbanToday = tasks.filter(t => t.status !== "completed" && t.status !== "cancelled" && t.due_date === todayStr);
  const kanbanUpcoming = tasks.filter(t => t.status !== "completed" && t.status !== "cancelled" && (!t.due_date || t.due_date > todayStr));
  const kanbanCompleted = tasks.filter(t => t.status === "completed").slice(0, 20);

  // h-20 : le "default" assignee dépend du rôle (commercial = "me", autres = "all")
  const roleDefaultAssignee = currentUserRole === "commercial" ? "me" : "all";
  const hasActiveFilters = search || priorityFilter !== "all" || statusFilter !== "all" || assigneeFilter !== roleDefaultAssignee;

  return (
    <div className="space-y-4 p-6">
      {/* Header compact */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-bold text-gray-900">Tâches</h1>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span><span className="font-bold text-blue-600 text-sm">{stats.dueToday}</span> aujourd&apos;hui</span>
            {stats.overdue > 0 && <span><span className="font-bold text-red-500 text-sm">{stats.overdue}</span> en retard</span>}
            <span><span className="font-bold text-green-600 text-sm">{stats.completedThisWeek}</span> terminées</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setViewMode("list")} className={cn("px-2 py-1 text-xs rounded-md transition", viewMode === "list" ? "bg-white shadow-sm font-medium" : "text-gray-500")} title="Vue liste">
              <List className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setViewMode("kanban")} className={cn("px-2 py-1 text-xs rounded-md transition", viewMode === "kanban" ? "bg-white shadow-sm font-medium" : "text-gray-500")} title="Vue kanban">
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setViewMode("calendar")} className={cn("px-2 py-1 text-xs rounded-md transition", viewMode === "calendar" ? "bg-white shadow-sm font-medium" : "text-gray-500")} title="Vue calendrier">
              <CalendarDays className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setViewMode("today")} className={cn("px-2 py-1 text-xs rounded-md transition", viewMode === "today" ? "bg-white shadow-sm font-medium" : "text-gray-500")} title="Focus du jour">
              <Sun className="h-3.5 w-3.5" />
            </button>
          </div>
          <Button onClick={toggleAddForm} size="sm" style={{ background: "#374151" }} className="text-white gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" /> Nouvelle tâche
          </Button>
        </div>
      </div>

      {/* Filters compact */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {(["all", "pending", "completed"] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)} className={cn("px-2.5 py-1 text-[11px] font-medium rounded-md transition", statusFilter === s ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100")}>
              {s === "all" ? "Toutes" : s === "pending" ? "En attente" : "Terminées"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as TaskPriority | "all")}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Priorité" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes priorités</SelectItem>
              <SelectItem value="high">Haute</SelectItem>
              <SelectItem value="medium">Moyenne</SelectItem>
              <SelectItem value="low">Basse</SelectItem>
            </SelectContent>
          </Select>
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Propriétaire" /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel className="text-[10px] uppercase tracking-wider text-gray-400">Vues rapides</SelectLabel>
                <SelectItem value="all">
                  Toute l&apos;équipe
                  <span className="text-gray-400 ml-1.5">({Array.from(assigneeCounts.values()).reduce((a, b) => a + b, 0)})</span>
                </SelectItem>
                {currentUserId && (
                  <SelectItem value="me">
                    Mes tâches
                    <span className="text-gray-400 ml-1.5">({assigneeCounts.get(currentUserId) ?? 0})</span>
                  </SelectItem>
                )}
                <SelectItem value="unassigned">
                  Non assigné
                  <span className="text-gray-400 ml-1.5">({assigneeCounts.get("__unassigned__") ?? 0})</span>
                </SelectItem>
              </SelectGroup>
              {profiles.length > 0 && (
                <>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel className="text-[10px] uppercase tracking-wider text-gray-400">Par personne</SelectLabel>
                    {profiles
                      .filter((p) => p.id !== currentUserId)
                      .map((p) => {
                        const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || "—";
                        const count = assigneeCounts.get(p.id) ?? 0;
                        return (
                          <SelectItem key={p.id} value={p.id}>
                            {name}
                            <span className="text-gray-400 ml-1.5">({count})</span>
                          </SelectItem>
                        );
                      })}
                  </SelectGroup>
                </>
              )}
            </SelectContent>
          </Select>
          <div className="relative w-48">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <Input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 pl-8 text-xs" />
          </div>
          {hasActiveFilters && (
            <button onClick={() => { setSearch(""); setPriorityFilter("all"); setStatusFilter("all"); setAssigneeFilter(roleDefaultAssignee); }} className="text-[11px] text-gray-400 hover:text-gray-600 whitespace-nowrap">
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* Inline Add Form */}
      {showAddForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Select
                value={formData.label || "_none"}
                onValueChange={(v) => {
                  const newLabel = v === "_none" ? "" : v;
                  // Pré-remplit le titre avec le label si l'utilisateur n'a rien
                  // tapé : recrée le comportement Sellsy (le type EST le titre)
                  // tout en autorisant un titre custom si l'utilisateur le veut.
                  setFormData((prev) => ({
                    ...prev,
                    label: newLabel,
                    title: prev.title.trim() || newLabel,
                  }));
                }}
              >
                <SelectTrigger className="h-9 w-44 text-xs"><SelectValue placeholder="Type…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Type —</SelectItem>
                  {SELLSY_TASK_LABELS.map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={formData.title}
                onChange={(e) => updateField("title", e.target.value)}
                placeholder={formData.label ? `Titre (par défaut : ${formData.label})…` : "Titre de la tâche..."}
                autoFocus
                className={cn("flex-1 text-sm", formErrors.title && "border-red-500")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && formData.title.trim()) handleCreate();
                  if (e.key === "Escape") setShowAddForm(false);
                }}
              />
              <Select value={formData.priority} onValueChange={(v) => updateField("priority", v)}>
                <SelectTrigger className="h-9 w-28 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Basse</SelectItem>
                  <SelectItem value="medium">Moyenne</SelectItem>
                  <SelectItem value="high">Haute</SelectItem>
                </SelectContent>
              </Select>
              <Select value={formData.assigned_to || "none"} onValueChange={(v) => updateField("assigned_to", v === "none" ? "" : v)}>
                <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Assigné à..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Non assigné</SelectItem>
                  {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.first_name} {p.last_name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={formData.due_date}
                onChange={(e) => updateField("due_date", e.target.value)}
                className="h-9 w-36 text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={formData.contact_email}
                onChange={(e) => updateField("contact_email", e.target.value)}
                placeholder="Email contact (optionnel)…"
                type="email"
                className="flex-1 text-sm h-9"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground mr-1">Rappel :</span>
              {REMINDER_PRESETS.slice(0, 4).map((preset) => {
                const presetIso = computeReminderDate(preset.days);
                const isActive = formData.reminder_at === presetIso;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => updateField("reminder_at", isActive ? "" : presetIso)}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                      isActive
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700"
                    )}
                  >
                    {preset.label}
                  </button>
                );
              })}
              {formData.reminder_at && (
                <span className="text-[11px] text-muted-foreground italic">
                  → notif {formatReminderLabel(formData.reminder_at)}
                </span>
              )}
              <div className="flex-1" />
              <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setShowAddForm(false)}>Annuler</Button>
              <Button size="sm" className="text-xs h-7 gap-1" onClick={handleCreate} disabled={saving || !formData.title.trim()}>
                {saving && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                Créer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Task list / Kanban */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ClipboardList className="h-10 w-10 text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-500">Aucune tâche trouvée</p>
          <p className="text-xs text-gray-400 mt-1">
            {hasActiveFilters ? "Modifiez vos filtres ou créez une nouvelle tâche." : "Commencez par créer votre première tâche."}
          </p>
          <Button onClick={toggleAddForm} size="sm" className="mt-3 gap-1.5 text-xs" style={{ background: "#374151" }}>
            <Plus className="h-3.5 w-3.5" /> Nouvelle tâche
          </Button>
        </div>
      ) : viewMode === "calendar" ? (
        <CalendarView tasks={tasks} onTaskClick={startEditingTask} />
      ) : viewMode === "today" ? (
        <TodayView
          overdueTasks={overdueTasks}
          todayTasks={todayTasks}
          onToggle={handleToggleComplete}
          onEdit={startEditingTask}
          completingTask={completingTask}
          completionNotes={completionNotes}
          onCompletionNotesChange={setCompletionNotes}
          onConfirmComplete={handleConfirmComplete}
          onCancelComplete={() => { setCompletingTask(null); setCompletionNotes(""); }}
        />
      ) : viewMode === "kanban" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Column: En retard */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 pb-2 border-b">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">En retard</span>
              <span className="text-[10px] text-gray-400">{kanbanOverdue.length}</span>
            </div>
            {kanbanOverdue.map(task => <TaskKanbanCard key={task.id} task={task} onToggle={handleToggleComplete} onEdit={startEditingTask} completingTask={completingTask} completionNotes={completionNotes} onCompletionNotesChange={setCompletionNotes} onConfirmComplete={handleConfirmComplete} onCancelComplete={() => { setCompletingTask(null); setCompletionNotes(""); }} />)}
          </div>

          {/* Column: Aujourd'hui */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 pb-2 border-b">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Aujourd&apos;hui</span>
              <span className="text-[10px] text-gray-400">{kanbanToday.length}</span>
            </div>
            {kanbanToday.map(task => <TaskKanbanCard key={task.id} task={task} onToggle={handleToggleComplete} onEdit={startEditingTask} completingTask={completingTask} completionNotes={completionNotes} onCompletionNotesChange={setCompletionNotes} onConfirmComplete={handleConfirmComplete} onCancelComplete={() => { setCompletingTask(null); setCompletionNotes(""); }} />)}
          </div>

          {/* Column: À venir */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 pb-2 border-b">
              <div className="w-2 h-2 rounded-full bg-gray-400" />
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">À venir</span>
              <span className="text-[10px] text-gray-400">{kanbanUpcoming.length}</span>
            </div>
            {kanbanUpcoming.map(task => <TaskKanbanCard key={task.id} task={task} onToggle={handleToggleComplete} onEdit={startEditingTask} completingTask={completingTask} completionNotes={completionNotes} onCompletionNotesChange={setCompletionNotes} onConfirmComplete={handleConfirmComplete} onCancelComplete={() => { setCompletingTask(null); setCompletionNotes(""); }} />)}
          </div>

          {/* Column: Terminées */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 pb-2 border-b">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Terminées</span>
              <span className="text-[10px] text-gray-400">{kanbanCompleted.length}</span>
            </div>
            {kanbanCompleted.map(task => <TaskKanbanCard key={task.id} task={task} onToggle={handleToggleComplete} onEdit={startEditingTask} completingTask={completingTask} completionNotes={completionNotes} onCompletionNotesChange={setCompletionNotes} onConfirmComplete={handleConfirmComplete} onCancelComplete={() => { setCompletingTask(null); setCompletionNotes(""); }} />)}
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          {/* Overdue */}
          {overdueTasks.length > 0 && (
            <>
              <p className="text-xs font-semibold text-red-500 uppercase tracking-wider mt-4 mb-2 flex items-center gap-1.5">
                <AlertCircle className="h-3 w-3" /> En retard ({overdueTasks.length})
              </p>
              <div className="space-y-1">
                {overdueTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    getProfileName={getProfileName}
                    onToggleComplete={() => handleToggleComplete(task)}
                    onEdit={() => startEditingTask(task)}
                    onDelete={() => openDeleteDialog(task)}
                    isOverdue
                    isEditing={editingTaskId === task.id}
                    editFormData={editingTaskId === task.id ? formData : undefined}
                    editFormErrors={editingTaskId === task.id ? formErrors : undefined}
                    onUpdateField={editingTaskId === task.id ? updateField : undefined}
                    onSaveEdit={editingTaskId === task.id ? handleUpdate : undefined}
                    onCancelEdit={() => { setEditingTaskId(null); setSelectedTask(null); setFormData(EMPTY_FORM); }}
                    saving={saving}
                    profiles={profiles}
                    prospects={prospects}
                    clients={clients}
                    completingTask={completingTask}
                    completionNotes={completionNotes}
                    onCompletionNotesChange={setCompletionNotes}
                    onConfirmComplete={handleConfirmComplete}
                    onCancelComplete={() => { setCompletingTask(null); setCompletionNotes(""); }}
                  />
                ))}
              </div>
            </>
          )}

          {/* Reminders */}
          {reminderTasks.length > 0 && (
            <>
              <p className="text-xs font-semibold text-amber-500 uppercase tracking-wider mt-4 mb-2 flex items-center gap-1.5">
                <Bell className="h-3 w-3" /> Rappels ({reminderTasks.length})
              </p>
              <div className="space-y-1">
                {reminderTasks.map((task) => (
                  <TaskRow
                    key={`reminder-${task.id}`}
                    task={task}
                    getProfileName={getProfileName}
                    onToggleComplete={() => handleToggleComplete(task)}
                    onEdit={() => startEditingTask(task)}
                    onDelete={() => openDeleteDialog(task)}
                    isEditing={editingTaskId === task.id}
                    editFormData={editingTaskId === task.id ? formData : undefined}
                    editFormErrors={editingTaskId === task.id ? formErrors : undefined}
                    onUpdateField={editingTaskId === task.id ? updateField : undefined}
                    onSaveEdit={editingTaskId === task.id ? handleUpdate : undefined}
                    onCancelEdit={() => { setEditingTaskId(null); setSelectedTask(null); setFormData(EMPTY_FORM); }}
                    saving={saving}
                    profiles={profiles}
                    prospects={prospects}
                    clients={clients}
                    completingTask={completingTask}
                    completionNotes={completionNotes}
                    onCompletionNotesChange={setCompletionNotes}
                    onConfirmComplete={handleConfirmComplete}
                    onCancelComplete={() => { setCompletingTask(null); setCompletionNotes(""); }}
                  />
                ))}
              </div>
            </>
          )}

          {/* Today */}
          {todayTasks.length > 0 && (
            <>
              <p className="text-xs font-semibold text-blue-500 uppercase tracking-wider mt-4 mb-2 flex items-center gap-1.5">
                <Clock className="h-3 w-3" /> Aujourd&apos;hui ({todayTasks.length})
              </p>
              <div className="space-y-1">
                {todayTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    getProfileName={getProfileName}
                    onToggleComplete={() => handleToggleComplete(task)}
                    onEdit={() => startEditingTask(task)}
                    onDelete={() => openDeleteDialog(task)}
                    isEditing={editingTaskId === task.id}
                    editFormData={editingTaskId === task.id ? formData : undefined}
                    editFormErrors={editingTaskId === task.id ? formErrors : undefined}
                    onUpdateField={editingTaskId === task.id ? updateField : undefined}
                    onSaveEdit={editingTaskId === task.id ? handleUpdate : undefined}
                    onCancelEdit={() => { setEditingTaskId(null); setSelectedTask(null); setFormData(EMPTY_FORM); }}
                    saving={saving}
                    profiles={profiles}
                    prospects={prospects}
                    clients={clients}
                    completingTask={completingTask}
                    completionNotes={completionNotes}
                    onCompletionNotesChange={setCompletionNotes}
                    onConfirmComplete={handleConfirmComplete}
                    onCancelComplete={() => { setCompletingTask(null); setCompletionNotes(""); }}
                  />
                ))}
              </div>
            </>
          )}

          {/* Upcoming */}
          {upcomingTasks.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-4 mb-2 flex items-center gap-1.5">
                <Calendar className="h-3 w-3" /> À venir ({upcomingTasks.length})
              </p>
              <div className="space-y-1">
                {upcomingTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    getProfileName={getProfileName}
                    onToggleComplete={() => handleToggleComplete(task)}
                    onEdit={() => startEditingTask(task)}
                    onDelete={() => openDeleteDialog(task)}
                    isEditing={editingTaskId === task.id}
                    editFormData={editingTaskId === task.id ? formData : undefined}
                    editFormErrors={editingTaskId === task.id ? formErrors : undefined}
                    onUpdateField={editingTaskId === task.id ? updateField : undefined}
                    onSaveEdit={editingTaskId === task.id ? handleUpdate : undefined}
                    onCancelEdit={() => { setEditingTaskId(null); setSelectedTask(null); setFormData(EMPTY_FORM); }}
                    saving={saving}
                    profiles={profiles}
                    prospects={prospects}
                    clients={clients}
                    completingTask={completingTask}
                    completionNotes={completionNotes}
                    onCompletionNotesChange={setCompletionNotes}
                    onConfirmComplete={handleConfirmComplete}
                    onCancelComplete={() => { setCompletingTask(null); setCompletionNotes(""); }}
                  />
                ))}
              </div>
            </>
          )}

          {/* Tasks with no due date */}
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
              <>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-4 mb-2 flex items-center gap-1.5">
                  <ClipboardList className="h-3 w-3" /> Sans échéance ({others.length})
                </p>
                <div className="space-y-1">
                  {others.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      getProfileName={getProfileName}
                      onToggleComplete={() => handleToggleComplete(task)}
                      onEdit={() => startEditingTask(task)}
                      onDelete={() => openDeleteDialog(task)}
                      isEditing={editingTaskId === task.id}
                      editFormData={editingTaskId === task.id ? formData : undefined}
                      editFormErrors={editingTaskId === task.id ? formErrors : undefined}
                      onUpdateField={editingTaskId === task.id ? updateField : undefined}
                      onSaveEdit={editingTaskId === task.id ? handleUpdate : undefined}
                      onCancelEdit={() => { setEditingTaskId(null); setSelectedTask(null); setFormData(EMPTY_FORM); }}
                      saving={saving}
                      profiles={profiles}
                      prospects={prospects}
                      clients={clients}
                      completingTask={completingTask}
                      completionNotes={completionNotes}
                      onCompletionNotesChange={setCompletionNotes}
                      onConfirmComplete={handleConfirmComplete}
                      onCancelComplete={() => { setCompletingTask(null); setCompletionNotes(""); }}
                    />
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
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
  isEditing?: boolean;
  editFormData?: TaskFormData;
  editFormErrors?: Partial<Record<keyof TaskFormData, string>>;
  onUpdateField?: (field: keyof TaskFormData, value: string) => void;
  onSaveEdit?: () => void;
  onCancelEdit?: () => void;
  saving?: boolean;
  profiles?: Profile[];
  prospects?: CrmProspect[];
  clients?: Client[];
  completingTask?: CrmTask | null;
  completionNotes?: string;
  onCompletionNotesChange?: (v: string) => void;
  onConfirmComplete?: () => void;
  onCancelComplete?: () => void;
}

function TaskRow({
  task, getProfileName, onToggleComplete, onEdit, onDelete, isOverdue,
  isEditing, editFormData, editFormErrors, onUpdateField, onSaveEdit, onCancelEdit, saving,
  profiles, prospects, clients,
  completingTask, completionNotes, onCompletionNotesChange, onConfirmComplete, onCancelComplete,
}: TaskRowProps) {
  const router = useRouter();
  const isCompleted = task.status === "completed";
  const profileName = getProfileName(task.assigned_to);

  if (isEditing && editFormData && onUpdateField && onSaveEdit && onCancelEdit) {
    return (
      <div
        className={cn(
          "rounded-lg border bg-white p-4 border-l-4 shadow-sm space-y-3",
          PRIORITY_BORDER[editFormData.priority as TaskPriority]
        )}
      >
        <div className="flex items-center gap-2">
          <Input
            value={editFormData.title}
            onChange={(e) => onUpdateField("title", e.target.value)}
            placeholder="Titre de la tâche..."
            autoFocus
            className={cn("flex-1 text-sm", editFormErrors?.title && "border-red-500")}
            onKeyDown={(e) => {
              if (e.key === "Enter" && editFormData.title.trim()) onSaveEdit();
              if (e.key === "Escape") onCancelEdit();
            }}
          />
        </div>
        <Textarea
          value={editFormData.description}
          onChange={(e) => onUpdateField("description", e.target.value)}
          placeholder="Description..."
          rows={2}
          className="resize-none text-sm"
        />
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={editFormData.priority} onValueChange={(v) => onUpdateField("priority", v)}>
            <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Basse</SelectItem>
              <SelectItem value="medium">Moyenne</SelectItem>
              <SelectItem value="high">Haute</SelectItem>
            </SelectContent>
          </Select>
          <Select value={editFormData.status} onValueChange={(v) => onUpdateField("status", v)}>
            <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">En attente</SelectItem>
              <SelectItem value="in_progress">En cours</SelectItem>
              <SelectItem value="completed">Terminée</SelectItem>
              <SelectItem value="cancelled">Annulée</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={editFormData.due_date}
            onChange={(e) => onUpdateField("due_date", e.target.value)}
            className="h-8 w-36 text-xs"
          />
          <Select value={editFormData.assigned_to || "_none"} onValueChange={(v) => onUpdateField("assigned_to", v === "_none" ? "" : v)}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Assigné à" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Non assigné</SelectItem>
              {profiles?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {[p.first_name, p.last_name].filter(Boolean).join(" ") || p.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={editFormData.prospect_id || "_none"} onValueChange={(v) => onUpdateField("prospect_id", v === "_none" ? "" : v)}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Prospect" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Aucun prospect</SelectItem>
              {prospects?.map((p) => <SelectItem key={p.id} value={p.id}>{p.company_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={editFormData.client_id || "_none"} onValueChange={(v) => onUpdateField("client_id", v === "_none" ? "" : v)}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Client" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Aucun client</SelectItem>
              {clients?.map((c) => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" className="text-xs h-7" onClick={onCancelEdit}>Annuler</Button>
          <Button size="sm" className="text-xs h-7 gap-1" onClick={onSaveEdit} disabled={saving || !editFormData.title.trim()}>
            {saving && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />}
            Enregistrer
          </Button>
        </div>
      </div>
    );
  }

  const priorityDotColor = task.priority === "high" ? "bg-red-500" : task.priority === "medium" ? "bg-amber-400" : "bg-gray-300";

  const handleRowClick = () => {
    if (task.prospect_id) {
      router.push(`/admin/crm/prospects/${task.prospect_id}`);
    } else if (task.client_id) {
      router.push(`/admin/clients/${task.client_id}`);
    } else {
      onEdit();
    }
  };

  return (
    <div
      onClick={handleRowClick}
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-white px-3 py-2.5 hover:bg-gray-50/80 transition-colors cursor-pointer",
        isCompleted && "opacity-50"
      )}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={isCompleted}
          onCheckedChange={onToggleComplete}
          className="flex-shrink-0"
        />
      </div>
      <span className={cn("h-2 w-2 rounded-full flex-shrink-0", priorityDotColor)} title={TASK_PRIORITY_LABELS[task.priority]} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {(() => {
            // Cf. TaskKanbanCard : fallback intelligent du titre quand la donnée
            // Sellsy historique a un title générique (= label). On évite ainsi
            // 32% des lignes affichant "Relance par téléphone/mail" en doublon
            // avec le badge label.
            const titleIsGeneric = isGenericTaskTitle(task.title, task.label);
            const displayTitle = titleIsGeneric
              ? (task.description?.trim() || task.prospect?.company_name || task.title)
              : task.title;
            const showDescriptionInline = !titleIsGeneric && task.description;
            return (
              <>
                <p className={cn("text-sm font-medium text-gray-900 truncate", isCompleted && "line-through text-gray-400")}>
                  {displayTitle}
                </p>
                {showDescriptionInline && (
                  <p className="text-xs text-gray-400 truncate hidden sm:block">{task.description}</p>
                )}
              </>
            );
          })()}
        </div>

        <div className="mt-0.5 flex items-center gap-3 flex-wrap text-[11px] text-gray-400">
          {task.label && (() => {
            const s = crmTaskLabelStyle(task.label);
            return (
              <span className={cn("flex items-center gap-1 rounded px-1.5 py-0.5 font-medium", s.bg, s.text)}>
                <Tag className="h-2.5 w-2.5" />
                {task.label}
              </span>
            );
          })()}
          {task.sellsy_external_ref && (
            <span className="flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">
              <Download className="h-2.5 w-2.5" />
              Sellsy
            </span>
          )}
          {task.due_date && (
            <span className={cn("flex items-center gap-1", isOverdue && !isCompleted && "text-red-600 font-medium")}>
              <Calendar className="h-3 w-3" />
              {isOverdue && !isCompleted && "En retard · "}
              {formatDate(task.due_date)}
            </span>
          )}
          {task.reminder_at && !isCompleted && (() => {
            const status = getReminderStatus(task.reminder_at);
            return (
              <span className={cn(
                "flex items-center gap-1",
                status === "past" ? "text-red-500 font-medium" :
                status === "today" ? "text-amber-600 font-medium" :
                "text-gray-400"
              )}>
                <Bell className="h-3 w-3" />
                {formatReminderLabel(task.reminder_at)}
              </span>
            );
          })()}
          {profileName ? (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              Assigné : {profileName}
            </span>
          ) : task.creator && (
            <span className="flex items-center gap-1 italic">
              <User className="h-3 w-3" />
              Créé par {task.creator.first_name} {task.creator.last_name}
            </span>
          )}
          {task.contact_email && (
            <a
              href={`mailto:${task.contact_email}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-blue-600 hover:underline truncate max-w-[220px]"
              title={task.contact_email}
            >
              <Mail className="h-3 w-3" />
              {task.contact_email}
            </a>
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
        {task.completion_notes && task.status === "completed" && (
          <p className="text-xs text-gray-500 italic mt-1 pl-4">{"\uD83D\uDCDD"} {task.completion_notes}</p>
        )}
        {completingTask?.id === task.id && onCompletionNotesChange && onConfirmComplete && onCancelComplete && (
          <div className="mt-2 border rounded-lg p-3 bg-gray-50/50 space-y-2">
            <Textarea
              value={completionNotes ?? ""}
              onChange={(e) => onCompletionNotesChange(e.target.value)}
              placeholder="Notes de complétion (ex: résumé de l'appel, décision prise...)"
              rows={2}
              autoFocus
              className="text-sm resize-none"
            />
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400 flex-1">Optionnel — ces notes apparaîtront dans la timeline du prospect</span>
              <Button size="sm" variant="ghost" className="text-xs h-6" onClick={() => onCancelComplete()}>Annuler</Button>
              <Button size="sm" className="text-xs h-6" onClick={() => onConfirmComplete()}>Terminer</Button>
            </div>
          </div>
        )}
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


