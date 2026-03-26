"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { useDebounce } from "@/hooks/useDebounce";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
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
  Clock,
  Users,
  ChevronRight,
  Library,
  MapPin,
  Video,
  CalendarDays,
  Loader2,
  Wifi,
  Monitor,
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

  // Creation dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState<SessionFormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Program picker
  const [programPickerOpen, setProgramPickerOpen] = useState(false);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [programSearch, setProgramSearch] = useState("");
  const [loadingPrograms, setLoadingPrograms] = useState(false);

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
        id, title, start_date, end_date, location, mode, status, max_participants, notes, type, program_id, training_id,
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
    setLoadingPrograms(true);
    const { data } = await supabase
      .from("programs")
      .select("id, title, description, objectives, duration_hours")
      .eq("entity_id", entityId)
      .eq("is_active", true)
      .order("title");
    setPrograms((data ?? []) as ProgramOption[]);
    setLoadingPrograms(false);
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

  const getFormationName = (s: SessionCard) => s.program?.title || s.training?.title || null;
  const getTrainerNames = (s: SessionCard) =>
    (s.formation_trainers || [])
      .map((ft) => ft.trainer ? `${ft.trainer.first_name} ${ft.trainer.last_name}` : null)
      .filter(Boolean)
      .join(", ");
  const getEnrollmentCount = (s: SessionCard) => s.enrollments?.length ?? 0;

  // ── Open creation dialog ──────────────────────────────────────────────────

  function openCreateDialog() {
    setFormData(emptyForm);
    setProgramPickerOpen(true);
    fetchPrograms();
  }

  function selectProgram(program: ProgramOption) {
    setFormData({
      ...emptyForm,
      program_id: program.id,
      title: program.title,
    });
    setProgramPickerOpen(false);
    setDialogOpen(true);
  }

  // ── Save session ──────────────────────────────────────────────────────────

  async function handleSave() {
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
    if (!formData.program_id) {
      toast({ title: "Programme requis", description: "Sélectionnez un programme.", variant: "destructive" });
      return;
    }

    setSaving(true);
    const payload = {
      entity_id: entityId,
      title: formData.title.trim(),
      program_id: formData.program_id,
      start_date: new Date(formData.start_date).toISOString(),
      end_date: new Date(formData.end_date).toISOString(),
      mode: formData.mode,
      type: formData.type,
      location: formData.mode !== "distanciel" ? (formData.location.trim() || null) : null,
      visio_link: formData.mode !== "presentiel" ? (formData.visio_link.trim() || null) : null,
      max_participants: formData.max_participants ? parseInt(formData.max_participants) : null,
      notes: formData.notes.trim() || null,
      status: "upcoming",
    };

    const { error } = await supabase.from("sessions").insert(payload);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Session planifiée" });
      setDialogOpen(false);
      setFormData(emptyForm);
      fetchSessions();
    }
    setSaving(false);
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Formations</h1>
          <p className="text-sm text-gray-500 mt-1">
            {sessions.length} session{sessions.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={openCreateDialog} className="gap-2">
          <Plus className="h-4 w-4" />
          Planifier une session
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Rechercher par titre, programme, formateur, lieu…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44">
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
          <SelectTrigger className="w-full sm:w-44">
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

      {/* Grid */}
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
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((session) => {
            const statusCfg = STATUS_CONFIG[session.status] ?? { label: session.status, color: "bg-gray-100 text-gray-600" };
            const modeCfg = MODE_CONFIG[session.mode] ?? { label: session.mode, icon: MapPin };
            const ModeIcon = modeCfg.icon;
            const programName = getFormationName(session);
            const trainerStr = getTrainerNames(session);
            const enrollCount = getEnrollmentCount(session);

            return (
              <Card key={session.id} className="flex flex-col overflow-hidden transition-shadow hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {programName && (
                        <div className="flex items-center gap-1.5 mb-1">
                          <Library className="h-3 w-3 text-indigo-500 flex-shrink-0" />
                          <span className="text-xs font-medium text-indigo-600 truncate">{programName}</span>
                        </div>
                      )}
                      <h3 className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2">
                        {session.title}
                      </h3>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 flex-shrink-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/admin/formations/${session.id}`} className="gap-2">
                            <BookOpen className="h-4 w-4" />
                            Gérer la formation
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => { setSessionToDelete(session); setDeleteDialogOpen(true); }}
                          className="gap-2 text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                          Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 space-y-3">
                  {/* Dates */}
                  <div className="flex items-center gap-1.5 text-xs text-gray-600">
                    <CalendarDays className="h-3.5 w-3.5 text-gray-400" />
                    <span>
                      Du {formatDate(session.start_date)} au {formatDate(session.end_date)}
                    </span>
                  </div>

                  {/* Location or Visio */}
                  {session.location && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      <MapPin className="h-3.5 w-3.5 text-gray-400" />
                      <span className="truncate">{session.location}</span>
                    </div>
                  )}

                  {/* Badges */}
                  <div className="flex flex-wrap gap-1.5">
                    <Badge className={cn("text-[10px] border-0 font-medium", statusCfg.color)}>
                      {statusCfg.label}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] font-medium gap-1">
                      <ModeIcon className="h-3 w-3" />
                      {modeCfg.label}
                    </Badge>
                    {session.type && (
                      <Badge variant="outline" className="text-[10px] font-medium uppercase">
                        {session.type}
                      </Badge>
                    )}
                  </div>

                  {/* Footer info */}
                  <div className="flex items-center gap-4 text-xs text-gray-500 pt-1">
                    {trainerStr && (
                      <span className="truncate">{trainerStr}</span>
                    )}
                    <div className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-gray-400" />
                      <span>
                        {enrollCount}
                        {session.max_participants ? `/${session.max_participants}` : ""}
                      </span>
                    </div>
                  </div>
                </CardContent>

                <CardFooter className="pt-3 border-t">
                  <Link
                    href={`/admin/formations/${session.id}`}
                    className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                  >
                    Gérer la formation
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* PROGRAM PICKER DIALOG                                                */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={programPickerOpen} onOpenChange={setProgramPickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Choisir un programme</DialogTitle>
          </DialogHeader>
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Rechercher un programme…"
              value={programSearch}
              onChange={(e) => setProgramSearch(e.target.value)}
              className="pl-8 text-sm"
            />
          </div>
          <div className="max-h-[400px] overflow-y-auto space-y-1">
            {loadingPrograms ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : programs
                .filter((p) => {
                  const q = programSearch.toLowerCase();
                  return !q || p.title.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q);
                })
                .length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-8">Aucun programme trouvé</p>
            ) : (
              programs
                .filter((p) => {
                  const q = programSearch.toLowerCase();
                  return !q || p.title.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q);
                })
                .map((program) => (
                  <button
                    key={program.id}
                    onClick={() => selectProgram(program)}
                    className="flex w-full items-center gap-3 rounded-lg border border-gray-100 bg-white p-3 text-left hover:border-indigo-300 hover:bg-indigo-50/50 transition-all"
                  >
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                      <Library className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{program.title}</p>
                      {program.description && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">{program.description}</p>
                      )}
                      {program.duration_hours && (
                        <p className="text-xs text-gray-400 mt-0.5">{program.duration_hours}h</p>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
                  </button>
                ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SESSION CREATION DIALOG                                              */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Planifier une session</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Selected program */}
            {formData.program_id && (
              <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2">
                <Library className="h-4 w-4 text-indigo-600 flex-shrink-0" />
                <span className="text-sm font-medium text-indigo-900 truncate">
                  {programs.find((p) => p.id === formData.program_id)?.title ?? "Programme sélectionné"}
                </span>
                <button
                  onClick={() => { setDialogOpen(false); openCreateDialog(); }}
                  className="ml-auto text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  Changer
                </button>
              </div>
            )}

            {/* Title */}
            <div className="space-y-1.5">
              <Label>Titre <span className="text-red-500">*</span></Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Management d'équipe — Groupe A"
              />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Date de début <span className="text-red-500">*</span></Label>
                <Input
                  type="datetime-local"
                  value={formData.start_date}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData((f) => ({
                      ...f,
                      start_date: val,
                      // Auto-set end date to +1h if not already set
                      end_date: f.end_date || (val ? new Date(new Date(val).getTime() + 3600000).toISOString().slice(0, 16) : ""),
                    }));
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Date de fin <span className="text-red-500">*</span></Label>
                <Input
                  type="datetime-local"
                  value={formData.end_date}
                  onChange={(e) => setFormData((f) => ({ ...f, end_date: e.target.value }))}
                />
              </div>
            </div>

            {/* Mode + Type */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Mode</Label>
                <Select value={formData.mode} onValueChange={(v) => setFormData((f) => ({ ...f, mode: v as SessionFormData["mode"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="presentiel">Présentiel</SelectItem>
                    <SelectItem value="distanciel">Distanciel</SelectItem>
                    <SelectItem value="hybride">Hybride</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData((f) => ({ ...f, type: v as SessionFormData["type"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="intra">Intra-entreprise</SelectItem>
                    <SelectItem value="inter">Inter-entreprises</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Location (if presentiel or hybride) */}
            {formData.mode !== "distanciel" && (
              <div className="space-y-1.5">
                <Label>Lieu</Label>
                <Input
                  value={formData.location}
                  onChange={(e) => setFormData((f) => ({ ...f, location: e.target.value }))}
                  placeholder="Ex: 12 rue de la Paix, Paris"
                />
              </div>
            )}

            {/* Visio link (if distanciel or hybride) */}
            {formData.mode !== "presentiel" && (
              <div className="space-y-1.5">
                <Label>Lien visio</Label>
                <Input
                  value={formData.visio_link}
                  onChange={(e) => setFormData((f) => ({ ...f, visio_link: e.target.value }))}
                  placeholder="https://meet.google.com/..."
                />
              </div>
            )}

            {/* Max participants */}
            <div className="space-y-1.5">
              <Label>Participants max</Label>
              <Input
                type="number"
                min="1"
                value={formData.max_participants}
                onChange={(e) => setFormData((f) => ({ ...f, max_participants: e.target.value }))}
                placeholder="Ex: 12"
                className="max-w-[150px]"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Notes internes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="Notes internes (optionnel)"
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Création…" : "Planifier la session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
