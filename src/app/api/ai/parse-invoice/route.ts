import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";

const PROMPT = `Tu es un assistant expert en extraction de données depuis des factures françaises.

Extrais de cette facture les informations suivantes et réponds UNIQUEMENT avec un JSON strict (pas de markdown, pas de code fence), au format :

{
  "recipient_name": "nom du destinataire/client",
  "recipient_siret": "SIRET du destinataire ou null",
  "recipient_address": "adresse complète ou null",
  "issue_date": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD ou null",
  "amount_ht": nombre,
  "amount_ttc": nombre,
  "vat_rate": nombre (0, 5.5, 10 ou 20),
  "external_ref": "numéro de facture",
  "description": "description courte (max 100 car)",
  "supplier_name": "nom de l'émetteur"
}

Si une info n'est pas visible, utilise null.
Si ce n'est pas une facture : {"error": "Ce document ne semble pas être une facture"}`;

export async function POST(req: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });

    const allowedTypes = ["application/pdf", "image/png", "image/jpeg"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Format non supporté. PDF, PNG ou JPG." }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Fichier trop volumineux (max 10 MB)" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Service IA non configuré" }, { status: 503 });

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const isPdf = file.type === "application/pdf";

    const contentBlock = isPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image", source: { type: "base64", media_type: file.type, data: base64 } };

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content: [contentBlock, { type: "text", text: PROMPT }] }],
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error("[parse-invoice] API error", errData);
      return NextResponse.json({ error: "Erreur API IA" }, { status: 502 });
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || "";
    const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

    let parsed;
    try { parsed = JSON.parse(cleaned); } catch {
      return NextResponse.json({ error: "L'IA n'a pas pu analyser ce document." }, { status: 422 });
    }

    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 422 });
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[parse-invoice]", err);
    return NextResponse.json({ error: "Erreur lors de l'analyse IA" }, { status: 500 });
  }
}
