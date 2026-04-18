import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  const { allowed, resetAt } = checkRateLimit(`qualiopi-proof-${auth.user.id}`, { limit: 15, windowSeconds: 3600 });
  if (!allowed) return rateLimitResponse(resetAt);

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const critereNum = parseInt(formData.get("critere_num") as string || "1");
    const docType = formData.get("document_type") as string || "autre";
    const sessionId = formData.get("session_id") as string | null;

    if (!file) return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Max 10 MB" }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Service IA non configuré" }, { status: 503 });

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const isPdf = file.type === "application/pdf";

    const contentBlock = isPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image", source: { type: "base64", media_type: file.type, data: base64 } };

    const prompt = `Tu es auditeur Qualiopi. Vérifie la conformité de ce ${docType} au critère ${critereNum} du référentiel national qualité.

JSON strict :
{"is_conforme":true|false,"conformity_score":0-100,"present_elements":["élément conforme"],"missing_elements":["élément manquant"],"recommendations":"2-3 phrases concrètes"}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        messages: [{ role: "user", content: [contentBlock, { type: "text", text: prompt }] }],
      }),
    });

    if (!res.ok) return NextResponse.json({ error: "Erreur API IA" }, { status: 502 });

    const data = await res.json();
    const text = data.content?.[0]?.text || "";
    const result = JSON.parse(text.replace(/```json|```/g, "").trim());

    await auth.supabase.from("qualiopi_proof_checks").insert({
      entity_id: auth.profile.entity_id,
      session_id: sessionId || null,
      critere_num: critereNum,
      document_name: file.name,
      is_conforme: result.is_conforme,
      conformity_score: result.conformity_score,
      missing_elements: result.missing_elements,
      present_elements: result.present_elements,
      recommendations: result.recommendations,
      checked_by: auth.user.id,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[qualiopi-check-proof]", err);
    return NextResponse.json({ error: "Analyse échouée" }, { status: 500 });
  }
}
