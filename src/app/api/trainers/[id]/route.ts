import { createClient } from "@/lib/supabase/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";
import { updateTrainerSchema } from "@/lib/validations";
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

    if (!["admin","super_admin"].includes(profile.role)) {
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
        { data: null, error: sanitizeDbError(fetchError, "fetch trainer") },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    return NextResponse.json({ data: null, error: sanitizeError(err, "fetch trainer") }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const supabase = createClient();
    const { user, profile, error, status } = await getAuthenticatedProfile(supabase);

    if (error || !profile) {
      return NextResponse.json({ data: null, error }, { status });
    }

    if (!["admin","super_admin"].includes(profile.role)) {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const body = await request.json();

    // Lot G audit BMAD : valider via Zod (avant : juste check first_name &&
    // last_name, payload non validé pour IBAN/SIRET/etc.). Schema partial
    // → tous les champs sont optionnels pour un PUT (update).
    const parsed = updateTrainerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }
    const data = parsed.data;
    const { competency_ids } = body;

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

    // Construit l'objet UPDATE uniquement avec les champs fournis (partial).
    // Évite d'écraser un champ existant en BDD avec `null` si le client ne
    // l'a pas envoyé du tout.
    const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.first_name !== undefined) updatePayload.first_name = data.first_name;
    if (data.last_name !== undefined) updatePayload.last_name = data.last_name;
    if (data.email !== undefined) updatePayload.email = data.email;
    if (data.phone !== undefined) updatePayload.phone = data.phone;
    if (data.type !== undefined) updatePayload.type = data.type;
    if (data.bio !== undefined) updatePayload.bio = data.bio;
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.hourly_rate !== undefined) updatePayload.hourly_rate = data.hourly_rate;
    if (data.availability_notes !== undefined) updatePayload.availability_notes = data.availability_notes;
    if (data.address !== undefined) updatePayload.address = data.address;
    if (data.city !== undefined) updatePayload.city = data.city;
    if (data.postal_code !== undefined) updatePayload.postal_code = data.postal_code;
    if (data.country !== undefined) updatePayload.country = data.country;
    if (data.siret !== undefined) updatePayload.siret = data.siret;
    if (data.nda !== undefined) updatePayload.nda = data.nda;
    if (data.legal_status !== undefined) updatePayload.legal_status = data.legal_status;
    if (data.company_name !== undefined) updatePayload.company_name = data.company_name;
    if (data.tva_number !== undefined) updatePayload.tva_number = data.tva_number;
    if (data.contract_type !== undefined) updatePayload.contract_type = data.contract_type;
    if (data.iban !== undefined) updatePayload.iban = data.iban;
    if (data.bic !== undefined) updatePayload.bic = data.bic;
    if (data.bank_name !== undefined) updatePayload.bank_name = data.bank_name;

    const { data: trainer, error: updateError } = await supabase
      .from("trainers")
      .update(updatePayload)
      .eq("id", params.id)
      .eq("entity_id", profile.entity_id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { data: null, error: sanitizeDbError(updateError, "update trainer") },
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

    logAudit({
      supabase,
      entityId: profile.entity_id,
      userId: user!.id,
      action: "update",
      resourceType: "trainers",
      resourceId: params.id,
      details: { first_name: data.first_name, last_name: data.last_name },
    });

    return NextResponse.json({ data: trainer, error: null });
  } catch (err) {
    return NextResponse.json({ data: null, error: sanitizeError(err, "update trainer") }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const supabase = createClient();
    const { user, profile, error, status } = await getAuthenticatedProfile(supabase);

    if (error || !profile) {
      return NextResponse.json({ data: null, error }, { status });
    }

    if (!["admin","super_admin"].includes(profile.role)) {
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
        { data: null, error: sanitizeDbError(deleteError, "delete trainer") },
        { status: 500 }
      );
    }

    logAudit({
      supabase,
      entityId: profile.entity_id,
      userId: user!.id,
      action: "delete",
      resourceType: "trainers",
      resourceId: params.id,
    });

    return NextResponse.json(
      { data: { id: params.id }, error: null },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json({ data: null, error: sanitizeError(err, "delete trainer") }, { status: 500 });
  }
}
