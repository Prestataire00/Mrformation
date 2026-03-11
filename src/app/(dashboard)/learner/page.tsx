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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import {
  formatDate,
  getInitials,
  SESSION_STATUS_LABELS,
  STATUS_COLORS,
} from "@/lib/utils";
import type { Learner, Enrollment, Session } from "@/lib/types";
import Link from "next/link";
import {
  GraduationCap,
  CalendarDays,
  MapPin,
  BookOpen,
  Award,
  CheckCircle2,
  Clock,
  Pencil,
  Save,
  X,
  Loader2,
  Building2,
  Phone,
  Mail,
  Briefcase,
  Star,
  ArrowRight,
  Calendar,
  PenLine,
} from "lucide-react";
import { isAfter, parseISO } from "date-fns";

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

const ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  registered: "Inscrit",
  confirmed: "Confirmé",
  cancelled: "Annulé",
  completed: "Terminé",
};

// ─── extended types ───────────────────────────────────────────────────────────

interface EnrollmentWithSession extends Enrollment {
  session?: Session & {
    training?: {
      title: string;
      description: string | null;
      duration_hours: number | null;
      certification: string | null;
    };
  };
}

interface LearnerWithDetails extends Omit<Learner, "client" | "enrollments"> {
  client?: { company_name: string };
  enrollments?: EnrollmentWithSession[];
}

interface ProfileForm {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  job_title: string;
}

// ─── sub-component: enrollment card ──────────────────────────────────────────

function EnrollmentCard({ enrollment }: { enrollment: EnrollmentWithSession }) {
  const session = enrollment.session;
  if (!session) return null;

  return (
    <div className="rounded-lg border p-4 space-y-3 hover:bg-muted/20 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-tight">{session.title}</p>
          {session.training?.title && (
            <p className="text-xs text-muted-foreground mt-0.5">{session.training.title}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Badge className={MODE_COLORS[session.mode] ?? "bg-gray-100 text-gray-800"}>
            {MODE_LABELS[session.mode] ?? session.mode}
          </Badge>
          <Badge className={STATUS_COLORS[enrollment.status] ?? ""}>
            {ENROLLMENT_STATUS_LABELS[enrollment.status] ?? enrollment.status}
          </Badge>
        </div>
      </div>

      {session.training?.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">
          {session.training.description}
        </p>
      )}

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
        {session.training?.duration_hours && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {session.training.duration_hours}h
          </span>
        )}
      </div>

      {/* Progress bar */}
      {(enrollment.completion_rate > 0 || session.status === "in_progress") && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Progression</span>
            <span className="font-medium">{enrollment.completion_rate ?? 0}%</span>
          </div>
          <Progress value={enrollment.completion_rate ?? 0} className="h-2" />
        </div>
      )}

      {/* Signature link for in_progress or completed sessions */}
      {(session.status === "in_progress" || session.status === "completed") && (
        <Link
          href={`/learner/sessions/${session.id}/sign`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors mt-1"
        >
          <PenLine className="h-3.5 w-3.5" />
          Signer ma présence
        </Link>
      )}
    </div>
  );
}

// ─── sub-component: certificate card ─────────────────────────────────────────

function CertificateCard({ enrollment }: { enrollment: EnrollmentWithSession }) {
  const session = enrollment.session;
  if (!session) return null;

  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-2">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
          <Award className="h-5 w-5 text-green-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-green-900">{session.title}</p>
          {session.training?.title && (
            <p className="text-xs text-green-700">{session.training.title}</p>
          )}
        </div>
        <Badge className="bg-green-200 text-green-800 shrink-0">Terminé</Badge>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-green-700">
        <span className="flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Complété le {formatDate(session.end_date)}
        </span>
        {session.training?.duration_hours && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {session.training.duration_hours}h
          </span>
        )}
        {session.training?.certification && (
          <span className="flex items-center gap-1">
            <Star className="h-3 w-3" />
            {session.training.certification}
          </span>
        )}
      </div>
      {enrollment.completion_rate === 100 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-green-700">
            <span>Progression</span>
            <span className="font-medium">100%</span>
          </div>
          <Progress value={100} className="h-2 bg-green-200 [&>div]:bg-green-500" />
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function LearnerPage() {
  const supabase = createClient();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [learner, setLearner] = useState<LearnerWithDetails | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfileForm>({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    job_title: "",
  });

  const now = new Date();

  // ── derived data ─────────────────────────────────────────────────────────

  const enrollments = learner?.enrollments ?? [];

  const inProgressEnrollments = enrollments.filter(
    (e) =>
      e.session?.status === "in_progress" &&
      e.status !== "cancelled"
  );

  const upcomingEnrollments = enrollments.filter(
    (e) =>
      e.session &&
      isAfter(parseISO(e.session.start_date), now) &&
      e.session.status !== "cancelled" &&
      e.status !== "cancelled"
  );

  const completedEnrollments = enrollments.filter(
    (e) => e.status === "completed" || e.session?.status === "completed"
  );

  const totalHours = completedEnrollments.reduce(
    (acc, e) => acc + (e.session?.training?.duration_hours ?? 0),
    0
  );

  // ── data fetching ──────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: learnerData, error } = await supabase
        .from("learners")
        .select(
          `
          *,
          client:clients(company_name),
          enrollments(
            *,
            session:sessions(
              *,
              training:trainings(title, description, duration_hours, certification)
            )
          )
        `
        )
        .eq("profile_id", user.id)
        .single();

      if (error || !learnerData) {
        setLearner(null);
        return;
      }

      setLearner(learnerData as LearnerWithDetails);
      setProfileForm({
        first_name: learnerData.first_name ?? "",
        last_name: learnerData.last_name ?? "",
        email: learnerData.email ?? "",
        phone: learnerData.phone ?? "",
        job_title: learnerData.job_title ?? "",
      });
    } catch (err) {
      console.error("LearnerPage fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── profile update ──────────────────────────────────────────────────────────

  const handleSaveProfile = async () => {
    if (!learner) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("learners")
        .update({
          first_name: profileForm.first_name,
          last_name: profileForm.last_name,
          email: profileForm.email,
          phone: profileForm.phone,
          job_title: profileForm.job_title,
        })
        .eq("id", learner.id);

      if (error) throw error;

      setLearner((prev) =>
        prev ? { ...prev, ...profileForm } : prev
      );
      setEditingProfile(false);
      toast({
        title: "Profil mis à jour",
        description: "Vos informations ont été enregistrées.",
      });
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
    if (!learner) return;
    setProfileForm({
      first_name: learner.first_name ?? "",
      last_name: learner.last_name ?? "",
      email: learner.email ?? "",
      phone: learner.phone ?? "",
      job_title: learner.job_title ?? "",
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

  if (!learner) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <GraduationCap className="h-12 w-12 text-muted-foreground" />
        <p className="text-lg font-medium text-muted-foreground">
          Profil apprenant non configuré
        </p>
        <p className="text-sm text-muted-foreground">
          Contactez votre administrateur pour configurer votre profil apprenant.
        </p>
      </div>
    );
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Welcome header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={undefined} alt={`${learner.first_name} ${learner.last_name}`} />
            <AvatarFallback className="bg-primary/10 text-primary font-bold text-xl">
              {getInitials(learner.first_name, learner.last_name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Bienvenue, {learner.first_name} !
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {learner.job_title && (
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Briefcase className="h-3.5 w-3.5" />
                  {learner.job_title}
                </span>
              )}
              {learner.client?.company_name && (
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {learner.client.company_name}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Formations inscrites
              </span>
              <span className="text-3xl font-bold">
                {enrollments.filter((e) => e.status !== "cancelled").length}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Formations complétées
              </span>
              <span className="text-3xl font-bold">{completedEnrollments.length}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                En cours
              </span>
              <span className="text-3xl font-bold">{inProgressEnrollments.length}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Heures de formation
              </span>
              <span className="text-3xl font-bold">{totalHours}h</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Browse available sessions ── */}
      <Link href="/learner/sessions">
        <Card className="border-dashed border-2 border-blue-200 bg-blue-50/50 hover:bg-blue-50 transition-colors cursor-pointer">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Parcourir les formations disponibles</p>
                  <p className="text-sm text-gray-500">Découvrez et inscrivez-vous aux sessions ouvertes</p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-blue-400" />
            </div>
          </CardContent>
        </Card>
      </Link>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Main column ── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Mes formations with tabs */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                Mes formations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="inprogress">
                <TabsList className="w-full mb-4">
                  <TabsTrigger value="inprogress" className="flex-1 gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    En cours
                    {inProgressEnrollments.length > 0 && (
                      <Badge className="h-5 w-5 flex items-center justify-center p-0 text-xs bg-yellow-100 text-yellow-800 ml-1">
                        {inProgressEnrollments.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="upcoming" className="flex-1 gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    À venir
                    {upcomingEnrollments.length > 0 && (
                      <Badge className="h-5 w-5 flex items-center justify-center p-0 text-xs bg-blue-100 text-blue-800 ml-1">
                        {upcomingEnrollments.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="completed" className="flex-1 gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Terminées
                    {completedEnrollments.length > 0 && (
                      <Badge className="h-5 w-5 flex items-center justify-center p-0 text-xs bg-green-100 text-green-800 ml-1">
                        {completedEnrollments.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>

                {/* En cours */}
                <TabsContent value="inprogress">
                  {inProgressEnrollments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                      <Clock className="h-8 w-8" />
                      <p className="text-sm">Aucune formation en cours</p>
                    </div>
                  ) : (
                    <ScrollArea className="max-h-[480px]">
                      <div className="space-y-3">
                        {inProgressEnrollments.map((enrollment) => (
                          <EnrollmentCard key={enrollment.id} enrollment={enrollment} />
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </TabsContent>

                {/* À venir */}
                <TabsContent value="upcoming">
                  {upcomingEnrollments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                      <CalendarDays className="h-8 w-8" />
                      <p className="text-sm">Aucune formation à venir</p>
                    </div>
                  ) : (
                    <ScrollArea className="max-h-[480px]">
                      <div className="space-y-3">
                        {upcomingEnrollments
                          .sort(
                            (a, b) =>
                              parseISO(a.session!.start_date).getTime() -
                              parseISO(b.session!.start_date).getTime()
                          )
                          .map((enrollment) => (
                            <EnrollmentCard key={enrollment.id} enrollment={enrollment} />
                          ))}
                      </div>
                    </ScrollArea>
                  )}
                </TabsContent>

                {/* Terminées */}
                <TabsContent value="completed">
                  {completedEnrollments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                      <CheckCircle2 className="h-8 w-8" />
                      <p className="text-sm">Aucune formation terminée</p>
                    </div>
                  ) : (
                    <ScrollArea className="max-h-[480px]">
                      <div className="space-y-3">
                        {completedEnrollments.map((enrollment) => (
                          <EnrollmentCard key={enrollment.id} enrollment={enrollment} />
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Achievements / Certifications */}
          {completedEnrollments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-yellow-500" />
                  Mes certifications &amp; attestations
                </CardTitle>
                <CardDescription>
                  {completedEnrollments.length} formation
                  {completedEnrollments.length > 1 ? "s" : ""} terminée
                  {completedEnrollments.length > 1 ? "s" : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {completedEnrollments.map((enrollment) => (
                    <CertificateCard key={enrollment.id} enrollment={enrollment} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Right column ── */}
        <div className="space-y-6">
          {/* Profile card */}
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
                    <p className="text-sm">{learner.first_name || "—"}</p>
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
                    <p className="text-sm">{learner.last_name || "—"}</p>
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
                  <p className="text-sm flex items-center gap-1">
                    {learner.email ? (
                      <>
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        {learner.email}
                      </>
                    ) : (
                      "—"
                    )}
                  </p>
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
                  <p className="text-sm flex items-center gap-1">
                    {learner.phone ? (
                      <>
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        {learner.phone}
                      </>
                    ) : (
                      "—"
                    )}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Poste / Fonction</Label>
                {editingProfile ? (
                  <Input
                    value={profileForm.job_title}
                    onChange={(e) =>
                      setProfileForm((p) => ({ ...p, job_title: e.target.value }))
                    }
                    className="h-8 text-sm"
                  />
                ) : (
                  <p className="text-sm flex items-center gap-1">
                    {learner.job_title ? (
                      <>
                        <Briefcase className="h-3 w-3 text-muted-foreground" />
                        {learner.job_title}
                      </>
                    ) : (
                      "—"
                    )}
                  </p>
                )}
              </div>

              {learner.client?.company_name && (
                <>
                  <Separator />
                  <div className="space-y-1">
                    <Label className="text-xs">Entreprise</Label>
                    <p className="text-sm flex items-center gap-1">
                      <Building2 className="h-3 w-3 text-muted-foreground" />
                      {learner.client.company_name}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Quick stats summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-primary" />
                Résumé de parcours
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total inscriptions</span>
                <span className="font-semibold">
                  {enrollments.filter((e) => e.status !== "cancelled").length}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 text-yellow-500" />
                  En cours
                </span>
                <span className="font-semibold">{inProgressEnrollments.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5 text-blue-500" />
                  À venir
                </span>
                <span className="font-semibold">{upcomingEnrollments.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  Terminées
                </span>
                <span className="font-semibold">{completedEnrollments.length}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Award className="h-3.5 w-3.5 text-yellow-500" />
                  Heures totales
                </span>
                <span className="font-bold">{totalHours}h</span>
              </div>

              {totalHours > 0 && (
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Progression globale</span>
                    <span>
                      {completedEnrollments.length}/
                      {enrollments.filter((e) => e.status !== "cancelled").length}
                    </span>
                  </div>
                  <Progress
                    value={
                      enrollments.filter((e) => e.status !== "cancelled").length > 0
                        ? (completedEnrollments.length /
                            enrollments.filter((e) => e.status !== "cancelled").length) *
                          100
                        : 0
                    }
                    className="h-2"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
