"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import {
  CalendarDays,
  MapPin,
  Loader2,
  BookOpen,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatDate, STATUS_COLORS, SESSION_STATUS_LABELS } from "@/lib/utils";
import {
  filterEnrollmentsByLearnerIds,
  countClientLearnersOnSession,
} from "@/lib/utils/client-portal-isolation";

interface FormationSession {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  location: string | null;
  mode: string;
  status: string;
  training: { title: string } | null;
  enrolled_learners: number;
}

const MODE_LABELS: Record<string, string> = {
  presentiel: "Présentiel",
  distanciel: "Distanciel",
  hybride: "Hybride",
};

export default function ClientFormationsPage() {
  const supabase = createClient();
  const { toast } = useToast();
  const [sessions, setSessions] = useState<FormationSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "upcoming" | "in_progress" | "completed">("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("profile_id", user.id)
      .single();

    if (!client) {
      setLoading(false);
      return;
    }

    // Get learners of this client
    const { data: learners } = await supabase
      .from("learners")
      .select("id")
      .eq("client_id", client.id);

    if (!learners || learners.length === 0) {
      setLoading(false);
      return;
    }

    const learnerIds = learners.map((l) => l.id);

    // Get enrollments for these learners
    const { data: rawEnrollments } = await supabase
      .from("enrollments")
      .select("session_id, learner_id")
      .in("learner_id", learnerIds)
      .neq("status", "cancelled");

    // Defense in depth — even though .in("learner_id", learnerIds) already filters,
    // apply the helper to guarantee no leak if the query is modified in the future.
    // Cf. Story 3.7 / NFR-SEC-2 — isolement portail client.
    const enrollments = filterEnrollmentsByLearnerIds(rawEnrollments, learnerIds);

    if (enrollments.length === 0) {
      setLoading(false);
      return;
    }

    // Get unique session IDs
    const sessionIds = [...new Set(enrollments.map((e) => e.session_id))];

    const { data: sessionsData } = await supabase
      .from("sessions")
      .select("id, title, start_date, end_date, location, mode, status, training:trainings(title)")
      .in("id", sessionIds)
      .order("start_date", { ascending: false });

    const now = new Date();
    const mapped = (sessionsData ?? []).map((s) => {
      const start = new Date(s.start_date);
      const end = new Date(s.end_date);
      let status = s.status;
      if (status !== "cancelled") {
        if (now >= end) status = "completed";
        else if (now >= start) status = "in_progress";
        else status = "upcoming";
      }
      return {
        ...s,
        status,
        training: Array.isArray(s.training) ? s.training[0] ?? null : s.training,
        // INTER : on ne compte QUE les apprenants du client courant sur cette session.
        enrolled_learners: countClientLearnersOnSession(enrollments, learnerIds, s.id),
      };
    }) as FormationSession[];

    setSessions(mapped);
    } catch (err) {
      console.error("[ClientFormations] fetch error:", err);
      toast({ title: "Erreur de chargement", description: "Impossible de charger vos formations.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [supabase, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = sessions.filter((s) => {
    if (filter === "all") return true;
    return s.status === filter;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Formations</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Suivi des formations de vos collaborateurs
          </p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {(["all", "upcoming", "in_progress", "completed"] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "Toutes" : f === "upcoming" ? "À venir" : f === "in_progress" ? "En cours" : "Terminées"}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-40" />
          {filter !== "all" && sessions.length > 0 ? (
            <>
              <p className="font-medium">Aucune formation dans cette catégorie</p>
              <Button
                variant="link"
                size="sm"
                onClick={() => setFilter("all")}
                className="mt-2"
              >
                Voir toutes les formations
              </Button>
            </>
          ) : (
            <p className="font-medium">Aucune formation</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((session) => (
            <Card key={session.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground">{session.title}</h3>
                    {session.training && (
                      <p className="text-muted-foreground text-sm">{session.training.title}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5" />
                        {formatDate(session.start_date)}
                        {session.end_date ? ` — ${formatDate(session.end_date)}` : ""}
                      </span>
                      {session.location && (
                        <span className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5" />
                          {session.location}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        {session.enrolled_learners} collaborateur{session.enrolled_learners !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className="text-xs">{MODE_LABELS[session.mode] ?? session.mode}</Badge>
                    <Badge className={cn("text-xs", STATUS_COLORS[session.status])}>
                      {SESSION_STATUS_LABELS[session.status] ?? session.status}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
