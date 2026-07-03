/**
 * Runner de génération Gamma pour un cours e-learning, extrait de la Background
 * Function Netlify `netlify/functions/elearning-generate-gamma-background.mts`.
 *
 * Pourquoi ce module (DUAL-MODE Netlify / Railway) :
 *   - Générer un deck Gamma par chapitre prend 30-120s (POST + polling API
 *     Gamma). Pour N chapitres en parallèle, on dépasse le timeout 26s d'une
 *     route Next.js sur Netlify Pro → la Background Function (15 min) s'en
 *     charge et importe désormais CE runner.
 *   - Sur Railway (conteneur long-lived, pas de timeout), les routes
 *     /gamma et /generate/gamma lancent ce runner en fire-and-forget IN-PROCESS.
 *
 * Contrairement au pipeline, la logique Gamma est EN DUR ici : appel direct à
 * l'API Gamma (`https://public-api.gamma.app/v1.0`, POST création + polling
 * ~2 min) et écriture de `elearning_chapters.gamma_*` / `elearning_courses.gamma_*`
 * via un client Supabase service_role.
 *
 * Progression : step ∈ ("gamma_starting" | "gamma_running" | "gamma_done" |
 * "gamma_failed") écrit dans `elearning_courses.generation_progress`. NE TOUCHE
 * PAS `generation_status` (qui reste "completed" pour le pipeline principal).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const GAMMA_API_BASE = "https://public-api.gamma.app/v1.0";

export interface ElearningGammaParams {
  courseId: string;
}

export interface ElearningGammaDeps {
  /**
   * Client service_role (bypass RLS). Optionnel : si absent, on l'instancie via
   * `createServiceRoleClient()` (utile côté route Railway). Le `.mts` Netlify
   * passe son propre client.
   */
  supabase?: SupabaseClient;
}

export interface ElearningGammaResult {
  ok: boolean;
  succeeded?: number;
  total?: number;
  durationMs: number;
  error?: string;
}

function gammaHeaders(): Record<string, string> {
  const apiKey = process.env.GAMMA_API_KEY;
  if (!apiKey) throw new Error("GAMMA_API_KEY non configurée");
  return {
    "X-API-KEY": apiKey,
    "Content-Type": "application/json",
  };
}

function buildEmbedUrl(gammaUrl: string): string {
  if (!gammaUrl) return "";
  return gammaUrl.replace("/docs/", "/embed/");
}

/**
 * Réponse partielle de l'API Gamma (POST /generations puis GET /generations/:id).
 * Les noms de champs varient selon les versions de l'API → on liste tous les
 * alias connus et on extrait de façon défensive (helpers pickString ci-dessous).
 */
interface GammaApiResponse {
  generationId?: string;
  generation_id?: string;
  id?: string;
  jobId?: string;
  status?: string;
  gammaUrl?: string;
  url?: string;
  deckUrl?: string;
  deck_url?: string;
  exportUrl?: string;
  downloadLink?: string;
  exportPptx?: string;
  exportPptxUrl?: string;
  pptx_url?: string;
  pptxUrl?: string;
}

/** Premier champ string non vide parmi une liste d'alias. */
function pickString(
  source: GammaApiResponse,
  keys: (keyof GammaApiResponse)[],
): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

type GammaDeckResult = {
  generationId: string;
  url: string;
  embedUrl: string;
  status: "completed" | "failed" | "pending";
  exportPptx?: string;
};

/**
 * Génère un deck Gamma pour un chapitre : POST création puis polling du statut
 * (max ~2 min = 40 × 3s), avec quelques polls supplémentaires si l'export PPTX
 * n'est pas immédiatement prêt.
 */
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
  const postData = (await res.json()) as GammaApiResponse;
  const generationId =
    pickString(postData, ["generationId", "generation_id", "id", "jobId"]) ?? "";
  if (!generationId) throw new Error("Gamma : pas de generationId");

  const exportPptxKeys: (keyof GammaApiResponse)[] = [
    "exportUrl",
    "downloadLink",
    "exportPptx",
    "exportPptxUrl",
    "pptx_url",
    "pptxUrl",
  ];

  // Polling status (max ~2 min = 40 × 3s).
  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise((r) => setTimeout(r, 3000));
    const r = await fetch(`${GAMMA_API_BASE}/generations/${generationId}`, {
      headers,
    });
    if (!r.ok) continue;
    const data = (await r.json()) as GammaApiResponse;
    const status = data.status || "pending";
    if (status === "completed") {
      const url =
        pickString(data, ["gammaUrl", "url", "deckUrl", "deck_url"]) ?? "";
      let exportPptx = pickString(data, exportPptxKeys);
      // Jusqu'à 3 polls supplémentaires si l'export n'est pas encore prêt.
      if (!exportPptx) {
        for (let extra = 0; extra < 3; extra++) {
          await new Promise((r) => setTimeout(r, 2000));
          const extraRes = await fetch(
            `${GAMMA_API_BASE}/generations/${generationId}`,
            { headers },
          );
          if (!extraRes.ok) continue;
          const extraData = (await extraRes.json()) as GammaApiResponse;
          exportPptx = pickString(extraData, exportPptxKeys);
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

/** Patch de progression écrit dans `elearning_courses.generation_progress`. */
type ProgressPatch = {
  step: "gamma_starting" | "gamma_running" | "gamma_done" | "gamma_failed";
  current?: number;
  total?: number;
  percent: number;
  message: string;
  error?: string | null;
};

/**
 * Génère les decks Gamma de tous les chapitres d'un cours et écrit les
 * `gamma_*` en DB. Reproduit fidèlement le `.mts` : payload Gamma, polling,
 * gestion timeout/erreur, tous les writes DB, progression.
 */
export async function runElearningGamma(
  params: ElearningGammaParams,
  deps: ElearningGammaDeps = {},
): Promise<ElearningGammaResult> {
  const { courseId } = params;
  // Client service_role : passé par l'appelant (.mts Netlify / routes Railway
  // le fournissent toujours), ou instancié ici en dernier recours. L'import de
  // `@/lib/supabase/server` est DYNAMIQUE (et non statique) pour ne pas tirer
  // `next/headers` dans le bundle Netlify de la Background Function, qui importe
  // ce runner mais passe déjà son propre client → ce chemin n'y est jamais pris.
  let resolvedSupabase = deps.supabase;
  if (!resolvedSupabase) {
    const { createServiceRoleClient } = await import("@/lib/supabase/server");
    resolvedSupabase = createServiceRoleClient();
  }
  // `const` définitivement typé (non-undefined) pour les closures ci-dessous.
  const supabase: SupabaseClient = resolvedSupabase;

  async function writeProgress(patch: ProgressPatch): Promise<void> {
    const now = new Date().toISOString();
    await supabase
      .from("elearning_courses")
      .update({
        generation_progress: { ...patch, updated_at: now },
        updated_at: now,
      })
      .eq("id", courseId);
  }

  console.log(`[gamma-runner] start course=${courseId}`);
  const startedAt = Date.now();

  try {
    await writeProgress({
      step: "gamma_starting",
      percent: 3,
      message: "Préparation Gamma…",
      error: null,
    });

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
      id: string;
      title: string;
      summary: string | null;
      content_markdown: string | null;
      order_index: number;
    }[];
    if (chList.length === 0) throw new Error("Aucun chapitre dans ce cours");

    const total = chList.length;
    await writeProgress({
      step: "gamma_running",
      current: 0,
      total,
      percent: 10,
      message: `Génération de ${total} deck(s) Gamma…`,
      error: null,
    });

    // Génération en parallèle, mais on incrémente la progression à chaque task
    // qui termine (pas après le Promise.all complet).
    let done = 0;
    const themeId =
      (course as { gamma_theme_id?: string | null }).gamma_theme_id ?? null;
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
          await writeProgress({
            step: "gamma_running",
            current: done,
            total,
            percent,
            message: `Gamma : ${done}/${total} chapitre(s) prêt(s)`,
            error: null,
          });
          return { ok: true, idx, result: res };
        }
        console.warn(`[gamma-runner] chapter ${idx + 1} status=${res.status}`);
        return { ok: false, idx, result: res };
      } catch (err) {
        console.error(`[gamma-runner] chapter ${idx + 1} error:`, err);
        return { ok: false, idx, result: null };
      }
    });

    const results = await Promise.all(tasks);
    const succeeded = results.filter((r) => r.ok);

    // Stocke le deck du 1er chapter au niveau cours pour le bouton "Voir dans Gamma".
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

    await writeProgress({
      step: "gamma_done",
      percent: 100,
      current: succeeded.length,
      total,
      message: `Gamma : ${succeeded.length}/${total} deck(s) générés`,
      error: null,
    });

    const durationMs = Date.now() - startedAt;
    console.log(
      `[gamma-runner] success course=${courseId} duration=${durationMs}ms succeeded=${succeeded.length}/${total}`,
    );
    return { ok: true, succeeded: succeeded.length, total, durationMs };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[gamma-runner] failed course=${courseId}:`, msg);
    await writeProgress({
      step: "gamma_failed",
      percent: 0,
      message: "Erreur Gamma",
      error: msg,
    });
    return { ok: false, durationMs: Date.now() - startedAt, error: msg };
  }
}
