/**
 * Documents Store — service centralisé pour CRUD `documents` (table unifiée
 * créée par b-1, peuplée par b-2). Stories B3 à B7 : ce service remplace
 * tous les accès directs `formation_convention_documents` du code applicatif.
 *
 * Le service maintient une compat de shape avec l'ancienne interface
 * `FormationConventionDocument` (legacy UI shape) via mapping bidirectionnel :
 *
 * - Read : `documents` row → mapped to `FormationConventionDocument` shape
 *   (status derivé en is_confirmed/is_sent/is_signed, metadata jsonb dépliée
 *   en colonnes flat)
 *
 * - Write : `FormationConventionDocument`-like input → mapped to `documents`
 *   columns (is_confirmed → status='generated', etc., colonnes extra dans
 *   metadata jsonb)
 *
 * Cela permet de garder l'UI intacte (TabConventionDocs etc.) tout en
 * basculant la source de vérité.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormationConventionDocument } from "@/lib/types";
import { mapStatusToFlags } from "@/lib/utils/document-status";

// ─── Types internes ─────────────────────────────────────────────────────

interface DocumentsRow {
  id: string;
  entity_id: string;
  doc_type: string;
  template_id: string | null;
  source_table: string;
  source_id: string;
  owner_type: "learner" | "company" | "trainer" | null;
  owner_id: string | null;
  status: "draft" | "generated" | "sent" | "signed" | "cancelled";
  generated_at: string | null;
  sent_at: string | null;
  signed_at: string | null;
  signature_token: string | null;
  signature_token_expires_at: string | null;
  metadata: {
    legacy_id?: string;
    document_date?: string;
    custom_label?: string;
    requires_signature?: boolean;
    signature_reminder_count?: number;
    signer_email?: string;
    signer_name?: string;
    signature_requested_at?: string;
  } | null;
  created_at: string;
}

interface DocumentsRowWithTemplate extends DocumentsRow {
  template?: { id: string; name: string } | null;
}

// ─── Mapping documents row → FormationConventionDocument (UI shape) ─────

export function mapDocumentToLegacyShape(row: DocumentsRowWithTemplate): FormationConventionDocument {
  const meta = row.metadata ?? {};
  const flags = mapStatusToFlags(row.status);
  return {
    id: row.id,
    session_id: row.source_id,
    doc_type: row.doc_type as FormationConventionDocument["doc_type"],
    owner_type: (row.owner_type ?? "learner") as FormationConventionDocument["owner_type"],
    owner_id: row.owner_id ?? "",
    template_id: row.template_id,
    is_confirmed: flags.is_confirmed,
    confirmed_at: row.generated_at,
    is_sent: flags.is_sent,
    sent_at: row.sent_at,
    is_signed: flags.is_signed,
    signed_at: row.signed_at,
    document_date: meta.document_date ?? null,
    custom_label: meta.custom_label ?? null,
    requires_signature: meta.requires_signature ?? false,
    signature_token: row.signature_token,
    signature_requested_at: meta.signature_requested_at ?? null,
    signature_reminder_count: meta.signature_reminder_count ?? 0,
    signer_email: meta.signer_email ?? null,
    signer_name: meta.signer_name ?? null,
    created_at: row.created_at,
    template: row.template ?? undefined,
  } as FormationConventionDocument;
}

// ─── Mapping FormationConventionDocument input → documents columns ──────

interface InsertDocInput {
  entity_id: string;
  session_id: string;
  doc_type: string;
  owner_type: "learner" | "company" | "trainer";
  owner_id: string;
  template_id?: string | null;
  requires_signature?: boolean;
  is_confirmed?: boolean;
  confirmed_at?: string;
  document_date?: string | null;
  custom_label?: string | null;
}

function mapInsertInputToDocumentsRow(input: InsertDocInput): Omit<DocumentsRow, "id" | "created_at" | "signature_token" | "signature_token_expires_at"> {
  const status: DocumentsRow["status"] = input.is_confirmed ? "generated" : "draft";
  return {
    entity_id: input.entity_id,
    doc_type: input.doc_type,
    template_id: input.template_id ?? null,
    source_table: "sessions",
    source_id: input.session_id,
    owner_type: input.owner_type,
    owner_id: input.owner_id,
    status,
    generated_at: input.is_confirmed ? input.confirmed_at ?? new Date().toISOString() : null,
    sent_at: null,
    signed_at: null,
    metadata: {
      document_date: input.document_date ?? undefined,
      custom_label: input.custom_label ?? undefined,
      requires_signature: input.requires_signature ?? false,
    },
  };
}

// ─── READ helpers ───────────────────────────────────────────────────────

/**
 * Charge les docs d'une session au format `FormationConventionDocument` (shape UI).
 * Filtre source_table='sessions' + source_id=sessionId.
 */
export async function getDocsForSession(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<FormationConventionDocument[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("*, template:document_templates(id, name)")
    .eq("source_table", "sessions")
    .eq("source_id", sessionId);
  if (error) throw error;
  return (data ?? []).map((row) => mapDocumentToLegacyShape(row as DocumentsRowWithTemplate));
}

/**
 * Version légère : retourne juste les clés (doc_type, owner_type, owner_id)
 * pour vérification d'existence (anti-doublon dans initializeDefaultDocs).
 */
export async function getDocKeysForSession(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<Array<{ doc_type: string; owner_type: string | null; owner_id: string | null }>> {
  const { data, error } = await supabase
    .from("documents")
    .select("doc_type, owner_type, owner_id")
    .eq("source_table", "sessions")
    .eq("source_id", sessionId);
  if (error) throw error;
  return (data ?? []) as Array<{ doc_type: string; owner_type: string | null; owner_id: string | null }>;
}

// ─── WRITE helpers ──────────────────────────────────────────────────────

/**
 * Insert batch de docs (par défaut ou custom). Idempotent via UNIQUE INDEX
 * `documents_unique_source_owner` : les doublons sont ignorés et le retour
 * `{ inserted }` indique le nombre RÉEL de lignes créées.
 *
 * Subtilité PostgreSQL : un `INSERT` multi-lignes est atomique — une seule
 * ligne en doublon (23505) fait rejeter TOUT le batch. L'ancienne version
 * avalait ce 23505 et insérait alors 0 ligne en silence, tout en laissant
 * croire à l'appelant que tout était passé. On retombe donc sur un insert
 * ligne-à-ligne dès qu'un conflit survient, pour ne perdre que les vrais
 * doublons et renvoyer un compte exact.
 */
export async function insertDocs(
  supabase: SupabaseClient,
  inputs: InsertDocInput[],
): Promise<{ inserted: number }> {
  if (inputs.length === 0) return { inserted: 0 };
  const rows = inputs.map(mapInsertInputToDocumentsRow);
  const { error } = await supabase.from("documents").insert(rows);
  // Pas d'erreur ⇒ insert atomique réussi ⇒ toutes les lignes sont passées.
  if (!error) return { inserted: rows.length };
  if (error.code !== "23505") throw error;
  // Conflit 23505 sur le batch : on rejoue ligne-à-ligne en comptant les
  // insertions réelles et en ignorant uniquement les doublons.
  let inserted = 0;
  for (const row of rows) {
    const { error: rowErr } = await supabase.from("documents").insert(row);
    if (!rowErr) inserted++;
    else if (rowErr.code !== "23505") throw rowErr;
  }
  return { inserted };
}

/**
 * Insert ou upsert (skip duplicates) — utilisé pour assigner template à tous.
 */
export async function upsertDocsIgnoreDuplicates(
  supabase: SupabaseClient,
  inputs: InsertDocInput[],
): Promise<void> {
  if (inputs.length === 0) return;
  const rows = inputs.map(mapInsertInputToDocumentsRow);
  const { error } = await supabase
    .from("documents")
    .upsert(rows, {
      onConflict: "entity_id,source_table,source_id,doc_type,owner_type,owner_id",
      ignoreDuplicates: true,
    });
  // Note : onConflict doit matcher l'index UNIQUE — qui utilise COALESCE,
  // donc PG peut ne pas matcher. Fallback : try/catch 23505.
  if (error && error.code !== "23505") throw error;
}

/**
 * Marque un doc comme "confirmé" (figé) : status='generated', generated_at=now.
 */
export async function markDocConfirmed(
  supabase: SupabaseClient,
  docId: string,
  documentDate?: string | null,
): Promise<void> {
  const update: { status: string; generated_at: string; metadata?: Record<string, unknown> } = {
    status: "generated",
    generated_at: new Date().toISOString(),
  };
  if (documentDate !== undefined) {
    // Pour préserver les autres metadata, on doit faire un read-modify-write
    const { data: existing } = await supabase
      .from("documents").select("metadata").eq("id", docId).single();
    update.metadata = { ...(existing?.metadata ?? {}), document_date: documentDate };
  }
  const { error } = await supabase.from("documents").update(update).eq("id", docId);
  if (error) throw error;
}

/**
 * Annule la confirmation : status='draft', generated_at=null.
 */
export async function unmarkDocConfirmed(supabase: SupabaseClient, docId: string): Promise<void> {
  const { error } = await supabase
    .from("documents")
    .update({ status: "draft", generated_at: null })
    .eq("id", docId);
  if (error) throw error;
}

/**
 * Marque un doc comme envoyé : status='sent', sent_at=now (sauf si déjà signed).
 */
export async function markDocSent(supabase: SupabaseClient, docId: string): Promise<void> {
  const { error } = await supabase
    .from("documents")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", docId)
    .neq("status", "signed"); // ne pas downgrader signed → sent
  if (error) throw error;
}

/**
 * Marque comme envoyé via filtre (session + doc_type + owner) — utilisé
 * par batch-email-handler qui ne connaît pas le doc_id.
 */
export async function markDocSentByFilter(
  supabase: SupabaseClient,
  filter: {
    sessionId: string;
    docType: string;
    ownerType: "learner" | "company" | "trainer";
    ownerId: string;
  },
): Promise<void> {
  const { error } = await supabase
    .from("documents")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("source_table", "sessions")
    .eq("source_id", filter.sessionId)
    .eq("doc_type", filter.docType)
    .eq("owner_type", filter.ownerType)
    .eq("owner_id", filter.ownerId)
    .neq("status", "signed");
  if (error) throw error;
}

/**
 * Marque un doc comme signé : status='signed', signed_at=now.
 * Appelé par /api/documents/sign (C1).
 */
export async function markDocSigned(supabase: SupabaseClient, docId: string): Promise<void> {
  const { error } = await supabase
    .from("documents")
    .update({ status: "signed", signed_at: new Date().toISOString() })
    .eq("id", docId);
  if (error) throw error;
}

/**
 * Set signature tracking fields (signature_token + signer_email + requested_at)
 * pour /api/documents/sign-request (single). Status passe à 'sent' aussi.
 */
export async function setSignatureTracking(
  supabase: SupabaseClient,
  docId: string,
  fields: {
    signatureToken: string;
    tokenExpiresAt: string;
    signerEmail: string;
    signerName?: string | null;
  },
): Promise<void> {
  const { data: existing } = await supabase
    .from("documents").select("metadata").eq("id", docId).single();
  const newMetadata = {
    ...(existing?.metadata ?? {}),
    signer_email: fields.signerEmail,
    signer_name: fields.signerName ?? undefined,
    signature_requested_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("documents")
    .update({
      signature_token: fields.signatureToken,
      signature_token_expires_at: fields.tokenExpiresAt,
      status: "sent",
      sent_at: new Date().toISOString(),
      metadata: newMetadata,
    })
    .eq("id", docId);
  if (error) throw error;
}

/**
 * Incrémente signature_reminder_count dans metadata (pour
 * /api/documents/process-sign-reminders).
 */
export async function incrementReminderCount(
  supabase: SupabaseClient,
  docId: string,
): Promise<void> {
  const { data: existing } = await supabase
    .from("documents").select("metadata").eq("id", docId).single();
  const currentCount = (existing?.metadata as { signature_reminder_count?: number } | null)?.signature_reminder_count ?? 0;
  const newMetadata = { ...(existing?.metadata ?? {}), signature_reminder_count: currentCount + 1 };
  const { error } = await supabase
    .from("documents")
    .update({ metadata: newMetadata })
    .eq("id", docId);
  if (error) throw error;
}

// ─── ServiceResult type ────────────────────────────────────────────────────
/**
 * Type résultat discriminé utilisé pour les helpers de mutation.
 * Pattern cohérent avec enrollments.ts / sessions.ts / invoices.ts.
 */
export type ServiceResult<T = Record<never, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: { message: string; code?: string } };

// ─── BULK UPDATE helpers ────────────────────────────────────────────────────

/**
 * UPDATE en masse de documents par doc_type pour une session.
 * Filtre par entity_id + source_table='sessions' + source_id (session) + doc_type.
 * Filtre optionnel onlyStatus (pattern legacy mass confirm).
 *
 * Résout les UPDATE inline (TabConventionDocs.tsx:960, 1576) qui manquaient
 * .eq("entity_id", entityId) — violation CLAUDE.md AR20.
 */
export async function updateDocsByDocType(
  supabase: SupabaseClient,
  entityId: string,
  sessionId: string,
  docType: string,
  patch: Record<string, unknown>,
  options?: { onlyStatus?: string },
): Promise<ServiceResult<{ updated: number }>> {
  let query = supabase
    .from("documents")
    .update(patch)
    .eq("entity_id", entityId)
    .eq("source_table", "sessions")
    .eq("source_id", sessionId)
    .eq("doc_type", docType);
  if (options?.onlyStatus) {
    query = query.eq("status", options.onlyStatus);
  }
  const { data, error } = await query.select("id");
  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  return { ok: true, updated: (data ?? []).length };
}

/**
 * Lookup d'1 doc par id avec les champs nécessaires pour /api/documents/sign.
 */
export async function getDocById(
  supabase: SupabaseClient,
  docId: string,
): Promise<{
  id: string;
  doc_type: string;
  owner_type: string | null;
  owner_id: string | null;
  source_id: string; // session_id
  status: string;
  signer_email: string | null;
  signer_name: string | null;
} | null> {
  const { data, error } = await supabase
    .from("documents")
    .select("id, doc_type, owner_type, owner_id, source_id, status, metadata")
    .eq("id", docId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const meta = (data.metadata as { signer_email?: string; signer_name?: string } | null) ?? {};
  return {
    id: data.id,
    doc_type: data.doc_type,
    owner_type: data.owner_type,
    owner_id: data.owner_id,
    source_id: data.source_id,
    status: data.status,
    signer_email: meta.signer_email ?? null,
    signer_name: meta.signer_name ?? null,
  };
}
