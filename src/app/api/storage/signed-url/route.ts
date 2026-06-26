import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";
import { extractStoragePath } from "@/lib/storage/extract-storage-path";

/**
 * POST /api/storage/signed-url — point d'accès partagé pour servir un fichier de
 * document via signed-URL (TTL court), après contrôle rôle + entité.
 *
 * Body : `{ table, id }`. On ne reçoit JAMAIS de path brut du client (pas de
 * path traversal / accès arbitraire) : on recharge la ligne côté serveur, on
 * résout SON entité (directe ou via FK selon la table) et on vérifie qu'elle
 * correspond à celle de l'utilisateur (super_admin = cross-entité).
 */

type EntityVia = "direct" | "session" | "client";

const TABLES: Record<string, { bucket: string; entityVia: EntityVia; cols: string }> = {
  formation_documents: { bucket: "formation-docs", entityVia: "session", cols: "file_url, session_id" },
  program_documents: { bucket: "formation-docs", entityVia: "direct", cols: "file_url, entity_id" },
  generated_documents: { bucket: "formation-docs", entityVia: "direct", cols: "file_url, entity_id" },
  client_documents: { bucket: "documents", entityVia: "client", cols: "file_url, client_id" },
};

export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin", "commercial", "trainer"]);
  if (auth.error) return auth.error;

  try {
    const { table, id } = (await request.json()) as { table?: string; id?: string };
    const cfg = table ? TABLES[table] : undefined;
    if (!cfg || !id) {
      return NextResponse.json({ error: "table/id invalides" }, { status: 400 });
    }

    const { data: row } = await auth.supabase.from(table!).select(cfg.cols).eq("id", id).maybeSingle();
    if (!row) {
      return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
    }
    const r = row as unknown as Record<string, string | null>;

    // Résolution de l'entité du document selon la table.
    let docEntityId: string | null = null;
    if (cfg.entityVia === "direct") {
      docEntityId = r.entity_id;
    } else if (cfg.entityVia === "session" && r.session_id) {
      const { data: s } = await auth.supabase.from("sessions").select("entity_id").eq("id", r.session_id).maybeSingle();
      docEntityId = (s as { entity_id?: string | null } | null)?.entity_id ?? null;
    } else if (cfg.entityVia === "client" && r.client_id) {
      const { data: c } = await auth.supabase.from("clients").select("entity_id").eq("id", r.client_id).maybeSingle();
      docEntityId = (c as { entity_id?: string | null } | null)?.entity_id ?? null;
    }

    if (auth.profile.role !== "super_admin" && docEntityId !== auth.profile.entity_id) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const loc = extractStoragePath(r.file_url, cfg.bucket);
    if (!loc) {
      return NextResponse.json({ error: "Fichier absent" }, { status: 404 });
    }

    const { data, error } = await auth.supabase.storage.from(loc.bucket).createSignedUrl(loc.path, 3600);
    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: "Lien indisponible" }, { status: 500 });
    }
    return NextResponse.json({ url: data.signedUrl });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "storage/signed-url") }, { status: 500 });
  }
}
