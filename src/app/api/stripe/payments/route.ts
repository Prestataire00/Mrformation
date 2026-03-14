import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { parsePagination } from "@/lib/validations";

// GET — list payments for entity
export async function GET(request: NextRequest) {
  const auth = await requireRole(["admin"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "";
    const dateFrom = searchParams.get("date_from") ?? "";
    const dateTo = searchParams.get("date_to") ?? "";
    const { page, perPage, offset } = parsePagination(searchParams);

    let query = auth.supabase
      .from("payments")
      .select("*", { count: "exact" })
      .eq("entity_id", auth.profile.entity_id)
      .order("created_at", { ascending: false })
      .range(offset, offset + perPage - 1);

    if (status) query = query.eq("status", status);
    if (dateFrom) query = query.gte("created_at", dateFrom);
    if (dateTo) query = query.lte("created_at", dateTo);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { error: sanitizeDbError(error, "payments GET") },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data,
      meta: {
        total: count ?? 0,
        page,
        per_page: perPage,
        total_pages: Math.ceil((count ?? 0) / perPage),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "payments GET") },
      { status: 500 }
    );
  }
}
