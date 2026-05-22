import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Abstraction « cours e-learning assignable » — réconcilie les 2 mondes :
 * cours IA (table elearning_courses) et cours « programme » (table programs,
 * content.type === "elearning"). Cf. spec §5.
 */

export interface AssignableCourse {
  id: string;
  source: "ai" | "program";
  title: string;
  duration_minutes: number;
}

interface AiCourseRow {
  id: string;
  title: string;
  status: string;
  estimated_duration_minutes: number | null;
}

interface ProgramRow {
  id: string;
  title: string;
  content: Record<string, unknown> | null;
}

/** Fusionne deux jeux de lignes brutes en une liste normalisée. Fonction pure. */
export function mergeAssignableCourses(
  aiCourses: AiCourseRow[],
  programs: ProgramRow[],
): AssignableCourse[] {
  const ai: AssignableCourse[] = aiCourses
    .filter((c) => c.status === "published")
    .map((c) => ({
      id: c.id,
      source: "ai",
      title: c.title,
      duration_minutes: c.estimated_duration_minutes ?? 0,
    }));

  const prog: AssignableCourse[] = programs
    .filter((p) => {
      const c = p.content;
      return !!c && c.type === "elearning" && c.status === "published";
    })
    .map((p) => {
      // Le titre d'un programme est une colonne top-level ; la durée est la
      // somme des durées de ses modules (content.modules[].duration_minutes).
      const modules = (p.content as Record<string, unknown>).modules;
      const duration = Array.isArray(modules)
        ? (modules as Array<{ duration_minutes?: unknown }>).reduce(
            (acc, m) => acc + (Number(m.duration_minutes) || 0),
            0,
          )
        : 0;
      return {
        id: p.id,
        source: "program",
        title: p.title,
        duration_minutes: duration,
      };
    });

  return [...ai, ...prog];
}

/**
 * Liste les cours e-learning publiés assignables d'une entité, depuis les
 * 2 mondes. Toujours filtré par entity_id.
 */
export async function getAssignableElearningCourses(
  supabase: SupabaseClient,
  entityId: string,
): Promise<AssignableCourse[]> {
  const { data: aiCourses } = await supabase
    .from("elearning_courses")
    .select("id, title, status, estimated_duration_minutes")
    .eq("entity_id", entityId)
    .eq("status", "published")
    .order("title");

  const { data: programs } = await supabase
    .from("programs")
    .select("id, title, content")
    .eq("entity_id", entityId)
    .order("title");

  return mergeAssignableCourses(
    (aiCourses ?? []) as AiCourseRow[],
    (programs ?? []) as ProgramRow[],
  );
}
