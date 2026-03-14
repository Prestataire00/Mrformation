import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import pdf from "pdf-parse";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";

interface RouteContext {
  params: { id: string };
}

function getServiceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const supabase = createClient();

    // Auth check
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("cv") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });
    }

    // Validate file type
    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Seuls les fichiers PDF sont acceptés" },
        { status: 400 }
      );
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract text from PDF
    let cvText = "";
    try {
      const pdfData = await pdf(buffer);
      cvText = pdfData.text || "";
    } catch (pdfErr) {
      console.error("PDF parse error:", pdfErr);
    }

    // Use service role client for storage (has permission to create buckets & upload)
    const serviceSupabase = getServiceSupabase();

    // Ensure bucket exists
    const { data: buckets } = await serviceSupabase.storage.listBuckets();
    const bucketExists = buckets?.some((b) => b.name === "documents");
    if (!bucketExists) {
      await serviceSupabase.storage.createBucket("documents", { public: true });
    }

    // Upload to Supabase Storage
    const fileName = `cv-${params.id}-${Date.now()}.pdf`;
    const storagePath = `trainers/${fileName}`;

    const { error: uploadError } = await serviceSupabase.storage
      .from("documents")
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

    // Get public URL
    const { data: urlData } = serviceSupabase.storage
      .from("documents")
      .getPublicUrl(storagePath);

    const cvUrl = urlData?.publicUrl || storagePath;

    // Update trainer record with cv_url and cv_text
    const { error: updateError } = await serviceSupabase
      .from("trainers")
      .update({
        cv_url: cvUrl,
        cv_text: cvText,
      })
      .eq("id", params.id);

    if (updateError) {
      return NextResponse.json(
        { error: sanitizeDbError(updateError, "trainers/[id]/cv update") },
        { status: 500 }
      );
    }

    return NextResponse.json({
      cv_url: cvUrl,
      cv_text_length: cvText.length,
      message: "CV uploadé et analysé avec succès",
    });
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err, "trainers/[id]/cv") }, { status: 500 });
  }
}
