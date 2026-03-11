"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import {
  formatDate,
  formatDateTime,
  getInitials,
  SESSION_STATUS_LABELS,
  STATUS_COLORS,
} from "@/lib/utils";
import type { Trainer, Session, TrainerCompetency } from "@/lib/types";
import {
  CalendarDays,
  Clock,
  MapPin,
  Monitor,
  Users,
  Star,
  Award,
  Pencil,
  Save,
  X,
  CalendarCheck,
  Loader2,
  PenLine,
} from "lucide-react";
import Link from "next/link";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  parseISO,
  isWithinInterval,
  isAfter,
} from "date-fns";

// ─── helpers ──────────────────────────────────────────────────────────────────

const MODE_LABELS: Record<string, string> = {
  presentiel: "Présentiel",
  distanciel: "Distanciel",
  hybride: "Hybride",
};

const MODE_COLORS: Record<string, string> = {
  presentiel: "bg-blue-100 text-blue-800",
  distanciel: "bg-purple-100 text-purple-800",
  hybride: "bg-teal-100 text-teal-800",
};

const COMPETENCY_LEVEL_LABELS: Record<string, string> = {
  beginner: "Débutant",
  intermediate: "Intermédiaire",
  expert: "Expert",
};

const COMPETENCY_LEVEL_COLORS: Record<string, string> = {
  beginner: "bg-gray-100 text-gray-700",
  intermediate: "bg-blue-100 text-blue-700",
  expert: "bg-green-100 text-green-700",
};

const TRAINER_TYPE_LABELS: Record<string, string> = {
  internal: "Interne",
  external: "Externe",
};

// ─── types ────────────────────────────────────────────────────────────────────

interface SessionWithDetails extends Omit<Session, "training" | "enrollments"> {
  training?: { title: string; description: string | null; duration_hours: number | null };
  enrollments?: { id: string }[];
}

interface ProfileForm {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  bio: string;
  availability_notes: string;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function TrainerPage() {
  const supabase = createClient();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [trainer, setTrainer] = useState<Trainer | null>(null);
  const [sessions, setSessions] = useState<SessionWithDetails[]>([]);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfileForm>({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    bio: "",
    availability_notes: "",
  });

  // ── derived data ────────────────────────────────────────────────────────────

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  const upcomingSessions = sessions.filter((s) =>
    isAfter(parseISO(s.start_date), now) && s.status !== "cancelled"
  );

  const monthSessions = sessions.filter((s) => {
    const d = parseISO(s.start_date);
    return isWithinInterval(d, { start: monthStart, end: monthEnd });
  });

  const weekSessions = sessions.filter((s) => {
    const d = parseISO(s.start_date);
    return isWithinInterval(d, { start: weekStart, end: weekEnd });
  });

  const totalHours = sessions
    .filter((s) => s.status === "completed")
    .reduce((acc, s) => acc + (s.training?.duration_hours ?? 0), 0);

  // ── data fetching ───────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // fetch trainer profile
      const { data: trainerData, error: trainerError } = await supabase
        .from("trainers")
        .select("*, competencies:trainer_competencies(*)")
        .eq("profile_id", user.id)
        .single();

      if (trainerError || !trainerData) {
        setTrainer(null);
        return;
      }

      setTrainer(trainerData as Trainer);
      setProfileForm({
        first_name: trainerData.first_name ?? "",
        last_name: trainerData.last_name ?? "",
        email: trainerData.email ?? "",
        phone: trainerData.phone ?? "",
        bio: trainerData.bio ?? "",
        availability_notes: trainerData.availability_notes ?? "",
      });

      // fetch sessions assigned to this trainer
      const { data: sessionsData } = await supabase
        .from("sessions")
        .select(
          `
          *,
          training:trainings(title, description, duration_hours),
          enrollments(id)
        `
        )
        .eq("trainer_id", trainerData.id)
        .order("start_date", { ascending: true });

      setSessions((sessionsData as SessionWithDetails[]) ?? []);
    } catch (err) {
      console.error("TrainerPage fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── profile update ──────────────────────────────────────────────────────────

  const handleSaveProfile = async () => {
    if (!trainer) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("trainers")
        .update({
          first_name: profileForm.first_name,
          last_name: profileForm.last_name,
          email: profileForm.email,
          phone: profileForm.phone,
          bio: profileForm.bio,
          availability_notes: profileForm.availability_notes,
        })
        .eq("id", trainer.id);

      if (error) throw error;

      setTrainer((prev) =>
        prev
          ? {
              ...prev,
              ...profileForm,
            }
          : prev
      );
      setEditingProfile(false);
      toast({ title: "Profil mis à jour", description: "Vos informations ont été enregistrées." });
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de mettre à jour le profil.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    if (!trainer) return;
    setProfileForm({
      first_name: trainer.first_name ?? "",
      last_name: trainer.last_name ?? "",
      email: trainer.email ?? "",
      phone: trainer.phone ?? "",
      bio: trainer.bio ?? "",
      availability_notes: trainer.availability_notes ?? "",
    });
    setEditingProfile(false);
  };

  // ── loading / no-profile states ─────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!trainer) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Award className="h-12 w-12 text-muted-foreground" />
        <p className="text-lg font-medium text-muted-foreground">
          Profil formateur non configuré
        </p>
        <p className="text-sm text-muted-foreground">
          Contactez votre administrateur pour configurer votre profil formateur.
        </p>
      </div>
    );
  }

  const competencies = (trainer as Trainer & { competencies?: TrainerCompetency[] }).competencies ?? [];

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 text-lg">
            <AvatarImage src={undefined} alt={`${trainer.first_name} ${trainer.last_name}`} />
            <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xl">
              {getInitials(trainer.first_name, trainer.last_name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {trainer.first_name} {trainer.last_name}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                className={
                  trainer.type === "internal"
                    ? "bg-indigo-100 text-indigo-800"
                    : "bg-orange-100 text-orange-800"
                }
              >
                {TRAINER_TYPE_LABELS[trainer.type]}
              </Badge>
              {trainer.email && (
                <span className="text-sm text-muted-foreground">{trainer.email}</span>
              )}
            </div>
            {trainer.bio && (
              <p className="text-sm text-muted-foreground mt-1 max-w-xl">{trainer.bio}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Sessions ce mois
              </span>
              <span className="text-3xl font-bold">{monthSessions.length}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Heures délivrées
              </span>
              <span className="text-3xl font-bold">{totalHours}h</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Sessions à venir
              </span>
              <span className="text-3xl font-bold">{upcomingSessions.length}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Cette semaine
              </span>
              <span className="text-3xl font-bold">{weekSessions.length}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Left column ── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Upcoming sessions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarCheck className="h-5 w-5 text-primary" />
                Mes sessions à venir
              </CardTitle>
              <CardDescription>
                {upcomingSessions.length === 0
                  ? "Aucune session à venir"
                  : `${upcomingSessions.length} session${upcomingSessions.length > 1 ? "s" : ""} planifiée${upcomingSessions.length > 1 ? "s" : ""}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {upcomingSessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                  <CalendarDays className="h-8 w-8" />
                  <p className="text-sm">Aucune session planifiée</p>
                </div>
              ) : (
                <ScrollArea className="max-h-[400px]">
                  <div className="space-y-3">
                    {upcomingSessions.map((session) => (
                      <div
                        key={session.id}
                        className="flex flex-col gap-2 rounded-lg border p-4 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-sm leading-tight">{session.title}</p>
                            {session.training?.title && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {session.training.title}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Badge className={MODE_COLORS[session.mode] ?? "bg-gray-100 text-gray-800"}>
                              {MODE_LABELS[session.mode] ?? session.mode}
                            </Badge>
                            <Badge className={STATUS_COLORS[session.status] ?? ""}>
                              {SESSION_STATUS_LABELS[session.status] ?? session.status}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {formatDate(session.start_date)} — {formatDate(session.end_date)}
                          </span>
                          {session.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {session.location}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {session.enrollments?.length ?? 0} participant
                            {(session.enrollments?.length ?? 0) > 1 ? "s" : ""}
                            {session.max_participants ? ` / ${session.max_participants}` : ""}
                          </span>
                        </div>
                        {(session.status === "in_progress" || session.status === "completed") && (
                          <Link
                            href={`/trainer/sessions/${session.id}/sign`}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors mt-1"
                          >
                            <PenLine className="h-3.5 w-3.5" />
                            Signer / Voir les signatures
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {/* This week planning */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Mon planning — cette semaine
              </CardTitle>
              <CardDescription>
                Du {formatDate(weekStart.toISOString())} au {formatDate(weekEnd.toISOString())}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {weekSessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                  <CalendarDays className="h-8 w-8" />
                  <p className="text-sm">Aucune session cette semaine</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {weekSessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex items-center gap-3 rounded-lg border p-3"
                    >
                      <div className="flex flex-col items-center min-w-[48px] text-center">
                        <span className="text-xs text-muted-foreground font-medium">
                          {formatDate(session.start_date, "EEE")}
                        </span>
                        <span className="text-lg font-bold leading-none">
                          {formatDate(session.start_date, "dd")}
                        </span>
                      </div>
                      <Separator orientation="vertical" className="h-10" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{session.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(session.start_date)}
                          {session.location && ` · ${session.location}`}
                        </p>
                      </div>
                      <Badge className={MODE_COLORS[session.mode] ?? ""}>
                        {MODE_LABELS[session.mode] ?? session.mode}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Right column ── */}
        <div className="space-y-6">
          {/* Profile */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle className="text-base">Mon profil</CardTitle>
              {!editingProfile ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingProfile(true)}
                  className="gap-1"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Modifier
                </Button>
              ) : (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={cancelEdit}
                    disabled={saving}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveProfile}
                    disabled={saving}
                    className="gap-1"
                  >
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Enregistrer
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Prénom</Label>
                  {editingProfile ? (
                    <Input
                      value={profileForm.first_name}
                      onChange={(e) =>
                        setProfileForm((p) => ({ ...p, first_name: e.target.value }))
                      }
                      className="h-8 text-sm"
                    />
                  ) : (
                    <p className="text-sm">{trainer.first_name || "—"}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nom</Label>
                  {editingProfile ? (
                    <Input
                      value={profileForm.last_name}
                      onChange={(e) =>
                        setProfileForm((p) => ({ ...p, last_name: e.target.value }))
                      }
                      className="h-8 text-sm"
                    />
                  ) : (
                    <p className="text-sm">{trainer.last_name || "—"}</p>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                {editingProfile ? (
                  <Input
                    type="email"
                    value={profileForm.email}
                    onChange={(e) =>
                      setProfileForm((p) => ({ ...p, email: e.target.value }))
                    }
                    className="h-8 text-sm"
                  />
                ) : (
                  <p className="text-sm">{trainer.email || "—"}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Téléphone</Label>
                {editingProfile ? (
                  <Input
                    value={profileForm.phone}
                    onChange={(e) =>
                      setProfileForm((p) => ({ ...p, phone: e.target.value }))
                    }
                    className="h-8 text-sm"
                  />
                ) : (
                  <p className="text-sm">{trainer.phone || "—"}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Biographie</Label>
                {editingProfile ? (
                  <Textarea
                    value={profileForm.bio}
                    onChange={(e) =>
                      setProfileForm((p) => ({ ...p, bio: e.target.value }))
                    }
                    rows={3}
                    className="text-sm resize-none"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {trainer.bio || "Aucune biographie renseignée"}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Disponibilités</Label>
                {editingProfile ? (
                  <Textarea
                    value={profileForm.availability_notes}
                    onChange={(e) =>
                      setProfileForm((p) => ({ ...p, availability_notes: e.target.value }))
                    }
                    rows={2}
                    className="text-sm resize-none"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {trainer.availability_notes || "Non renseigné"}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Competencies */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Star className="h-4 w-4 text-primary" />
                Mes compétences
              </CardTitle>
            </CardHeader>
            <CardContent>
              {competencies.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Aucune compétence renseignée
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {competencies.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-1.5 rounded-full border px-3 py-1"
                    >
                      <span className="text-sm font-medium">{c.competency}</span>
                      <Badge
                        className={`text-xs ${COMPETENCY_LEVEL_COLORS[c.level] ?? "bg-gray-100 text-gray-700"}`}
                      >
                        {COMPETENCY_LEVEL_LABELS[c.level] ?? c.level}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* All sessions summary */}
          {sessions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Toutes mes sessions</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[220px]">
                  <div className="space-y-2">
                    {sessions.map((session) => (
                      <div
                        key={session.id}
                        className="flex items-center justify-between gap-2 py-1"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{session.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(session.start_date)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {(session.status === "in_progress" || session.status === "completed") && (
                            <Link href={`/trainer/sessions/${session.id}/sign`}>
                              <PenLine className="h-3.5 w-3.5 text-blue-600 hover:text-blue-800" />
                            </Link>
                          )}
                          <Badge className={STATUS_COLORS[session.status] ?? ""}>
                            {SESSION_STATUS_LABELS[session.status] ?? session.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
