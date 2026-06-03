import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import pdf from "pdf-parse";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";
import {
  TRAINER_CV_BUCKET,
  detectCvBucket,
  extractCvStorageCleanPath,
  getTrainerCvStoragePath,
} from "@/lib/trainers/cv-storage";

interface RouteContext {
  params: { id: string };
}

function getServiceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/trainers/[id]/cv
 *
 * Upload du CV d'un formateur + extraction du texte (pdf-parse) pour
 * indexation IA. Stocke dans le bucket privé `elearning-documents` sous
 * `trainers/cv/cv-<trainerId>.pdf` (path déterministe → l'upsert écrase
 * l'ancien CV sans bloat Storage, cf bug Loris "Erreur lors du
 * remplacement d'un CV lorsqu'il y a déjà un CV").
 *
 * Sécurité multi-tenant (audit BMAD Lot A) :
 *  - admin/super_admin authentifié
 *  - trainer.entity_id === profile.entity_id (sauf super_admin)
 *  - bucket privé (PAS public) — cv_url stocke le path interne, signed
 *    URL générée à la demande via /api/trainers/[id]/cv/url.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const supabase = createClient();

    // Auth admin / super_admin uniquement
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, entity_id")
      .eq("id", user.id)
      .single();
    if (!profile || !["admin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    // Défense en profondeur : trainer doit appartenir à l'entité (admin) ;
    // super_admin bypass.
    const { data: trainerRow } = await supabase
      .from("trainers")
      .select("entity_id, cv_url")
      .eq("id", params.id)
      .maybeSingle();
    if (!trainerRow) {
      return NextResponse.json({ error: "Formateur introuvable" }, { status: 404 });
    }
    if (profile.role === "admin" && trainerRow.entity_id !== profile.entity_id) {
      return NextResponse.json({ error: "Formateur hors de l'entité" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("cv") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });
    }
    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Seuls les fichiers PDF sont acceptés" },
        { status: 400 }
      );
    }

    // Read file buffer + extract text
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    let cvText = "";
    try {
      const pdfData = await pdf(buffer);
      cvText = pdfData.text || "";
    } catch (pdfErr) {
      console.error("PDF parse error:", pdfErr);
    }

    // Storage : bucket privé existant `elearning-documents`, path
    // déterministe (cf src/lib/trainers/cv-storage.ts) pour upsert propre.
    const serviceSupabase = getServiceSupabase();
    const storagePath = getTrainerCvStoragePath(params.id);

    // Purger l'ancien CV s'il existe sur un autre path. Best-effort
    // silencieux. Détection du bucket via helper testé pour éviter la
    // purge sur le mauvais bucket (cf audit BMAD #4).
    const previousCvUrl = trainerRow.cv_url as string | null;
    if (previousCvUrl && previousCvUrl !== storagePath) {
      const legacyBucket = detectCvBucket(previousCvUrl);
      const cleanPath = extractCvStorageCleanPath(previousCvUrl);
      if (cleanPath) {
        await serviceSupabase.storage
          .from(legacyBucket)
          .remove([cleanPath])
          .catch(() => undefined);
      }
    }

    const { error: uploadError } = await serviceSupabase.storage
      .from(TRAINER_CV_BUCKET)
      .upload(storagePath, buffer, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (uploadError) {
      return NextResponse.json(
        { error: sanitizeDbError(uploadError, "trainers/[id]/cv upload") },
        { status: 500 }
      );
    }

    // Sauvegarder le path interne (pas une URL publique) — signed URL à
    // la demande via une route dédiée pour respecter le bucket privé.
    const { error: updateError } = await serviceSupabase
      .from("trainers")
      .update({ cv_url: storagePath, cv_text: cvText })
      .eq("id", params.id)
      .eq("entity_id", trainerRow.entity_id);
    if (updateError) {
      return NextResponse.json(
        { error: sanitizeDbError(updateError, "trainers/[id]/cv update") },
        { status: 500 }
      );
    }

    // Lot H audit BMAD : trace audit log (CV upload = action sensible RGPD).
    logAudit({
      supabase,
      entityId: trainerRow.entity_id as string,
      userId: user.id,
      action: "update",
      resourceType: "trainers.cv",
      resourceId: params.id,
      details: { cv_text_length: cvText.length, file_size: file.size },
    });

    return NextResponse.json({
      cv_url: storagePath,
      cv_text_length: cvText.length,
      message: "CV uploadé et analysé avec succès",
    });
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err, "trainers/[id]/cv") }, { status: 500 });
  }
}
