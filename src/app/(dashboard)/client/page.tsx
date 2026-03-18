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
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  formatDate,
  getInitials,
  SESSION_STATUS_LABELS,
  STATUS_COLORS,
} from "@/lib/utils";
import type { Client, Learner, Session, Enrollment } from "@/lib/types";
import {
  Building2,
  Users,
  CalendarDays,
  CalendarCheck,
  GraduationCap,
  MapPin,
  Briefcase,
  Mail,
  TrendingUp,
  CheckCircle2,
  Loader2,
  AlertCircle,
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
    training?: { title: string; description: string | null };
  };
  learner?: Learner;
}

interface LearnerWithEnrollments extends Learner {
  enrollments?: EnrollmentWithSession[];
}

interface ClientWithDetails extends Client {
  learners?: LearnerWithEnrollments[];
}

// ─── component ────────────────────────────────────────────────────────────────

export default function ClientPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<ClientWithDetails | null>(null);
  const [allEnrollments, setAllEnrollments] = useState<EnrollmentWithSession[]>([]);
  const [programEnrollments, setProgramEnrollments] = useState<{
    id: string;
    program_id: string;
    learner_id: string;
    status: string;
    completion_rate: number;
    program: { title: string } | null;
    learner: { first_name: string; last_name: string } | null;
  }[]>([]);

  const now = new Date();

  // ── derived data ─────────────────────────────────────────────────────────

  const learners = client?.learners ?? [];

  const activeSessions = allEnrollments.filter(
    (e) =>
      e.session?.status === "in_progress" && e.status !== "cancelled"
  );

  const upcomingEnrollments = allEnrollments.filter(
    (e) =>
      e.session &&
      isAfter(parseISO(e.session.start_date), now) &&
      e.session.status !== "cancelled" &&
      e.status !== "cancelled"
  );

  const completedEnrollments = allEnrollments.filter(
    (e) => e.status === "completed" || e.session?.status === "completed"
  );

  // unique sessions that are in_progress
  const inProgressSessions = Array.from(
    new Map(
      activeSessions
        .filter((e) => e.session)
        .map((e) => [e.session!.id, e.session!])
    ).values()
  );

  // unique upcoming sessions
  const upcomingSessions = Array.from(
    new Map(
      upcomingEnrollments
        .filter((e) => e.session)
        .map((e) => [e.session!.id, e.session!])
    ).values()
  ).sort((a, b) => parseISO(a.start_date).getTime() - parseISO(b.start_date).getTime());

  // ── data fetching ──────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // get the profile to find entity
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (!profile) return;

      // find client linked to this profile's entity
      // A "client" user is linked through the profiles table (role = 'client')
      // We try to find their client record through contacts or direct link
      // Strategy: find client where one of its contacts has this email, or
      // where client is linked to the profile entity and the user email matches
      let clientData: ClientWithDetails | null = null;

      // First attempt: find via contacts table
      if (profile.email) {
        const { data: contactData } = await supabase
          .from("contacts")
          .select("client_id")
          .eq("email", profile.email)
          .limit(1)
          .single();

        if (contactData?.client_id) {
          const { data } = await supabase
            .from("clients")
            .select(
              `
              *,
              learners(
                *,
                enrollments(
                  *,
                  session:sessions(
                    *,
                    training:trainings(title, description)
                  )
                )
              )
            `
            )
            .eq("id", contactData.client_id)
            .single();
          clientData = data as ClientWithDetails | null;
        }
      }

      // Second attempt: find via learners table (profile_id → client_id)
      if (!clientData) {
        const { data: learnerData } = await supabase
          .from("learners")
          .select("client_id")
          .eq("profile_id", user.id)
          .not("client_id", "is", null)
          .limit(1)
          .single();

        if (learnerData?.client_id) {
          const { data } = await supabase
            .from("clients")
            .select(
              `
              *,
              learners(
                *,
                enrollments(
                  *,
                  session:sessions(
                    *,
                    training:trainings(title, description)
                  )
                )
              )
            `
            )
            .eq("id", learnerData.client_id)
            .single();
          clientData = data as ClientWithDetails | null;
        }
      }

      if (!clientData) {
        setClient(null);
        return;
      }

      setClient(clientData);

      // flatten all enrollments across learners
      const allEnrolls: EnrollmentWithSession[] = [];
      for (const learner of clientData.learners ?? []) {
        for (const enrollment of learner.enrollments ?? []) {
          allEnrolls.push({ ...enrollment, learner });
        }
      }
      setAllEnrollments(allEnrolls);

      // Fetch program enrollments for all learners
      const learnerIds = (clientData.learners ?? []).map((l) => l.id);
      if (learnerIds.length > 0) {
        const { data: progEnrolls } = await supabase
          .from("program_enrollments")
          .select("id, program_id, learner_id, status, completion_rate, program:programs(title), learner:learners(first_name, last_name)")
          .in("learner_id", learnerIds);
        setProgramEnrollments((progEnrolls as unknown as typeof programEnrollments) ?? []);
      }
    } catch (err) {
      console.error("ClientPage fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── loading / no-client states ─────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <p className="text-lg font-medium text-muted-foreground">
          Aucun espace client configuré
        </p>
        <p className="text-sm text-muted-foreground">
          Contactez votre administrateur pour accéder à votre espace client.
        </p>
      </div>
    );
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
            <Building2 className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{client.company_name}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {client.sector && (
                <Badge variant="outline" className="text-xs">
                  <Briefcase className="h-3 w-3 mr-1" />
                  {client.sector}
                </Badge>
              )}
              {client.city && (
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {client.city}
                </span>
              )}
              <Badge className={STATUS_COLORS[client.status] ?? ""}>
                {client.status === "active"
                  ? "Actif"
                  : client.status === "inactive"
                  ? "Inactif"
                  : "Prospect"}
              </Badge>
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
                Apprenants inscrits
              </span>
              <span className="text-3xl font-bold">{learners.length}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Formations en cours
              </span>
              <span className="text-3xl font-bold">{inProgressSessions.length}</span>
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
                Formations complétées
              </span>
              <span className="text-3xl font-bold">{completedEnrollments.length}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Left / main column ── */}
        <div className="lg:col-span-2 space-y-6">
          {/* In-progress formations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Mes formations en cours
              </CardTitle>
              <CardDescription>
                {inProgressSessions.length === 0
                  ? "Aucune formation en cours"
                  : `${inProgressSessions.length} formation${inProgressSessions.length > 1 ? "s" : ""} en cours`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {inProgressSessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                  <GraduationCap className="h-8 w-8" />
                  <p className="text-sm">Aucune formation en cours</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {inProgressSessions.map((session) => {
                    // compute average completion for this session across client's learners
                    const sessionEnrollments = allEnrollments.filter(
                      (e) => e.session_id === session.id && e.status !== "cancelled"
                    );
                    const avgCompletion =
                      sessionEnrollments.length > 0
                        ? Math.round(
                            sessionEnrollments.reduce(
                              (acc, e) => acc + (e.completion_rate ?? 0),
                              0
                            ) / sessionEnrollments.length
                          )
                        : 0;

                    return (
                      <div key={session.id} className="space-y-2 rounded-lg border p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-sm">{session.title}</p>
                            {(session as SessionWithTraining).training?.title && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {(session as SessionWithTraining).training?.title}
                              </p>
                            )}
                          </div>
                          <Badge className={MODE_COLORS[session.mode] ?? ""}>
                            {MODE_LABELS[session.mode] ?? session.mode}
                          </Badge>
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
                            {sessionEnrollments.length} apprenant
                            {sessionEnrollments.length > 1 ? "s" : ""}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Progression moyenne</span>
                            <span className="font-medium">{avgCompletion}%</span>
                          </div>
                          <Progress value={avgCompletion} className="h-2" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming formations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarCheck className="h-5 w-5 text-primary" />
                Mes formations à venir
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
                  <p className="text-sm">Aucune session à venir</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingSessions.map((session) => {
                    const sessionEnrollments = allEnrollments.filter(
                      (e) => e.session_id === session.id && e.status !== "cancelled"
                    );
                    return (
                      <div
                        key={session.id}
                        className="flex flex-col gap-2 rounded-lg border p-4 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-sm">{session.title}</p>
                            {(session as SessionWithTraining).training?.title && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {(session as SessionWithTraining).training?.title}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Badge className={MODE_COLORS[session.mode] ?? ""}>
                              {MODE_LABELS[session.mode] ?? session.mode}
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
                            {sessionEnrollments.length} apprenant
                            {sessionEnrollments.length > 1 ? "s" : ""} inscrit
                            {sessionEnrollments.length > 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
          {/* Program enrollments */}
          {programEnrollments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-primary" />
                  Parcours de formation
                </CardTitle>
                <CardDescription>
                  Progression de vos apprenants sur les parcours
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(() => {
                  // Group by program
                  const byProgram = new Map<string, { title: string; enrollments: typeof programEnrollments }>();
                  for (const pe of programEnrollments) {
                    const program = Array.isArray(pe.program) ? pe.program[0] : pe.program;
                    const title = program?.title ?? "Parcours";
                    if (!byProgram.has(pe.program_id)) {
                      byProgram.set(pe.program_id, { title, enrollments: [] });
                    }
                    byProgram.get(pe.program_id)!.enrollments.push(pe);
                  }

                  return (
                    <div className="space-y-4">
                      {Array.from(byProgram.entries()).map(([progId, { title, enrollments: progEnrolls }]) => {
                        const avgRate = Math.round(
                          progEnrolls.reduce((acc, e) => acc + e.completion_rate, 0) / progEnrolls.length
                        );
                        const completedCount = progEnrolls.filter((e) => e.status === "completed").length;

                        return (
                          <div key={progId} className="rounded-lg border p-4 space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-semibold text-sm">{title}</p>
                              <Badge className="bg-blue-100 text-blue-800 text-xs shrink-0">
                                {progEnrolls.length} apprenant{progEnrolls.length > 1 ? "s" : ""}
                              </Badge>
                            </div>
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Progression moyenne</span>
                                <span className="font-medium">{avgRate}%</span>
                              </div>
                              <Progress value={avgRate} className="h-2" />
                            </div>
                            <div className="flex gap-2 text-xs text-muted-foreground">
                              <span>{completedCount} terminé{completedCount > 1 ? "s" : ""}</span>
                              <span>·</span>
                              <span>{progEnrolls.length - completedCount} en cours</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Right column — Learners ── */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-primary" />
                Mes apprenants
              </CardTitle>
              <CardDescription>
                {learners.length} apprenant{learners.length > 1 ? "s" : ""} rattaché
                {learners.length > 1 ? "s" : ""} à votre compte
              </CardDescription>
            </CardHeader>
            <CardContent>
              {learners.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Aucun apprenant rattaché
                </p>
              ) : (
                <ScrollArea className="max-h-[480px]">
                  <div className="space-y-3">
                    {learners.map((learner) => {
                      const activeCount = (learner.enrollments ?? []).filter(
                        (e) =>
                          e.session?.status === "in_progress" && e.status !== "cancelled"
                      ).length;
                      const upcomingCount = (learner.enrollments ?? []).filter(
                        (e) =>
                          e.session &&
                          isAfter(parseISO(e.session.start_date), now) &&
                          e.status !== "cancelled"
                      ).length;
                      const completedCount = (learner.enrollments ?? []).filter(
                        (e) => e.status === "completed"
                      ).length;

                      return (
                        <div
                          key={learner.id}
                          className="rounded-lg border p-3 space-y-2"
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarImage src={undefined} alt={`${learner.first_name} ${learner.last_name}`} />
                              <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                                {getInitials(learner.first_name, learner.last_name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">
                                {learner.first_name} {learner.last_name}
                              </p>
                              {learner.job_title && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {learner.job_title}
                                </p>
                              )}
                            </div>
                          </div>
                          {learner.email && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Mail className="h-3 w-3 shrink-0" />
                              <span className="truncate">{learner.email}</span>
                            </p>
                          )}
                          <div className="flex gap-2 flex-wrap">
                            {activeCount > 0 && (
                              <Badge className="bg-yellow-100 text-yellow-800 text-xs">
                                {activeCount} en cours
                              </Badge>
                            )}
                            {upcomingCount > 0 && (
                              <Badge className="bg-blue-100 text-blue-800 text-xs">
                                {upcomingCount} à venir
                              </Badge>
                            )}
                            {completedCount > 0 && (
                              <Badge className="bg-green-100 text-green-800 text-xs">
                                {completedCount} terminée{completedCount > 1 ? "s" : ""}
                              </Badge>
                            )}
                            {activeCount === 0 && upcomingCount === 0 && completedCount === 0 && (
                              <Badge variant="outline" className="text-xs">
                                Aucune inscription
                              </Badge>
                            )}
                          </div>
                          {(learner.enrollments ?? []).length > 0 && (
                            <>
                              <Separator />
                              <div className="space-y-1">
                                {(learner.enrollments ?? [])
                                  .filter((e) => e.status !== "cancelled")
                                  .slice(0, 3)
                                  .map((enrollment) => (
                                    <div
                                      key={enrollment.id}
                                      className="flex items-center justify-between gap-2"
                                    >
                                      <p className="text-xs truncate text-muted-foreground flex-1">
                                        {enrollment.session?.title ?? "Session inconnue"}
                                      </p>
                                      <Badge
                                        className={`text-xs shrink-0 ${STATUS_COLORS[enrollment.status] ?? ""}`}
                                      >
                                        {ENROLLMENT_STATUS_LABELS[enrollment.status] ?? enrollment.status}
                                      </Badge>
                                    </div>
                                  ))}
                                {(learner.enrollments ?? []).filter(
                                  (e) => e.status !== "cancelled"
                                ).length > 3 && (
                                  <p className="text-xs text-muted-foreground">
                                    +
                                    {(learner.enrollments ?? []).filter(
                                      (e) => e.status !== "cancelled"
                                    ).length - 3}{" "}
                                    autre(s)
                                  </p>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {/* Completed formations summary */}
          {completedEnrollments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Formations terminées
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[200px]">
                  <div className="space-y-2">
                    {Array.from(
                      new Map(
                        completedEnrollments
                          .filter((e) => e.session)
                          .map((e) => [e.session!.id, e.session!])
                      ).values()
                    ).map((session) => (
                      <div key={session.id} className="flex items-start gap-2 py-1">
                        <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium">{session.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(session.end_date)}
                          </p>
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

// ─── local helper type ─────────────────────────────────────────────────────────
type SessionWithTraining = Session & {
  training?: { title: string; description: string | null };
};
