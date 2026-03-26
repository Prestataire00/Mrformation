import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";

export async function GET(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!["admin","super_admin"].includes(profile?.role ?? "")) {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const tag = searchParams.get("tag");

    let query = supabase
      .from("elearning_global_flashcards")
      .select("*")
      .eq("course_id", params.courseId)
      .order("order_index", { ascending: true });

    if (tag) query = query.contains("tags", [tag]);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: sanitizeDbError(error, "fetching global flashcards") }, { status: 500 });

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "fetching global flashcards") }, { status: 500 });
  }
}
