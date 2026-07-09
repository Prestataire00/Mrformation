/**
 * Liste des documents EXISTANTS d'une formation joignables à un email
 * (dialog d'envoi facture / doc de fin de formation).
 *
 * Deux sources :
 *  - Fichiers déposés (`formation_documents`, bucket `formation-docs`) →
 *    téléchargés via URL signée puis convertis en base64.
 *  - Documents Qualiopi générés (`documents`) → régénérés à la volée via
 *    `/api/documents/generate-from-template` (même mécanique que l'envoi
 *    unitaire).
 *
 * Chaque entrée expose un `resolve()` async : la PJ n'est téléchargée/générée
 * qu'au moment où l'utilisateur la sélectionne (pas de pré-chargement).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSignedDocUrl } from "@/lib/storage/fetch-signed-doc-url";
import { DOCUMENT_LABELS } from "@/lib/email/document-labels";

export interface ResolvedAttachment {
  filename: string;
  content: string; // base64 (sans préfixe data:)
  type: string;
}

export interface AvailableAttachment {
  id: string;
  label: string;
  resolve: () => Promise<ResolvedAttachment>;
}

/** « certificat_realisation » + « Jean Dupont » → « Certificat de réalisation — Jean Dupont ». */
export function formationDocLabel(docType: string, ownerName?: string | null): string {
  const base =
    DOCUMENT_LABELS[docType] ??
    (docType.replace(/_/g, " ").trim().replace(/^./, (c) => c.toUpperCase()) || "Document");
  const owner = (ownerName ?? "").trim();
  return owner ? `${base} — ${owner}` : base;
}

async function urlToBase64(url: string): Promise<{ content: string; type: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Téléchargement échoué (${res.status})`);
  const blob = await res.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Lecture du fichier échouée"));
    reader.readAsDataURL(blob);
  });
  return { content: dataUrl.split(",")[1] ?? "", type: blob.type || "application/octet-stream" };
}

export async function listFormationAttachments(
  supabase: SupabaseClient,
  sessionId: string,
  entityId: string | null | undefined,
): Promise<AvailableAttachment[]> {
  const out: AvailableAttachment[] = [];

  // 1. Fichiers déposés
  const { data: uploaded } = await supabase
    .from("formation_documents")
    .select("id, file_name")
    .eq("session_id", sessionId)
    .order("file_name");
  for (const f of (uploaded ?? []) as Array<{ id: string; file_name: string | null }>) {
    const filename = f.file_name || "document";
    out.push({
      id: `uploaded:${f.id}`,
      label: filename,
      resolve: async () => {
        const url = await fetchSignedDocUrl("formation_documents", f.id);
        const { content, type } = await urlToBase64(url);
        return { filename, content, type };
      },
    });
  }

  // 2. Documents générés
  let genQuery = supabase
    .from("documents")
    .select("id, doc_type, template_id, owner_type, owner_id, status")
    .eq("source_table", "sessions")
    .eq("source_id", sessionId)
    .in("status", ["generated", "sent", "signed"]);
  if (entityId) genQuery = genQuery.eq("entity_id", entityId);
  const { data: gen } = await genQuery;
  const genRows = (gen ?? []) as Array<{
    id: string;
    doc_type: string;
    template_id: string | null;
    owner_type: string;
    owner_id: string;
  }>;

  // Noms des destinataires (en lot) pour des libellés lisibles.
  const names = new Map<string, string>();
  const byType = (t: string) => [...new Set(genRows.filter((r) => r.owner_type === t).map((r) => r.owner_id))];
  const learnerIds = byType("learner");
  const clientIds = byType("company");
  const trainerIds = byType("trainer");
  if (learnerIds.length) {
    const { data } = await supabase.from("learners").select("id, first_name, last_name").in("id", learnerIds);
    for (const l of (data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>)
      names.set(`learner:${l.id}`, `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim());
  }
  if (clientIds.length) {
    const { data } = await supabase.from("clients").select("id, company_name").in("id", clientIds);
    for (const c of (data ?? []) as Array<{ id: string; company_name: string | null }>)
      names.set(`company:${c.id}`, c.company_name ?? "");
  }
  if (trainerIds.length) {
    const { data } = await supabase.from("trainers").select("id, first_name, last_name").in("id", trainerIds);
    for (const t of (data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>)
      names.set(`trainer:${t.id}`, `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim());
  }

  for (const d of genRows) {
    const label = formationDocLabel(d.doc_type, names.get(`${d.owner_type}:${d.owner_id}`));
    const ctxKey =
      d.owner_type === "learner" ? "learner_id" : d.owner_type === "company" ? "client_id" : d.owner_type === "trainer" ? "trainer_id" : null;
    out.push({
      id: `generated:${d.id}`,
      label,
      resolve: async () => {
        const res = await fetch("/api/documents/generate-from-template", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            template_id: d.template_id || undefined,
            doc_type: d.template_id ? undefined : d.doc_type,
            context: { session_id: sessionId, ...(ctxKey ? { [ctxKey]: d.owner_id } : {}) },
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Génération du document échouée");
        return {
          filename: json.filename || `${d.doc_type.replace(/_/g, "-")}.pdf`,
          content: json.base64,
          type: "application/pdf",
        };
      },
    });
  }

  return out;
}
