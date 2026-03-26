import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";

async function getTrainerId(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data } = await supabase.from("trainers").select("id").eq("profile_id", userId).single();
  return data?.id || null;
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

    const trainerId = await getTrainerId(supabase, user.id);
    if (!trainerId) return NextResponse.json({ error: "Formateur non trouvé" }, { status: 403 });

    const { data: doc, error } = await supabase
      .from("trainer_documents")
      .select("*, sessions(id, start_date, trainings(title))")
      .eq("id", params.id)
      .eq("trainer_id", trainerId)
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

    const trainerId = await getTrainerId(supabase, user.id);
    if (!trainerId) return NextResponse.json({ error: "Formateur non trouvé" }, { status: 403 });

    // Get the document to retrieve file_path before deleting
    const { data: doc } = await supabase
      .from("trainer_documents")
      .select("id, file_path")
      .eq("id", params.id)
      .eq("trainer_id", trainerId)
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
      .eq("trainer_id", trainerId);

    if (error) return NextResponse.json({ error: sanitizeDbError(error, "trainer/documents/[id] DELETE") }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "trainer/documents/[id] DELETE") }, { status: 500 });
  }
}
