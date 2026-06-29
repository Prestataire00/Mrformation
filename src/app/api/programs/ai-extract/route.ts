/**
 * POST /api/programs/ai-extract
 *
 * Reçoit un fichier PDF ou DOCX, extrait le texte, puis utilise GPT-4o-mini
 * pour structurer le contenu en champs programme de formation.
 *
 * Body : FormData avec un champ `file` (PDF ou DOCX, max 10 MB).
 * Retourne : JSON avec les 17 champs du programme + modules.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import OpenAI from "openai";

// ── Document parsing ──────────────────────────────────────────────────────
// pdf-parse et mammoth sont des libs CJS sans types parfaits — import dynamique.

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const pdfParse = (await import("pdf-parse")).default;
  const result = await pdfParse(buffer);
  return result.text;
}

async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

// ── Prompt système ────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es un assistant pour un organisme de formation professionnelle français.
On te donne le contenu texte extrait d'un document décrivant un programme de formation.
Tu dois extraire et structurer TOUTES les informations trouvées dans les champs suivants.

Règles :
- Extrais uniquement ce qui est présent dans le document. Ne complète PAS avec des informations inventées.
- Si un champ n'est pas trouvé dans le document, mets null.
- Pour les modules : extrais chaque module/chapitre/partie du programme avec son titre, durée estimée en heures (ou null si non précisé), et les sujets/thèmes abordés (un par ligne).
- Les objectifs pédagogiques : un par ligne.
- Les méthodes d'évaluation et ressources pédagogiques : un par ligne.
- Durée totale : en heures ET en jours si disponible.

Réponds UNIQUEMENT en JSON valide (pas de markdown, pas de code block) avec cette structure exacte :
{
  "title": "string | null",
  "description": "string | null",
  "objectives": "string | null (un par ligne, séparés par \\n)",
  "duration_hours": "number | null",
  "duration_days": "number | null",
  "location": "string | null",
  "specialty": "string | null",
  "diploma": "string | null",
  "cpf_eligible": "boolean",
  "target_audience": "string | null",
  "prerequisites": "string | null",
  "team_description": "string | null",
  "evaluation_methods": "string | null (une par ligne, séparées par \\n)",
  "pedagogical_resources": "string | null (une par ligne, séparées par \\n)",
  "certification_results": "string | null",
  "certification_terms": "string | null",
  "certification_details": "string | null",
  "modules": [
    {
      "title": "string",
      "duration_hours": "number | null",
      "topics": "string (un sujet par ligne, séparés par \\n)"
    }
  ]
}`;

// ── Route handler ─────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const authResult = await requireRole(["admin", "super_admin"]);
  if (authResult.error) return authResult.error;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY non configurée. Ajoutez-la dans les variables d'environnement Netlify." },
      { status: 503 },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });
    }

    // Validate file size (10 MB max)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Fichier trop volumineux (max 10 MB)" }, { status: 400 });
    }

    // Validate file type
    const fileName = file.name.toLowerCase();
    const isPdf = fileName.endsWith(".pdf") || file.type === "application/pdf";
    const isDocx = fileName.endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    if (!isPdf && !isDocx) {
      return NextResponse.json({ error: "Format non supporté. Envoyez un fichier PDF ou DOCX." }, { status: 400 });
    }

    // Parse document to text
    const buffer = Buffer.from(await file.arrayBuffer());
    let text: string;

    if (isPdf) {
      text = await extractTextFromPdf(buffer);
    } else {
      text = await extractTextFromDocx(buffer);
    }

    if (!text || text.trim().length < 50) {
      return NextResponse.json(
        { error: "Le document ne contient pas assez de texte exploitable (minimum 50 caractères)." },
        { status: 400 },
      );
    }

    // Truncate to ~15000 chars to stay within token limits
    const truncated = text.slice(0, 15000);

    // Call OpenAI
    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Voici le contenu du document :\n\n${truncated}` },
      ],
      temperature: 0.1,
      max_tokens: 4096,
    });

    const responseText = completion.choices[0]?.message?.content ?? "{}";

    // Extract JSON (handle potential markdown code blocks)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Réponse IA invalide — impossible d'extraire le JSON", raw: responseText },
        { status: 500 },
      );
    }

    const extracted = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      extracted,
      model: completion.model,
      usage: completion.usage,
      textLength: text.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    console.error("[ai-extract] Error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
