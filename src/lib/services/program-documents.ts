/**
 * Service CRUD `program_documents` — supports de cours attachés à un programme.
 *
 * Modèle SOURCE UNIQUE (SPEC spec-program-supports-docs-partages) : les
 * fichiers sont stockés une seule fois au niveau du programme et affichés
 * par jointure (sessions liées, portail apprenant). Ce module centralise les
 * opérations DB (règle CLAUDE.md #10) :
 *  - injecte le `SupabaseClient` (testable)
 *  - impose le filtre `entity_id` (defense in depth en plus de la RLS)
 *  - colonnes explicites (pas de `select("*")`)
 *  - renvoie un `ServiceResult<T>` discriminé.
 *
 * L'upload/suppression du fichier dans Storage reste côté composant (bucket
 * public `formation-docs`, pattern identique à TabDocsPartages).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProgramDocument } from "@/lib/types";

export type ServiceResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: { message: string; code?: string } };

const PROGRAM_DOCUMENT_COLUMNS =
  "id, program_id, entity_id, file_name, file_url, uploaded_by, created_at";

export interface ProgramDocumentCreateInput {
  programId: string;
  entityId: string;
  fileName: string;
  fileUrl: string;
  uploadedBy: string | null;
}

/** Liste les supports d'un programme (filtré entity_id), tri croissant par date. */
export async function listProgramDocuments(
  supabase: SupabaseClient,
  programId: string,
  entityId: string,
): Promise<ServiceResult<{ documents: ProgramDocument[] }>> {
  const { data, error } = await supabase
    .from("program_documents")
    .select(PROGRAM_DOCUMENT_COLUMNS)
    .eq("program_id", programId)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: true });

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }
  return { ok: true, documents: (data as unknown as ProgramDocument[]) ?? [] };
}

/** Crée un support de programme. */
export async function createProgramDocument(
  supabase: SupabaseClient,
  input: ProgramDocumentCreateInput,
): Promise<ServiceResult<{ document: ProgramDocument }>> {
  const { data, error } = await supabase
    .from("program_documents")
    .insert({
      program_id: input.programId,
      entity_id: input.entityId,
      file_name: input.fileName,
      file_url: input.fileUrl,
      uploaded_by: input.uploadedBy,
    })
    .select(PROGRAM_DOCUMENT_COLUMNS)
    .single();

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }
  return { ok: true, document: data as unknown as ProgramDocument };
}

/** Supprime un support de programme (filtré entity_id, defense in depth). */
export async function deleteProgramDocument(
  supabase: SupabaseClient,
  id: string,
  entityId: string,
): Promise<ServiceResult<Record<never, never>>> {
  const { error } = await supabase
    .from("program_documents")
    .delete()
    .eq("id", id)
    .eq("entity_id", entityId);

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }
  return { ok: true };
}
