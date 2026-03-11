import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

interface RouteContext {
  params: { id: string };
}

async function getAuthenticatedProfile(supabase: ReturnType<typeof createClient>) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { user: null, profile: null, error: "Unauthorized", status: 401 };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("entity_id, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.entity_id) {
    return { user: null, profile: null, error: "Profile or entity not found", status: 403 };
  }

  return { user, profile, error: null, status: 200 };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const supabase = createClient();
    const { profile, error, status } = await getAuthenticatedProfile(supabase);

    if (error || !profile) {
      return NextResponse.json({ data: null, error }, { status });
    }

    if (profile.role !== "admin") {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const { data, error: fetchError } = await supabase
      .from("trainers")
      .select(`
        *,
        trainer_competencies (
          id,
          training_domains (id, name)
        ),
        sessions (
          id,
          start_date,
          end_date,
          status,
          mode,
          trainings (id, title)
        )
      `)
      .eq("id", params.id)
      .eq("entity_id", profile.entity_id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return NextResponse.json(
          { data: null, error: "Formateur non trouvé" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { data: null, error: fetchError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const supabase = createClient();
    const { user, profile, error, status } = await getAuthenticatedProfile(supabase);

    if (error || !profile) {
      return NextResponse.json({ data: null, error }, { status });
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
      status: trainerStatus,
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

    const { data: existing } = await supabase
      .from("trainers")
      .select("id")
      .eq("id", params.id)
      .eq("entity_id", profile.entity_id)
      .single();

    if (!existing) {
      return NextResponse.json(
        { data: null, error: "Formateur non trouvé" },
        { status: 404 }
      );
    }

    const { data: trainer, error: updateError } = await supabase
      .from("trainers")
      .update({
        first_name,
        last_name,
        email: email ?? null,
        phone: phone ?? null,
        address: address ?? null,
        city: city ?? null,
        postal_code: postal_code ?? null,
        country: country ?? "France",
        siret: siret ?? null,
        status: trainerStatus ?? "active",
        bio: bio ?? null,
        hourly_rate: hourly_rate ?? null,
        contract_type: contract_type ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id)
      .eq("entity_id", profile.entity_id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { data: null, error: updateError.message },
        { status: 500 }
      );
    }

    if (competency_ids && Array.isArray(competency_ids)) {
      await supabase
        .from("trainer_competencies")
        .delete()
        .eq("trainer_id", params.id);

      if (competency_ids.length > 0) {
        const competencyRows = competency_ids.map((domainId: string) => ({
          trainer_id: params.id,
          training_domain_id: domainId,
        }));

        const { error: compError } = await supabase
          .from("trainer_competencies")
          .insert(competencyRows);

        if (compError) {
          console.error("Failed to update trainer competencies:", compError.message);
        }
      }
    }

    return NextResponse.json({ data: trainer, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const supabase = createClient();
    const { profile, error, status } = await getAuthenticatedProfile(supabase);

    if (error || !profile) {
      return NextResponse.json({ data: null, error }, { status });
    }

    if (profile.role !== "admin") {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const { data: existing } = await supabase
      .from("trainers")
      .select("id")
      .eq("id", params.id)
      .eq("entity_id", profile.entity_id)
      .single();

    if (!existing) {
      return NextResponse.json(
        { data: null, error: "Formateur non trouvé" },
        { status: 404 }
      );
    }

    const { error: deleteError } = await supabase
      .from("trainers")
      .delete()
      .eq("id", params.id)
      .eq("entity_id", profile.entity_id);

    if (deleteError) {
      return NextResponse.json(
        { data: null, error: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { data: { id: params.id }, error: null },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
