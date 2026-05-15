/**
 * POST /api/documents/templates/import
 *
 * Importe un template Word/PDF dans `document_templates`. Story D1 du
 * refactor Documents.
 *
 * Workflow :
 *   1. Auth + check rôle admin/super_admin
 *   2. Reçoit FormData : file (Blob) + name + docType + defaultForDocType
 *   3. Upload du fichier dans bucket `formation-docs/templates/{entity_id}/{uuid}.docx`
 *   4. Si template avec même name existe pour cette entité → UPSERT (overwrite + log)
 *   5. INSERT dans `document_templates` avec mode='docx_fidelity', is_system=false
 *   6. Si `defaultForDocType` = true → désactive default sur les autres templates du même type
 *
 * Sécurité : RLS Supabase + check applicatif role + filtre entity_id partout.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { logEvent } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";

const TEMPLATES_BUCKET = "formation-docs";
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();

    // ── Auth ──────────────────────────────────────────────────────────────
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("entity_id, role")
      .eq("id", user.id)
      .single();
    if (!profile?.entity_id) {
      return NextResponse.json(
        { error: "Profile or entity not found" },
        { status: 403 },
      );
    }
    if (!["admin", "super_admin"].includes(profile.role)) {
      return NextResponse.json(
        { error: "Accès non autorisé" },
        { status: 403 },
      );
    }

    // ── Parse FormData ────────────────────────────────────────────────────
    const formData = await request.formData();
    const file = formData.get("file");
    const name = formData.get("name");
    const docType = formData.get("docType");
    const defaultForDocType = formData.get("defaultForDocType") === "true";

    if (!(file instanceof Blob)) {
      return NextResponse.json(
        { error: "Le fichier est obligatoire (FormData field `file`)" },
        { status: 400 },
      );
    }
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Le nom du template est obligatoire" },
        { status: 400 },
      );
    }
    if (typeof docType !== "string" || !docType.trim()) {
      return NextResponse.json(
        { error: "Le type de document est obligatoire" },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `Fichier trop volumineux (max ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB)` },
        { status: 400 },
      );
    }

    // ── Filename + path Storage ──────────────────────────────────────────
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const uuid = crypto.randomUUID();
    const ext = ((file as File).name || "template.docx").split(".").pop() || "docx";
    const storagePath = `templates/${profile.entity_id}/${uuid}.${ext}`;

    // ── Upload Storage ────────────────────────────────────────────────────
    const { error: uploadError } = await supabase.storage
      .from(TEMPLATES_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (uploadError) {
      return NextResponse.json(
        { error: `Échec upload Storage : ${sanitizeError(uploadError, "uploading template")}` },
        { status: 500 },
      );
    }

    // Récupère l'URL publique (le bucket est lisible auth, on stocke le path en clair)
    const { data: urlData } = supabase.storage
      .from(TEMPLATES_BUCKET)
      .getPublicUrl(storagePath);
    const sourceDocxUrl = urlData.publicUrl;

    // ── Mode de template selon extension ──────────────────────────────────
    const mode = ext.toLowerCase() === "pdf" ? "pdf_fidelity" : "docx_fidelity";

    // ── UPSERT par (entity_id, name) ──────────────────────────────────────
    const { data: existing } = await supabase
      .from("document_templates")
      .select("id")
      .eq("entity_id", profile.entity_id)
      .eq("name", name.trim())
      .maybeSingle();

    // Sémantique `default_for_doc_type` : TEXT (cf migration
    // add_default_for_doc_type.sql). Valeur = nom du doc_type pour lequel
    // ce template est marqué défaut, ou NULL.
    const defaultForDocTypeValue = defaultForDocType ? docType : null;

    let templateId: string;
    if (existing) {
      // UPDATE
      const { error: updateError } = await supabase
        .from("document_templates")
        .update({
          type: docType,
          source_docx_url: sourceDocxUrl,
          mode,
          default_for_doc_type: defaultForDocTypeValue,
          uploaded_at: new Date().toISOString(),
          uploaded_by: user.id,
        })
        .eq("id", existing.id);
      if (updateError) {
        return NextResponse.json(
          { error: sanitizeDbError(updateError, "updating template") },
          { status: 500 },
        );
      }
      templateId = existing.id;
      logEvent("template_overwritten", {
        entity_id: profile.entity_id,
        template_id: templateId,
        doc_type: docType,
        uploaded_by: user.id,
      });
    } else {
      // INSERT
      const { data: inserted, error: insertError } = await supabase
        .from("document_templates")
        .insert({
          entity_id: profile.entity_id,
          name: name.trim(),
          type: docType,
          content: null, // mode docx_fidelity : pas de HTML, juste le .docx
          source_docx_url: sourceDocxUrl,
          mode,
          is_system: false,
          default_for_doc_type: defaultForDocTypeValue,
          uploaded_at: new Date().toISOString(),
          uploaded_by: user.id,
        })
        .select("id")
        .single();
      if (insertError || !inserted) {
        return NextResponse.json(
          { error: sanitizeDbError(insertError, "inserting template") },
          { status: 500 },
        );
      }
      templateId = inserted.id;
      logEvent("template_imported", {
        entity_id: profile.entity_id,
        template_id: templateId,
        doc_type: docType,
        uploaded_by: user.id,
      });
    }

    // ── Si défaut activé, désactiver les autres templates marqués défaut pour
    // le même doc_type. `default_for_doc_type` est TEXT — on désactive en
    // settant la colonne à NULL pour tous les templates de cette entité dont
    // la valeur est l'actuel docType, sauf celui qu'on vient d'enregistrer.
    if (defaultForDocType) {
      await supabase
        .from("document_templates")
        .update({ default_for_doc_type: null })
        .eq("entity_id", profile.entity_id)
        .eq("default_for_doc_type", docType)
        .neq("id", templateId);
    }

    return NextResponse.json({ templateId, storagePath, mode });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "import template") },
      { status: 500 },
    );
  }
}
