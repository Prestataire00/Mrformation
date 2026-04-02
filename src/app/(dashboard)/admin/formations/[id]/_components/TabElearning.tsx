"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import type { Session, FormationElearningAssignment } from "@/lib/types";

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

interface ElearningCourse {
  id: string;
  title: string;
  status: string;
  estimated_duration_minutes: number;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function TabElearning({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();

  const [courses, setCourses] = useState<ElearningCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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

  // Fetch available courses
  const fetchCourses = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("entity_id")
      .eq("id", user.id)
      .single();
    if (!profile) return;
    const { data } = await supabase
      .from("elearning_courses")
      .select("id, title, status, estimated_duration_minutes")
      .eq("entity_id", profile.entity_id)
      .eq("status", "published")
      .order("title");
    setCourses((data as ElearningCourse[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  // Initialize notes from existing assignments
  useEffect(() => {
    const n: Record<string, string> = {};
    for (const a of assignments) {
      if (a.notes) n[a.learner_id] = a.notes;
    }
    setNotes(n);
  }, [assignments]);

  // Get assignment for a learner
  const getAssignment = (learnerId: string): FormationElearningAssignment | undefined => {
    return assignments.find((a) => a.learner_id === learnerId);
  };

  // Calculate signed attendance time for a learner (in seconds)
  const getSignedAttendanceTime = (learnerId: string): number => {
    const learnerSignatures = signatures.filter(
      (s) => s.signer_id === learnerId && s.signer_type === "learner" && s.time_slot_id
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

  // Assign course to learner
  const handleAssign = async (learnerId: string) => {
    const courseId = courseSelections[learnerId];
    if (!courseId) {
      toast({ title: "Sélectionnez un cours", variant: "destructive" });
      return;
    }

    setSaving(`assign-${learnerId}`);

    const { data: enrollment } = await supabase
      .from("elearning_enrollments")
      .upsert(
        { course_id: courseId, learner_id: learnerId },
        { onConflict: "course_id,learner_id", ignoreDuplicates: true }
      )
      .select("id")
      .single();

    const { error } = await supabase.from("formation_elearning_assignments").insert({
      session_id: formation.id,
      learner_id: learnerId,
      course_id: courseId,
      elearning_enrollment_id: enrollment?.id || null,
      start_date: startDates[learnerId] || null,
      end_date: endDates[learnerId] || null,
    });

    setSaving(null);
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
      onRefresh();
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

  // Toggle completed
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

  return (
    <div className="space-y-4">
      {/* Header compact */}
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        e-Learning ({enrollments.length} apprenant{enrollments.length !== 1 ? "s" : ""})
      </h3>

      {enrollments.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Aucun apprenant inscrit.
        </p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_180px_100px_90px_40px] gap-2 px-4 py-2 bg-muted/30 border-b text-xs font-medium text-muted-foreground">
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
            const timeModules = assignment?.time_elearning_modules || 0;
            const timeEvals = assignment?.time_elearning_evaluations || 0;
            const timeOther = assignment?.time_other_evaluations || 0;
            const timeVirtual = assignment?.time_virtual_classroom || 0;
            const totalTime = timeModules + timeEvals + timeOther + timeVirtual + signedTime;
            const isExpanded = expanded[learner.id];

            return (
              <div key={enrollment.id} className="border-b last:border-b-0">
                {/* Summary row */}
                <div
                  className="grid grid-cols-[1fr_180px_100px_90px_40px] gap-2 px-4 py-2.5 items-center text-sm cursor-pointer hover:bg-muted/20 transition-colors"
                  onClick={() => toggleExpanded(learner.id)}
                >
                  <span className="font-medium truncate">
                    {learner.first_name} {learner.last_name}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">
                    {assignment?.course?.title || "Non attribué"}
                  </span>
                  <span className="text-xs font-mono text-muted-foreground">{formatTime(totalTime)}</span>
                  <div>
                    {assignment?.is_completed ? (
                      <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Terminé</span>
                    ) : assignment ? (
                      <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">En cours</span>
                    ) : (
                      <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">—</span>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); toggleExpanded(learner.id); }}>
                    <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
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
                          <SelectTrigger className="w-[220px] h-8 text-xs">
                            <SelectValue placeholder="Sélectionner..." />
                          </SelectTrigger>
                          <SelectContent>
                            {courses.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.title}
                              </SelectItem>
                            ))}
                            {courses.length === 0 && (
                              <SelectItem value="_none" disabled>
                                Aucun cours disponible
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
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
                      <p className="text-xs text-muted-foreground">
                        Cours actuel : <span className="font-medium text-foreground">{assignment.course?.title}</span>
                        {assignment.start_date && ` — Du ${assignment.start_date}`}
                        {assignment.end_date && ` au ${assignment.end_date}`}
                      </p>
                    )}

                    {/* Time breakdown - compact grid */}
                    <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs max-w-md">
                      <span className="text-muted-foreground">Modules e-learning</span>
                      <span className="font-mono">{formatTime(timeModules)}</span>
                      <span className="text-muted-foreground">Évaluations e-learning</span>
                      <span className="font-mono">{formatTime(timeEvals)}</span>
                      <span className="text-muted-foreground">Autres évaluations</span>
                      <span className="font-mono">{formatTime(timeOther)}</span>
                      <span className="text-muted-foreground">Classe virtuelle</span>
                      <span className="font-mono">{formatTime(timeVirtual)}</span>
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
                      {assignment && (
                        <div className="flex items-center gap-2 pt-1 shrink-0">
                          <span className="text-xs text-muted-foreground">Terminé</span>
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
