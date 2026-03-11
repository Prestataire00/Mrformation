"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CalendarDays,
  MapPin,
  Clock,
  Loader2,
  BookOpen,
  CheckCircle,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate, STATUS_COLORS, SESSION_STATUS_LABELS } from "@/lib/utils";

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
  const [sessions, setSessions] = useState<FormationSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "upcoming" | "in_progress" | "completed">("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

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
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("session_id, learner_id")
      .in("learner_id", learnerIds)
      .neq("status", "cancelled");

    if (!enrollments || enrollments.length === 0) {
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
        enrolled_learners: enrollments.filter((e) => e.session_id === s.id).length,
      };
    }) as FormationSession[];

    setSessions(mapped);
    setLoading(false);
  }, [supabase]);

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
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Formations</h1>
          <p className="text-gray-500 text-sm mt-1">
            Suivi des formations de vos collaborateurs
          </p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {(["all", "upcoming", "in_progress", "completed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              filter === f
                ? "bg-blue-100 text-blue-700"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            {f === "all" ? "Toutes" : f === "upcoming" ? "À venir" : f === "in_progress" ? "En cours" : "Terminées"}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Aucune formation</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((session) => (
            <div
              key={session.id}
              className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900">{session.title}</h3>
                  {session.training && (
                    <p className="text-gray-500 text-sm">{session.training.title}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-500">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {formatDate(session.start_date)}
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
