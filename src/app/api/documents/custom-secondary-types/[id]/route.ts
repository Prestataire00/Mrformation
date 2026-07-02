import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";
import {
  updateCustomType,
  updateCustomTypeSchema,
} from "@/lib/services/custom-secondary-doc-types";

/**
 * PATCH /api/documents/custom-secondary-types/[id]
 *
 * Renomme (`label`) et/ou (dé)active (`isActive`) un type secondaire custom de
 * l'entité. La désactivation est soft : le type disparaît du catalogue mais les
 * documents déjà attribués restent listables et générables. Admin + super_admin.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const parsed = updateCustomTypeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const entityId = auth.profile.entity_id;
  const { id } = params;

  try {
    // Une seule écriture atomique (renommage et/ou (dé)activation).
    const res = await updateCustomType(auth.supabase, entityId, id, {
      label: parsed.data.label,
      isActive: parsed.data.isActive,
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: sanitizeError(new Error(res.error.message), "custom-secondary-types PATCH") },
        { status: res.error.code === "PGRST116" ? 404 : 500 },
      );
    }

    logAudit({
      supabase: auth.supabase,
      entityId,
      userId: auth.user.id,
      action: "update",
      resourceType: "custom_secondary_doc_type",
      resourceId: id,
      details: {
        label: parsed.data.label,
        isActive: parsed.data.isActive,
      },
    });

    return NextResponse.json({ type: res.type });
  } catch (err) {
    console.error("[custom-secondary-types PATCH] error:", err);
    return NextResponse.json(
      { error: sanitizeError(err, "custom-secondary-types PATCH") },
      { status: 500 },
    );
  }
}
