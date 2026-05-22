import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { requireElearningCourse } from "@/lib/auth/elearning-access";
import { logAudit } from "@/lib/audit-log";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { courseId: string; chapterId: string } }
) {
  try {
    const access = await requireElearningCourse(params.courseId, ["admin", "super_admin"]);
    if (!access.ok) return access.error;
    const { supabase, profile, userId } = access;

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
      return NextResponse.json({ error: sanitizeDbError(error, "updating chapter") }, { status: 500 });
    }

    logAudit({
      supabase,
      entityId: profile.entity_id,
      userId,
      action: "update",
      resourceType: "elearning_chapter",
      resourceId: params.chapterId,
      details: { courseId: params.courseId },
    });

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "updating chapter") }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { courseId: string; chapterId: string } }
) {
  try {
    const access = await requireElearningCourse(params.courseId, ["admin", "super_admin"]);
    if (!access.ok) return access.error;
    const { supabase, profile, userId } = access;

    const { error } = await supabase
      .from("elearning_chapters")
      .delete()
      .eq("id", params.chapterId)
      .eq("course_id", params.courseId);

    if (error) {
      return NextResponse.json({ error: sanitizeDbError(error, "deleting chapter") }, { status: 500 });
    }

    logAudit({
      supabase,
      entityId: profile.entity_id,
      userId,
      action: "delete",
      resourceType: "elearning_chapter",
      resourceId: params.chapterId,
      details: { courseId: params.courseId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "deleting chapter") }, { status: 500 });
  }
}
