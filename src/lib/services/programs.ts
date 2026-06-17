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
 * CONT-7 audit BMAD : compte les enregistrements "orphelins" de l'entité
 * qui cassent la continuité Programme → Formation → Session :
 *  - formations (trainings) sans program_id
 *  - sessions sans training_id (= sessions non rattachées à une formation)
 *  - program_enrollments sans session associée pour le même learner
 *
 * Affiché en bandeau sur le hub Programmes pour signaler des nettoyages
 * possibles. Best-effort : si une table est inaccessible, le count vaut 0.
 */
export interface OrphanLinkCounts {
  formationsWithoutProgram: number;
  sessionsWithoutTraining: number;
}

export async function auditOrphanLinks(
  supabase: SupabaseClient,
  entityId: string,
): Promise<ServiceResult<{ counts: OrphanLinkCounts }>> {
  const [trainingsOrphans, sessionsOrphans] = await Promise.all([
    supabase
      .from("trainings")
      .select("id", { count: "exact", head: true })
      .is("program_id", null)
      .eq("entity_id", entityId),
    supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .is("training_id", null)
      .eq("entity_id", entityId),
  ]);

  return {
    ok: true,
    counts: {
      formationsWithoutProgram: trainingsOrphans.count ?? 0,
      sessionsWithoutTraining: sessionsOrphans.count ?? 0,
    },
  };
}

/**
 * CONT-5 audit BMAD : pour le hub Programmes, retourne par programme le
 * nombre de formations (trainings) et de sessions associées. Permet
 * d'afficher un badge "Utilisé par X formations / Y sessions" sur chaque
 * card pour donner du contexte managérial.
 *
 * Performance : 2 requêtes Supabase (trainings + sessions) avec
 * `program_id IN (...)`, agrégation côté client. Aucun N+1.
 */
export interface ProgramUsageCounts {
  trainings: number;
  sessions: number;
  /** ELE-8 audit BMAD : nombre de cours e-learning générés depuis ce programme. */
  elearnings: number;
}

export async function fetchProgramsUsageCounts(
  supabase: SupabaseClient,
  programIds: string[],
): Promise<ServiceResult<{ countsByProgram: Record<string, ProgramUsageCounts> }>> {
  if (programIds.length === 0) {
    return { ok: true, countsByProgram: {} };
  }

  const [trainingsResult, sessionsResult, elearningsResult] = await Promise.all([
    supabase.from("trainings").select("program_id").in("program_id", programIds),
    supabase.from("sessions").select("program_id").in("program_id", programIds),
    supabase.from("elearning_courses").select("program_id").in("program_id", programIds),
  ]);

  const countsByProgram: Record<string, ProgramUsageCounts> = {};
  for (const id of programIds) {
    countsByProgram[id] = { trainings: 0, sessions: 0, elearnings: 0 };
  }

  if (trainingsResult.data) {
    for (const row of trainingsResult.data as Array<{ program_id: string | null }>) {
      if (row.program_id && countsByProgram[row.program_id]) {
        countsByProgram[row.program_id].trainings++;
      }
    }
  }
  if (sessionsResult.data) {
    for (const row of sessionsResult.data as Array<{ program_id: string | null }>) {
      if (row.program_id && countsByProgram[row.program_id]) {
        countsByProgram[row.program_id].sessions++;
      }
    }
  }
  if (elearningsResult.data) {
    for (const row of elearningsResult.data as Array<{ program_id: string | null }>) {
      if (row.program_id && countsByProgram[row.program_id]) {
        countsByProgram[row.program_id].elearnings++;
      }
    }
  }

  return { ok: true, countsByProgram };
}

/**
 * Lot G audit BMAD : compte les références FK vers un programme avant
 * suppression. Permet d'avertir l'utilisateur des effets cascade /
 * SET NULL silencieux :
 *   - trainings.program_id → SET NULL (perte du lien programme)
 *   - sessions.program_id → SET NULL
 *   - elearning_courses.program_id → SET NULL
 *   - crm_quotes.program_id → SET NULL
 *   - program_versions → CASCADE (suppression)
 *   - program_enrollments → CASCADE (suppression)
 *
 * Le compte est `null` si la table est inaccessible (RLS / table absente
 * dans certains déploiements legacy) — l'UI affiche alors "?" sans bloquer.
 */
export interface ProgramReferenceCounts {
  trainings: number | null;
  sessions: number | null;
  elearning_courses: number | null;
  crm_quotes: number | null;
  program_enrollments: number | null;
  program_versions: number | null;
}

export async function countProgramReferences(
  supabase: SupabaseClient,
  programId: string,
): Promise<ServiceResult<{ counts: ProgramReferenceCounts }>> {
  async function safeCount(table: string): Promise<number | null> {
    const { count, error } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("program_id", programId);
    if (error) return null;
    return count ?? 0;
  }

  const [trainings, sessions, elearning, quotes, enrollments, versions] = await Promise.all([
    safeCount("trainings"),
    safeCount("sessions"),
    safeCount("elearning_courses"),
    safeCount("crm_quotes"),
    safeCount("program_enrollments"),
    safeCount("program_versions"),
  ]);

  return {
    ok: true,
    counts: {
      trainings,
      sessions,
      elearning_courses: elearning,
      crm_quotes: quotes,
      program_enrollments: enrollments,
      program_versions: versions,
    },
  };
}

// ── Créer une session depuis un programme ─────────────────────────────────────

/**
 * Données du programme transmises au service pour créer la formation de rattachement.
 * On évite de transmettre l'objet Program entier (couplage trop fort) ; seuls
 * les champs réellement écrits dans `trainings` sont requis.
 */
export interface CreateSessionFromProgramInput {
  /** Champs programme — alimentent la formation (training) de rattachement. */
  programId: string;
  entityId: string;
  programTitle: string;
  durationHours: number | null;
  price: number | null;
  nsfCode: string | null;
  nsfLabel: string | null;
  bpfObjective: string | null;
  bpfFundingType: string | null;
  /** Champs session — saisis dans le dialog. */
  startDate: string;
  endDate: string;
  mode: "presentiel" | "distanciel" | "hybride";
  location: string | null;
  trainerId: string | null;
}

/**
 * Crée une session liée à un programme en s'assurant qu'une formation
 * (training) de rattachement existe — idempotente côté training :
 *
 *  1. Cherche un training déjà lié à ce programme + entity_id.
 *  2. Si aucun → l'insère.
 *  3. Insert la session sur ce training.
 *
 * Note d'idempotence (non-atomique) : si l'insert session échoue après que
 * le training a été créé, le training persisté est réutilisable au prochain
 * appel — pas de doublon. Les deux opérations étant séquentielles sans
 * transaction Postgres côté client, c'est le meilleur compromis possible avec
 * supabase-js.
 */
export async function createSessionFromProgram(
  supabase: SupabaseClient,
  input: CreateSessionFromProgramInput,
): Promise<ServiceResult<{ sessionId: string }>> {
  // ── 1. Find-or-create training ──────────────────────────────────────────────
  const { data: existingTrainings, error: fetchError } = await supabase
    .from("trainings")
    .select("id")
    .eq("program_id", input.programId)
    .eq("entity_id", input.entityId)
    .limit(1);

  if (fetchError) {
    return { ok: false, error: { message: fetchError.message, code: fetchError.code } };
  }

  let trainingId: string;

  if (existingTrainings && existingTrainings.length > 0) {
    trainingId = (existingTrainings[0] as { id: string }).id;
  } else {
    const { data: newTraining, error: trainingError } = await supabase
      .from("trainings")
      .insert({
        entity_id: input.entityId,
        title: input.programTitle,
        program_id: input.programId,
        duration_hours: input.durationHours ?? null,
        price_per_person: input.price ?? null,
        nsf_code: input.nsfCode ?? null,
        nsf_label: input.nsfLabel ?? null,
        bpf_objective: input.bpfObjective ?? null,
        bpf_funding_type: input.bpfFundingType ?? null,
        is_active: true,
      })
      .select("id")
      .single();

    if (trainingError || !newTraining) {
      return {
        ok: false,
        error: {
          message: trainingError?.message ?? "Impossible de créer la formation.",
          code: trainingError?.code,
        },
      };
    }
    trainingId = (newTraining as { id: string }).id;
  }

  // ── 2. Insert session ───────────────────────────────────────────────────────
  const { data: newSession, error: sessionError } = await supabase
    .from("sessions")
    .insert({
      entity_id: input.entityId,
      training_id: trainingId,
      program_id: input.programId,
      title: input.programTitle,
      start_date: input.startDate,
      end_date: input.endDate,
      mode: input.mode,
      location: input.location ?? null,
      status: "upcoming",
      trainer_id: input.trainerId ?? null,
    })
    .select("id")
    .single();

  if (sessionError || !newSession) {
    return {
      ok: false,
      error: {
        message: sessionError?.message ?? "Impossible de créer la session.",
        code: sessionError?.code,
      },
    };
  }

  return { ok: true, sessionId: (newSession as { id: string }).id };
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
