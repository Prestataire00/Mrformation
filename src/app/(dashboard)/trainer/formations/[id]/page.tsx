"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { resolveTrainerSessionIds } from "@/lib/auth/trainer-session-access";
import { resolveTrainerTasksStatus } from "@/lib/services/trainer-tasks";
import type { TrainerTasksStatus } from "@/lib/services/trainer-tasks";
import { useToast } from "@/components/ui/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  CheckCircle,
  Circle,
  CalendarDays,
  MapPin,
  Users,
  Clock,
  BookOpen,
  ShieldOff,
  AlertCircle,
  PencilLine,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import type { FormationTimeSlot, Learner } from "@/lib/types";
import { DerouleEditDialog } from "./_components/DerouleEditDialog";

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

interface SessionData {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  location: string | null;
  mode: string;
  program: { title: string } | null;
  formation_time_slots: FormationTimeSlot[];
  enrollments: { id: string; learner: Learner | null }[];
}

function formatTimeParis(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
}

function formatDateParis(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Paris",
  });
}

// ─── Icône de statut de tâche ────────────────────────────────────────────────

function TaskStatusIcon({ done }: { done: boolean | null }) {
  if (done === null) {
    return <span className="text-gray-300 text-lg leading-none select-none">—</span>;
  }
  if (done) {
    return <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />;
  }
  return <Circle className="h-5 w-5 text-gray-300 shrink-0" />;
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function TrainerFormationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [session, setSession] = useState<SessionData | null>(null);
  const [taskStatus, setTaskStatus] = useState<TrainerTasksStatus | null>(null);
  const [editingSlot, setEditingSlot] = useState<FormationTimeSlot | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setUnauthorized(true);
        setLoading(false);
        return;
      }

      // ── Garde d'accès : vérifier que cette session appartient au formateur ──
      const sessionIds = await resolveTrainerSessionIds(supabase, user.id);
      if (!sessionIds.includes(id)) {
        setUnauthorized(true);
        setLoading(false);
        return;
      }

      // ── Fetch session + relations ──────────────────────────────────────────
      const { data, error } = await supabase
        .from("sessions")
        .select(
          `id, title, start_date, end_date, location, mode,
           program:programs(title),
           formation_time_slots(id, session_id, title, start_time, end_time, slot_order,
             module_title, module_objectives, module_themes, module_exercises, color, created_at, updated_at),
           enrollments(id, learner:learners(id, first_name, last_name, email, phone, job_title,
             learner_type, client_id, entity_id, profile_id, created_at))`
        )
        .eq("id", id)
        .single();

      if (error) {
        toast({
          title: "Erreur",
          description: "Impossible de charger la formation.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // Sort slots by slot_order
      const raw = data as unknown as SessionData;
      const rawSlots: FormationTimeSlot[] = (raw.formation_time_slots ?? []);
      rawSlots.sort((a, b) => a.slot_order - b.slot_order);

      setSession({
        ...raw,
        formation_time_slots: rawSlots,
      });

      // ── Statut des tâches ─────────────────────────────────────────────────
      const status = await resolveTrainerTasksStatus(supabase, id);
      setTaskStatus(status);
    } catch (err) {
      toast({
        title: "Erreur inattendue",
        description: err instanceof Error ? err.message : "Une erreur est survenue.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [supabase, id, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── États de chargement / erreur / accès refusé ───────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-500">
        <ShieldOff className="h-12 w-12 opacity-40" />
        <p className="font-semibold text-lg">Accès non autorisé</p>
        <p className="text-sm text-gray-400">
          Vous n&apos;êtes pas assigné à cette formation.
        </p>
        <Link
          href="/trainer/sessions"
          className="mt-2 text-sm text-blue-600 hover:underline"
        >
          Retour à mes sessions
        </Link>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-500">
        <AlertCircle className="h-12 w-12 opacity-40" />
        <p className="font-medium">Formation introuvable.</p>
      </div>
    );
  }

  const learners = session.enrollments
    .map((e) => e.learner)
    .filter((l): l is Learner => l !== null);

  // ── Rendu principal ───────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-2">
      {/* ── Lien retour ── */}
      <div>
        <Link
          href="/trainer/sessions"
          className="text-sm text-gray-500 hover:text-gray-700 hover:underline"
        >
          ← Retour à mes sessions
        </Link>
      </div>

      {/* ── En-tête ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
        <h1 className="text-2xl font-bold text-gray-900">{session.title}</h1>

        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            {formatDate(session.start_date)} — {formatDate(session.end_date)}
          </span>
          {session.location && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              {session.location}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            {learners.length} apprenant{learners.length !== 1 ? "s" : ""}
          </span>
          {session.program?.title && (
            <span className="flex items-center gap-1.5">
              <BookOpen className="h-4 w-4" />
              {session.program.title}
            </span>
          )}
        </div>

        {session.mode && (
          <Badge className={cn("text-xs w-fit", MODE_COLORS[session.mode] ?? "bg-gray-100 text-gray-700")}>
            {MODE_LABELS[session.mode] ?? session.mode}
          </Badge>
        )}
      </div>

      {/* ── Section « Tâches à faire » ── */}
      {taskStatus && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-gray-800">
              Tâches à faire
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Tâche 1 : Déroulé pédagogique */}
            <div className="flex items-start gap-3">
              <TaskStatusIcon done={taskStatus.deroule} />
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-medium", taskStatus.deroule ? "text-gray-500 line-through" : "text-gray-800")}>
                  Renseigner le déroulé pédagogique réalisé
                </p>
              </div>
              {session.formation_time_slots.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs shrink-0"
                  onClick={() => {
                    const slots = session.formation_time_slots;
                    const hasText = (v: string | null | undefined) =>
                      typeof v === "string" && v.trim().length > 0;
                    const firstEmpty = slots.find(
                      (s) =>
                        !hasText(s.module_title) &&
                        !hasText(s.module_objectives) &&
                        !hasText(s.module_themes) &&
                        !hasText(s.module_exercises)
                    );
                    setEditingSlot(firstEmpty ?? slots[0]);
                  }}
                >
                  Accéder
                </Button>
              )}
            </div>

            {/* Tâche 2 : Bilan de fin de formation */}
            <div className="flex items-start gap-3">
              <TaskStatusIcon done={taskStatus.bilan} />
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-medium", taskStatus.bilan === true ? "text-gray-500 line-through" : "text-gray-800")}>
                  Remplir le bilan de fin de formation
                </p>
                {taskStatus.bilan === null && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Aucun bilan demandé pour l&apos;instant
                  </p>
                )}
              </div>
              {taskStatus.bilan !== null && (
                <button
                  disabled
                  className="text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-400 shrink-0 cursor-not-allowed"
                >
                  Accéder
                </button>
              )}
            </div>

            {/* Tâche 3 : Support pédagogique */}
            <div className="flex items-start gap-3">
              <TaskStatusIcon done={taskStatus.support} />
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-medium", taskStatus.support ? "text-gray-500 line-through" : "text-gray-800")}>
                  Ajouter un support pédagogique
                </p>
              </div>
              <Link
                href="/trainer/courses"
                className="text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 shrink-0"
              >
                Accéder
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Planning (créneaux, lecture seule) ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-gray-400" />
            Planning
          </CardTitle>
        </CardHeader>
        <CardContent>
          {session.formation_time_slots.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              Aucun créneau planifié pour l&apos;instant.
            </p>
          ) : (
            <ul className="space-y-2">
              {session.formation_time_slots.map((slot) => (
                <li
                  key={slot.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 text-sm"
                >
                  <div className="shrink-0 text-gray-500 min-w-[140px]">
                    <span className="font-medium">
                      {formatDateParis(slot.start_time)}
                    </span>
                    <br />
                    <span className="text-xs text-gray-400">
                      {formatTimeParis(slot.start_time)} – {formatTimeParis(slot.end_time)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    {slot.title && (
                      <p className="font-medium text-gray-800">{slot.title}</p>
                    )}
                    {slot.module_title && (
                      <p className="text-xs text-gray-500 mt-0.5">{slot.module_title}</p>
                    )}
                    {!slot.title && !slot.module_title && (
                      <p className="text-gray-400 italic">Créneau sans titre</p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs shrink-0 gap-1"
                    onClick={() => setEditingSlot(slot)}
                  >
                    <PencilLine className="h-3 w-3" />
                    Renseigner le déroulé
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Apprenants (lecture seule) ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <Users className="h-4 w-4 text-gray-400" />
            Apprenants ({learners.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {learners.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              Aucun apprenant inscrit pour l&apos;instant.
            </p>
          ) : (
            <ul className="space-y-2">
              {learners.map((learner) => (
                <li
                  key={learner.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 text-sm"
                >
                  <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-xs shrink-0">
                    {learner.first_name?.[0] ?? ""}
                    {learner.last_name?.[0] ?? ""}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800">
                      {learner.first_name} {learner.last_name}
                    </p>
                    {learner.job_title && (
                      <p className="text-xs text-gray-500">{learner.job_title}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Dialog d'édition du déroulé ── */}
      <DerouleEditDialog
        slot={editingSlot}
        open={editingSlot !== null}
        onOpenChange={(open) => {
          if (!open) setEditingSlot(null);
        }}
        onSaved={fetchData}
      />
    </div>
  );
}
