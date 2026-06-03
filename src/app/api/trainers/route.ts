import { createClient } from "@/lib/supabase/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { parsePagination, createTrainerSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit-log";
import { NextRequest, NextResponse } from "next/server";

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

    if (!["admin","super_admin"].includes(profile.role)) {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? "";
    const status = searchParams.get("status") ?? "";
    const { page, perPage, offset } = parsePagination(searchParams);

    let query = supabase
      .from("trainers")
      .select(
        `
        *,
        trainer_competencies (
          id,
          training_domains (id, name)
        )
      `,
        { count: "exact" }
      )
      .eq("entity_id", profile.entity_id)
      .order("last_name", { ascending: true })
      .range(offset, offset + perPage - 1);

    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`
      );
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { data: null, error: sanitizeDbError(error, "fetch trainers") },
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
    return NextResponse.json({ data: null, error: sanitizeError(err, "fetch trainers") }, { status: 500 });
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

    if (!["admin","super_admin"].includes(profile.role)) {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const body = await request.json();

    const parsed = createTrainerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // Lot G audit BMAD : utilise parsed.data validé (au lieu de body brut
    // pour adresse/SIRET/etc.). Ajout type, IBAN/BIC, NDA, legal_status,
    // company_name, tva_number, availability_notes, bank_name.
    const data = parsed.data;
    const { competency_ids } = body;

    const { data: trainer, error: insertError } = await supabase
      .from("trainers")
      .insert({
        entity_id: profile.entity_id,
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email ?? null,
        phone: data.phone ?? null,
        type: data.type ?? "internal",
        bio: data.bio ?? null,
        status: data.status ?? "active",
        hourly_rate: data.hourly_rate ?? null,
        availability_notes: data.availability_notes ?? null,
        address: data.address ?? null,
        city: data.city ?? null,
        postal_code: data.postal_code ?? null,
        country: data.country ?? "France",
        siret: data.siret ?? null,
        nda: data.nda ?? null,
        legal_status: data.legal_status ?? null,
        company_name: data.company_name ?? null,
        tva_number: data.tva_number ?? null,
        contract_type: data.contract_type ?? null,
        iban: data.iban ?? null,
        bic: data.bic ?? null,
        bank_name: data.bank_name ?? null,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { data: null, error: sanitizeDbError(insertError, "create trainer") },
        { status: 500 }
      );
    }

    if (competency_ids && Array.isArray(competency_ids) && competency_ids.length > 0) {
      const competencyRows = competency_ids.map((domainId: string) => ({
        trainer_id: trainer.id,
        training_domain_id: domainId,
      }));

      const { error: compError } = await supabase
        .from("trainer_competencies")
        .insert(competencyRows);

      if (compError) {
        console.error("Failed to insert trainer competencies:", compError.message);
      }
    }

    logAudit({
      supabase,
      entityId: profile.entity_id,
      userId: user.id,
      action: "create",
      resourceType: "trainers",
      resourceId: trainer.id,
      details: { first_name: trainer.first_name, last_name: trainer.last_name },
    });

    return NextResponse.json({ data: trainer, error: null }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ data: null, error: sanitizeError(err, "create trainer") }, { status: 500 });
  }
}
