import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";

async function getTrainerContext(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data } = await supabase
    .from("trainers")
    .select("id, entity_id")
    .eq("profile_id", userId)
    .single();
  return data ? { id: data.id as string, entity_id: data.entity_id as string | null } : null;
}

/**
 * GET    /api/trainer/documents/[id]  — get one document
 * DELETE /api/trainer/documents/[id]  — delete document + file from storage
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const trainer = await getTrainerContext(supabase, user.id);
    if (!trainer) return NextResponse.json({ error: "Formateur non trouvé" }, { status: 403 });

    const { data: doc, error } = await supabase
      .from("trainer_documents")
      .select("*, sessions(id, start_date, trainings(title))")
      .eq("id", params.id)
      .eq("trainer_id", trainer.id)
      .single();

    if (error || !doc) return NextResponse.json({ error: "Document non trouvé" }, { status: 404 });
    return NextResponse.json({ data: doc });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "trainer/documents/[id] GET") }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const trainer = await getTrainerContext(supabase, user.id);
    if (!trainer) return NextResponse.json({ error: "Formateur non trouvé" }, { status: 403 });

    // Get the document to retrieve file_path before deleting
    const { data: doc } = await supabase
      .from("trainer_documents")
      .select("id, file_path, file_name, doc_type, scope")
      .eq("id", params.id)
      .eq("trainer_id", trainer.id)
      .single();

    if (!doc) return NextResponse.json({ error: "Document non trouvé" }, { status: 404 });

    // Delete from storage
    if (doc.file_path) {
      await supabase.storage.from("elearning-documents").remove([doc.file_path]);
    }

    // Delete from database
    const { error } = await supabase
      .from("trainer_documents")
      .delete()
      .eq("id", params.id)
      .eq("trainer_id", trainer.id);

    if (error) return NextResponse.json({ error: sanitizeDbError(error, "trainer/documents/[id] DELETE") }, { status: 500 });

    // Lot H audit BMAD : trace suppression document (sensible RGPD).
    if (trainer.entity_id) {
      logAudit({
        supabase,
        entityId: trainer.entity_id,
        userId: user.id,
        action: "delete",
        resourceType: "trainer_documents",
        resourceId: params.id,
        details: { scope: doc.scope, doc_type: doc.doc_type, file_name: doc.file_name },
      });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "trainer/documents/[id] DELETE") }, { status: 500 });
  }
}
