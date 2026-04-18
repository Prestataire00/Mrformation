import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { Resend } from "resend";
import { randomBytes } from "crypto";
import QRCode from "qrcode";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

type RouteContext = { params: { id: string } };

export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const learnerId = context.params.id;
    const body = await req.json().catch(() => ({}));
    const sessionId = body.session_id || null;

    const { data: learner } = await auth.supabase
      .from("learners")
      .select("id, first_name, last_name, email, entity_id")
      .eq("id", learnerId)
      .eq("entity_id", auth.profile.entity_id)
      .single();

    if (!learner?.email) return NextResponse.json({ error: "Apprenant sans email" }, { status: 400 });

    // Generate magic link
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://mrformationcrm.netlify.app").replace(/\/+$/, "");
    const magicUrl = `${baseUrl}/access/${token}`;

    await auth.supabase.from("learner_access_tokens").insert({
      token,
      learner_id: learnerId,
      entity_id: auth.profile.entity_id,
      session_id: sessionId,
      expires_at: expiresAt.toISOString(),
      created_by: auth.user.id,
    });

    // Generate QR code
    const qrDataUrl = await QRCode.toDataURL(magicUrl, { width: 200, margin: 2, color: { dark: "#374151", light: "#FFFFFF" } });

    // Get entity + session info
    const { data: entity } = await auth.supabase.from("entities").select("name").eq("id", auth.profile.entity_id).single();
    const entityName = entity?.name || "MR FORMATION";

    let sessionTitle = "";
    if (sessionId) {
      const { data: session } = await auth.supabase.from("sessions").select("title, start_date").eq("id", sessionId).single();
      if (session) sessionTitle = session.title;
    }

    const fromAddress = entityName.toLowerCase().includes("c3v")
      ? "C3V Formation <noreply@c3vformation.fr>"
      : "MR Formation <noreply@mrformation.fr>";

    const html = `<div style="font-family:Helvetica,Arial,sans-serif;color:#374151;max-width:600px;margin:0 auto;padding:20px;">
      <div style="background:linear-gradient(135deg,#374151,#1f2937);color:white;padding:24px;border-radius:12px;margin-bottom:24px;">
        <h1 style="margin:0;font-size:22px;">Bienvenue ${learner.first_name} 👋</h1>
        <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Votre espace de formation est prêt</p>
      </div>
      ${sessionTitle ? `<div style="background:#f9fafb;padding:16px;border-radius:8px;margin-bottom:24px;"><p style="margin:0;font-size:13px;color:#6b7280;">Formation</p><p style="margin:4px 0 0;font-weight:600;font-size:15px;">${sessionTitle}</p></div>` : ""}
      <p>Bonjour <strong>${learner.first_name}</strong>,</p>
      <p>${entityName} vous a créé un accès sécurisé à votre espace personnel.</p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${magicUrl}" style="display:inline-block;background:#DC2626;color:white;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">Accéder à mon espace →</a>
      </div>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:24px 0;text-align:center;">
        <p style="margin:0 0 12px;font-size:13px;color:#6b7280;">Ou scannez ce QR code :</p>
        <img src="${qrDataUrl}" alt="QR Code" style="width:180px;height:180px;" />
      </div>
      <div style="border-top:1px solid #e5e7eb;padding-top:16px;font-size:12px;color:#9ca3af;">
        <p>🔒 Ce lien est personnel. Valable jusqu'au ${expiresAt.toLocaleDateString("fr-FR")}.</p>
      </div>
    </div>`;

    if (resend) {
      await resend.emails.send({
        from: fromAddress,
        to: [learner.email],
        subject: `Bienvenue sur votre espace ${entityName}`,
        html,
      });
    }

    return NextResponse.json({ success: true, magic_url: magicUrl, expires_at: expiresAt.toISOString() });
  } catch (err) {
    console.error("[send-welcome]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}
