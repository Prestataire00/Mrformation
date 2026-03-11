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
    const { user, profile, error, status } = await getAuthenticatedProfile(supabase);

    if (error || !profile) {
      return NextResponse.json({ data: null, error }, { status });
    }

    if (profile.role !== "admin") {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const { data, error: fetchError } = await supabase
      .from("clients")
      .select(`
        *,
        contacts (*),
        learners (*)
      `)
      .eq("id", params.id)
      .eq("entity_id", profile.entity_id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return NextResponse.json(
          { data: null, error: "Client non trouvé" },
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
      name,
      siret,
      address,
      city,
      postal_code,
      country,
      phone,
      email,
      website,
      status: clientStatus,
      notes,
      opco,
      funding_type,
    } = body;

    if (!name) {
      return NextResponse.json(
        { data: null, error: "Le nom du client est requis" },
        { status: 400 }
      );
    }

    const { data: existing } = await supabase
      .from("clients")
      .select("id")
      .eq("id", params.id)
      .eq("entity_id", profile.entity_id)
      .single();

    if (!existing) {
      return NextResponse.json(
        { data: null, error: "Client non trouvé" },
        { status: 404 }
      );
    }

    const { data, error: updateError } = await supabase
      .from("clients")
      .update({
        name,
        siret: siret ?? null,
        address: address ?? null,
        city: city ?? null,
        postal_code: postal_code ?? null,
        country: country ?? "France",
        phone: phone ?? null,
        email: email ?? null,
        website: website ?? null,
        status: clientStatus ?? "active",
        notes: notes ?? null,
        opco: opco ?? null,
        funding_type: funding_type ?? null,
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
      .from("clients")
      .select("id")
      .eq("id", params.id)
      .eq("entity_id", profile.entity_id)
      .single();

    if (!existing) {
      return NextResponse.json(
        { data: null, error: "Client non trouvé" },
        { status: 404 }
      );
    }

    const { error: deleteError } = await supabase
      .from("clients")
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
