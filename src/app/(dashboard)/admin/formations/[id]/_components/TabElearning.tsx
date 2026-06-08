"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Loader2, ChevronDown, GraduationCap, BookOpen, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import type { Session, FormationElearningAssignment } from "@/lib/types";
import { LearnerAccessBadge } from "@/components/credentials/LearnerAccessBadge";
import {
  getAssignableElearningCourses,
  type AssignableCourse,
} from "@/lib/services/elearning-courses";

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

/** Statut runtime d'un enrollment (progression réelle). */
interface EnrollmentProgress {
  completion_rate: number;
  status: string;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Traduit le status runtime en libellé français. */
function formatEnrollmentStatus(status: string): string {
  switch (status) {
    case "enrolled":
      return "À démarrer";
    case "in_progress":
      return "En cours";
    case "completed":
      return "Terminé";
    default:
      return status;
  }
}

export function TabElearning({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();

  // Step 1 — unified course list (AI + programme worlds)
  const [courses, setCourses] = useState<AssignableCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Step 3 — real progression keyed by elearning_enrollment_id
  const [progress, setProgress] = useState<Record<string, EnrollmentProgress>>({});

  // Per-learner form state
  const [courseSelections, setCourseSelections] = useState<Record<string, string>>({});
  const [startDates, setStartDates] = useState<Record<string, string>>({});
  const [endDates, setEndDates] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const assignments = formation.formation_elearning_assignments || [];
  const enrollments = formation.enrollments || [];
  const signatures = formation.signatures || [];
  const timeSlots = formation.formation_time_slots || [];

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  // Step 1 — Fetch available courses from BOTH worlds
  const fetchCourses = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("entity_id")
      .eq("id", user.id)
      .single();
    if (!profile) return;
    const data = await getAssignableElearningCourses(supabase, profile.entity_id);
    setCourses(data);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  // Step 3 — Fetch real progression for AI assignments that have an enrollment id
  useEffect(() => {
    const ids = assignments
      .filter(
        (a) => a.course_source === "ai" && a.elearning_enrollment_id != null,
      )
      .map((a) => a.elearning_enrollment_id as string);

    if (ids.length === 0) {
      setProgress({});
      return;
    }

    let cancelled = false;
    supabase
      .from("elearning_enrollments")
      .select("id, completion_rate, status")
      .in("id", ids)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const map: Record<string, EnrollmentProgress> = {};
        for (const row of data) {
          map[row.id as string] = {
            completion_rate: row.completion_rate as number,
            status: row.status as string,
          };
        }
        setProgress(map);
      });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments]);

  // Initialize notes from existing assignments
  useEffect(() => {
    const n: Record<string, string> = {};
    for (const a of assignments) {
      if (a.notes) n[a.learner_id] = a.notes;
    }
    setNotes(n);
  }, [assignments]);

  // Get assignment for a learner
  const getAssignment = (learnerId: string): FormationElearningAssignment | undefined =>
    assignments.find((a) => a.learner_id === learnerId);

  // Step 3 — resolve the display title from the unified courses list first,
  // then fall back to the joined relation (AI courses only), then a default.
  const resolveTitle = (assignment: FormationElearningAssignment): string =>
    courses.find((c) => c.id === assignment.course_id)?.title ??
    assignment.course?.title ??
    "Non attribué";

  // Calculate signed attendance time for a learner (in seconds)
  const getSignedAttendanceTime = (learnerId: string): number => {
    const learnerSignatures = signatures.filter(
      (s) => s.signer_id === learnerId && s.signer_type === "learner" && s.time_slot_id,
    );
    let totalSeconds = 0;
    for (const sig of learnerSignatures) {
      const slot = timeSlots.find((ts) => ts.id === sig.time_slot_id);
      if (slot) {
        const start = new Date(slot.start_time).getTime();
        const end = new Date(slot.end_time).getTime();
        totalSeconds += Math.max(0, (end - start) / 1000);
      }
    }
    return totalSeconds;
  };

  // Step 2 — Assign course to learner (handles both worlds)
  const handleAssign = async (learnerId: string) => {
    const courseId = courseSelections[learnerId];
    if (!courseId) {
      toast({ title: "Sélectionnez un cours", variant: "destructive" });
      return;
    }

    // Resolve selected course from the unified list
    const selected = courses.find((c) => c.id === courseId);
    if (!selected) {
      toast({ title: "Cours introuvable", variant: "destructive" });
      return;
    }

    setSaving(`assign-${learnerId}`);

    try {
      // Only create a runtime enrollment for AI courses; programme courses have no runtime.
      let enrollmentId: string | null = null;
      if (selected.source === "ai") {
        const { data: enrollment } = await supabase
          .from("elearning_enrollments")
          .upsert(
            { course_id: courseId, learner_id: learnerId },
            { onConflict: "course_id,learner_id", ignoreDuplicates: true },
          )
          .select("id")
          .single();
        enrollmentId = enrollment?.id ?? null;
      }

      const { error } = await supabase.from("formation_elearning_assignments").insert({
        session_id: formation.id,
        learner_id: learnerId,
        course_id: courseId,
        course_source: selected.source,
        elearning_enrollment_id: enrollmentId,
        start_date: startDates[learnerId] || null,
        end_date: endDates[learnerId] || null,
      });

      if (error) {
        if (error.code === "23505") {
          toast({ title: "Ce cours est déjà attribué à cet apprenant", variant: "destructive" });
        } else {
          toast({ title: "Erreur", description: error.message, variant: "destructive" });
        }
      } else {
        toast({ title: "Cours e-learning attribué" });
        setCourseSelections((prev) => ({ ...prev, [learnerId]: "" }));
        setStartDates((prev) => ({ ...prev, [learnerId]: "" }));
        setEndDates((prev) => ({ ...prev, [learnerId]: "" }));
        await onRefresh();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible d'attribuer";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  // Save notes
  const handleSaveNotes = async (assignmentId: string, learnerId: string) => {
    setSaving(`notes-${learnerId}`);
    try {
      const { error } = await supabase
        .from("formation_elearning_assignments")
        .update({ notes: notes[learnerId] || "" })
        .eq("id", assignmentId)
        .eq("session_id", formation.id);
      if (error) throw error;
      toast({ title: "Notes confirmées" });
      await onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible de sauvegarder";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  // Step 3 — "Validation admin" toggle (distinct from real progress)
  const handleToggleCompleted = async (assignmentId: string, isCompleted: boolean) => {
    try {
      const { error } = await supabase
        .from("formation_elearning_assignments")
        .update({ is_completed: isCompleted })
        .eq("id", assignmentId)
        .eq("session_id", formation.id);
      if (error) throw error;
      await onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible de mettre à jour";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Compute hero stats (reflect admin validation — intentionally left as-is per spec)
  const assignedCount = assignments.length;
  const completedCount = assignments.filter((a) => a.is_completed).length;

  return (
    <div className="space-y-4">
      {/* Hero row */}
      {assignedCount > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Cours attribués</p>
            <p className="text-xl font-bold">{assignedCount}</p>
          </div>
          <div className="border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Terminés</p>
            <p className="text-xl font-bold text-green-700">{completedCount}</p>
          </div>
          <div className="border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Progression</p>
            <p className="text-xl font-bold">
              {assignedCount > 0 ? Math.round((completedCount / assignedCount) * 100) : 0}%
            </p>
          </div>
        </div>
      )}

      {enrollments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed rounded-lg">
          <GraduationCap className="h-12 w-12 text-gray-300 mb-3" />
          <p className="font-medium text-gray-600">Aucun apprenant inscrit</p>
          <p className="text-sm text-muted-foreground mt-1">
            Inscrivez des apprenants pour leur attribuer des cours e-learning.
          </p>
        </div>
      ) : assignedCount === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed rounded-lg">
          <BookOpen className="h-12 w-12 text-gray-300 mb-3" />
          <p className="font-medium text-gray-600">Aucun cours e-learning attribué</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Attribuez un cours à vos {enrollments.length} apprenant
            {enrollments.length > 1 ? "s" : ""} pour qu&apos;ils puissent le suivre en autonomie.
          </p>
          <p className="text-xs text-muted-foreground mt-3">
            Cliquez sur un apprenant ci-dessous pour attribuer un cours.
          </p>
        </div>
      ) : null}

      {enrollments.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_180px_100px_auto_40px] gap-2 px-4 py-2 bg-muted/30 border-b text-xs font-medium text-muted-foreground">
            <span>Apprenant</span>
            <span>Cours attribué</span>
            <span>Temps total</span>
            <span>Statut</span>
            <span></span>
          </div>

          {enrollments.map((enrollment) => {
            const learner = enrollment.learner;
            if (!learner) return null;

            const assignment = getAssignment(learner.id);
            const signedTime = getSignedAttendanceTime(learner.id);
            // Story 4.2 — les champs time_* de formation_elearning_assignments n'étaient jamais
            // populés et ont été supprimés. Le temps total = temps d'émargement signé (calculé
            // dynamiquement par getSignedAttendanceTime depuis les signatures).
            const totalTime = signedTime;
            const isExpanded = expanded[learner.id];

            // Step 3 — resolve real progression for AI assignments
            const enrollmentProgress =
              assignment?.course_source === "ai" && assignment.elearning_enrollment_id
                ? progress[assignment.elearning_enrollment_id]
                : undefined;

            return (
              <div key={enrollment.id} className="border-b last:border-b-0">
                {/* Summary row */}
                <div
                  className="grid grid-cols-[1fr_180px_100px_auto_40px] gap-2 px-4 py-2.5 items-center text-sm cursor-pointer hover:bg-muted/20 transition-colors"
                  onClick={() => toggleExpanded(learner.id)}
                >
                  <span className="font-medium truncate flex items-center gap-1.5">
                    {learner.first_name} {learner.last_name}
                    <LearnerAccessBadge profileId={learner.profile_id} iconOnly />
                  </span>
                  {/* Step 3 — title from unified list first */}
                  <span className="text-xs text-muted-foreground truncate">
                    {assignment ? resolveTitle(assignment) : "Non attribué"}
                  </span>
                  <span className="text-xs font-mono text-muted-foreground">
                    {formatTime(totalTime)}
                  </span>
                  {/* Step 3 — status column: real progression primary + admin-validation secondary */}
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    {assignment ? (
                      enrollmentProgress ? (
                        // AI course with real progression data
                        <>
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                              enrollmentProgress.status === "completed"
                                ? "bg-green-100 text-green-700"
                                : enrollmentProgress.status === "in_progress"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {enrollmentProgress.completion_rate}%&nbsp;&middot;&nbsp;
                            {formatEnrollmentStatus(enrollmentProgress.status)}
                          </span>
                          {assignment.is_completed && (
                            <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                              Validé
                            </span>
                          )}
                        </>
                      ) : (
                        // Programme course OR AI with no progression yet — manual flag is the signal
                        assignment.is_completed ? (
                          <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                            Terminé
                          </span>
                        ) : (
                          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                            En cours
                          </span>
                        )
                      )
                    ) : (
                      <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                        —
                      </span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpanded(learner.id);
                    }}
                  >
                    <ChevronDown
                      className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    />
                  </Button>
                </div>

                {/* Expandable detail panel */}
                {isExpanded && (
                  <div className="px-4 py-3 bg-muted/10 border-t space-y-4">
                    {/* Attribution form - inline row */}
                    <div className="flex items-end gap-2 flex-wrap">
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Cours</span>
                        <Select
                          value={courseSelections[learner.id] || ""}
                          onValueChange={(val) =>
                            setCourseSelections((prev) => ({ ...prev, [learner.id]: val }))
                          }
                        >
                          <SelectTrigger className="w-[240px] h-8 text-xs">
                            <SelectValue placeholder="Sélectionner..." />
                          </SelectTrigger>
                          <SelectContent>
                            {/* Step 1 — both worlds; programme courses suffixed */}
                            {courses.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.source === "program" ? `${c.title} (programme)` : c.title}
                              </SelectItem>
                            ))}
                            {courses.length === 0 && (
                              <SelectItem value="_none" disabled>
                                Aucun cours disponible
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        {/* ELE-5 audit BMAD : lien cliquable vers le programme
                            source quand un cours "programme" est sélectionné. */}
                        {(() => {
                          const selectedId = courseSelections[learner.id];
                          if (!selectedId) return null;
                          const selected = courses.find((c) => c.id === selectedId);
                          if (!selected || selected.source !== "program") return null;
                          return (
                            <Link
                              href={`/admin/programs/${selected.id}`}
                              className="text-[10px] text-purple-700 hover:underline inline-flex items-center gap-0.5 mt-0.5"
                              target="_blank"
                            >
                              <ExternalLink className="h-2.5 w-2.5" /> Voir le programme
                            </Link>
                          );
                        })()}
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Début</span>
                        <Input
                          type="date"
                          className="w-[140px] h-8 text-xs"
                          value={startDates[learner.id] || ""}
                          onChange={(e) =>
                            setStartDates((prev) => ({ ...prev, [learner.id]: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Fin</span>
                        <Input
                          type="date"
                          className="w-[140px] h-8 text-xs"
                          value={endDates[learner.id] || ""}
                          onChange={(e) =>
                            setEndDates((prev) => ({ ...prev, [learner.id]: e.target.value }))
                          }
                        />
                      </div>
                      <Button
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => handleAssign(learner.id)}
                        disabled={saving === `assign-${learner.id}` || !courseSelections[learner.id]}
                      >
                        {saving === `assign-${learner.id}` && (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        )}
                        Attribuer
                      </Button>
                    </div>

                    {/* Current assignment info */}
                    {assignment && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          Cours actuel :{" "}
                          {/* Step 3 — resolve title from unified list */}
                          <span className="font-medium text-foreground">
                            {resolveTitle(assignment)}
                          </span>
                          {assignment.start_date && ` — Du ${assignment.start_date}`}
                          {assignment.end_date && ` au ${assignment.end_date}`}
                        </p>
                        {/* Step 3 — real progression line for AI courses */}
                        {enrollmentProgress && (
                          <p className="text-xs text-muted-foreground">
                            Progression réelle :{" "}
                            <span className="font-medium text-foreground">
                              {enrollmentProgress.completion_rate}%&nbsp;&middot;&nbsp;
                              {formatEnrollmentStatus(enrollmentProgress.status)}
                            </span>
                          </p>
                        )}
                      </div>
                    )}

                    {/* Time breakdown - compact grid */}
                    {/* Story 4.2 — les lignes Modules / Évaluations / Classe virtuelle ont été
                        retirées : les champs time_* correspondants n'étaient jamais populés. */}
                    <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs max-w-md">
                      <span className="text-muted-foreground">Émargements signés</span>
                      <span className="font-mono">{formatTime(signedTime)}</span>
                      <span className="font-medium">Total</span>
                      <span className="font-mono font-medium">{formatTime(totalTime)}</span>
                    </div>

                    {/* Notes + completion */}
                    <div className="flex items-start gap-4">
                      <div className="flex-1 space-y-1.5">
                        <Textarea
                          className="text-xs"
                          rows={2}
                          placeholder="Notes..."
                          value={notes[learner.id] || ""}
                          onChange={(e) =>
                            setNotes((prev) => ({ ...prev, [learner.id]: e.target.value }))
                          }
                        />
                        {assignment && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7"
                            onClick={() => handleSaveNotes(assignment.id, learner.id)}
                            disabled={saving === `notes-${learner.id}`}
                          >
                            {saving === `notes-${learner.id}` && (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            )}
                            Enregistrer les notes
                          </Button>
                        )}
                      </div>
                      {/* Step 3 — relabelled as "Validation admin" */}
                      {assignment && (
                        <div className="flex items-center gap-2 pt-1 shrink-0">
                          <span className="text-xs text-muted-foreground">Validation admin</span>
                          <Switch
                            checked={assignment.is_completed}
                            onCheckedChange={(checked) =>
                              handleToggleCompleted(assignment.id, checked)
                            }
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
