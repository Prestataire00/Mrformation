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

    const { data: profile } = await supabase
      .from("profiles")
      .select("entity_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.entity_id) {
      return NextResponse.json({ data: null, error: "Profile not found" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("crm_tags")
      .select("*")
      .eq("entity_id", profile.entity_id)
      .order("name");

    if (error) {
      return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
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
      return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("entity_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.entity_id || profile.role !== "admin") {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const body = await request.json();
    const { name, color } = body;

    if (!name?.trim()) {
      return NextResponse.json({ data: null, error: "Le nom du tag est requis" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("crm_tags")
      .insert({
        entity_id: profile.entity_id,
        name: name.trim(),
        color: color || "#6B7280",
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ data: null, error: "Ce tag existe déjà" }, { status: 409 });
      }
      return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("entity_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.entity_id || profile.role !== "admin") {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const tagId = searchParams.get("id");

    if (!tagId) {
      return NextResponse.json({ data: null, error: "ID du tag requis" }, { status: 400 });
    }

    const { error } = await supabase
      .from("crm_tags")
      .delete()
      .eq("id", tagId)
      .eq("entity_id", profile.entity_id);

    if (error) {
      return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: { deleted: true }, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
