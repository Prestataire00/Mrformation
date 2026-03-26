import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";

// GET: Get active session for a course
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

    const { data, error } = await supabase
      .from("elearning_live_sessions")
      .select("*")
      .eq("course_id", params.courseId)
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return NextResponse.json({ error: sanitizeDbError(error, "fetching live session") }, { status: 500 });

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "fetching live session") }, { status: 500 });
  }
}

// POST: Create a new live session
export async function POST(
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

    // End any existing active sessions for this course
    await supabase
      .from("elearning_live_sessions")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("course_id", params.courseId)
      .eq("status", "active");

    const { data, error } = await supabase
      .from("elearning_live_sessions")
      .insert({
        course_id: params.courseId,
        presenter_id: user.id,
        status: "active",
        current_slide_index: 0,
        current_state: {},
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: sanitizeDbError(error, "creating live session") }, { status: 500 });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "creating live session") }, { status: 500 });
  }
}

// PATCH: Update session (slide index, state, end)
export async function PATCH(
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

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.current_slide_index !== undefined) updates.current_slide_index = body.current_slide_index;
    if (body.current_state !== undefined) updates.current_state = body.current_state;
    if (body.status === "ended") {
      updates.status = "ended";
      updates.ended_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("elearning_live_sessions")
      .update(updates)
      .eq("course_id", params.courseId)
      .eq("status", "active")
      .select()
      .single();

    if (error) return NextResponse.json({ error: sanitizeDbError(error, "updating live session") }, { status: 500 });

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "updating live session") }, { status: 500 });
  }
}
