import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";

const PROMPT = `Tu es un assistant expert RH spécialisé en formation professionnelle.

Analyse ce CV et extrais les informations suivantes en JSON strict (pas de markdown) :

{
  "first_name": "prénom",
  "last_name": "nom",
  "email": "email ou null",
  "phone": "téléphone ou null",
  "specialties": ["domaine1", "domaine2"],
  "skills": ["compétence1", "compétence2"],
  "experience_years": nombre,
  "education": ["diplôme1", "diplôme2"],
  "certifications": ["certif1", "certif2"],
  "languages": ["langue1", "langue2"],
  "bio": "résumé 2-3 phrases du profil professionnel",
  "formation_domains": ["domaines qu'il peut enseigner"]
}

Réponds UNIQUEMENT avec le JSON.`;

export async function POST(req: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return NextResponse.json({ error: "Fichier requis" }, { status: 400 });

    const allowedTypes = ["application/pdf", "image/png", "image/jpeg"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "PDF, PNG ou JPG uniquement" }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Max 10 MB" }, { status: 400 });
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
        max_tokens: 2048,
        messages: [{ role: "user", content: [contentBlock, { type: "text", text: PROMPT }] }],
      }),
    });

    if (!res.ok) {
      console.error("[parse-cv] API error", await res.text());
      return NextResponse.json({ error: "Erreur API IA" }, { status: 502 });
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || "";
    const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

    let parsed;
    try { parsed = JSON.parse(cleaned); } catch {
      return NextResponse.json({ error: "L'IA n'a pas pu analyser ce CV." }, { status: 422 });
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[parse-cv]", err);
    return NextResponse.json({ error: "Erreur lors de l'analyse" }, { status: 500 });
  }
}
