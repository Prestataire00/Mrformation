import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { logAudit } from "@/lib/audit-log";
import { sanitizeDbError } from "@/lib/api-error";

const PROMPT = `Extrais du CV en JSON strict (pas de markdown):
{"first_name":"","last_name":"","email":null,"phone":null,"competencies":[{"name":"compétence","level":"beginner|intermediate|expert"}],"experience_years":0,"seniority_level":"junior|confirmed|senior|expert","education":[{"degree":"","school":"","year":null}],"certifications":[{"name":"","organism":""}],"languages":[{"language":"","level":"A1-C2|native"}],"bio":"2 phrases max","formation_domains":["domaines enseignables"],"ai_keywords":["10 mots-clés métier"]}
JSON uniquement.`;

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
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Fichier trop volumineux (max 5 MB)" }, { status: 400 });
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

    // Auto-save if trainer_id provided
    const trainerId = formData.get("trainer_id") as string | null;
    const autoSave = formData.get("auto_save") === "true";

    let competenciesSaved = 0;
    let saved = false;

    if (trainerId && autoSave) {
      // Lot AI audit BMAD : defense in depth multi-tenant. requireRole déjà
      // vérifié super_admin/admin, mais le trainer_id arrive du client donc
      // on doit vérifier qu'il appartient bien à l'entité du user (sauf
      // super_admin cross-entité).
      const { data: trainerRow, error: fetchErr } = await auth.supabase
        .from("trainers")
        .select("id, entity_id")
        .eq("id", trainerId)
        .maybeSingle();
      if (fetchErr) {
        return NextResponse.json(
          { error: sanitizeDbError(fetchErr, "parse-cv fetch trainer") },
          { status: 500 }
        );
      }
      if (!trainerRow) {
        return NextResponse.json({ error: "Formateur introuvable" }, { status: 404 });
      }
      if (auth.profile.role === "admin" && trainerRow.entity_id !== auth.profile.entity_id) {
        return NextResponse.json({ error: "Formateur hors de l'entité" }, { status: 403 });
      }

      // Update trainer fields — entity_id filter pour defense in depth.
      // Lot AI audit BMAD #1 : avant, pas de filter → super_admin pouvait
      // écraser un trainer d'une autre entité par un trainer_id pris du DOM.
      const { error: updateErr } = await auth.supabase
        .from("trainers")
        .update({
          bio: parsed.bio || undefined,
          experience_years: parsed.experience_years || undefined,
          seniority_level: parsed.seniority_level || undefined,
          education: parsed.education || [],
          certifications: parsed.certifications || [],
          languages: parsed.languages || [],
          formation_domains: parsed.formation_domains || [],
          ai_summary: parsed.bio || undefined,
          ai_keywords: parsed.ai_keywords || [],
          cv_uploaded_at: new Date().toISOString(),
        })
        .eq("id", trainerId)
        .eq("entity_id", trainerRow.entity_id);
      if (updateErr) {
        console.error("[parse-cv] trainer update failed:", updateErr);
        return NextResponse.json(
          { error: sanitizeDbError(updateErr, "parse-cv update trainer") },
          { status: 500 }
        );
      }

      // Upsert competencies — error handling explicite (avant : silent fail).
      if (parsed.competencies?.length) {
        const { error: deleteErr } = await auth.supabase
          .from("trainer_competencies")
          .delete()
          .eq("trainer_id", trainerId);
        if (deleteErr) {
          console.error("[parse-cv] competencies delete failed:", deleteErr);
          return NextResponse.json(
            { error: sanitizeDbError(deleteErr, "parse-cv delete competencies") },
            { status: 500 }
          );
        }

        const rows = parsed.competencies.map((c: { name: string; level: string }) => ({
          trainer_id: trainerId,
          competency: c.name,
          level: c.level || "intermediate",
        }));
        const { error: insertErr } = await auth.supabase
          .from("trainer_competencies")
          .insert(rows);
        if (insertErr) {
          console.error("[parse-cv] competencies insert failed:", insertErr);
          return NextResponse.json(
            { error: sanitizeDbError(insertErr, "parse-cv insert competencies") },
            { status: 500 }
          );
        }
        competenciesSaved = rows.length;
      }

      saved = true;

      logAudit({
        supabase: auth.supabase,
        entityId: trainerRow.entity_id as string,
        userId: auth.user.id,
        action: "update",
        resourceType: "trainers.cv_analysis",
        resourceId: trainerId,
        details: {
          competencies_saved: competenciesSaved,
          ai_keywords_count: (parsed.ai_keywords || []).length,
          formation_domains_count: (parsed.formation_domains || []).length,
        },
      });
    }

    return NextResponse.json({ ...parsed, saved, competencies_saved: competenciesSaved });
  } catch (err) {
    console.error("[parse-cv]", err);
    return NextResponse.json({ error: "Erreur lors de l'analyse" }, { status: 500 });
  }
}
