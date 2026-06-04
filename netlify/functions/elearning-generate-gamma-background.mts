/**
 * Netlify Background Function — génération Gamma async (fix 504).
 *
 * Pourquoi : générer un deck Gamma par chapitre prend 30-120s (POST + polling
 * Gamma API). Pour N chapitres en parallèle, on est largement au-dessus du
 * timeout 26s d'une route Next.js sur Netlify Pro.
 *
 * Cette BG function (15min de timeout) :
 *   1. Charge le cours + chapitres via Supabase service_role
 *   2. Appelle l'API Gamma directement (pas via route Next.js intermédiaire)
 *      en parallèle pour tous les chapitres
 *   3. Met à jour chapter.gamma_* et course.gamma_* en DB
 *   4. Tracke la progression dans elearning_courses.generation_progress avec
 *      step="gamma_running" / "gamma_done" / "gamma_failed" — NE TOUCHE PAS
 *      generation_status (qui reste "completed" pour le pipeline principal).
 *
 * Invoquée par : POST /api/elearning/[id]/gamma (auth admin user → fire-and-
 * forget vers cette BG function avec Bearer CRON_SECRET).
 *
 * Polling côté client : GET /api/elearning/[id]?shallow=true lit
 * generation_progress.step.
 */

import type { Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

type Payload = { courseId: string };

const CRON_SECRET = process.env.CRON_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GAMMA_API_KEY = process.env.GAMMA_API_KEY;
const GAMMA_API_BASE = "https://public-api.gamma.app/v1.0";

function supabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    throw new Error("Supabase service_role manquant (SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY)");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function gammaHeaders() {
  if (!GAMMA_API_KEY) throw new Error("GAMMA_API_KEY non configurée");
  return {
    "X-API-KEY": GAMMA_API_KEY,
    "Content-Type": "application/json",
  };
}

function buildEmbedUrl(gammaUrl: string): string {
  if (!gammaUrl) return "";
  return gammaUrl.replace("/docs/", "/embed/");
}

type ProgressPatch = {
  step: "gamma_starting" | "gamma_running" | "gamma_done" | "gamma_failed";
  current?: number;
  total?: number;
  percent: number;
  message: string;
  error?: string | null;
};

async function writeProgress(courseId: string, patch: ProgressPatch) {
  const supabase = supabaseAdmin();
  await supabase
    .from("elearning_courses")
    .update({
      generation_progress: { ...patch, updated_at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    })
    .eq("id", courseId);
}

type GammaDeckResult = {
  generationId: string;
  url: string;
  embedUrl: string;
  status: "completed" | "failed" | "pending";
  exportPptx?: string;
};

async function generateChapterDeck(
  chapterTitle: string,
  chapterMarkdown: string,
  themeId: string | null,
): Promise<GammaDeckResult> {
  const headers = gammaHeaders();
  const body: Record<string, unknown> = {
    inputText: `# ${chapterTitle}\n\n${chapterMarkdown.replace(/^### /gm, "## ")}`,
    textMode: "condense",
    format: "presentation",
    numCards: 8,
    textOptions: {
      amount: "medium",
      tone: "professionnel et pédagogique",
      audience: "apprenants en formation professionnelle",
      language: "fr",
    },
    imageOptions: {
      source: "aiGenerated",
      style: "professionnel, moderne, éducatif",
    },
    exportAs: "pptx",
  };
  if (themeId) body.themeId = themeId;

  const res = await fetch(`${GAMMA_API_BASE}/generations`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Gamma POST ${res.status}: ${await res.text()}`);
  }
  const postData = await res.json();
  const generationId: string =
    postData.generationId || postData.generation_id || postData.id || postData.jobId || "";
  if (!generationId) throw new Error("Gamma : pas de generationId");

  // Polling status (max ~2 min = 40 × 3s)
  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise((r) => setTimeout(r, 3000));
    const r = await fetch(`${GAMMA_API_BASE}/generations/${generationId}`, { headers });
    if (!r.ok) continue;
    const data = await r.json();
    const status = data.status || "pending";
    if (status === "completed") {
      const url = data.gammaUrl || data.url || data.deckUrl || data.deck_url || "";
      let exportPptx: string | undefined =
        data.exportUrl || data.downloadLink || data.exportPptx || data.exportPptxUrl ||
        data.pptx_url || data.pptxUrl || undefined;
      // Up to 3 extra polls si l'export n'est pas encore prêt
      if (!exportPptx) {
        for (let extra = 0; extra < 3; extra++) {
          await new Promise((r) => setTimeout(r, 2000));
          const extraRes = await fetch(`${GAMMA_API_BASE}/generations/${generationId}`, { headers });
          if (!extraRes.ok) continue;
          const extraData = await extraRes.json();
          exportPptx =
            extraData.exportUrl || extraData.downloadLink || extraData.exportPptx ||
            extraData.exportPptxUrl || extraData.pptx_url || extraData.pptxUrl || undefined;
          if (exportPptx) break;
        }
      }
      return {
        generationId,
        url,
        embedUrl: buildEmbedUrl(url),
        status: "completed",
        exportPptx,
      };
    }
    if (status === "failed") {
      return { generationId, url: "", embedUrl: "", status: "failed" };
    }
  }
  return { generationId, url: "", embedUrl: "", status: "pending" };
}

export default async (req: Request) => {
  if (req.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const { courseId } = payload;
  if (!courseId) return new Response("courseId required", { status: 400 });

  console.log(`[gamma-bg] start course=${courseId}`);

  const startedAt = Date.now();
  try {
    await writeProgress(courseId, {
      step: "gamma_starting",
      percent: 3,
      message: "Préparation Gamma…",
      error: null,
    });

    const supabase = supabaseAdmin();

    const { data: course, error: courseErr } = await supabase
      .from("elearning_courses")
      .select("id, title, gamma_theme_id")
      .eq("id", courseId)
      .maybeSingle();
    if (courseErr || !course) {
      throw new Error("Cours non trouvé");
    }

    const { data: chapters, error: chErr } = await supabase
      .from("elearning_chapters")
      .select("id, title, summary, content_markdown, order_index")
      .eq("course_id", courseId)
      .order("order_index");
    if (chErr) throw new Error(`Erreur chargement chapitres : ${chErr.message}`);
    const chList = (chapters ?? []) as {
      id: string; title: string; summary: string | null;
      content_markdown: string | null; order_index: number;
    }[];
    if (chList.length === 0) throw new Error("Aucun chapitre dans ce cours");

    const total = chList.length;
    await writeProgress(courseId, {
      step: "gamma_running",
      current: 0,
      total,
      percent: 10,
      message: `Génération de ${total} deck(s) Gamma…`,
      error: null,
    });

    // Génération en parallèle, mais on incrémente la progression à chaque
    // task qui termine (pas après le Promise.all complet).
    let done = 0;
    const themeId = (course as { gamma_theme_id?: string | null }).gamma_theme_id ?? null;
    const tasks = chList.map(async (ch, idx) => {
      try {
        const md = ch.content_markdown || ch.summary || "";
        const res = await generateChapterDeck(ch.title, md, themeId);
        if (res.status === "completed" && res.embedUrl) {
          await supabase
            .from("elearning_chapters")
            .update({
              gamma_embed_url: res.embedUrl,
              gamma_deck_url: res.url,
              gamma_deck_id: res.generationId,
              gamma_slide_start: null,
              ...(res.exportPptx && { gamma_export_pptx: res.exportPptx }),
              updated_at: new Date().toISOString(),
            })
            .eq("id", ch.id);
          done++;
          const percent = 10 + Math.round((done / total) * 85);
          await writeProgress(courseId, {
            step: "gamma_running",
            current: done,
            total,
            percent,
            message: `Gamma : ${done}/${total} chapitre(s) prêt(s)`,
            error: null,
          });
          return { ok: true, idx, result: res };
        }
        console.warn(`[gamma-bg] chapter ${idx + 1} status=${res.status}`);
        return { ok: false, idx, result: res };
      } catch (err) {
        console.error(`[gamma-bg] chapter ${idx + 1} error:`, err);
        return { ok: false, idx, result: null };
      }
    });

    const results = await Promise.all(tasks);
    const succeeded = results.filter((r) => r.ok);

    // Stocke le deck du 1er chapter au niveau cours pour le bouton "Voir dans Gamma"
    if (succeeded.length > 0 && succeeded[0].result) {
      const first = succeeded[0].result;
      await supabase
        .from("elearning_courses")
        .update({
          gamma_embed_url: first.embedUrl,
          gamma_deck_url: first.url,
          gamma_deck_id: first.generationId,
          ...(first.exportPptx && { gamma_export_pptx: first.exportPptx }),
          updated_at: new Date().toISOString(),
        })
        .eq("id", courseId);
    }

    if (succeeded.length === 0) {
      throw new Error("Aucun deck Gamma généré (tous les chapitres ont échoué)");
    }

    await writeProgress(courseId, {
      step: "gamma_done",
      percent: 100,
      current: succeeded.length,
      total,
      message: `Gamma : ${succeeded.length}/${total} deck(s) générés`,
      error: null,
    });

    const duration = Date.now() - startedAt;
    console.log(`[gamma-bg] success course=${courseId} duration=${duration}ms succeeded=${succeeded.length}/${total}`);
    return new Response(JSON.stringify({ ok: true, succeeded: succeeded.length, total, duration_ms: duration }), {
      status: 200,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[gamma-bg] failed course=${courseId}:`, msg);
    await writeProgress(courseId, {
      step: "gamma_failed",
      percent: 0,
      message: "Erreur Gamma",
      error: msg,
    });
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500 });
  }
};

export const config: Config = {};
