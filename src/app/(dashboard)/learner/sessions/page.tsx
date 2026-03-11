"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import {
  Calendar,
  MapPin,
  Users,
  Loader2,
  CheckCircle,
  Clock,
  Monitor,
  Search,
} from "lucide-react";

interface SessionWithTraining {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  location: string | null;
  mode: string;
  status: string;
  max_participants: number | null;
  is_public: boolean;
  training: { id: string; title: string } | null;
  enrollment_count: number;
  is_enrolled: boolean;
}

export default function LearnerSessionsPage() {
  const supabase = createClient();
  const { entityId } = useEntity();

  const [sessions, setSessions] = useState<SessionWithTraining[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  async function loadSessions() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Get learner ID
    const { data: learner } = await supabase
      .from("learners")
      .select("id")
      .eq("profile_id", user.id)
      .single();

    // Get public sessions for this entity
    const { data: sessionsData } = await supabase
      .from("sessions")
      .select(
        "id, title, start_date, end_date, location, mode, status, max_participants, is_public, training:trainings(id, title)"
      )
      .eq("entity_id", entityId)
      .eq("is_public", true)
      .in("status", ["upcoming", "in_progress"])
      .order("start_date", { ascending: true });

    if (!sessionsData) {
      setLoading(false);
      return;
    }

    // Get enrollment counts and check if learner is enrolled
    const sessionsWithInfo = await Promise.all(
      sessionsData.map(async (s) => {
        const { count } = await supabase
          .from("enrollments")
          .select("id", { count: "exact", head: true })
          .eq("session_id", s.id)
          .neq("status", "cancelled");

        let isEnrolled = false;
        if (learner) {
          const { data: enrollment } = await supabase
            .from("enrollments")
            .select("id")
            .eq("session_id", s.id)
            .eq("learner_id", learner.id)
            .maybeSingle();
          isEnrolled = !!enrollment;
        }

        // Handle the training relation which could be an array or object
        const training = Array.isArray(s.training)
          ? s.training[0] ?? null
          : s.training;

        // Auto-compute status based on dates
        const now = new Date();
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
          training,
          enrollment_count: count ?? 0,
          is_enrolled: isEnrolled,
        } as SessionWithTraining;
      })
    );

    setSessions(sessionsWithInfo);
    setLoading(false);
  }

  async function handleEnroll(sessionId: string) {
    setEnrollingId(sessionId);
    setMessage(null);

    try {
      const res = await fetch("/api/enrollments/self-enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error });
      } else {
        setMessage({ type: "success", text: "Inscription réussie !" });
        // Reload sessions to update UI
        await loadSessions();
      }
    } catch {
      setMessage({ type: "error", text: "Erreur lors de l'inscription" });
    }

    setEnrollingId(null);
  }

  const filtered = sessions.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.title.toLowerCase().includes(q) ||
      s.training?.title?.toLowerCase().includes(q) ||
      s.location?.toLowerCase().includes(q)
    );
  });

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Formations Disponibles
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Inscrivez-vous aux sessions de formation ouvertes
          </p>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm ${
            message.type === "success"
              ? "bg-green-50 border border-green-200 text-green-700"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Rechercher par nom, formation, lieu..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Aucune session disponible</p>
          <p className="text-sm mt-1">
            Il n&apos;y a pas de sessions ouvertes aux inscriptions pour le
            moment.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map((session) => {
            const spotsLeft = session.max_participants
              ? session.max_participants - session.enrollment_count
              : null;
            const isFull = spotsLeft !== null && spotsLeft <= 0;

            return (
              <div
                key={session.id}
                className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 text-base">
                      {session.title}
                    </h3>
                    {session.training && (
                      <p className="text-gray-500 text-sm mt-0.5">
                        {session.training.title}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-500">
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
                        <Monitor className="w-3.5 h-3.5" />
                        {session.mode === "remote"
                          ? "Distanciel"
                          : session.mode === "hybrid"
                          ? "Hybride"
                          : "Présentiel"}
                      </span>
                      {session.max_participants && (
                        <span className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" />
                          {session.enrollment_count}/
                          {session.max_participants} inscrits
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0">
                    {session.is_enrolled ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 text-sm font-medium rounded-lg">
                        <CheckCircle className="w-4 h-4" />
                        Inscrit
                      </span>
                    ) : isFull ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-500 text-sm font-medium rounded-lg">
                        Complet
                      </span>
                    ) : (
                      <button
                        onClick={() => handleEnroll(session.id)}
                        disabled={enrollingId === session.id}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
                      >
                        {enrollingId === session.id ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Inscription...
                          </>
                        ) : (
                          "S'inscrire"
                        )}
                      </button>
                    )}
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
