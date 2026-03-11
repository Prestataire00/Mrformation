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
      .from("sessions")
      .select(`
        *,
        trainings (id, title, duration_hours, objectives, prerequisites),
        trainers (id, first_name, last_name, email, phone),
        clients (id, company_name, email, phone),
        enrollments (
          id,
          status,
          enrolled_at,
          learners (id, first_name, last_name, email)
        )
      `)
      .eq("id", params.id)
      .eq("entity_id", profile.entity_id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return NextResponse.json(
          { data: null, error: "Session non trouvée" },
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
    const { profile, error, status } = await getAuthenticatedProfile(supabase);

    if (error || !profile) {
      return NextResponse.json({ data: null, error }, { status });
    }

    if (profile.role !== "admin") {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const body = await request.json();

    const {
      training_id,
      trainer_id,
      client_id,
      start_date,
      end_date,
      mode,
      location,
      address,
      city,
      postal_code,
      max_participants,
      status: sessionStatus,
      notes,
      price,
      internal_notes,
    } = body;

    if (!training_id) {
      return NextResponse.json(
        { data: null, error: "La formation est requise" },
        { status: 400 }
      );
    }

    if (!start_date) {
      return NextResponse.json(
        { data: null, error: "La date de début est requise" },
        { status: 400 }
      );
    }

    const { data: existing } = await supabase
      .from("sessions")
      .select("id")
      .eq("id", params.id)
      .eq("entity_id", profile.entity_id)
      .single();

    if (!existing) {
      return NextResponse.json(
        { data: null, error: "Session non trouvée" },
        { status: 404 }
      );
    }

    const { data, error: updateError } = await supabase
      .from("sessions")
      .update({
        training_id,
        trainer_id: trainer_id ?? null,
        client_id: client_id ?? null,
        start_date,
        end_date: end_date ?? null,
        mode: mode ?? "présentiel",
        location: location ?? null,
        address: address ?? null,
        city: city ?? null,
        postal_code: postal_code ?? null,
        max_participants: max_participants ?? null,
        status: sessionStatus ?? "planned",
        notes: notes ?? null,
        price: price ?? null,
        internal_notes: internal_notes ?? null,
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

    return NextResponse.json({ data, error: null });
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
      .from("sessions")
      .select("id, status")
      .eq("id", params.id)
      .eq("entity_id", profile.entity_id)
      .single();

    if (!existing) {
      return NextResponse.json(
        { data: null, error: "Session non trouvée" },
        { status: 404 }
      );
    }

    if (existing.status === "in_progress") {
      return NextResponse.json(
        { data: null, error: "Impossible de supprimer une session en cours" },
        { status: 422 }
      );
    }

    const { error: deleteError } = await supabase
      .from("sessions")
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
