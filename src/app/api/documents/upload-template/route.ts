import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/require-role";

const BUCKET = "formation-docs";
const ALLOWED_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase config");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(req: NextRequest) {
  const authResult = await requireRole(["super_admin", "admin"]);
  if (authResult.error) return authResult.error;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const entityId = formData.get("entity_id") as string | null;

    if (!file || !entityId) {
      return NextResponse.json({ error: "file et entity_id requis" }, { status: 400 });
    }

    if (file.type !== ALLOWED_MIME) {
      return NextResponse.json({ error: "Seuls les fichiers .docx sont acceptés" }, { status: 400 });
    }

    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "Fichier trop volumineux (max 20 Mo)" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const uuid = crypto.randomUUID();
    const storagePath = `templates/${entityId}/${uuid}.docx`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: ALLOWED_MIME,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(storagePath);

    return NextResponse.json({
      url: urlData.publicUrl,
      path: storagePath,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
