"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CalendarDays,
  MapPin,
  Users,
  Clock,
  Loader2,
  Monitor,
  Building2,
  Wifi,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate, SESSION_STATUS_LABELS, STATUS_COLORS } from "@/lib/utils";
import type { Session } from "@/lib/types";

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

interface SessionWithDetails extends Omit<Session, "training" | "enrollments"> {
  training?: { title: string; duration_hours: number | null };
  enrollments?: { id: string }[];
}

export default function TrainerSessionsPage() {
  const supabase = createClient();
  const [sessions, setSessions] = useState<SessionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "upcoming" | "completed">("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: trainer } = await supabase
      .from("trainers")
      .select("id")
      .eq("profile_id", user.id)
      .single();

    if (!trainer) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("sessions")
      .select("*, training:trainings(title, duration_hours), enrollments(id)")
      .eq("trainer_id", trainer.id)
      .order("start_date", { ascending: false });

    const now = new Date();
    const mapped = ((data as SessionWithDetails[]) ?? []).map((s) => {
      if (s.status === "cancelled") return s;
      const start = new Date(s.start_date);
      const end = new Date(s.end_date);
      let status = s.status;
      if (now >= end) status = "completed";
      else if (now >= start) status = "in_progress";
      else status = "upcoming";
      return { ...s, status };
    });
    setSessions(mapped);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const now = new Date();
  const filtered = sessions.filter((s) => {
    if (filter === "upcoming") return new Date(s.start_date) > now && s.status !== "cancelled";
    if (filter === "completed") return s.status === "completed";
    return true;
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
          <h1 className="text-2xl font-bold text-gray-900">Mes Sessions</h1>
          <p className="text-gray-500 text-sm mt-1">
            {sessions.length} session{sessions.length !== 1 ? "s" : ""} au total
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {(["all", "upcoming", "completed"] as const).map((f) => (
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
            {f === "all" ? "Toutes" : f === "upcoming" ? "À venir" : "Terminées"}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Aucune session</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((session) => {
            const ModeIcon =
              session.mode === "presentiel" ? Building2 :
              session.mode === "distanciel" ? Wifi : Monitor;

            return (
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
                        {formatDate(session.start_date)} — {formatDate(session.end_date)}
                      </span>
                      {session.location && (
                        <span className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5" />
                          {session.location}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        {session.enrollments?.length ?? 0} inscrit{(session.enrollments?.length ?? 0) !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className={cn("text-xs gap-1", MODE_COLORS[session.mode])}>
                      <ModeIcon className="h-3 w-3" />
                      {MODE_LABELS[session.mode]}
                    </Badge>
                    <Badge className={cn("text-xs", STATUS_COLORS[session.status])}>
                      {SESSION_STATUS_LABELS[session.status] ?? session.status}
                    </Badge>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
