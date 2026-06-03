/**
 * Lot A audit BMAD — service CRUD `programs` / `program_versions`.
 *
 * Avant : toute la logique Supabase était inline dans 4 pages client
 * (page.tsx 901 LOC, [id]/page.tsx 1393 LOC, catalogue/page.tsx 247 LOC,
 * import/page.tsx 682 LOC). Violation de la règle absolue #10 CLAUDE.md
 * et duplication de filtres `entity_id`.
 *
 * Ce module centralise les opérations en :
 *  - injectant le `SupabaseClient` (testable)
 *  - imposant le filtre `entity_id` (defense in depth — la RLS doit déjà
 *    protéger, mais on évite les surprises côté super_admin cross-entité)
 *  - sélectionnant des colonnes explicites (pas de `select("*")`)
 *  - renvoyant un `ServiceResult<T>` discriminé pour gestion d'erreur
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BpfFundingType,
  BpfObjective,
  Program,
  ProgramContent,
  ProgramVersion,
} from "@/lib/types";

export type ServiceResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: { message: string; code?: string } };

const PROGRAM_COLUMNS =
  "id, entity_id, title, description, objectives, version, is_active, content, price, tva_rate, duration_hours, nsf_code, nsf_label, is_apprenticeship, bpf_objective, bpf_funding_type, created_at, updated_at";

const PROGRAM_VERSION_COLUMNS =
  "id, program_id, version, content, created_by, created_at";

export interface ProgramCreateInput {
  title: string;
  description: string | null;
  objectives: string | null;
  content: ProgramContent;
  price: number | null;
  tva_rate: number | null;
  duration_hours: number | null;
  nsf_code: string | null;
  nsf_label: string | null;
  is_apprenticeship: boolean;
  bpf_objective: BpfObjective | null;
  bpf_funding_type: BpfFundingType | null;
}

export type ProgramUpdateInput = Partial<ProgramCreateInput>;

/** Liste les programmes d'une entité, tri descendant par updated_at. */
export async function fetchPrograms(
  supabase: SupabaseClient,
  entityId: string,
): Promise<ServiceResult<{ programs: Program[] }>> {
  const { data, error } = await supabase
    .from("programs")
    .select(PROGRAM_COLUMNS)
    .eq("entity_id", entityId)
    .order("updated_at", { ascending: false });

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }
  return { ok: true, programs: (data as unknown as Program[]) ?? [] };
}

/** Récupère un programme par id, filtré par entity_id (defense in depth). */
export async function fetchProgramById(
  supabase: SupabaseClient,
  id: string,
  entityId: string,
): Promise<ServiceResult<{ program: Program | null }>> {
  const { data, error } = await supabase
    .from("programs")
    .select(PROGRAM_COLUMNS)
    .eq("id", id)
    .eq("entity_id", entityId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }
  return { ok: true, program: (data as unknown as Program) ?? null };
}

/** Crée un programme. Initialise version=1 et is_active=true. */
export async function createProgram(
  supabase: SupabaseClient,
  entityId: string,
  input: ProgramCreateInput,
): Promise<ServiceResult<{ program: Program }>> {
  const { data, error } = await supabase
    .from("programs")
    .insert({
      ...input,
      entity_id: entityId,
      version: 1,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .select(PROGRAM_COLUMNS)
    .single();

  if (error || !data) {
    return { ok: false, error: { message: error?.message ?? "Insert failed", code: error?.code } };
  }
  return { ok: true, program: data as unknown as Program };
}

/** Met à jour un programme (partial). Touche updated_at automatiquement. */
export async function updateProgram(
  supabase: SupabaseClient,
  id: string,
  entityId: string,
  input: ProgramUpdateInput,
): Promise<ServiceResult<{ program: Program }>> {
  const { data, error } = await supabase
    .from("programs")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("entity_id", entityId)
    .select(PROGRAM_COLUMNS)
    .single();

  if (error || !data) {
    return { ok: false, error: { message: error?.message ?? "Update failed", code: error?.code } };
  }
  return { ok: true, program: data as unknown as Program };
}

/** Supprime un programme (FK cascade sur program_versions). */
export async function deleteProgram(
  supabase: SupabaseClient,
  id: string,
  entityId: string,
): Promise<ServiceResult<Record<never, never>>> {
  const { error } = await supabase
    .from("programs")
    .delete()
    .eq("id", id)
    .eq("entity_id", entityId);

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }
  return { ok: true };
}

/** Toggle is_active (Catalogue / Hub). */
export async function toggleProgramActive(
  supabase: SupabaseClient,
  id: string,
  entityId: string,
  newIsActive: boolean,
): Promise<ServiceResult<Record<never, never>>> {
  const { error } = await supabase
    .from("programs")
    .update({ is_active: newIsActive, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("entity_id", entityId);

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }
  return { ok: true };
}

/** Liste les versions historiques d'un programme. */
export async function fetchProgramVersions(
  supabase: SupabaseClient,
  programId: string,
): Promise<ServiceResult<{ versions: ProgramVersion[] }>> {
  const { data, error } = await supabase
    .from("program_versions")
    .select(PROGRAM_VERSION_COLUMNS)
    .eq("program_id", programId)
    .order("version", { ascending: false });

  if (error) {
    return { ok: false, error: { message: error.message, code: error.code } };
  }
  return { ok: true, versions: (data as unknown as ProgramVersion[]) ?? [] };
}

/**
 * Crée une nouvelle version : snapshot l'état actuel dans program_versions
 * puis incrémente le numéro de version sur le programme. Pas atomique côté
 * Postgres (pas de transaction côté supabase-js client), mais l'ordre
 * (snapshot d'abord, increment ensuite) limite la fenêtre d'incohérence :
 * si l'increment échoue, le snapshot existe mais le programme reste à
 * version N — l'utilisateur peut retenter.
 */
export async function createProgramVersion(
  supabase: SupabaseClient,
  programId: string,
  entityId: string,
  currentVersion: number,
  content: ProgramContent | null,
): Promise<ServiceResult<{ newVersion: number }>> {
  const newVersion = currentVersion + 1;

  const { error: snapshotError } = await supabase.from("program_versions").insert({
    program_id: programId,
    version: newVersion,
    content,
  });
  if (snapshotError) {
    return { ok: false, error: { message: snapshotError.message, code: snapshotError.code } };
  }

  const { error: updateError } = await supabase
    .from("programs")
    .update({ version: newVersion, updated_at: new Date().toISOString() })
    .eq("id", programId)
    .eq("entity_id", entityId);
  if (updateError) {
    return { ok: false, error: { message: updateError.message, code: updateError.code } };
  }
  return { ok: true, newVersion };
}
