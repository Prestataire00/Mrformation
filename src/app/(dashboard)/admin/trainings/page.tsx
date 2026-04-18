"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { useDebounce } from "@/hooks/useDebounce";
import { cn, formatDate } from "@/lib/utils";
import { exportToCSV } from "@/lib/utils/export-csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchSelect } from "@/components/ui/search-select";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import {
  Plus,
  Search,
  MoreHorizontal,
  Trash2,
  BookOpen,
  Users,
  MapPin,
  CalendarDays,
  Loader2,
  Wifi,
  Monitor,
  LayoutGrid,
  LayoutList,
  CheckCircle,
  Briefcase,
  Shield,
  Download,
} from "lucide-react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SessionCard {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  location: string | null;
  mode: string;
  status: string;
  max_participants: number | null;
  notes: string | null;
  type: string | null;
  program_id: string | null;
  training_id: string | null;
  is_subcontracted?: boolean;
  qualiopi_score?: number;
  program?: { id: string; title: string; description: string | null } | null;
  training?: { title: string } | null;
  formation_trainers?: Array<{ trainer: { first_name: string; last_name: string } | null }>;
  enrollments?: Array<{ id: string }>;
}

interface ProgramOption {
  id: string;
  title: string;
  description: string | null;
  objectives: string | null;
  duration_hours: number | null;
}

interface SessionFormData {
  program_id: string;
  title: string;
  start_date: string;
  end_date: string;
  mode: "presentiel" | "distanciel" | "hybride";
  type: "intra" | "inter";
  location: string;
  visio_link: string;
  max_participants: string;
  notes: string;
  is_subcontracted: boolean;
}

const emptyForm: SessionFormData = {
  program_id: "",
  title: "",
  start_date: "",
  end_date: "",
  mode: "presentiel",
  type: "intra",
  location: "",
  visio_link: "",
  max_participants: "",
  notes: "",
  is_subcontracted: false,
};

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  upcoming:    { label: "À venir",    color: "bg-blue-100 text-blue-700" },
  in_progress: { label: "En cours",   color: "bg-amber-100 text-amber-700" },
  completed:   { label: "Terminée",   color: "bg-green-100 text-green-700" },
  cancelled:   { label: "Annulée",    color: "bg-gray-100 text-gray-500" },
};

const MODE_CONFIG: Record<string, { label: string; icon: typeof MapPin }> = {
  presentiel: { label: "Présentiel", icon: MapPin },
  distanciel: { label: "Distanciel", icon: Wifi },
  hybride:    { label: "Hybride",    icon: Monitor },
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default function FormationsPage() {
  const supabase = createClient();
  const { toast } = useToast();
  const { entityId } = useEntity();

  // Data
  const [sessions, setSessions] = useState<SessionCard[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all");

  // Inline creation form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState<SessionFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);

  // View mode
  const [viewMode, setViewMode] = useState<"grid" | "kanban">("grid");

  // Delete
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<SessionCard | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Fetch sessions ─────────────────────────────────────────────────────────

  const fetchSessions = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("sessions")
      .select(`
        id, title, start_date, end_date, location, mode, status, max_participants, notes, type, program_id, training_id, is_subcontracted, qualiopi_score,
        program:programs(id, title, description),
        training:trainings(title),
        formation_trainers(trainer:trainers(first_name, last_name)),
        enrollments(id)
      `)
      .eq("entity_id", entityId)
      .order("start_date", { ascending: false });

    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les formations.", variant: "destructive" });
    } else {
      // Auto-compute status based on dates
      const now = new Date();
      const mapped = (data || []).map((s: Record<string, unknown>) => {
        const startDate = new Date(s.start_date as string);
        const endDate = new Date(s.end_date as string);
        let computedStatus = s.status as string;
        if (computedStatus !== "cancelled") {
          if (now >= endDate) computedStatus = "completed";
          else if (now >= startDate) computedStatus = "in_progress";
          else computedStatus = "upcoming";
        }
        return { ...s, status: computedStatus };
      });
      setSessions(mapped as SessionCard[]);
    }
    setLoading(false);
  }, [entityId, supabase, toast]);

  // ── Fetch programs for picker ──────────────────────────────────────────────

  const fetchPrograms = useCallback(async () => {
    if (!entityId) return;
    const { data } = await supabase
      .from("programs")
      .select("id, title, description, objectives, duration_hours")
      .eq("entity_id", entityId)
      .eq("is_active", true)
      .order("title");
    setPrograms((data ?? []) as ProgramOption[]);
  }, [entityId, supabase]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // ── Filtering ──────────────────────────────────────────────────────────────

  const filtered = sessions.filter((s) => {
    const q = debouncedSearch.toLowerCase();
    const matchSearch =
      !q ||
      s.title.toLowerCase().includes(q) ||
      s.program?.title.toLowerCase().includes(q) ||
      s.training?.title.toLowerCase().includes(q) ||
      s.location?.toLowerCase().includes(q) ||
      s.formation_trainers?.some((ft) =>
        `${ft.trainer?.first_name} ${ft.trainer?.last_name}`.toLowerCase().includes(q)
      );
    const matchStatus = statusFilter === "all" || s.status === statusFilter;
    const matchMode = modeFilter === "all" || s.mode === modeFilter;
    return matchSearch && matchStatus && matchMode;
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  const getEnrollmentCount = (s: SessionCard) => s.enrollments?.length ?? 0;

  // ── Open inline create form ─────────────────────────────────────────────

  function openCreateForm() {
    setFormData(emptyForm);
    setShowCreateForm(true);
    fetchPrograms();
  }

  // ── Save session ──────────────────────────────────────────────────────────

  async function handleCreateSession() {
    if (!formData.title.trim()) {
      toast({ title: "Titre requis", variant: "destructive" });
      return;
    }
    if (!formData.start_date || !formData.end_date) {
      toast({ title: "Dates requises", description: "Les dates de début et de fin sont obligatoires.", variant: "destructive" });
      return;
    }
    if (new Date(formData.start_date) >= new Date(formData.end_date)) {
      toast({ title: "Dates invalides", description: "La date de fin doit être après la date de début.", variant: "destructive" });
      return;
    }

    setSaving(true);
    const payload = {
      entity_id: entityId,
      title: formData.title.trim(),
      program_id: formData.program_id || null,
      start_date: new Date(formData.start_date).toISOString(),
      end_date: new Date(formData.end_date).toISOString(),
      mode: formData.mode,
      type: formData.type,
      location: formData.mode !== "distanciel" ? (formData.location.trim() || null) : null,
      visio_link: formData.mode !== "presentiel" ? (formData.visio_link.trim() || null) : null,
      max_participants: formData.max_participants ? parseInt(formData.max_participants) : null,
      notes: formData.notes.trim() || null,
      status: "upcoming",
      is_subcontracted: formData.is_subcontracted,
    };

    const { error } = await supabase.from("sessions").insert(payload);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Session planifiée" });
      setShowCreateForm(false);
      setFormData(emptyForm);
      fetchSessions();
    }
    setSaving(false);
  }

  // ── Complete session (Kanban) ──────────────────────────────────────────────

  async function handleCompleteSession(sessionId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const { error } = await supabase
      .from("sessions")
      .update({ status: "completed", is_completed: true })
      .eq("id", sessionId);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Session marquée comme terminée" });
      fetchSessions();
    }
  }

  // ── Delete session ────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!sessionToDelete) return;
    setDeleting(true);
    const { error } = await supabase.from("sessions").delete().eq("id", sessionToDelete.id);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Session supprimée" });
      setSessions((prev) => prev.filter((s) => s.id !== sessionToDelete.id));
    }
    setDeleting(false);
    setDeleteDialogOpen(false);
    setSessionToDelete(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold text-gray-900">Formations</h1>
        <span className="text-xs text-gray-400">{sessions.length} session{sessions.length !== 1 ? "s" : ""}</span>
        <div className="flex-1" />
        <div className="flex items-center gap-1 border rounded-md p-0.5">
          <Button
            variant={viewMode === "grid" ? "default" : "ghost"}
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setViewMode("grid")}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={viewMode === "kanban" ? "default" : "ghost"}
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setViewMode("kanban")}
          >
            <LayoutList className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={() => {
          exportToCSV(filtered.map(s => ({
            titre: s.title,
            debut: s.start_date,
            fin: s.end_date,
            statut: s.status,
            mode: s.mode,
            type: s.type || "",
            lieu: s.location || "",
            apprenants: String(s.enrollments?.length || 0),
          })), `formations-${new Date().toISOString().split("T")[0]}`);
        }}>
          <Download className="h-3.5 w-3.5" /> CSV
        </Button>
        <Button size="sm" onClick={openCreateForm} className="gap-1.5 h-8 text-xs">
          <Plus className="h-3.5 w-3.5" />
          Planifier une session
        </Button>
      </div>

      {/* Inline creation form */}
      {showCreateForm && (
        <div className="border rounded-lg p-4 bg-gray-50/50 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <Input
              placeholder="Titre de la session *"
              autoFocus
              className="h-8 text-sm"
              value={formData.title}
              onChange={(e) => setFormData((f) => ({ ...f, title: e.target.value }))}
            />
            <Input
              type="date"
              className="h-8 text-sm"
              value={formData.start_date}
              onChange={(e) => {
                const val = e.target.value;
                setFormData((f) => ({
                  ...f,
                  start_date: val,
                  end_date: f.end_date || val,
                }));
              }}
            />
            <Input
              type="date"
              className="h-8 text-sm"
              value={formData.end_date}
              onChange={(e) => setFormData((f) => ({ ...f, end_date: e.target.value }))}
            />
            <Select value={formData.mode} onValueChange={(v) => setFormData((f) => ({ ...f, mode: v as SessionFormData["mode"] }))}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Mode" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="presentiel">Présentiel</SelectItem>
                <SelectItem value="distanciel">Distanciel</SelectItem>
                <SelectItem value="hybride">Hybride</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={formData.type} onValueChange={(v) => setFormData((f) => ({ ...f, type: v as "intra" | "inter" }))}>
              <SelectTrigger className="h-8 text-sm w-40"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="intra">INTRA — Chez le client</SelectItem>
                <SelectItem value="inter">INTER — Inter-entreprises</SelectItem>
              </SelectContent>
            </Select>
            <div className="w-48">
              <SearchSelect
                options={programs.map((p) => ({ value: p.id, label: p.title, sublabel: p.description || "" }))}
                onSelect={(v) => setFormData((f) => ({ ...f, program_id: v }))}
                placeholder="Programme (optionnel)"
              />
              {formData.program_id && (
                <button onClick={() => setFormData((f) => ({ ...f, program_id: "" }))} className="text-[10px] text-gray-400 hover:text-gray-600 mt-0.5">
                  {programs.find(p => p.id === formData.program_id)?.title} ✕
                </button>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={formData.is_subcontracted}
                onCheckedChange={(checked) => setFormData((f) => ({ ...f, is_subcontracted: checked === true }))}
              />
              <span className="text-xs text-gray-600">Sous-traitance</span>
            </label>
            {formData.is_subcontracted && (
              <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded">Les automatisations de sous-traitance seront activées</span>
            )}
            <div className="flex-1" />
            <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setShowCreateForm(false)}>Annuler</Button>
            <Button size="sm" className="text-xs h-7" onClick={handleCreateSession} disabled={saving}>
              {saving ? "Création…" : "Créer"}
            </Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="upcoming">À venir</SelectItem>
            <SelectItem value="in_progress">En cours</SelectItem>
            <SelectItem value="completed">Terminées</SelectItem>
            <SelectItem value="cancelled">Annulées</SelectItem>
          </SelectContent>
        </Select>
        <Select value={modeFilter} onValueChange={setModeFilter}>
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue placeholder="Mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les modes</SelectItem>
            <SelectItem value="presentiel">Présentiel</SelectItem>
            <SelectItem value="distanciel">Distanciel</SelectItem>
            <SelectItem value="hybride">Hybride</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <BookOpen className="h-12 w-12 mb-3 text-gray-300" />
          <p className="font-medium text-gray-500">Aucune formation trouvée</p>
          <p className="text-sm mt-1">Modifiez vos filtres ou planifiez une session.</p>
        </div>
      ) : viewMode === "kanban" ? (
        /* ═══ VUE KANBAN ═══ */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(["upcoming", "in_progress", "completed"] as const).map((col) => {
            const colCfg = STATUS_CONFIG[col];
            const colSessions = filtered.filter((s) => s.status === col);
            return (
              <div key={col} className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <span className={cn("inline-block w-2.5 h-2.5 rounded-full", col === "upcoming" ? "bg-blue-500" : col === "in_progress" ? "bg-amber-500" : "bg-green-500")} />
                  <span className="text-sm font-semibold text-gray-700">{colCfg.label}</span>
                  <Badge variant="outline" className="text-[10px] ml-auto">{colSessions.length}</Badge>
                </div>
                <div className="space-y-2 min-h-[100px]">
                  {colSessions.map((session) => {
                    const modeCfg = MODE_CONFIG[session.mode] ?? { label: session.mode, icon: MapPin };
                    const ModeIcon = modeCfg.icon;
                    const enrollCount = getEnrollmentCount(session);
                    const trainerName = session.formation_trainers?.[0]?.trainer
                      ? `${session.formation_trainers[0].trainer.first_name} ${session.formation_trainers[0].trainer.last_name}`
                      : null;

                    return (
                      <Link key={session.id} href={`/admin/formations/${session.id}`}>
                        <Card className="overflow-hidden transition-shadow hover:shadow-md cursor-pointer">
                          <CardContent className="p-3 space-y-2">
                            <h4 className="text-sm font-semibold text-gray-900 line-clamp-2">{session.title}</h4>
                            <div className="flex items-center gap-1.5 text-xs text-gray-500">
                              <CalendarDays className="h-3 w-3" />
                              <span>{formatDate(session.start_date)} — {formatDate(session.end_date)}</span>
                            </div>
                            {trainerName && (
                              <p className="text-xs text-gray-500 truncate">{trainerName}</p>
                            )}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge variant="outline" className="text-[10px] font-medium gap-1">
                                <ModeIcon className="h-3 w-3" />
                                {modeCfg.label}
                              </Badge>
                              {session.is_subcontracted && (
                                <Badge variant="outline" className="text-[10px] font-medium gap-1 border-purple-300 text-purple-700">
                                  <Briefcase className="h-3 w-3" /> Sous-traitance
                                </Badge>
                              )}
                              {(session.qualiopi_score ?? 0) > 0 && (
                                <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                                  (session.qualiopi_score ?? 0) >= 67 ? "bg-green-100 text-green-700" :
                                  (session.qualiopi_score ?? 0) >= 34 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                                )}>
                                  <Shield className="h-2.5 w-2.5" /> {session.qualiopi_score}%
                                </span>
                              )}
                              <div className="flex items-center gap-1 text-[10px] text-gray-400 ml-auto">
                                <Users className="h-3 w-3" />
                                {enrollCount}
                              </div>
                            </div>
                            {col === "in_progress" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full h-7 text-xs gap-1 mt-1 border-green-300 text-green-700 hover:bg-green-50"
                                onClick={(e) => handleCompleteSession(session.id, e)}
                              >
                                <CheckCircle className="h-3 w-3" /> Terminer
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                  {colSessions.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-6">Aucune session</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ═══ VUE CARDS ═══ */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((session) => {
            const statusCfg = STATUS_CONFIG[session.status] ?? { label: session.status, color: "bg-gray-100 text-gray-600" };
            const modeCfg = MODE_CONFIG[session.mode] ?? { label: session.mode, icon: MapPin };
            const ModeIcon = modeCfg.icon;
            const enrollCount = getEnrollmentCount(session);

            return (
              <Link key={session.id} href={`/admin/formations/${session.id}`}>
                <Card className="overflow-hidden transition-shadow hover:shadow-md cursor-pointer">
                  <CardHeader className="pb-2 pt-3 px-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2 flex-1 min-w-0">
                        {session.title}
                      </h3>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 flex-shrink-0">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/formations/${session.id}`} className="gap-2">
                              <BookOpen className="h-4 w-4" />
                              Gérer
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={(e) => { e.preventDefault(); setSessionToDelete(session); setDeleteDialogOpen(true); }}
                            className="gap-2 text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-2 pb-3 px-4">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <CalendarDays className="h-3 w-3 text-gray-400" />
                      <span>{formatDate(session.start_date)} — {formatDate(session.end_date)}</span>
                    </div>

                    {session.location && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <MapPin className="h-3 w-3 text-gray-400" />
                        <span className="truncate">{session.location}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge className={cn("text-[10px] border-0 font-medium", statusCfg.color)}>
                        {statusCfg.label}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] font-medium gap-1">
                        <ModeIcon className="h-3 w-3" />
                        {modeCfg.label}
                      </Badge>
                      {session.is_subcontracted && (
                        <Badge variant="outline" className="text-[10px] font-medium gap-1 border-purple-300 text-purple-700">
                          <Briefcase className="h-3 w-3" /> S-T
                        </Badge>
                      )}
                      {(session.qualiopi_score ?? 0) > 0 && (
                        <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                          (session.qualiopi_score ?? 0) >= 67 ? "bg-green-100 text-green-700" :
                          (session.qualiopi_score ?? 0) >= 34 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                        )}>
                          <Shield className="h-2.5 w-2.5" /> {session.qualiopi_score}%
                        </span>
                      )}
                      <div className="flex items-center gap-1 text-[10px] text-gray-400 ml-auto">
                        <Users className="h-3 w-3" />
                        {enrollCount}{session.max_participants ? `/${session.max_participants}` : ""}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* DELETE DIALOG                                                        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600">Supprimer la session</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Êtes-vous sûr de vouloir supprimer <strong>{sessionToDelete?.title}</strong> ? Cette action est irréversible.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(false)}>Annuler</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Suppression…" : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
