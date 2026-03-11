import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get("unread") === "true";
    const limit = parseInt(searchParams.get("limit") ?? "20", 10);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);

    let query = supabase
      .from("crm_notifications")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (unreadOnly) {
      query = query.eq("is_read", false);
    }

    const { data, error, count: totalCount } = await query;

    if (error) {
      return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    }

    // Also get unread count
    const { count } = await supabase
      .from("crm_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    return NextResponse.json({ data, error: null, unread_count: count ?? 0, total_count: totalCount ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, mark_all_read } = body;

    if (mark_all_read) {
      const { error } = await supabase
        .from("crm_notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("is_read", false);

      if (error) {
        return NextResponse.json({ data: null, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ data: { updated: true }, error: null });
    }

    if (id) {
      const { error } = await supabase
        .from("crm_notifications")
        .update({ is_read: true })
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) {
        return NextResponse.json({ data: null, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ data: { updated: true }, error: null });
    }

    return NextResponse.json({ data: null, error: "ID or mark_all_read required" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
