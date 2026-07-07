import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";
import { createDocxTemplateRecord } from "@/lib/services/documents-store";
import {
  listCustomTypes,
  createCustomType,
  createCustomTypeFieldsSchema,
} from "@/lib/services/custom-secondary-doc-types";

/**
 * GET /api/documents/custom-secondary-types[?includeInactive=true]
 *
 * Liste le catalogue des types secondaires custom de l'entité. Par défaut,
 * seulement les actifs (catalogue d'attribution). `includeInactive=true` pour
 * la gestion / l'affichage des docs d'un type désactivé. Admin + super_admin.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  const includeInactive =
    new URL(request.url).searchParams.get("includeInactive") === "true";

  const res = await listCustomTypes(auth.supabase, auth.profile.entity_id, {
    includeInactive,
  });
  if (!res.ok) {
    return NextResponse.json(
      { error: sanitizeError(new Error(res.error.message), "custom-secondary-types GET") },
      { status: 500 },
    );
  }
  return NextResponse.json({ types: res.types });
}

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_EXT = new Set(["docx"]);
const TEMPLATES_BUCKET = "formation-docs";

/**
 * POST /api/documents/custom-secondary-types  (FormData)
 *
 * Crée un type secondaire custom : upload du template (.docx) → ligne
 * document_templates (docx_fidelity) → définition custom active liée. Le
 * destinataire (ownerType) est figé à la création. Admin + super_admin.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "FormData invalide" }, { status: 400 });
  }

  const parsed = createCustomTypeFieldsSchema.safeParse({
    label: formData.get("label"),
    category: formData.get("category"),
    ownerType: formData.get("ownerType"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json(
      { error: "Le template (.docx) est obligatoire (champ `file`)." },
      { status: 400 },
    );
  }
  const fileName = (file instanceof File ? file.name : "") || "template.docx";
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return NextResponse.json(
      { error: "Format non supporté : uploadez un template Word (.docx)." },
      { status: 400 },
    );
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `Fichier trop volumineux (max ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB).` },
      { status: 400 },
    );
  }

  try {
    // 1. Template uploadé → ligne document_templates.
    const tpl = await createDocxTemplateRecord(auth.supabase, {
      entityId: auth.profile.entity_id,
      name: parsed.data.label,
      // `document_templates.type` est contraint (CHECK type_check) à
      // agreement|certificate|attendance|invoice|other. La valeur est ici
      // purement indicative — le lien réel est `template_id` — donc on prend
      // 'other' (valeur autorisée) pour ne pas violer la contrainte.
      docType: "other",
      file,
      fileName,
      uploadedBy: auth.user.id,
    });
    if (!tpl.ok) {
      return NextResponse.json(
        { error: sanitizeError(new Error(tpl.error.message), "custom-secondary-types POST template") },
        { status: 500 },
      );
    }

    // 2. Définition custom liée au template.
    const created = await createCustomType(auth.supabase, {
      entityId: auth.profile.entity_id,
      label: parsed.data.label,
      category: parsed.data.category,
      ownerType: parsed.data.ownerType,
      templateId: tpl.templateId,
    });
    if (!created.ok) {
      // Rollback best-effort : le template vient d'être créé mais n'est
      // référencé par aucune définition → on le retire pour éviter un orphelin
      // (fichier Storage + ligne document_templates).
      await auth.supabase.storage.from(TEMPLATES_BUCKET).remove([tpl.storagePath]);
      await auth.supabase
        .from("document_templates")
        .delete()
        .eq("id", tpl.templateId)
        .eq("entity_id", auth.profile.entity_id);
      return NextResponse.json(
        { error: sanitizeError(new Error(created.error.message), "custom-secondary-types POST") },
        { status: 500 },
      );
    }

    logAudit({
      supabase: auth.supabase,
      entityId: auth.profile.entity_id,
      userId: auth.user.id,
      action: "create",
      resourceType: "custom_secondary_doc_type",
      resourceId: created.type.id,
      details: {
        doc_type: created.type.doc_type,
        label: created.type.label,
        category: created.type.category,
        owner_type: created.type.owner_type,
      },
    });

    return NextResponse.json({ type: created.type }, { status: 201 });
  } catch (err) {
    console.error("[custom-secondary-types POST] error:", err);
    return NextResponse.json(
      { error: sanitizeError(err, "custom-secondary-types POST") },
      { status: 500 },
    );
  }
}
