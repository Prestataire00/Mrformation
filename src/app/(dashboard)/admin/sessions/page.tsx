"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { Session, Training, Trainer } from "@/lib/types";
import { cn, formatDate, formatDateTime, STATUS_COLORS, SESSION_STATUS_LABELS } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  Pencil,
  Trash2,
  CalendarDays,
  MapPin,
  Users,
  Monitor,
  Building2,
  Wifi,
  UserPlus,
  X,
  Loader2,
  Link2,
  Video,
} from "lucide-react";

type SessionFull = Session & {
  training: { title: string; classification: string | null } | null;
  trainer: { first_name: string; last_name: string } | null;
  enrollments_count: number;
};

interface LearnerBasic {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
}

interface EnrollmentWithLearner {
  id: string;
  learner_id: string;
  status: string;
  enrolled_at: string;
  learner: LearnerBasic;
}

const MODE_LABELS: Record<string, string> = {
  presentiel: "Présentiel",
  distanciel: "Distanciel",
  hybride: "Hybride",
};

const MODE_COLORS: Record<string, string> = {
  presentiel: "bg-teal-100 text-teal-700",
  distanciel: "bg-purple-100 text-purple-700",
  hybride: "bg-indigo-100 text-indigo-700",
};

const ModeIcon = ({ mode }: { mode: string }) => {
  if (mode === "presentiel") return <Building2 className="h-3.5 w-3.5" />;
  if (mode === "distanciel") return <Wifi className="h-3.5 w-3.5" />;
  return <Monitor className="h-3.5 w-3.5" />;
};

interface SessionFormData {
  title: string;
  training_id: string;
  start_date: string;
  end_date: string;
  location: string;
  meeting_url: string;
  mode: "presentiel" | "distanciel" | "hybride";
  status: "upcoming" | "in_progress" | "completed" | "cancelled";
  max_participants: string;
  trainer_id: string;
  is_public: boolean;
  notes: string;
}

const emptyForm: SessionFormData = {
  title: "",
  training_id: "",
  start_date: "",
  end_date: "",
  location: "",
  meeting_url: "",
  mode: "presentiel",
  status: "upcoming",
  max_participants: "",
  trainer_id: "",
  is_public: false,
  notes: "",
};

const toInputDatetime = (iso: string) => {
  if (!iso) return "";
  return iso.slice(0, 16);
};

export default function SessionsPage() {
  const supabase = createClient();
  const { toast } = useToast();
  const { entityId } = useEntity();
  const searchParams = useSearchParams();
  const trainingIdParam = searchParams.get("training_id");

  const [sessions, setSessions] = useState<SessionFull[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [modeFilter, setModeFilter] = useState<string>("all");
  const [trainingFilter, setTrainingFilter] = useState<string>(trainingIdParam || "all");
  const [classificationFilter, setClassificationFilter] = useState<string>("all");

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<SessionFull | null>(null);
  const [formData, setFormData] = useState<SessionFormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Location autocomplete
  const [knownLocations, setKnownLocations] = useState<string[]>([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);

  // Delete
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<SessionFull | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sessions")
      .select("*, training:trainings(title, classification), trainer:trainers(first_name, last_name), enrollments:enrollments(id)")
      .order("start_date", { ascending: false });

    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les sessions.", variant: "destructive" });
    } else {
      const now = new Date();
      const mapped = (data || []).map((s: Record<string, unknown>) => {
        const startDate = new Date(s.start_date as string);
        const endDate = new Date(s.end_date as string);
        // Auto-compute status based on dates
        let computedStatus = s.status as string;
        if (computedStatus !== "cancelled") {
          if (now >= endDate) {
            computedStatus = "completed";
          } else if (now >= startDate) {
            computedStatus = "in_progress";
          } else {
            computedStatus = "upcoming";
          }
        }
        return {
          ...s,
          status: computedStatus,
          enrollments_count: Array.isArray(s.enrollments) ? (s.enrollments as unknown[]).length : 0,
        };
      });
      setSessions(mapped as SessionFull[]);
      // Extract unique known locations for autocomplete
      const locs = [...new Set(
        (data || [])
          .map((s: Record<string, unknown>) => s.location as string)
          .filter((l): l is string => !!l && l.trim().length > 0 && !l.startsWith("http"))
      )].sort();
      setKnownLocations(locs);
    }
    setLoading(false);
  }, []);

  const fetchRefs = useCallback(async () => {
    const [{ data: trainingsData }, { data: trainersData }] = await Promise.all([
      supabase.from("trainings").select("id, title, is_active").eq("is_active", true).order("title"),
      supabase.from("trainers").select("id, first_name, last_name, type").order("last_name"),
    ]);
    setTrainings((trainingsData as Training[]) || []);
    setTrainers((trainersData as Trainer[]) || []);
  }, []);

  useEffect(() => {
    fetchSessions();
    fetchRefs();
  }, [fetchSessions, fetchRefs]);

  const filtered = sessions.filter((s) => {
    const matchSearch =
      search === "" ||
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.training?.title.toLowerCase().includes(search.toLowerCase()) ||
      s.location?.toLowerCase().includes(search.toLowerCase()) ||
      `${s.trainer?.first_name} ${s.trainer?.last_name}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || s.status === statusFilter;
    const matchMode = modeFilter === "all" || s.mode === modeFilter;
    const matchTraining = trainingFilter === "all" || s.training_id === trainingFilter;
    const matchClassification = classificationFilter === "all" || s.training?.classification === classificationFilter;
    return matchSearch && matchStatus && matchMode && matchTraining && matchClassification;
  });

  const openAddDialog = () => {
    setEditingSession(null);
    setFormData({
      ...emptyForm,
      training_id: trainingIdParam || "",
    });
    setDialogOpen(true);
  };

  const openEditDialog = (session: SessionFull) => {
    setEditingSession(session);
    setFormData({
      title: session.title,
      training_id: session.training_id || "",
      start_date: toInputDatetime(session.start_date),
      end_date: toInputDatetime(session.end_date),
      location: session.location || "",
      meeting_url: (session as unknown as Record<string, unknown>).meeting_url as string || "",
      mode: session.mode,
      status: session.status,
      max_participants: session.max_participants?.toString() || "",
      trainer_id: session.trainer_id || "",
      is_public: !!(session as unknown as Record<string, unknown>).is_public,
      notes: session.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast({ title: "Titre requis", description: "Le titre de la session est obligatoire.", variant: "destructive" });
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
      title: formData.title.trim(),
      training_id: formData.training_id || null,
      start_date: new Date(formData.start_date).toISOString(),
      end_date: new Date(formData.end_date).toISOString(),
      location: formData.location.trim() || null,
      meeting_url: formData.meeting_url.trim() || null,
      mode: formData.mode,
      status: formData.status,
      max_participants: formData.max_participants ? parseInt(formData.max_participants) : null,
      trainer_id: formData.trainer_id || null,
      is_public: formData.is_public,
      notes: formData.notes.trim() || null,
    };

    if (editingSession) {
      const { error } = await supabase.from("sessions").update(payload).eq("id", editingSession.id);
      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      toast({ title: "Session mise à jour" });

      // ── Auto-envoi questionnaires si session → completed ──────────────
      if (editingSession.status !== "completed" && payload.status === "completed") {
        try {
          // 1. Récupérer les questionnaires liés avec auto_send_on_completion = true
          const { data: qSessions } = await supabase
            .from("questionnaire_sessions")
            .select("questionnaire_id, questionnaires(title)")
            .eq("session_id", editingSession.id)
            .eq("auto_send_on_completion", true);

          if (qSessions && qSessions.length > 0) {
            // 2. Récupérer les apprenants inscrits à cette session
            const { data: enrollments } = await supabase
              .from("enrollments")
              .select("learner_id, learners(first_name, last_name, email)")
              .eq("session_id", editingSession.id)
              .neq("status", "cancelled");

            const learners = (enrollments || [])
              .map((e: any) => e.learners)
              .filter((l: any) => l?.email);

            if (learners.length > 0) {
              // 3. Envoyer un email à chaque apprenant pour chaque questionnaire
              const siteUrl = window.location.origin;
              let sentCount = 0;
              for (const qs of qSessions) {
                const qTitle = (qs as any).questionnaires?.title ?? "questionnaire";
                for (const learner of learners) {
                  const l = learner as { first_name: string; last_name: string; email: string };
                  const body = `Bonjour ${l.first_name},\n\nLa session "${editingSession.title}" vient de se terminer.\n\nNous vous invitons à remplir le questionnaire suivant :\n${qTitle}\n\nAccédez à votre espace apprenant pour y répondre : ${siteUrl}/learner\n\nMerci pour votre participation.\n\nCordialement,\nL'équipe de formation`;
                  await fetch("/api/emails/send", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      to: l.email,
                      subject: `Questionnaire à remplir — ${editingSession.title}`,
                      body,
                    }),
                  });
                  sentCount++;
                }
              }
              toast({
                title: "Questionnaires envoyés automatiquement",
                description: `${sentCount} email${sentCount > 1 ? "s" : ""} envoyé${sentCount > 1 ? "s" : ""} à ${learners.length} apprenant${learners.length > 1 ? "s" : ""}.`,
              });
            }
          }
        } catch { /* non bloquant */ }
      }
    } else {
      const insertPayload = entityId ? { ...payload, entity_id: entityId } : payload;
      const { error } = await supabase.from("sessions").insert(insertPayload);
      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      toast({ title: "Session créée", description: `"${payload.title}" a été planifiée.` });
    }

    setSaving(false);
    setDialogOpen(false);
    await fetchSessions();
  };

  const openDeleteDialog = (session: SessionFull) => {
    setSessionToDelete(session);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!sessionToDelete) return;
    setDeleting(true);
    const { error } = await supabase.from("sessions").delete().eq("id", sessionToDelete.id);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Session supprimée" });
      setDeleteDialogOpen(false);
      setSessionToDelete(null);
      await fetchSessions();
    }
    setDeleting(false);
  };

  // Enrollment management
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [enrollSession, setEnrollSession] = useState<SessionFull | null>(null);
  const [sessionEnrollments, setSessionEnrollments] = useState<EnrollmentWithLearner[]>([]);
  const [allLearners, setAllLearners] = useState<LearnerBasic[]>([]);
  const [enrollLoading, setEnrollLoading] = useState(false);
  const [enrollingLearnerId, setEnrollingLearnerId] = useState<string | null>(null);
  const [removingEnrollmentId, setRemovingEnrollmentId] = useState<string | null>(null);
  const [learnerSearch, setLearnerSearch] = useState("");

  const openEnrollDialog = async (session: SessionFull) => {
    setEnrollSession(session);
    setEnrollDialogOpen(true);
    setEnrollLoading(true);
    setLearnerSearch("");

    // Load enrollments for this session
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("id, learner_id, status, enrolled_at, learner:learners(id, first_name, last_name, email)")
      .eq("session_id", session.id)
      .order("enrolled_at", { ascending: false });

    const mapped = (enrollments ?? []).map((e: Record<string, unknown>) => ({
      ...e,
      learner: Array.isArray(e.learner) ? e.learner[0] : e.learner,
    })) as EnrollmentWithLearner[];
    setSessionEnrollments(mapped);

    // Load all learners for the entity
    const { data: learners } = await supabase
      .from("learners")
      .select("id, first_name, last_name, email")
      .eq("entity_id", entityId)
      .order("last_name");

    setAllLearners((learners as LearnerBasic[]) ?? []);
    setEnrollLoading(false);
  };

  const handleEnrollLearner = async (learnerId: string) => {
    if (!enrollSession) return;
    setEnrollingLearnerId(learnerId);

    const { error } = await supabase.from("enrollments").insert({
      session_id: enrollSession.id,
      learner_id: learnerId,
      status: "registered",
    });

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Apprenant inscrit" });
      await openEnrollDialog(enrollSession);
      await fetchSessions();
    }
    setEnrollingLearnerId(null);
  };

  const handleRemoveEnrollment = async (enrollmentId: string) => {
    setRemovingEnrollmentId(enrollmentId);

    const { error } = await supabase.from("enrollments").delete().eq("id", enrollmentId);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Inscription retirée" });
      if (enrollSession) {
        await openEnrollDialog(enrollSession);
        await fetchSessions();
      }
    }
    setRemovingEnrollmentId(null);
  };

  // Learners not yet enrolled in this session
  const enrolledIds = new Set(sessionEnrollments.map((e) => e.learner_id));
  const availableLearners = allLearners.filter((l) => {
    if (enrolledIds.has(l.id)) return false;
    if (!learnerSearch) return true;
    const q = learnerSearch.toLowerCase();
    return (
      l.first_name.toLowerCase().includes(q) ||
      l.last_name.toLowerCase().includes(q) ||
      (l.email?.toLowerCase().includes(q) ?? false)
    );
  });

  // Stats
  const upcoming = sessions.filter((s) => s.status === "upcoming").length;
  const inProgress = sessions.filter((s) => s.status === "in_progress").length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sessions de formation</h1>
          <p className="text-sm text-gray-500 mt-1">
            {sessions.length} session{sessions.length !== 1 ? "s" : ""} —{" "}
            {upcoming} à venir{inProgress > 0 ? `, ${inProgress} en cours` : ""}
          </p>
        </div>
        <Button onClick={openAddDialog} className="gap-2">
          <Plus className="h-4 w-4" />
          Planifier une session
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Rechercher par titre, lieu, formateur..."
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
        <Select value={trainingFilter} onValueChange={setTrainingFilter}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="Formation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les formations</SelectItem>
            {trainings.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={classificationFilter} onValueChange={setClassificationFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Classification" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes classifications</SelectItem>
            <SelectItem value="reglementaire">Réglementaire</SelectItem>
            <SelectItem value="certifiant">Certifiant</SelectItem>
            <SelectItem value="qualifiant">Qualifiant</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 min-w-[180px]">Session</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 min-w-[150px]">Formation</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 min-w-[160px]">Dates</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Lieu</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Mode</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Statut</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 min-w-[140px]">Formateur</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Inscrits</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                    <CalendarDays className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                    <p className="font-medium">Aucune session trouvée</p>
                    <p className="text-xs mt-1">Modifiez vos filtres ou planifiez une nouvelle session.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((session) => (
                  <tr key={session.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 truncate max-w-[180px]">{session.title}</p>
                      {session.notes && (
                        <p className="text-xs text-gray-400 truncate max-w-[180px]">{session.notes}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {session.training ? (
                        <p className="text-gray-600 text-xs truncate max-w-[150px]">{session.training.title}</p>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-gray-600 space-y-0.5">
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400">Du</span>
                          <span>{formatDate(session.start_date)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400">Au</span>
                          <span>{formatDate(session.end_date)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        {session.location ? (
                          <div className="flex items-center gap-1 text-gray-600 text-xs">
                            <MapPin className="h-3 w-3 text-gray-400 flex-shrink-0" />
                            <span className="truncate max-w-[120px]">{session.location}</span>
                          </div>
                        ) : null}
                        {(session as unknown as Record<string, unknown>).meeting_url ? (
                          <div className="flex items-center gap-1 text-xs">
                            <Video className="h-3 w-3 text-purple-400 flex-shrink-0" />
                            <a
                              href={(session as unknown as Record<string, unknown>).meeting_url as string}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-purple-600 hover:underline truncate max-w-[120px]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Lien visio
                            </a>
                          </div>
                        ) : null}
                        {!session.location && !(session as unknown as Record<string, unknown>).meeting_url && (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={cn("text-xs gap-1 font-normal", MODE_COLORS[session.mode] || "bg-gray-100 text-gray-600")}>
                        <ModeIcon mode={session.mode} />
                        {MODE_LABELS[session.mode] || session.mode}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={cn("text-xs font-normal", STATUS_COLORS[session.status] || "bg-gray-100 text-gray-600")}>
                        {SESSION_STATUS_LABELS[session.status] || session.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {session.trainer ? (
                        <span className="text-xs text-gray-700">
                          {session.trainer.first_name} {session.trainer.last_name}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">Non assigné</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-xs text-gray-600">
                        <Users className="h-3.5 w-3.5 text-gray-400" />
                        <span>
                          {session.enrollments_count}
                          {session.max_participants ? `/${session.max_participants}` : ""}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEnrollDialog(session)} className="gap-2">
                            <UserPlus className="h-4 w-4" />
                            Gérer les inscriptions
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openEditDialog(session)} className="gap-2">
                            <Pencil className="h-4 w-4" />
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => openDeleteDialog(session)}
                            className="gap-2 text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t bg-gray-50 text-xs text-gray-500">
            {filtered.length} session{filtered.length !== 1 ? "s" : ""} affichée{filtered.length !== 1 ? "s" : ""}
            {sessions.length !== filtered.length ? ` sur ${sessions.length}` : ""}
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSession ? "Modifier la session" : "Planifier une session"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="s_title">Titre <span className="text-red-500">*</span></Label>
              <Input
                id="s_title"
                value={formData.title}
                onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                placeholder="Ex: Management d'équipe — Groupe A"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s_training">Formation associée</Label>
              <Select
                value={formData.training_id || "none"}
                onValueChange={(v) => setFormData((p) => ({ ...p, training_id: v === "none" ? "" : v }))}
              >
                <SelectTrigger id="s_training">
                  <SelectValue placeholder="Sélectionner une formation..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune formation</SelectItem>
                  {trainings.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="s_start">Date et heure de début <span className="text-red-500">*</span></Label>
                <Input
                  id="s_start"
                  type="datetime-local"
                  value={formData.start_date}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData((p) => {
                      // Auto-fill end_date = start_date + 1 hour
                      let endDate = p.end_date;
                      if (val) {
                        const d = new Date(val);
                        d.setHours(d.getHours() + 1);
                        endDate = d.toISOString().slice(0, 16);
                      }
                      return { ...p, start_date: val, end_date: endDate };
                    });
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s_end">Date et heure de fin <span className="text-red-500">*</span></Label>
                <Input
                  id="s_end"
                  type="datetime-local"
                  value={formData.end_date}
                  onChange={(e) => setFormData((p) => ({ ...p, end_date: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="s_mode">Mode</Label>
                <Select
                  value={formData.mode}
                  onValueChange={(v) => setFormData((p) => ({ ...p, mode: v as SessionFormData["mode"] }))}
                >
                  <SelectTrigger id="s_mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="presentiel">Présentiel</SelectItem>
                    <SelectItem value="distanciel">Distanciel</SelectItem>
                    <SelectItem value="hybride">Hybride</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s_status">Statut</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData((p) => ({ ...p, status: v as SessionFormData["status"] }))}
                >
                  <SelectTrigger id="s_status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upcoming">À venir</SelectItem>
                    <SelectItem value="in_progress">En cours</SelectItem>
                    <SelectItem value="completed">Terminée</SelectItem>
                    <SelectItem value="cancelled">Annulée</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Lieu (présentiel / hybride) */}
            {(formData.mode === "presentiel" || formData.mode === "hybride") && (
              <div className="space-y-1.5 relative">
                <Label htmlFor="s_location" className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-gray-400" />
                  Lieu de formation
                </Label>
                <Input
                  id="s_location"
                  value={formData.location}
                  onChange={(e) => {
                    setFormData((p) => ({ ...p, location: e.target.value }));
                    setShowLocationSuggestions(true);
                  }}
                  onFocus={() => setShowLocationSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowLocationSuggestions(false), 200)}
                  placeholder="Ex: Salle 3A, Paris 75001"
                  autoComplete="off"
                />
                {showLocationSuggestions && formData.location.length > 0 && (() => {
                    const matches = knownLocations.filter((l) =>
                      l.toLowerCase().includes(formData.location.toLowerCase()) && l.toLowerCase() !== formData.location.toLowerCase()
                    );
                    if (matches.length === 0) return null;
                    return (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {matches.map((loc) => (
                          <button
                            key={loc}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setFormData((p) => ({ ...p, location: loc }));
                              setShowLocationSuggestions(false);
                            }}
                          >
                            <MapPin className="h-3 w-3 text-gray-400 flex-shrink-0" />
                            {loc}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
              </div>
            )}

            {/* Lien de connexion (distanciel / hybride) */}
            {(formData.mode === "distanciel" || formData.mode === "hybride") && (
              <div className="space-y-1.5">
                <Label htmlFor="s_meeting_url" className="flex items-center gap-1.5">
                  <Video className="h-3.5 w-3.5 text-gray-400" />
                  Lien de connexion <span className="text-xs text-gray-400 font-normal">(optionnel)</span>
                </Label>
                <Input
                  id="s_meeting_url"
                  value={formData.meeting_url}
                  onChange={(e) => setFormData((p) => ({ ...p, meeting_url: e.target.value }))}
                  placeholder="https://meet.google.com/... ou https://zoom.us/..."
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="s_max">Participants max</Label>
                <Input
                  id="s_max"
                  type="number"
                  min="1"
                  value={formData.max_participants}
                  onChange={(e) => setFormData((p) => ({ ...p, max_participants: e.target.value }))}
                  placeholder="12"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s_trainer">Formateur</Label>
                <Select
                  value={formData.trainer_id || "none"}
                  onValueChange={(v) => setFormData((p) => ({ ...p, trainer_id: v === "none" ? "" : v }))}
                >
                  <SelectTrigger id="s_trainer">
                    <SelectValue placeholder="Sélectionner..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Non assigné</SelectItem>
                    {trainers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.first_name} {t.last_name}
                        {t.type === "external" ? " (Ext.)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
              <input
                type="checkbox"
                id="s_is_public"
                checked={formData.is_public}
                onChange={(e) => setFormData((p) => ({ ...p, is_public: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <Label htmlFor="s_is_public" className="cursor-pointer">
                <span className="font-medium text-sm">Session publique</span>
                <span className="block text-xs text-gray-500">Les apprenants peuvent s&apos;inscrire eux-mêmes à cette session</span>
              </Label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s_notes">Notes internes</Label>
              <Textarea
                id="s_notes"
                value={formData.notes}
                onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                rows={3}
                placeholder="Informations complémentaires, rappels..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Enregistrement..." : editingSession ? "Mettre à jour" : "Planifier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enrollment Management Dialog */}
      <Dialog open={enrollDialogOpen} onOpenChange={setEnrollDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Inscriptions — {enrollSession?.title}
            </DialogTitle>
          </DialogHeader>

          {enrollLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="space-y-6 py-2">
              {/* Enrolled learners */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Apprenants inscrits ({sessionEnrollments.length})
                </h3>
                {sessionEnrollments.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">Aucun apprenant inscrit</p>
                ) : (
                  <div className="space-y-2">
                    {sessionEnrollments.map((enrollment) => (
                      <div
                        key={enrollment.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {enrollment.learner.first_name} {enrollment.learner.last_name}
                          </p>
                          {enrollment.learner.email && (
                            <p className="text-xs text-gray-500">{enrollment.learner.email}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={cn("text-xs", STATUS_COLORS[enrollment.status] || "bg-gray-100 text-gray-600")}>
                            {enrollment.status === "registered" ? "Inscrit" :
                             enrollment.status === "confirmed" ? "Confirmé" :
                             enrollment.status === "completed" ? "Terminé" :
                             enrollment.status === "cancelled" ? "Annulé" : enrollment.status}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleRemoveEnrollment(enrollment.id)}
                            disabled={removingEnrollmentId === enrollment.id}
                          >
                            {removingEnrollmentId === enrollment.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <X className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add learner */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Ajouter un apprenant
                </h3>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Rechercher un apprenant par nom ou email..."
                    value={learnerSearch}
                    onChange={(e) => setLearnerSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {availableLearners.length === 0 ? (
                    <p className="text-sm text-gray-400 italic py-2">
                      {learnerSearch ? "Aucun apprenant trouvé" : "Tous les apprenants sont déjà inscrits"}
                    </p>
                  ) : (
                    availableLearners.slice(0, 20).map((learner) => (
                      <div
                        key={learner.id}
                        className="flex items-center justify-between p-2.5 rounded-lg hover:bg-blue-50 transition-colors"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {learner.first_name} {learner.last_name}
                          </p>
                          {learner.email && (
                            <p className="text-xs text-gray-500">{learner.email}</p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 h-7 text-xs"
                          onClick={() => handleEnrollLearner(learner.id)}
                          disabled={enrollingLearnerId === learner.id}
                        >
                          {enrollingLearnerId === learner.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <UserPlus className="h-3 w-3" />
                          )}
                          Inscrire
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrollDialogOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Supprimer la session</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Supprimer la session <strong>&quot;{sessionToDelete?.title}&quot;</strong> ?
            Les inscriptions associées seront également supprimées. Cette action est irréversible.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Suppression..." : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
