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
  isHttpCvUrl,
} from "@/lib/trainers/cv-storage";

/**
 * POST/GET /api/trainer/cv — gestion par le formateur de SON PROPRE CV.
 *
 * Endpoint self-service (sous /api/trainer, autorisé au rôle trainer par le
 * middleware) : le formateur est résolu depuis l'auth (`trainers.profile_id =
 * auth.uid()`), donc aucun IDOR possible (pas d'`[id]` exposé). L'upload
 * admin reste sur `/api/trainers/[id]/cv` (admin-only).
 */

function getServiceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function resolveOwnTrainer(
  supabase: ReturnType<typeof createClient>,
  userId: string,
) {
  // Multi-entité : un profil peut avoir plusieurs fiches (1/entité). .maybeSingle()
  // échouait à ≥2 lignes → CV inaccessible. On prend la 1ʳᵉ fiche (le CV est par
  // fiche ; cas multi-entité rare — affiner par entité active si besoin).
  const { data } = await supabase
    .from("trainers")
    .select("id, entity_id, cv_url")
    .eq("profile_id", userId)
    .limit(1);
  return ((data ?? [])[0] as { id: string; entity_id: string | null; cv_url: string | null } | undefined) ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const trainer = await resolveOwnTrainer(supabase, user.id);
    if (!trainer) {
      return NextResponse.json({ error: "Profil formateur introuvable" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("cv") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });
    }
    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Seuls les fichiers PDF sont acceptés" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let cvText = "";
    try {
      cvText = (await pdf(buffer)).text || "";
    } catch (pdfErr) {
      console.error("PDF parse error:", pdfErr);
    }

    const serviceSupabase = getServiceSupabase();
    const storagePath = getTrainerCvStoragePath(trainer.id);

    // Purge de l'ancien CV (best-effort) pour éviter le bloat Storage.
    const previousCvUrl = trainer.cv_url;
    if (previousCvUrl && previousCvUrl !== storagePath) {
      const cleanPath = extractCvStorageCleanPath(previousCvUrl);
      if (cleanPath) {
        await serviceSupabase.storage
          .from(detectCvBucket(previousCvUrl))
          .remove([cleanPath])
          .catch(() => undefined);
      }
    }

    const { error: uploadError } = await serviceSupabase.storage
      .from(TRAINER_CV_BUCKET)
      .upload(storagePath, buffer, { contentType: "application/pdf", upsert: true });
    if (uploadError) {
      return NextResponse.json({ error: sanitizeDbError(uploadError, "trainer/cv upload") }, { status: 500 });
    }

    const { error: updateError } = await serviceSupabase
      .from("trainers")
      .update({ cv_url: storagePath, cv_text: cvText })
      .eq("id", trainer.id);
    if (updateError) {
      return NextResponse.json({ error: sanitizeDbError(updateError, "trainer/cv update") }, { status: 500 });
    }

    logAudit({
      supabase,
      entityId: trainer.entity_id ?? "",
      userId: user.id,
      action: "update",
      resourceType: "trainers.cv",
      resourceId: trainer.id,
      details: { self: true, cv_text_length: cvText.length, file_size: file.size },
    });

    return NextResponse.json({
      cv_url: storagePath,
      cv_text_length: cvText.length,
      message: "CV enregistré avec succès.",
    });
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err, "trainer/cv POST") }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const trainer = await resolveOwnTrainer(supabase, user.id);
    if (!trainer?.cv_url) {
      return NextResponse.json({ error: "Aucun CV uploadé" }, { status: 404 });
    }

    if (isHttpCvUrl(trainer.cv_url)) {
      return NextResponse.json({ url: trainer.cv_url, legacy: true });
    }

    // Signed URL via le service client (bucket privé) — l'ownership est déjà
    // garantie (cv_url résolu depuis la fiche du formateur courant).
    const { data, error } = await getServiceSupabase()
      .storage.from(TRAINER_CV_BUCKET)
      .createSignedUrl(trainer.cv_url, 3600);
    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: "Impossible de générer le lien" }, { status: 500 });
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "trainer/cv GET") }, { status: 500 });
  }
}
