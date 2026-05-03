import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";
import { resolveAttachments } from "@/lib/services/email-attachments-resolver";
import type { EmailAttachmentDescriptor } from "@/lib/services/email-queue";

/**
 * POST /api/documents/generate
 *
 * Génère un PDF côté serveur (PDFShift) et le retourne en téléchargement.
 * Réutilise l'infrastructure de templates + résolution d'attachments de la queue email.
 *
 * Body :
 *   {
 *     "type": "convocation" | "convention_entreprise" | "programme_formation" | etc.,
 *     "payload": { "session_id": "...", "learner_id": "...", ... }
 *   }
 *
 * Réponse :
 *   - Succès : application/pdf en stream (Content-Disposition: attachment)
 *   - Erreur : { error } JSON 4xx/5xx
 *
 * Réservé aux admins/super_admins/trainers (génération à la demande depuis le dashboard).
 */

const PayloadSchema = z.object({
  type: z.enum([
    "convocation",
    "convention_entreprise",
    "convention_intervention",
    "contrat_sous_traitance",
    "certificat_realisation",
    "programme_formation",
    "facture",
    "devis",
  ]),
  payload: z.record(z.string(), z.string()),
});

export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin", "trainer"]);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const parsed = PayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Payload invalide", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const descriptor = {
      type: parsed.data.type,
      payload: parsed.data.payload,
    } as unknown as EmailAttachmentDescriptor;

    const resolved = await resolveAttachments(auth.supabase, [descriptor]);
    if (resolved.length === 0) {
      return NextResponse.json(
        { error: "Impossible de générer le document (données introuvables ou template manquant)" },
        { status: 404 }
      );
    }

    const file = resolved[0];

    return new Response(new Uint8Array(file.content), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Content-Length": String(file.content.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[documents/generate] error:", err);
    return NextResponse.json(
      { error: sanitizeError(err, "documents/generate") },
      { status: 500 }
    );
  }
}
