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

    if (profile.role !== "admin") {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? "";
    const status = searchParams.get("status") ?? "";
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const perPage = parseInt(searchParams.get("per_page") ?? "20", 10);
    const offset = (page - 1) * perPage;

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
        { data: null, error: error.message },
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

    if (profile.role !== "admin") {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const body = await request.json();

    const {
      first_name,
      last_name,
      email,
      phone,
      address,
      city,
      postal_code,
      country,
      siret,
      status,
      bio,
      hourly_rate,
      contract_type,
      competency_ids,
    } = body;

    if (!first_name || !last_name) {
      return NextResponse.json(
        { data: null, error: "Le prénom et le nom du formateur sont requis" },
        { status: 400 }
      );
    }

    const { data: trainer, error: insertError } = await supabase
      .from("trainers")
      .insert({
        entity_id: profile.entity_id,
        first_name,
        last_name,
        email: email ?? null,
        phone: phone ?? null,
        address: address ?? null,
        city: city ?? null,
        postal_code: postal_code ?? null,
        country: country ?? "France",
        siret: siret ?? null,
        status: status ?? "active",
        bio: bio ?? null,
        hourly_rate: hourly_rate ?? null,
        contract_type: contract_type ?? null,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { data: null, error: insertError.message },
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

    return NextResponse.json({ data: trainer, error: null }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
