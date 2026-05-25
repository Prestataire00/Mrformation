import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { snapshotEntityQualiopi } from "@/lib/services/qualiopi-snapshots";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role configuration");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * POST — invoqué par la Netlify Scheduled Function (cron quotidien 3h UTC).
 * Auth : Bearer CRON_SECRET. Itère sur les entités, snapshot par entité.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.CRON_SECRET;
  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  try {
    const { data: entities } = await supabase.from("entities").select("id, name");
    let totalInserted = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    const perEntity: Array<{ entity: string; inserted: number; skipped: number; errors: number }> = [];

    for (const entity of entities ?? []) {
      const res = await snapshotEntityQualiopi(supabase, entity.id);
      totalInserted += res.inserted;
      totalSkipped += res.skipped;
      totalErrors += res.errors;
      perEntity.push({ entity: entity.name, ...res });
    }

    return NextResponse.json({
      success: true,
      totalInserted,
      totalSkipped,
      totalErrors,
      perEntity,
      executedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[qualiopi-snapshots POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET — utilisé par QualiopiSparkline et QualiopiHistoryDetail côté front.
 * Query param `session_id`. Filtré par entity_id du caller en défense en profondeur.
 */
const GetQuery = z.object({
  session_id: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  const auth = await requireRole(["admin", "super_admin", "trainer"]);
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const parsed = GetQuery.safeParse({ session_id: url.searchParams.get("session_id") });
  if (!parsed.success) {
    return NextResponse.json({ error: "session_id requis" }, { status: 400 });
  }

  const entityId = auth.profile.entity_id;
  const { data, error } = await auth.supabase
    .from("qualiopi_snapshots")
    .select("snapshot_date, global_score, created_at")
    .eq("session_id", parsed.data.session_id)
    .eq("entity_id", entityId)
    .order("snapshot_date", { ascending: false })
    .limit(90);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ snapshots: data ?? [] });
}
