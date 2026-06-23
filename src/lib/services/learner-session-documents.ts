import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Documents de session (`trainer_documents`, scope='session') visibles par un
 * apprenant : uploadés par le formateur, rattachés à une session, et marqués
 * `visible_to_learners`. La RLS `trainer_documents_learner_read` borne déjà la
 * lecture aux sessions de l'apprenant ; on filtre aussi côté requête.
 */

export interface LearnerSessionDocument {
  id: string;
  session_id: string;
  doc_type: string;
  file_name: string;
  file_type: string;
  notes: string | null;
}

/** Documents de session visibles, pour les sessions fournies. */
export async function getSessionDocumentsForLearner(
  supabase: SupabaseClient,
  sessionIds: string[],
): Promise<LearnerSessionDocument[]> {
  if (sessionIds.length === 0) return [];

  const { data } = await supabase
    .from("trainer_documents")
    .select("id, session_id, doc_type, file_name, file_type, notes")
    .eq("scope", "session")
    .eq("visible_to_learners", true)
    .in("session_id", sessionIds)
    .order("created_at", { ascending: false });

  return (data as LearnerSessionDocument[] | null) ?? [];
}
