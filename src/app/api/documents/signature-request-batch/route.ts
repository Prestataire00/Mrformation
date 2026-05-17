/**
 * POST /api/documents/signature-request-batch
 *
 * Pour une session + doc_type donnés : pour chaque doc `requires_signature
 * && !is_signed`, crée un signing_token (expires_at = NOW + 30 jours),
 * update le doc (signature_token, signature_requested_at, signer_email,
 * is_sent, sent_at), et envoie un email Resend avec le lien `/sign/{token}`.
 *
 * Body : `{ sessionId, docType }`.
 * Réponse : `{ totalRequested, successCount, failureCount, errors, totalLatencyMs }`.
 *
 * Story F3 — Mass signature request batch.
 */

import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sanitizeError } from "@/lib/api-error";
import { logEvent } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const isResendConfigured =
  !!process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== "votre-cle-resend";

const resend = isResendConfigured ? new Resend(process.env.RESEND_API_KEY) : null;

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role configuration");
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const DOC_LABELS: Record<string, string> = {
  convention_entreprise: "Convention de formation",
  convention_intervention: "Convention d'intervention",
  contrat_sous_traitance: "Contrat de sous-traitance",
};

const ALLOWED_DOC_TYPES = new Set(Object.keys(DOC_LABELS));

interface DocRow {
  id: string;
  doc_type: string;
  owner_type: "learner" | "company" | "trainer";
  owner_id: string;
  is_signed: boolean;
  requires_signature: boolean;
}

interface BatchError {
  docId: string;
  ownerName: string;
  error: string;
}

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, entity_id, role")
      .eq("id", user.id)
      .single();
    if (!profile?.entity_id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    }
    if (!["admin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    const body = (await request.json()) as { sessionId?: string; docType?: string };
    if (!body.sessionId || !body.docType) {
      return NextResponse.json(
        { error: "sessionId et docType sont obligatoires" },
        { status: 400 },
      );
    }
    if (!ALLOWED_DOC_TYPES.has(body.docType)) {
      return NextResponse.json(
        { error: `doc_type non supporté pour signature batch : ${body.docType}` },
        { status: 400 },
      );
    }

    // Vérifie la session (gate entity_id)
    const { data: session } = await supabase
      .from("sessions")
      .select("id, title, entity_id, formation_companies:formation_companies(client_id, client:clients(id, company_name, contacts(*))), formation_trainers:formation_trainers(trainer_id, trainer:trainers(*)), enrollments:enrollments(learner_id, learner:learners(*))")
      .eq("id", body.sessionId)
      .eq("entity_id", profile.entity_id)
      .single();
    if (!session) {
      return NextResponse.json(
        { error: "Session introuvable ou non autorisée" },
        { status: 404 },
      );
    }

    // Charge les docs candidats : requires_signature + non-signés (table `documents`)
    const { data: docsRaw, error: docsErr } = await supabase
      .from("documents")
      .select("id, doc_type, owner_type, owner_id, status, metadata")
      .eq("source_table", "sessions")
      .eq("source_id", body.sessionId)
      .eq("doc_type", body.docType)
      .neq("status", "signed");

    if (docsErr) {
      return NextResponse.json(
        { error: `Lecture docs : ${docsErr.message}` },
        { status: 500 },
      );
    }
    // Filtre `requires_signature=true` côté app (vit dans metadata jsonb)
    const candidateDocs = (docsRaw ?? [])
      .filter((d) => (d.metadata as { requires_signature?: boolean } | null)?.requires_signature === true)
      .map((d) => ({
        id: d.id as string,
        doc_type: d.doc_type as string,
        owner_type: d.owner_type as "learner" | "company" | "trainer",
        owner_id: d.owner_id as string,
        is_signed: d.status === "signed",
        requires_signature: true,
      })) as DocRow[];
    if (candidateDocs.length === 0) {
      return NextResponse.json(
        { error: "Aucun document à signer pour ce doc_type" },
        { status: 404 },
      );
    }

    // From-address selon l'entité
    const { data: entityRow } = await supabase
      .from("entities")
      .select("name")
      .eq("id", profile.entity_id)
      .single();
    const entityName = entityRow?.name || "MR FORMATION";
    const fromAddress = entityName.toLowerCase().includes("c3v")
      ? "C3V Formation <noreply@c3vformation.fr>"
      : "MR Formation <noreply@mrformation.fr>";

    // Indexes pour résoudre owner_name + email selon owner_type
    type CompanyLink = { client_id: string; client: { id: string; company_name: string | null; contacts: Array<{ email: string | null; is_primary: boolean | null }> } | null };
    type TrainerLink = { trainer_id: string; trainer: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null };
    type EnrollmentLink = { learner_id: string; learner: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null };
    const companies = (session as unknown as { formation_companies: CompanyLink[] }).formation_companies ?? [];
    const trainers = (session as unknown as { formation_trainers: TrainerLink[] }).formation_trainers ?? [];
    const enrollments = (session as unknown as { enrollments: EnrollmentLink[] }).enrollments ?? [];

    const sessionTitle = (session as { title?: string }).title ?? "Formation";
    const docLabel = DOC_LABELS[body.docType];
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.URL ||
      "https://mrformationcrm.netlify.app";

    const serviceSupabase = createServiceClient();

    const tasks = candidateDocs.map(async (doc) => {
      const taskStartedAt = Date.now();
      // Résoudre owner_name + signer_email selon owner_type
      let ownerName = doc.owner_id.slice(0, 8);
      let signerEmail: string | null = null;
      if (doc.owner_type === "company") {
        const link = companies.find((c) => c.client_id === doc.owner_id);
        if (link?.client) {
          ownerName = link.client.company_name ?? ownerName;
          const contacts = link.client.contacts ?? [];
          const withEmail = contacts.filter((c) => c.email);
          signerEmail = withEmail.find((c) => c.is_primary)?.email ?? withEmail[0]?.email ?? null;
        }
      } else if (doc.owner_type === "trainer") {
        const link = trainers.find((t) => t.trainer_id === doc.owner_id);
        if (link?.trainer) {
          ownerName = `${link.trainer.last_name ?? ""} ${link.trainer.first_name ?? ""}`.trim() || ownerName;
          signerEmail = link.trainer.email ?? null;
        }
      } else {
        const link = enrollments.find((e) => e.learner_id === doc.owner_id);
        if (link?.learner) {
          ownerName = `${link.learner.last_name ?? ""} ${link.learner.first_name ?? ""}`.trim() || ownerName;
          signerEmail = link.learner.email ?? null;
        }
      }

      if (!signerEmail) {
        throw new Error("Pas d'email");
      }

      // 1. Créer signing_token (30 jours)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const { data: tokenRow, error: tokenErr } = await supabase
        .from("signing_tokens")
        .insert({
          session_id: body.sessionId,
          entity_id: profile.entity_id,
          document_id: doc.id,
          token_purpose: "document_signature",
          expires_at: expiresAt.toISOString(),
          signer_type: doc.owner_type === "company" ? "learner" : doc.owner_type,
        })
        .select("token")
        .single();
      if (tokenErr || !tokenRow) {
        throw new Error(`Création token : ${tokenErr?.message ?? "inconnu"}`);
      }

      // 2. Update doc avec tracking signature (signature_token + metadata)
      try {
        const { data: existing } = await supabase
          .from("documents").select("metadata").eq("id", doc.id).single();
        const newMetadata = {
          ...((existing?.metadata as Record<string, unknown> | null) ?? {}),
          signer_email: signerEmail,
          signature_requested_at: new Date().toISOString(),
        };
        await supabase
          .from("documents")
          .update({
            signature_token: tokenRow.token,
            signature_token_expires_at: expiresAt.toISOString(),
            status: "sent",
            sent_at: new Date().toISOString(),
            metadata: newMetadata,
          })
          .eq("id", doc.id);
      } catch (updateErr) {
        console.error("[signature-request-batch] doc update failed:", updateErr);
      }

      // 3. Envoyer email Resend
      if (!resend) {
        throw new Error("RESEND_API_KEY non configurée");
      }
      const signUrl = `${appUrl}/sign/${tokenRow.token}`;
      const subject = `Document à signer — ${docLabel} — ${sessionTitle}`;
      const textBody = `Bonjour,\n\nVeuillez signer électroniquement le document "${docLabel}" relatif à la formation "${sessionTitle}".\n\nPour accéder au document et le signer, cliquez sur le lien suivant :\n${signUrl}\n\nCe lien est valide pendant 30 jours.\n\nCordialement,\nL'équipe ${entityName}`;
      const htmlBody = `<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#374151;">
<p>Bonjour,</p>
<p>Veuillez signer électroniquement le document <strong>${docLabel}</strong> relatif à la formation <strong>${sessionTitle}</strong>.</p>
<p>Pour accéder au document et le signer, cliquez sur le lien suivant :</p>
<p><a href="${signUrl}" style="background:#2563EB;color:white;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block;">Signer le document</a></p>
<p style="color:#6B7280;font-size:12px;">Ce lien est valide pendant 30 jours.</p>
<p>Cordialement,<br/>L'équipe ${entityName}</p>
</div>`;

      const sendResult = await resend.emails.send({
        from: fromAddress,
        to: [signerEmail],
        subject,
        html: htmlBody,
        text: textBody,
      });

      if (sendResult.error) {
        throw new Error(sendResult.error.message ?? "Resend send error");
      }

      // 4. Log email_history (best-effort)
      try {
        await serviceSupabase.from("email_history").insert({
          recipient_email: signerEmail,
          subject,
          body: textBody,
          status: "sent",
          sent_at: new Date().toISOString(),
          entity_id: profile.entity_id,
          sent_by: profile.id,
          session_id: body.sessionId,
          recipient_type: doc.owner_type,
          recipient_id: doc.owner_id,
          sent_via: "resend",
        });
      } catch (logErr) {
        console.error("[signature-request-batch] email_history insert failed:", logErr);
      }

      logEvent("document_signature_requested", {
        entity_id: profile.entity_id,
        doc_type: body.docType,
        session_id: body.sessionId,
        doc_id: doc.id,
        owner_id: doc.owner_id,
        owner_type: doc.owner_type,
        recipient_email: signerEmail,
        expires_at: expiresAt.toISOString(),
        latency_ms: Date.now() - taskStartedAt,
      });

      return { docId: doc.id, ownerName, token: tokenRow.token };
    });

    const settled = await Promise.allSettled(tasks);

    const errors: BatchError[] = [];
    let successCount = 0;

    settled.forEach((outcome, idx) => {
      const doc = candidateDocs[idx];
      if (outcome.status === "fulfilled") {
        successCount += 1;
      } else {
        const msg = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        errors.push({
          docId: doc.id,
          ownerName: doc.owner_id.slice(0, 8),
          error: msg,
        });
        logEvent("document_failed", {
          entity_id: profile.entity_id,
          doc_type: body.docType,
          session_id: body.sessionId,
          doc_id: doc.id,
          owner_id: doc.owner_id,
          owner_type: doc.owner_type,
          action: "signature_request",
          error_message: msg,
        });
      }
    });

    logEvent("batch_signature_request_summary", {
      entity_id: profile.entity_id,
      doc_type: body.docType,
      session_id: body.sessionId,
      total: candidateDocs.length,
      success: successCount,
      failure: errors.length,
      latency_ms: Date.now() - t0,
    });

    return NextResponse.json({
      totalRequested: candidateDocs.length,
      successCount,
      failureCount: errors.length,
      errors,
      totalLatencyMs: Date.now() - t0,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "signature-request-batch") },
      { status: 500 },
    );
  }
}
