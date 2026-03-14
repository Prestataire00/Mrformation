import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("entity_id, role")
      .eq("id", user.id)
      .single();
    if (!profile?.entity_id) {
      return NextResponse.json({ error: "Entity not found" }, { status: 403 });
    }

    if (profile.role !== "admin") {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "";

    let query = supabase
      .from("elearning_courses")
      .select("*, elearning_chapters(id)")
      .eq("entity_id", profile.entity_id)
      .order("updated_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: sanitizeDbError(error, "fetching elearning courses") }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "fetching elearning courses") }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("entity_id, role")
      .eq("id", user.id)
      .single();
    if (!profile?.entity_id) {
      return NextResponse.json({ error: "Entity not found" }, { status: 403 });
    }

    if (profile.role !== "admin") {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const body = await request.json();
    const { title, source_file_name, source_file_url, source_file_type, final_quiz_target_count, flashcards_target_count, extracted_text, course_type, gamma_theme_id, gamma_template_id, num_chapters, program_id } = body;

    if (!title) {
      return NextResponse.json({ error: "Le titre est requis" }, { status: 400 });
    }

    // Text-input mode: extracted_text provided directly (no file upload)
    const hasDirectText = typeof extracted_text === "string" && extracted_text.trim().length > 0;

    const insertData: Record<string, unknown> = {
      entity_id: profile.entity_id,
      created_by: user.id,
      title,
      source_file_name: source_file_name || null,
      source_file_url: source_file_url || null,
      source_file_type: source_file_type || (hasDirectText ? "text/plain" : null),
      extracted_text: hasDirectText ? extracted_text.trim() : null,
      status: "processing",
      generation_status: "pending",
    };
    if (course_type && ["presentation", "quiz", "complete"].includes(course_type)) {
      insertData.course_type = course_type;
    }
    if (gamma_theme_id) insertData.gamma_theme_id = gamma_theme_id;
    if (gamma_template_id) insertData.gamma_template_id = gamma_template_id;
    if (final_quiz_target_count !== undefined) insertData.final_quiz_target_count = final_quiz_target_count;
    if (flashcards_target_count !== undefined) insertData.flashcards_target_count = flashcards_target_count;
    if (num_chapters !== undefined) insertData.num_chapters = Math.min(8, Math.max(2, Number(num_chapters) || 5));
    if (program_id) insertData.program_id = program_id;

    const { data, error } = await supabase
      .from("elearning_courses")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: sanitizeDbError(error, "creating elearning course") }, { status: 500 });
    }

    logAudit({
      supabase,
      entityId: profile.entity_id,
      userId: user.id,
      action: "create",
      resourceType: "elearning_course",
      resourceId: data.id,
      details: { name: data.title },
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "creating elearning course") }, { status: 500 });
  }
}
