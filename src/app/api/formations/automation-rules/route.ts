import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";

const DEFAULT_RULES = [
  { trigger_type: "session_start_minus_days", document_type: "convention_entreprise", days_offset: 5, is_enabled: true },
  { trigger_type: "session_start_minus_days", document_type: "convocation", days_offset: 2, is_enabled: true },
  { trigger_type: "session_end_plus_days", document_type: "certificat_realisation", days_offset: 5, is_enabled: true },
  { trigger_type: "session_end_plus_days", document_type: "questionnaire_satisfaction", days_offset: 7, is_enabled: true },
];

export async function GET() {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const { data, error } = await auth.supabase
      .from("formation_automation_rules")
      .select("*")
      .eq("entity_id", auth.profile.entity_id)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: sanitizeDbError(error, "automation-rules GET") },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json({
        rules: DEFAULT_RULES.map((r) => ({
          ...r,
          id: null,
          entity_id: auth.profile.entity_id,
        })),
        is_default: true,
      });
    }

    return NextResponse.json({ rules: data, is_default: false });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: sanitizeError(err, "automation-rules GET") },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const { rules } = await request.json();

    if (!Array.isArray(rules)) {
      return NextResponse.json(
        { error: "Le champ 'rules' doit être un tableau." },
        { status: 400 }
      );
    }

    const entityId = auth.profile.entity_id;

    const { error: deleteError } = await auth.supabase
      .from("formation_automation_rules")
      .delete()
      .eq("entity_id", entityId);

    if (deleteError) {
      return NextResponse.json(
        { error: sanitizeDbError(deleteError, "automation-rules DELETE") },
        { status: 500 }
      );
    }

    const rows = rules.map((r: { trigger_type: string; document_type: string; days_offset: number; is_enabled: boolean }) => ({
      entity_id: entityId,
      trigger_type: r.trigger_type,
      document_type: r.document_type,
      days_offset: r.days_offset,
      is_enabled: r.is_enabled,
    }));

    const { data, error: insertError } = await auth.supabase
      .from("formation_automation_rules")
      .insert(rows)
      .select();

    if (insertError) {
      return NextResponse.json(
        { error: sanitizeDbError(insertError, "automation-rules INSERT") },
        { status: 500 }
      );
    }

    logAudit({
      supabase: auth.supabase,
      entityId,
      userId: auth.user.id,
      action: "update",
      resourceType: "formation_automation_rules",
      resourceId: entityId,
      details: { rules_count: rows.length },
    });

    return NextResponse.json({ rules: data, saved: rows.length });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: sanitizeError(err, "automation-rules PUT") },
      { status: 500 }
    );
  }
}
