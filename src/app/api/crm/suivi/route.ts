import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createCommercialActionSchema } from "@/lib/validations/crm-suivi";
import { parsePagination } from "@/lib/validations";
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
      return NextResponse.json(
        { data: null, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("entity_id, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.entity_id) {
      return NextResponse.json(
        { data: null, error: "Profile or entity not found" },
        { status: 403 }
      );
    }

    if (!["admin", "super_admin"].includes(profile.role)) {
      return NextResponse.json(
        { data: null, error: "Accès non autorisé" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const actionType = searchParams.get("action_type") ?? "";
    const prospectId = searchParams.get("prospect_id") ?? "";
    const authorId = searchParams.get("author_id") ?? "";
    const search = searchParams.get("search") ?? "";
    const dateFrom = searchParams.get("date_from") ?? "";
    const dateTo = searchParams.get("date_to") ?? "";
    const { page, perPage, offset } = parsePagination(searchParams);

    let query = supabase
      .from("crm_commercial_actions")
      .select(
        `
        *,
        author:profiles!crm_commercial_actions_author_id_fkey (id, first_name, last_name),
        prospect:crm_prospects!crm_commercial_actions_prospect_id_fkey (id, company_name, contact_name)
      `,
        { count: "exact" }
      )
      .eq("entity_id", profile.entity_id)
      .order("created_at", { ascending: false })
      .range(offset, offset + perPage - 1);

    if (actionType) {
      query = query.eq("action_type", actionType);
    }

    if (prospectId) {
      query = query.eq("prospect_id", prospectId);
    }

    if (authorId) {
      query = query.eq("author_id", authorId);
    }

    if (search) {
      query = query.or(
        `subject.ilike.%${search}%,content.ilike.%${search}%`
      );
    }

    if (dateFrom) {
      query = query.gte("created_at", dateFrom + "T00:00:00");
    }

    if (dateTo) {
      query = query.lte("created_at", dateTo + "T23:59:59");
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { data: null, error: sanitizeDbError(error, "fetching actions") },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data,
      error: null,
      meta: {
        total: count ?? 0,
        page,
        per_page: perPage,
        total_pages: Math.ceil((count ?? 0) / perPage),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { data: null, error: sanitizeError(err, "fetching actions") },
      { status: 500 }
    );
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
      return NextResponse.json(
        { data: null, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("entity_id, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.entity_id) {
      return NextResponse.json(
        { data: null, error: "Profile or entity not found" },
        { status: 403 }
      );
    }

    if (!["admin", "super_admin"].includes(profile.role)) {
      return NextResponse.json(
        { data: null, error: "Accès non autorisé" },
        { status: 403 }
      );
    }

    const body = await request.json();

    const parsed = createCommercialActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { action_type, prospect_id, client_id, subject, content, metadata } =
      parsed.data;

    const { data, error } = await supabase
      .from("crm_commercial_actions")
      .insert({
        entity_id: profile.entity_id,
        author_id: user.id,
        action_type,
        prospect_id: prospect_id ?? null,
        client_id: client_id ?? null,
        subject: subject ?? null,
        content: content ?? null,
        metadata: metadata ?? {},
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { data: null, error: sanitizeDbError(error, "creating action") },
        { status: 500 }
      );
    }

    logAudit({
      supabase,
      entityId: profile.entity_id,
      userId: user.id,
      action: "create",
      resourceType: "commercial_action",
      resourceId: data.id,
      details: { action_type, subject },
    });

    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { data: null, error: sanitizeError(err, "creating action") },
      { status: 500 }
    );
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
      return NextResponse.json(
        { data: null, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("entity_id, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.entity_id) {
      return NextResponse.json(
        { data: null, error: "Profile or entity not found" },
        { status: 403 }
      );
    }

    if (!["admin", "super_admin"].includes(profile.role)) {
      return NextResponse.json(
        { data: null, error: "Accès non autorisé" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const actionId = searchParams.get("id");

    if (!actionId) {
      return NextResponse.json(
        { data: null, error: "ID requis" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("crm_commercial_actions")
      .delete()
      .eq("id", actionId)
      .eq("entity_id", profile.entity_id);

    if (error) {
      return NextResponse.json(
        { data: null, error: sanitizeDbError(error, "deleting action") },
        { status: 500 }
      );
    }

    logAudit({
      supabase,
      entityId: profile.entity_id,
      userId: user.id,
      action: "delete",
      resourceType: "commercial_action",
      resourceId: actionId,
    });

    return NextResponse.json({ data: null, error: null });
  } catch (err) {
    return NextResponse.json(
      { data: null, error: sanitizeError(err, "deleting action") },
      { status: 500 }
    );
  }
}
