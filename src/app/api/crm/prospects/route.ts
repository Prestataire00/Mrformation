import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { parsePagination, createProspectSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit-log";
import { isCrmAuthorized } from "@/lib/auth/permissions";
import { resolveActiveEntityId } from "@/lib/crm/active-entity";
import { searchProspectIds } from "@/lib/services/prospect-search";

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
      .select("entity_id, role, has_crm_access")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.entity_id) {
      return NextResponse.json(
        { data: null, error: "Profile or entity not found" },
        { status: 403 }
      );
    }

    // h-17 : helper centralisé (admin/super_admin/commercial + trainer avec has_crm_access)
    if (!isCrmAuthorized(profile)) {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const activeEntityId = resolveActiveEntityId(profile);

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? "";
    const status = searchParams.get("status") ?? "";
    const assignedTo = searchParams.get("assigned_to") ?? "";
    const dateFrom = searchParams.get("date_from") ?? "";
    const dateTo = searchParams.get("date_to") ?? "";
    const { page, perPage, offset } = parsePagination(searchParams);

    let query = supabase
      .from("crm_prospects")
      .select(
        `
        *,
        assigned_profile:profiles!crm_prospects_assigned_to_fkey (id, first_name, last_name)
      `,
        { count: "exact" }
      )
      .eq("entity_id", activeEntityId)
      .order("created_at", { ascending: false })
      .range(offset, offset + perPage - 1);

    // Recherche fuzzy/accents via RPC paramétrée (plus d'injection DSL .or()).
    if (search.trim()) {
      const res = await searchProspectIds(supabase, activeEntityId ?? "", search);
      if (!res.ok) {
        return NextResponse.json(
          { data: null, error: sanitizeDbError(res.error) },
          { status: 500 }
        );
      }
      // ids vides → sentinelle UUID inexistante pour renvoyer 0 résultat proprement.
      query = query.in(
        "id",
        res.ids.length ? res.ids : ["00000000-0000-0000-0000-000000000000"]
      );
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (assignedTo) {
      query = query.eq("assigned_to", assignedTo);
    }

    if (dateFrom) {
      query = query.gte("created_at", dateFrom);
    }

    if (dateTo) {
      query = query.lte("created_at", dateTo);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { data: null, error: sanitizeDbError(error, "fetching prospects") },
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
    return NextResponse.json({ data: null, error: sanitizeError(err, "fetching prospects") }, { status: 500 });
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
      .select("entity_id, role, has_crm_access")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.entity_id) {
      return NextResponse.json(
        { data: null, error: "Profile or entity not found" },
        { status: 403 }
      );
    }

    // h-17 : helper centralisé (admin/super_admin/commercial + trainer avec has_crm_access)
    if (!isCrmAuthorized(profile)) {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const activeEntityId = resolveActiveEntityId(profile);

    const body = await request.json();

    const parsed = createProspectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { company_name, contact_name, contact_email, contact_phone, status, source, notes } = parsed.data;

    const { data, error } = await supabase
      .from("crm_prospects")
      .insert({
        entity_id: activeEntityId,
        company_name,
        contact_name: contact_name ?? null,
        email: contact_email ?? body.email ?? null,
        phone: contact_phone ?? body.phone ?? null,
        status: status ?? "new",
        source: source ?? null,
        notes: notes ?? null,
        assigned_to: body.assigned_to ?? user.id,
        siret: body.siret ?? null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { data: null, error: sanitizeDbError(error, "creating prospect") },
        { status: 500 }
      );
    }

    logAudit({
      supabase,
      entityId: activeEntityId,
      userId: user.id,
      action: "create",
      resourceType: "prospect",
      resourceId: data.id,
      details: { name: data.company_name },
    });

    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ data: null, error: sanitizeError(err, "creating prospect") }, { status: 500 });
  }
}
