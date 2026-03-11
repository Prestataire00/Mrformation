import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { courseId: string; chapterId: string } }
) {
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
      .select("role")
      .eq("id", user.id)
      .single();

    if (!["admin", "learner"].includes(profile?.role)) {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const body = await request.json();
    const { title, summary, content_html, content_markdown, key_concepts, order_index, estimated_duration_minutes } = body;

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title;
    if (summary !== undefined) updates.summary = summary;
    if (content_html !== undefined) updates.content_html = content_html;
    if (content_markdown !== undefined) updates.content_markdown = content_markdown;
    if (key_concepts !== undefined) updates.key_concepts = key_concepts;
    if (order_index !== undefined) updates.order_index = order_index;
    if (estimated_duration_minutes !== undefined) updates.estimated_duration_minutes = estimated_duration_minutes;

    const { data, error } = await supabase
      .from("elearning_chapters")
      .update(updates)
      .eq("id", params.chapterId)
      .eq("course_id", params.courseId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { courseId: string; chapterId: string } }
) {
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
      .select("role")
      .eq("id", user.id)
      .single();

    if (!["admin", "learner"].includes(profile?.role)) {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const { error } = await supabase
      .from("elearning_chapters")
      .delete()
      .eq("id", params.chapterId)
      .eq("course_id", params.courseId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
