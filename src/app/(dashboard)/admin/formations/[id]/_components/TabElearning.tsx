"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

  // Per-learner form state
  const [courseSelections, setCourseSelections] = useState<Record<string, string>>({});
  const [startDates, setStartDates] = useState<Record<string, string>>({});
  const [endDates, setEndDates] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const assignments = formation.formation_elearning_assignments || [];
  const enrollments = formation.enrollments || [];
  const signatures = formation.signatures || [];
  const timeSlots = formation.formation_time_slots || [];

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
    // Find all signatures for this learner
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

    // First create elearning_enrollment
    const { data: enrollment } = await supabase
      .from("elearning_enrollments")
      .upsert(
        { course_id: courseId, learner_id: learnerId },
        { onConflict: "course_id,learner_id", ignoreDuplicates: true }
      )
      .select("id")
      .single();

    // Then create formation_elearning_assignment
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
    const { error } = await supabase
      .from("formation_elearning_assignments")
      .update({ notes: notes[learnerId] || "" })
      .eq("id", assignmentId);
    setSaving(null);
    if (error) {
      toast({ title: "Erreur", variant: "destructive" });
    } else {
      toast({ title: "Notes confirmées" });
      onRefresh();
    }
  };

  // Toggle completed
  const handleToggleCompleted = async (assignmentId: string, isCompleted: boolean) => {
    const { error } = await supabase
      .from("formation_elearning_assignments")
      .update({ is_completed: isCompleted })
      .eq("id", assignmentId);
    if (error) {
      toast({ title: "Erreur", variant: "destructive" });
    } else {
      onRefresh();
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
    <div className="space-y-6">
      <h2 className="text-xl font-bold">{formation.title}</h2>
      <p className="text-sm text-muted-foreground">
        Pour attribuer des formations e-learning, choisissez des programmes ci-dessous
      </p>

      {enrollments.map((enrollment) => {
        const learner = enrollment.learner;
        if (!learner) return null;

        const assignment = getAssignment(learner.id);
        const signedTime = getSignedAttendanceTime(learner.id);

        // Calculate total time
        const timeModules = assignment?.time_elearning_modules || 0;
        const timeEvals = assignment?.time_elearning_evaluations || 0;
        const timeOther = assignment?.time_other_evaluations || 0;
        const timeVirtual = assignment?.time_virtual_classroom || 0;
        const totalTime = timeModules + timeEvals + timeOther + timeVirtual + signedTime;

        return (
          <Card key={enrollment.id}>
            <CardContent className="pt-6 space-y-5">
              {/* Learner name */}
              <h3 className="text-lg font-bold underline">
                {learner.first_name} {learner.last_name}
              </h3>

              {/* Connection tracking button */}
              <Button
                className="bg-teal-500 hover:bg-teal-600 text-white"
                onClick={() => toast({ title: "Suivi des connexions (à implémenter)" })}
              >
                Suivi des connexions
              </Button>

              {/* Current assignment */}
              {assignment ? (
                <p className="text-sm font-semibold">
                  Cours attribué : {assignment.course?.title || "Cours e-learning"}
                  {assignment.start_date && ` — Du ${assignment.start_date}`}
                  {assignment.end_date && ` au ${assignment.end_date}`}
                </p>
              ) : (
                <p className="text-sm font-semibold uppercase text-muted-foreground">
                  Pas de cours e-learning attribué
                </p>
              )}

              {/* Attribution form */}
              <div className="space-y-3">
                <p className="font-semibold text-sm">Attribuer un cours e-learning</p>
                <Select
                  value={courseSelections[learner.id] || ""}
                  onValueChange={(val) =>
                    setCourseSelections((prev) => ({ ...prev, [learner.id]: val }))
                  }
                >
                  <SelectTrigger className="w-[400px]">
                    <SelectValue placeholder="Sélectionner un cours..." />
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

                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-sm font-semibold mb-1">Commence le</p>
                    <Input
                      type="date"
                      className="w-[180px]"
                      value={startDates[learner.id] || ""}
                      onChange={(e) =>
                        setStartDates((prev) => ({ ...prev, [learner.id]: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <p className="text-sm font-semibold mb-1">Valide jusqu&apos;au</p>
                    <Input
                      type="date"
                      className="w-[180px]"
                      value={endDates[learner.id] || ""}
                      onChange={(e) =>
                        setEndDates((prev) => ({ ...prev, [learner.id]: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <Button
                  className="bg-teal-500 hover:bg-teal-600 text-white"
                  onClick={() => handleAssign(learner.id)}
                  disabled={saving === `assign-${learner.id}` || !courseSelections[learner.id]}
                >
                  {saving === `assign-${learner.id}` && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Attribuer
                </Button>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <p className="font-semibold text-sm">Notes</p>
                <Textarea
                  value={notes[learner.id] || ""}
                  onChange={(e) =>
                    setNotes((prev) => ({ ...prev, [learner.id]: e.target.value }))
                  }
                  placeholder="Ajouter des notes..."
                  rows={3}
                />
                {assignment && (
                  <Button
                    className="bg-teal-500 hover:bg-teal-600 text-white"
                    onClick={() => handleSaveNotes(assignment.id, learner.id)}
                    disabled={saving === `notes-${learner.id}`}
                  >
                    {saving === `notes-${learner.id}` && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Confirmer les notes
                  </Button>
                )}
              </div>

              {/* Suivi Final */}
              <div className="space-y-2 bg-muted/30 p-4 rounded-lg">
                <p className="font-semibold">Suivi Final</p>
                <p className="text-sm">
                  Temps passé sur les modules e-learning : {formatTime(timeModules)}
                </p>
                <p className="text-sm">
                  Temps passé sur les évaluations e-learning : {formatTime(timeEvals)}
                </p>
                <p className="text-sm">
                  Temps passé sur les autres évaluations : {formatTime(timeOther)}
                </p>
                <p className="text-sm">
                  Temps passé en classe virtuelle : {formatTime(timeVirtual)}
                </p>
                <p className="text-sm">
                  Temps total des émargements signés : {formatTime(signedTime)}
                </p>
                <p className="text-sm font-bold">
                  Temps total : {formatTime(totalTime)}
                </p>

                {assignment && (
                  <div className="pt-2">
                    <Switch
                      checked={assignment.is_completed}
                      onCheckedChange={(checked) =>
                        handleToggleCompleted(assignment.id, checked)
                      }
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {enrollments.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            Aucun apprenant inscrit.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
