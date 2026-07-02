/**
 * Service — catalogue des types de documents secondaires CUSTOM par entité
 * (table `custom_secondary_doc_types`, migration add_custom_secondary_doc_types.sql).
 *
 * Cohabite avec les 23 types secondaires legacy codés en dur
 * (src/lib/templates/secondary-categories.ts). Un type custom :
 *   - se résout via `template_id` (document_templates uploadé), pas via le registry ;
 *   - est non-signable en v1 ;
 *   - a un `owner_type` figé à la création (learner | trainer | session) ;
 *   - se désactive en soft (is_active=false) sans casser les docs déjà attribués.
 *
 * Aucun filtre entity_id implicite : la route appelante fournit toujours
 * l'entity_id résolu (pattern documents-store / enrollments).
 */

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CustomSecondaryDocType,
  CustomSecondaryOwnerType,
} from "@/lib/types";

export type ServiceResult<T = Record<never, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: { message: string; code?: string } };

/** Préfixe des clés doc_type custom, garantissant l'absence de collision legacy. */
export const CUSTOM_DOC_TYPE_PREFIX = "custom_";

/** Catégories partagées avec le catalogue legacy (SECONDARY_CATEGORY_LABELS). */
export const CUSTOM_SECONDARY_CATEGORIES = [
  "habilitation",
  "attestation_metier",
  "administratif",
  "evaluation",
] as const;

/** Destinataires possibles pour un type custom (figé à la création). */
export const CUSTOM_SECONDARY_OWNER_TYPES: readonly CustomSecondaryOwnerType[] = [
  "learner",
  "trainer",
  "session",
] as const;

const SELECT_COLS =
  "id, entity_id, doc_type, label, category, owner_type, template_id, is_active, created_at, updated_at";

/** Vrai si le doc_type appartient au catalogue custom (vs legacy/officiel). */
export function isCustomDocType(docType: string): boolean {
  return docType.startsWith(CUSTOM_DOC_TYPE_PREFIX);
}

/** Champs (hors fichier) du formulaire de création d'un type custom. */
export const createCustomTypeFieldsSchema = z.object({
  label: z.string().trim().min(1, "Libellé requis").max(120),
  category: z.enum(CUSTOM_SECONDARY_CATEGORIES),
  ownerType: z.enum(["learner", "trainer", "session"]),
});

/** Champs du PATCH (renommage et/ou (dé)activation). Au moins un requis. */
export const updateCustomTypeSchema = z
  .object({
    label: z.string().trim().min(1).max(120).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.label !== undefined || v.isActive !== undefined, {
    message: "Aucun champ à mettre à jour",
  });

/**
 * Génère une clé doc_type custom unique (best-effort). L'unicité réelle est
 * garantie par UNIQUE(entity_id, doc_type) côté base ; en cas de collision
 * (improbable), l'INSERT renvoie 23505 et l'appelant peut régénérer.
 */
export function generateCustomDocType(): string {
  return CUSTOM_DOC_TYPE_PREFIX + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

// ─── READ ────────────────────────────────────────────────────────────────

/**
 * Liste les types custom d'une entité. Par défaut, uniquement les actifs
 * (catalogue d'attribution). `includeInactive` = true pour la gestion et
 * l'affichage des docs déjà attribués d'un type désactivé.
 */
export async function listCustomTypes(
  supabase: SupabaseClient,
  entityId: string,
  options?: { includeInactive?: boolean },
): Promise<ServiceResult<{ types: CustomSecondaryDocType[] }>> {
  let query = supabase
    .from("custom_secondary_doc_types")
    .select(SELECT_COLS)
    .eq("entity_id", entityId);
  if (!options?.includeInactive) {
    query = query.eq("is_active", true);
  }
  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  return { ok: true, types: (data ?? []) as CustomSecondaryDocType[] };
}

/**
 * Récupère un type custom ACTIF par sa clé doc_type, scopé à l'entité.
 * Utilisé pour résoudre owner/template lors de l'attribution.
 */
export async function getActiveCustomTypeByDocType(
  supabase: SupabaseClient,
  entityId: string,
  docType: string,
): Promise<ServiceResult<{ type: CustomSecondaryDocType | null }>> {
  const { data, error } = await supabase
    .from("custom_secondary_doc_types")
    .select(SELECT_COLS)
    .eq("entity_id", entityId)
    .eq("doc_type", docType)
    .eq("is_active", true)
    .maybeSingle();
  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  return { ok: true, type: (data as CustomSecondaryDocType | null) ?? null };
}

// ─── WRITE ───────────────────────────────────────────────────────────────

export interface CreateCustomTypeInput {
  entityId: string;
  label: string;
  category: CustomSecondaryDocType["category"];
  ownerType: CustomSecondaryOwnerType;
  templateId: string;
}

/**
 * Insère une définition de type custom active. Génère la clé doc_type.
 * `requires_signature` n'existe pas ici : les types custom sont non-signables
 * en v1 (forcé côté attribution).
 */
export async function createCustomType(
  supabase: SupabaseClient,
  input: CreateCustomTypeInput,
): Promise<ServiceResult<{ type: CustomSecondaryDocType }>> {
  const docType = generateCustomDocType();
  const { data, error } = await supabase
    .from("custom_secondary_doc_types")
    .insert({
      entity_id: input.entityId,
      doc_type: docType,
      label: input.label.trim(),
      category: input.category,
      owner_type: input.ownerType,
      template_id: input.templateId,
      is_active: true,
    })
    .select(SELECT_COLS)
    .single();
  if (error || !data) {
    return { ok: false, error: { message: error?.message ?? "Insertion échouée", code: error?.code } };
  }
  return { ok: true, type: data as CustomSecondaryDocType };
}

/**
 * Renomme un type custom (libellé). Le custom_label des docs déjà attribués
 * n'est pas modifié (snapshot au moment de l'attribution).
 */
export async function renameCustomType(
  supabase: SupabaseClient,
  entityId: string,
  id: string,
  label: string,
): Promise<ServiceResult<{ type: CustomSecondaryDocType }>> {
  const { data, error } = await supabase
    .from("custom_secondary_doc_types")
    .update({ label: label.trim(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("entity_id", entityId)
    .select(SELECT_COLS)
    .single();
  if (error || !data) {
    return { ok: false, error: { message: error?.message ?? "Type introuvable", code: error?.code } };
  }
  return { ok: true, type: data as CustomSecondaryDocType };
}

/**
 * Met à jour un type custom en une seule écriture atomique (renommage et/ou
 * (dé)activation). Évite les 2 UPDATE non atomiques quand les deux champs sont
 * fournis ensemble. Isolation par `id` + `entity_id`.
 */
export async function updateCustomType(
  supabase: SupabaseClient,
  entityId: string,
  id: string,
  patch: { label?: string; isActive?: boolean },
): Promise<ServiceResult<{ type: CustomSecondaryDocType }>> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.label !== undefined) update.label = patch.label.trim();
  if (patch.isActive !== undefined) update.is_active = patch.isActive;
  const { data, error } = await supabase
    .from("custom_secondary_doc_types")
    .update(update)
    .eq("id", id)
    .eq("entity_id", entityId)
    .select(SELECT_COLS)
    .single();
  if (error || !data) {
    return { ok: false, error: { message: error?.message ?? "Type introuvable", code: error?.code } };
  }
  return { ok: true, type: data as CustomSecondaryDocType };
}

/**
 * Active / désactive (soft) un type custom. Une désactivation le retire du
 * catalogue mais laisse intacts les documents déjà attribués de ce type.
 */
export async function setCustomTypeActive(
  supabase: SupabaseClient,
  entityId: string,
  id: string,
  isActive: boolean,
): Promise<ServiceResult<{ type: CustomSecondaryDocType }>> {
  const { data, error } = await supabase
    .from("custom_secondary_doc_types")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("entity_id", entityId)
    .select(SELECT_COLS)
    .single();
  if (error || !data) {
    return { ok: false, error: { message: error?.message ?? "Type introuvable", code: error?.code } };
  }
  return { ok: true, type: data as CustomSecondaryDocType };
}
