/**
 * Service d'intégration OpenAI (ChatGPT)
 * Utilisé pour la génération de contenu pédagogique et l'assistance à la création de programmes.
 */

import { z } from "zod";
import { withRetry } from "@/lib/ai/with-retry";
import { wrapUserData } from "@/lib/ai/sanitize-prompt";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key === "votre-cle-openai") {
    throw new Error("OPENAI_API_KEY non configurée. Ajoutez votre clé dans .env.local");
  }
  return key;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenAIResponse {
  content: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

/**
 * Envoie une requête à l'API ChatGPT
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options?: { model?: string; temperature?: number; max_tokens?: number; timeout?: number; json?: boolean }
): Promise<OpenAIResponse> {
  const apiKey = getApiKey();
  const { model = "gpt-4o-mini", temperature = 0.7, max_tokens = 2000, timeout = 90000, json = false } = options || {};

  return withRetry(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens,
          ...(json ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        const err = new Error(`OpenAI ${response.status}: ${body.slice(0, 300)}`) as Error & { status: number };
        err.status = response.status;
        throw err;
      }

      const data = await response.json();
      return {
        content: data.choices[0]?.message?.content || "",
        usage: data.usage,
      };
    } finally {
      clearTimeout(timer);
    }
  }, { retries: 3, baseDelayMs: 600 });
}

/**
 * Génère un programme de formation à partir d'un titre et d'objectifs
 */
export async function generateTrainingProgram(params: {
  title: string;
  objectives?: string;
  duration_hours?: number;
  target_audience?: string;
}): Promise<string> {
  const { title, objectives, duration_hours, target_audience } = params;

  const prompt = `Tu es un expert en ingénierie pédagogique pour un organisme de formation professionnelle français.
Génère un programme de formation structuré pour :

Titre : ${title}
${objectives ? `Objectifs : ${objectives}` : ""}
${duration_hours ? `Durée : ${duration_hours} heures` : ""}
${target_audience ? `Public cible : ${target_audience}` : ""}

Le programme doit inclure :
- Les objectifs pédagogiques détaillés
- Le déroulé pédagogique (modules et sous-modules)
- Les méthodes pédagogiques utilisées
- Les modalités d'évaluation
- Les prérequis

Formate le résultat en texte structuré avec des titres clairs.`;

  const result = await chatCompletion([
    { role: "system", content: "Tu es un assistant spécialisé en formation professionnelle. Réponds en français." },
    { role: "user", content: prompt },
  ]);

  return result.content;
}

/**
 * Génère un programme de formation structuré (JSON) pour remplir la fiche programme
 */
export interface GeneratedProgramModule {
  id: number;
  title: string;
  duration_hours: number;
  topics: string[];
  // Lot A1 — séquence enrichie (additif, tous optionnels).
  summary_objective?: string;
  operational_objectives?: string[];
  content_details?: string[];
  methods?: string;
  evaluation?: string;
}

export interface GeneratedProgramContent {
  description: string;
  objectives: string;
  duration_hours: number;
  duration_days: number;
  target_audience: string;
  prerequisites: string;
  location: string;
  modules: GeneratedProgramModule[];
  evaluation_methods: string[];
  pedagogical_resources: string[];
  team_description: string;
  certification_results: string;
  // Lot A1 — page 1 enrichie (additif, tous optionnels).
  general_objectives?: string[];
  access_terms?: string;
}

export async function generateStructuredProgram(params: {
  title: string;
  duration_hours?: number;
  duration_days?: number;
  target_audience?: string;
  precisions?: string;
}): Promise<GeneratedProgramContent> {
  const { title, duration_hours, duration_days, target_audience, precisions } = params;

  // Lot A1 — Prompt métier fourni par le client (Design Notes du spec),
  // paramétré {nom} / {jours} / {heures} / {precisions}. Sortie JSON contrainte.
  const joursLabel = duration_days ? `${duration_days} jours` : "le nombre de jours adapté";
  const heuresLabel = duration_hours ? `${duration_hours} heures` : "le volume horaire adapté";

  const prompt = `Tu es un concepteur pédagogique senior pour un organisme de formation en France, certifié Qualiopi.

THÉMATIQUE : "${title}" sur ${joursLabel} soit ${heuresLabel}.

Génère un programme détaillé : pour chaque séquence, donne objectifs opérationnels, contenus, méthodes, évaluations et durée.

Infos générales attendues :
- objectifs généraux de la formation
- effectif maximum de 12 personnes
- prérequis
- public cible
- lieu
- délais et modalités d'accès
- méthodes pédagogiques (alternance d'apports théoriques et d'ateliers pratiques, ludo-pédagogie, support de synthèse remis)
- modalités d'évaluation (évaluation des acquis en continu, évaluation à chaud, émargements, accessibilité / situation de handicap)

Résumé des séquences : pour chaque séquence, un titre + un objectif court.
Détail par séquence : objectifs opérationnels, contenus détaillés avec exemples concrets, méthodes, évaluation, durée.

Consignes de rédaction : verbes d'action, granularité fine, langage professionnel, exemples concrets, et respect des normes DPC / Titre Professionnel si elles sont présentes dans les précisions suivantes.

PRÉCISIONS DU FORMATEUR : ${precisions && precisions.trim() ? precisions.trim() : "aucune précision fournie"}
${target_audience ? `PUBLIC CIBLE IMPOSÉ : ${target_audience}` : ""}

Réponds UNIQUEMENT en JSON valide (pas de markdown, pas de commentaires) avec cette structure exacte :
{
  "description": "Description détaillée du programme sur plusieurs lignes, avec le déroulé jour par jour",
  "objectives": "1 - Premier objectif\\n2 - Deuxième objectif\\n3 - Troisième objectif\\n4 - Quatrième objectif",
  "general_objectives": ["Objectif général 1", "Objectif général 2"],
  "duration_hours": ${duration_hours ?? 14},
  "duration_days": ${duration_days ?? 2},
  "target_audience": "Public visé (max 12 personnes)",
  "prerequisites": "Prérequis nécessaires ou Aucun",
  "location": "Formation en présentiel",
  "access_terms": "Délais et modalités d'accès à la formation",
  "modules": [
    {
      "id": 1,
      "title": "Titre de la séquence 1",
      "duration_hours": 3.5,
      "topics": ["Sujet 1", "Sujet 2"],
      "summary_objective": "Objectif court résumant la séquence",
      "operational_objectives": ["Être capable de…", "Être capable de…"],
      "content_details": ["Contenu détaillé avec exemple concret", "Contenu détaillé avec exemple concret"],
      "methods": "Méthodes pédagogiques de la séquence (apports théoriques, atelier pratique…)",
      "evaluation": "Modalités d'évaluation de la séquence"
    }
  ],
  "evaluation_methods": ["Test de positionnement", "Évaluation des acquis en continu (tests, exercices, études de cas et mises en situation)", "Évaluation à chaud", "Émargements", "Accessibilité / situation de handicap prise en compte"],
  "pedagogical_resources": ["Alternance d'apports théoriques et d'ateliers pratiques", "Ludo-pédagogie pour faciliter l'ancrage", "Support de synthèse remis aux participants"],
  "team_description": "Formateur expert du domaine avec expérience terrain",
  "certification_results": "Attestation de fin de formation"
}`;

  const result = await chatCompletion(
    [
      { role: "system", content: "Tu es un assistant spécialisé en formation professionnelle. Tu réponds UNIQUEMENT en JSON valide." },
      { role: "user", content: prompt },
    ],
    { model: "gpt-4o-mini", temperature: 0.7, max_tokens: 8000, json: true }
  );

  // Parse JSON from response (handle potential markdown wrapping).
  // Si le parse échoue, on conserve le comportement historique : throw →
  // la route renvoie une erreur gérée.
  let jsonStr = result.content.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  const parsed = JSON.parse(jsonStr) as unknown;

  // Normalisation tolérante : l'IA peut renvoyer des nombres en string ou
  // omettre `modules`. On ne fait PLUS confiance aveuglément au JSON ; on
  // coerce les champs numériques et on garantit que `modules` est un tableau.
  // Un schéma Zod local tolérant gère la coercion sans introduire de `any`.
  const tolerantModuleSchema = z.object({
    id: z.coerce.number().optional(),
    title: z.string().optional(),
    duration_hours: z.coerce.number().optional(),
    topics: z.array(z.string()).optional(),
    summary_objective: z.string().optional(),
    operational_objectives: z.array(z.string()).optional(),
    content_details: z.array(z.string()).optional(),
    methods: z.string().optional(),
    evaluation: z.string().optional(),
  });
  const tolerantSchema = z.object({
    modules: z.array(tolerantModuleSchema).default([]),
    duration_hours: z.coerce.number().optional(),
    duration_days: z.coerce.number().optional(),
  });

  const norm = tolerantSchema.safeParse(parsed);
  // Base : l'objet parsé tel quel ; on superpose la normalisation tolérante.
  const base = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;

  const normalized: GeneratedProgramContent = {
    ...(base as Partial<GeneratedProgramContent>),
    description: typeof base.description === "string" ? base.description : "",
    objectives: typeof base.objectives === "string" ? base.objectives : "",
    target_audience: typeof base.target_audience === "string" ? base.target_audience : "",
    prerequisites: typeof base.prerequisites === "string" ? base.prerequisites : "",
    location: typeof base.location === "string" ? base.location : "",
    team_description: typeof base.team_description === "string" ? base.team_description : "",
    certification_results: typeof base.certification_results === "string" ? base.certification_results : "",
    evaluation_methods: Array.isArray(base.evaluation_methods) ? (base.evaluation_methods as string[]) : [],
    pedagogical_resources: Array.isArray(base.pedagogical_resources) ? (base.pedagogical_resources as string[]) : [],
    duration_hours: norm.success && norm.data.duration_hours != null ? norm.data.duration_hours : 0,
    duration_days: norm.success && norm.data.duration_days != null ? norm.data.duration_days : 0,
    modules: (norm.success ? norm.data.modules : []).map((m, i) => ({
      id: m.id ?? i + 1,
      title: m.title ?? "",
      duration_hours: m.duration_hours ?? 0,
      topics: m.topics ?? [],
      summary_objective: m.summary_objective,
      operational_objectives: m.operational_objectives,
      content_details: m.content_details,
      methods: m.methods,
      evaluation: m.evaluation,
    })),
  };

  return normalized;
}

/**
 * Génère des questions de questionnaire de satisfaction
 */
export async function generateSurveyQuestions(params: {
  training_title: string;
  type: "satisfaction" | "evaluation";
  count?: number;
}): Promise<string> {
  const { training_title, type, count = 10 } = params;

  const prompt = type === "satisfaction"
    ? `Génère ${count} questions de satisfaction pour une formation intitulée "${training_title}".
       Inclus des questions sur : le contenu, le formateur, l'organisation, les supports, et l'applicabilité.
       Format : une question par ligne, avec le type entre crochets [rating], [text], [yes_no] ou [multiple_choice].`
    : `Génère ${count} questions d'évaluation des acquis pour la formation "${training_title}".
       Les questions doivent évaluer la compréhension et les compétences acquises.
       Format : une question par ligne, avec le type entre crochets [multiple_choice] ou [text].`;

  const result = await chatCompletion([
    { role: "system", content: "Tu es un expert en évaluation de formations professionnelles. Réponds en français." },
    { role: "user", content: prompt },
  ]);

  return result.content;
}

// ============================================================
// E-Learning: Document → Course AI generation
// ============================================================

import type {
  CourseOutline,
  GeneratedChapterContent,
  GeneratedQuizData,
  GeneratedFinalExamBatch,
  GeneratedGlobalFlashcardsBatch,
  GeneratedSlideSpecBatch,
} from "@/lib/types/elearning";
import type { ZodType } from "zod";
import {
  outlineSchema,
  chapterContentSchema,
  quizDataSchema,
  finalExamBatchSchema,
} from "@/lib/validations/elearning-ai";

/** Helper to parse JSON from OpenAI response (strips markdown fences).
 *  Si un schéma Zod est fourni, valide la structure et lève une erreur
 *  typée (code "AI_SCHEMA") plutôt que de laisser passer un objet malformé.
 */
export function parseJsonResponse<T>(content: string, schema?: ZodType<T>): T {
  let jsonStr = content.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    const e = new Error("Réponse IA non-JSON") as Error & { code: string };
    e.code = "AI_JSON_PARSE";
    throw e;
  }
  if (schema) {
    const r = schema.safeParse(parsed);
    if (!r.success) {
      const e = new Error(
        `Sortie IA invalide: ${r.error.issues.map((i) => i.path.join(".")).join(", ")}`
      ) as Error & { code: string };
      e.code = "AI_SCHEMA";
      throw e;
    }
    return r.data;
  }
  return parsed as T;
}

/**
 * Pass 1: Analyse le document et génère un plan de cours structuré
 */
export async function generateCourseOutline(
  documentText: string,
  maxChapters: number = 6
): Promise<CourseOutline> {
  // Fix 504 Netlify Pro (26s) : 100k → 60k chars suffisent pour générer
  // un outline pertinent (titres + summaries court). Réduit le temps de
  // processing prompt d'OpenAI.
  const truncated = documentText.substring(0, 60000);

  const result = await chatCompletion(
    [
      {
        role: "system",
        content:
          "Tu es un expert en ingénierie pédagogique pour un organisme de formation professionnelle français certifié Qualiopi. Tu analyses des documents sources pour créer des parcours e-learning structurés. Tu réponds UNIQUEMENT en JSON valide (pas de markdown, pas de commentaires).",
      },
      {
        role: "user",
        content: `Analyse le document suivant et génère un plan de cours e-learning structuré.

DOCUMENT SOURCE :
${wrapUserData("document_source", truncated)}

Génère un JSON avec cette structure exacte :
{
  "title": "Titre du cours e-learning",
  "description": "Description pédagogique du cours (2-3 phrases)",
  "objectives": "1 - Premier objectif\\n2 - Deuxième objectif\\n3 - Troisième objectif",
  "target_audience": "Public cible identifié",
  "prerequisites": "Prérequis identifiés ou Aucun",
  "estimated_duration_minutes": 30,
  "chapters": [
    {
      "id": 1,
      "title": "Titre du chapitre",
      "summary": "Résumé du contenu à couvrir dans ce chapitre",
      "key_concepts": ["concept1", "concept2"],
      "estimated_duration_minutes": 8
    }
  ]
}

Règles :
- Entre 3 et ${maxChapters} chapitres
- Chaque chapitre doit correspondre à une section cohérente du document source
- Durée réaliste et courte : un chapitre e-learning = 5 à 15 minutes max (slides + quiz + flashcards)
- La durée totale du cours = somme des chapitres, typiquement entre 20 et 60 minutes
- Les objectifs doivent être mesurables (verbes d'action)`,
      },
    ],
    { model: "gpt-4o-mini", temperature: 0.4, max_tokens: 3000, json: true }
  );

  return parseJsonResponse<CourseOutline>(result.content, outlineSchema as ZodType<CourseOutline>);
}

/**
 * Pass 2: Génère le contenu détaillé d'un chapitre
 */
export async function generateChapterContent(
  chapterTitle: string,
  chapterSummary: string,
  keyConcepts: string[],
  relevantSourceText: string,
  courseTitle: string,
  courseObjectives: string
): Promise<GeneratedChapterContent> {
  // Borne relâchée car BG 15 min (plus de contrainte 504) :
  // 80k → 50k → 30k (ancienne limite timeout) → 60000 chars (contexte riche).
  // 60 000 reste borné (anti-coût) mais suffisant pour la qualité pédagogique.
  const truncatedSource = relevantSourceText.substring(0, 60000);

  const result = await chatCompletion(
    [
      {
        role: "system",
        content:
          "Tu es un expert en création de contenu e-learning pour la formation professionnelle. Tu crées des leçons claires, structurées et engageantes à partir de documents sources. Tu réponds UNIQUEMENT en JSON valide.",
      },
      {
        role: "user",
        content: `Crée le contenu pédagogique pour le chapitre suivant d'un cours e-learning.

CONTEXTE DU COURS :
- Titre : ${courseTitle}
- Objectifs : ${courseObjectives}

CHAPITRE À RÉDIGER :
- Titre : ${chapterTitle}
- Résumé attendu : ${chapterSummary}
- Concepts clés : ${keyConcepts.join(", ")}

CONTENU SOURCE À TRANSFORMER :
${wrapUserData("document_source", truncatedSource)}

Génère un JSON avec cette structure :
{
  "title": "${chapterTitle}",
  "introduction": "Introduction engageante (2-3 phrases)",
  "sections": [
    {
      "title": "Sous-titre de la section",
      "content_html": "<p>Contenu pédagogique structuré en HTML simple (p, ul, ol, li, strong, em, h3, h4). Riche et détaillé.</p>",
      "key_points": ["Point clé 1", "Point clé 2"]
    }
  ],
  "summary": "Résumé des points essentiels du chapitre",
  "duration_minutes": 20
}

Règles :
- Le contenu doit être fidèle au document source mais reformulé pour l'apprentissage
- Utiliser un ton professionnel mais accessible
- Structurer en 2-5 sections par chapitre
- Contenu HTML simple et propre (pas de classes CSS, pas de scripts)
- Contenu détaillé (200-300 mots par section, pas plus)`,
      },
    ],
    // Borne relâchée car BG 15 min (plus de contrainte 504) :
    // 4000 → 2500 → 1800 (ancienne limite timeout) → 3000 tokens.
    // 3000 reste borné (anti-coût) — suffit pour 5-6 sections de 250-300 mots.
    { model: "gpt-4o", temperature: 0.5, max_tokens: 3000, json: true }
  );

  return parseJsonResponse<GeneratedChapterContent>(result.content, chapterContentSchema as ZodType<GeneratedChapterContent>);
}

/**
 * Pass 3: Génère quiz et flashcards pour tous les chapitres
 */
export async function generateQuizAndFlashcards(
  chapters: { title: string; summary: string; key_concepts: string[] }[],
  courseTitle: string
): Promise<GeneratedQuizData> {
  const chapterSummaries = chapters
    .map(
      (ch, i) =>
        `Chapitre ${i + 1} - ${ch.title}:\nRésumé: ${ch.summary}\nConcepts clés: ${ch.key_concepts.join(", ")}`
    )
    .join("\n\n");

  const result = await chatCompletion(
    [
      {
        role: "system",
        content:
          "Tu es un expert en évaluation pédagogique pour la formation professionnelle. Tu crées des quiz et des flashcards pour évaluer la compréhension des apprenants. Tu réponds UNIQUEMENT en JSON valide.",
      },
      {
        role: "user",
        content: `Crée des questions d'évaluation pour le cours e-learning "${courseTitle}".

RÉSUMÉ DES CHAPITRES :
${chapterSummaries}

Génère un JSON avec cette structure :
{
  "quiz_questions": [
    {
      "chapter_index": 0,
      "question": "Texte de la question",
      "type": "multiple_choice",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": 0,
      "explanation": "Explication de la bonne réponse"
    },
    {
      "chapter_index": 1,
      "question": "Vrai ou Faux : affirmation...",
      "type": "true_false",
      "correct_answer": true,
      "explanation": "Explication"
    }
  ],
  "flashcards": [
    {
      "chapter_index": 0,
      "front": "Terme ou question",
      "back": "Définition ou réponse"
    }
  ]
}

Règles :
- EXACTEMENT 4 questions par chapitre (pas plus, pas moins)
- Mix de types : multiple_choice (4 options, correct_answer = index 0-3), true_false (correct_answer = true/false)
- EXACTEMENT 4 flashcards par chapitre (pas plus, pas moins)
- Chaque question DOIT avoir au moins 2 options
- Questions qui testent la compréhension, pas la mémorisation
- Explications claires pour chaque réponse`,
      },
    ],
    // Fix 504 Netlify Pro : 4000 → 3000 tokens. La génération de N quiz +
    // N flashcards en 1 call peut être longue ; on reste à 3000 (suffit
    // pour ~10 questions + ~20 flashcards), si plus de chapitres on
    // peut splitter en sous-lots côté client.
    { model: "gpt-4o-mini", temperature: 0.4, max_tokens: 3000, json: true }
  );

  return parseJsonResponse<GeneratedQuizData>(result.content, quizDataSchema as ZodType<GeneratedQuizData>);
}

// ============================================================
// V2: Final Exam Batch Generation
// ============================================================

export async function generateFinalExamBatch(
  courseTitle: string,
  courseObjectives: string,
  chapters: { title: string; summary: string; key_concepts: string[] }[],
  sourceChunks: { index: number; text: string }[],
  batchConfig: {
    batchIndex: number;
    questionsToGenerate: number;
    typeDistribution: { multiple_choice: number; true_false: number; short_answer: number };
    difficultyRange: { min: number; max: number };
    focusChapterIndices: number[];
  }
): Promise<GeneratedFinalExamBatch> {
  const chapterContext = batchConfig.focusChapterIndices
    .map((i) => chapters[i])
    .filter(Boolean)
    .map(
      (ch, idx) =>
        `Chapitre ${batchConfig.focusChapterIndices[idx] + 1} - ${ch.title}:\n${ch.summary}\nConcepts: ${ch.key_concepts.join(", ")}`
    )
    .join("\n\n");

  const relevantChunks = batchConfig.focusChapterIndices
    .map((i) => sourceChunks[Math.min(i, sourceChunks.length - 1)])
    .filter(Boolean);

  const result = await chatCompletion(
    [
      {
        role: "system",
        content: `Tu es un expert en évaluation pédagogique. Tu crées des questions d'examen final pour un cours e-learning.
Tu dois générer exactement ${batchConfig.questionsToGenerate} questions.
Distribution: ${batchConfig.typeDistribution.multiple_choice} QCM, ${batchConfig.typeDistribution.true_false} Vrai/Faux, ${batchConfig.typeDistribution.short_answer} réponse courte.
Difficulté entre ${batchConfig.difficultyRange.min} et ${batchConfig.difficultyRange.max} (échelle 1-5).
Tu réponds UNIQUEMENT en JSON valide.`,
      },
      {
        role: "user",
        content: `Cours: "${courseTitle}"
Objectifs: ${courseObjectives}

CHAPITRES DE RÉFÉRENCE:
${chapterContext}

CONTENU SOURCE:
${relevantChunks.map((c) => c.text.substring(0, 6000)).join("\n---\n")}

Génère un JSON:
{
  "questions": [
    {
      "question": "Texte de la question",
      "type": "multiple_choice",
      "options": ["A", "B", "C", "D"],
      "correct_answer": 0,
      "explanation": "Justification",
      "difficulty": 3,
      "topic": "Titre du chapitre ou concept",
      "objective_ref": "Objectif pédagogique visé",
      "estimated_time_sec": 60,
      "citations": [{"chunk_index": 0, "text": "extrait court du source"}]
    },
    {
      "question": "Affirmation vrai/faux...",
      "type": "true_false",
      "correct_answer": true,
      "explanation": "...",
      "difficulty": 2,
      "topic": "...",
      "objective_ref": "...",
      "estimated_time_sec": 30,
      "citations": [{"chunk_index": 0, "text": "..."}]
    },
    {
      "question": "Question à réponse courte...",
      "type": "short_answer",
      "correct_answer": "La réponse attendue",
      "explanation": "...",
      "difficulty": 4,
      "topic": "...",
      "objective_ref": "...",
      "estimated_time_sec": 90,
      "citations": [{"chunk_index": 0, "text": "..."}]
    }
  ]
}

RÈGLES STRICTES:
- Questions variées testant compréhension, application et analyse
- CHAQUE question DOIT OBLIGATOIREMENT inclure TOUS ces champs:
  * "objective_ref": l'objectif pédagogique précis que cette question évalue (phrase complète, ex: "Comprendre les principes de...")
  * "difficulty": entier 1-5 (1=facile, 5=très difficile)
  * "explanation": justification détaillée de la bonne réponse (au moins 2 phrases = rationale)
  * "citations": au moins 1 citation du document source (extrait court max 100 car.)
  * "topic": le chapitre ou concept évalué
- Pour short_answer: correct_answer est une chaîne
- Pour multiple_choice: 4 options, correct_answer = index 0-3
- Pour true_false: correct_answer = true ou false
- NE PAS générer de questions sans objective_ref ou sans citations`,
      },
    ],
    { model: "gpt-4o", temperature: 0.5, max_tokens: 4000, json: true }
  );

  return parseJsonResponse<GeneratedFinalExamBatch>(result.content, finalExamBatchSchema as ZodType<GeneratedFinalExamBatch>);
}

// ============================================================
// V2: Global Flashcards Batch Generation
// ============================================================

export async function generateGlobalFlashcardsBatch(
  courseTitle: string,
  chapters: { title: string; summary: string; key_concepts: string[] }[],
  sourceChunks: { index: number; text: string }[],
  batchConfig: {
    batchIndex: number;
    count: number;
    focusChapterIndices: number[];
  }
): Promise<GeneratedGlobalFlashcardsBatch> {
  const chapterContext = batchConfig.focusChapterIndices
    .map((i) => chapters[i])
    .filter(Boolean)
    .map(
      (ch, idx) =>
        `Chapitre ${batchConfig.focusChapterIndices[idx] + 1} - ${ch.title}:\n${ch.summary}\nConcepts: ${ch.key_concepts.join(", ")}`
    )
    .join("\n\n");

  const relevantChunks = batchConfig.focusChapterIndices
    .map((i) => sourceChunks[Math.min(i, sourceChunks.length - 1)])
    .filter(Boolean);

  const result = await chatCompletion(
    [
      {
        role: "system",
        content: `Tu es un expert en pédagogie. Tu crées des flashcards pour un cours e-learning.
Génère exactement ${batchConfig.count} flashcards couvrant les concepts clés.
Tu réponds UNIQUEMENT en JSON valide.`,
      },
      {
        role: "user",
        content: `Cours: "${courseTitle}"

CHAPITRES:
${chapterContext}

SOURCE:
${relevantChunks.map((c) => c.text.substring(0, 6000)).join("\n---\n")}

JSON:
{
  "flashcards": [
    {
      "front": "Question ou terme",
      "back": "Réponse ou définition",
      "tags": ["chapitre_1", "concept_x"],
      "citations": [{"chunk_index": 0, "text": "extrait court"}]
    }
  ]
}

Règles:
- Couvrir concepts, définitions, processus et formules clés
- front: question précise ou terme à définir
- back: réponse concise mais complète
- tags: chapitres et thèmes concernés
- citations: extrait court (max 80 car.) du source`,
      },
    ],
    { model: "gpt-4o-mini", temperature: 0.5, max_tokens: 4000, json: true }
  );

  return parseJsonResponse<GeneratedGlobalFlashcardsBatch>(result.content);
}

// ============================================================
// V2: Slide Spec Batch Generation
// ============================================================

export async function generateSlideSpecBatch(
  courseTitle: string,
  courseObjectives: string,
  chapters: { title: string; summary: string; key_concepts: string[] }[],
  batchConfig: {
    batchIndex: number;
    totalBatches: number;
    focusChapterIndices: number[];
    includeQuizSlides: boolean;
    includeFlashcardSlides: boolean;
  }
): Promise<GeneratedSlideSpecBatch> {
  const chapterContext = batchConfig.focusChapterIndices
    .map((i) => chapters[i])
    .filter(Boolean)
    .map(
      (ch, idx) =>
        `Chapitre ${batchConfig.focusChapterIndices[idx] + 1} - ${ch.title}:\n${ch.summary}\nConcepts: ${ch.key_concepts.join(", ")}`
    )
    .join("\n\n");

  const isFirst = batchConfig.batchIndex === 0;
  const isLast = batchConfig.batchIndex === batchConfig.totalBatches - 1;

  let extraInstructions = "";
  if (isFirst) extraInstructions += "\n- Commence par une slide de titre (type 'title') avec le titre du cours et les objectifs en sous-titre.";
  if (isLast) {
    extraInstructions += "\n- Termine par une slide récapitulative (type 'recap') résumant les points clés du cours.";
  }

  // Quiz slides: ALWAYS pairs (quiz_question + quiz_answer)
  let quizInstruction = "";
  if (batchConfig.includeQuizSlides) {
    quizInstruction = `\nQUIZ SLIDES (OBLIGATOIRE): Pour chaque question, génère TOUJOURS DEUX slides:
1. type "quiz_question" — question + options SANS révéler la réponse
2. type "quiz_answer" — même question + bonne réponse en évidence + explication
Génère 3-5 paires quiz_question/quiz_answer.`;
  }

  let flashcardInstruction = "";
  if (batchConfig.includeFlashcardSlides) {
    flashcardInstruction = "\n- Ajoute 3-5 slides flashcard (type 'flashcard').";
  }

  const result = await chatCompletion(
    [
      {
        role: "system",
        content: `Tu es un expert en conception de présentations pédagogiques professionnelles. Tu crées des slides riches et détaillées pour un cours e-learning.
Format 16:9. Tu réponds UNIQUEMENT en JSON valide.
QUALITÉ: Chaque slide DOIT contenir AU MINIMUM 3 éléments significatifs. Le contenu total par slide doit dépasser 250 caractères.`,
      },
      {
        role: "user",
        content: `Cours: "${courseTitle}"
Objectifs: ${courseObjectives}

CHAPITRES À COUVRIR:
${chapterContext}

Génère un JSON de slides:
{
  "slides": [
    {
      "type": "content",
      "title": "Titre de la slide",
      "subtitle": "Sous-titre contextuel",
      "elements": [
        {"kind": "text", "x": 0.5, "y": 1.3, "w": 9, "h": 0.8, "text": "Définition ou contexte explicatif détaillé"},
        {"kind": "bullets", "x": 0.5, "y": 2.3, "w": 4.2, "h": 3.5, "bullets": ["Point clé 1 avec explication", "Point clé 2 avec explication", "Point clé 3 avec explication"]},
        {"kind": "table", "x": 5, "y": 2.3, "w": 4.5, "h": 3.5, "bullets": ["Catégorie A: valeur 1", "Catégorie B: valeur 2"]}
      ],
      "speaker_notes": "Notes présentateur détaillées (2-3 phrases minimum)",
      "citations": [{"chunk_index": 0, "text": "réf. source"}]
    }
  ]
}

Types: title, content, two_columns, quiz_question, quiz_answer, flashcard, recap.
Elements: text, bullets, table.
Positions en pouces (16:9 = 10" × 7.5").${extraInstructions}${quizInstruction}${flashcardInstruction}

RÈGLES STRICTES:
- MINIMUM 5 slides par chapitre (idéal: 6-8)
- Chaque slide DOIT avoir AU MOINS 3 éléments (text + bullets + table ou text + 2x bullets)
- Chaque chapitre DOIT inclure:
  * 1+ slide de définitions/concepts (text explicatif + bullets)
  * 1+ slide d'exemples concrets ou cas pratiques
  * 1+ slide avec tableau comparatif/récapitulatif (element kind "table")
  * 1+ slide de processus/étapes numérotées
- Bullets informatifs (10-15 mots par point, pas juste des mots-clés)
- Speaker notes OBLIGATOIRES et détaillées
- Total: 15-30 slides pour ce lot`,
      },
    ],
    { model: "gpt-4o-mini", temperature: 0.5, max_tokens: 8000, json: true }
  );

  return parseJsonResponse<GeneratedSlideSpecBatch>(result.content);
}

// ============================================================
// Content Enrichment (when source content is too thin)
// ============================================================

export interface EnrichedChapterContent {
  enriched_markdown: string;
  was_enriched: boolean;
  word_count: number;
}

/**
 * Analyse si le contenu d'un chapitre est trop superficiel (bullet-point/bullshit)
 * et l'enrichit avec du contenu substantiel via GPT-4o.
 */
export async function enrichChapterContent(
  chapterTitle: string,
  chapterSummary: string,
  keyConcepts: string[],
  existingContent: string,
  courseTitle: string,
  courseObjectives: string
): Promise<EnrichedChapterContent> {
  const wordCount = existingContent.trim().split(/\s+/).length;

  // Si le contenu est déjà dense (>300 mots), pas besoin d'enrichir
  if (wordCount > 300) {
    return { enriched_markdown: existingContent, was_enriched: false, word_count: wordCount };
  }

  const result = await chatCompletion(
    [
      {
        role: "system",
        content: `Tu es un expert en création de contenu pédagogique riche et engageant pour la formation professionnelle.
Tu reçois un contenu de chapitre qui est trop superficiel (trop de bullet-points, pas assez de substance).
Tu dois l'enrichir considérablement avec :
- Des explications détaillées et claires
- Des exemples concrets du monde professionnel
- Des définitions précises des concepts clés
- Des cas pratiques et mises en situation
- Des tableaux comparatifs quand pertinent
- Des étapes de processus détaillées

Le résultat doit être en Markdown structuré, prêt pour une présentation Gamma.
MINIMUM 800 mots de contenu riche et pédagogique.`,
      },
      {
        role: "user",
        content: `Cours : "${courseTitle}"
Objectifs : ${courseObjectives}

Chapitre : "${chapterTitle}"
Résumé : ${chapterSummary}
Concepts clés : ${keyConcepts.join(", ")}

CONTENU ACTUEL (trop superficiel, ${wordCount} mots) :
---
${existingContent}
---

Enrichis ce contenu en gardant la même structure mais en ajoutant beaucoup plus de substance.
Format : Markdown structuré avec titres H2/H3, listes, tableaux, exemples.`,
      },
    ],
    { model: "gpt-4o", temperature: 0.5, max_tokens: 3000 }
  );

  const enrichedWordCount = result.content.trim().split(/\s+/).length;
  return {
    enriched_markdown: result.content,
    was_enriched: true,
    word_count: enrichedWordCount,
  };
}

// ============================================================
// Gamma Prompt Content Generation — FULL COURSE (single deck)
// Produces one unified storyboard for a SINGLE Gamma API call
// ============================================================

/**
 * Génère le contenu markdown optimisé Gamma pour TOUT le cours en un seul bloc.
 * Chaque chapitre est clairement séparé par un H1, ce qui permet à Gamma
 * de créer un deck unique. On peut ensuite mapper les chapitres à des plages de slides.
 */
export async function generateGammaFullCourseContent(
  courseTitle: string,
  chapters: { title: string; contentMarkdown: string; key_concepts: string[] }[]
): Promise<string> {
  const chapterBlocks = chapters
    .map(
      (ch, i) =>
        `--- CHAPITRE ${i + 1} : ${ch.title} ---\nConcepts clés : ${ch.key_concepts.join(", ")}\n\nContenu :\n${ch.contentMarkdown.substring(0, 10000)}`
    )
    .join("\n\n");

  const result = await chatCompletion(
    [
      {
        role: "system",
        content: `Tu es un expert en création de présentations pédagogiques pour Gamma App.
Tu génères un storyboard COMPLET en markdown pour un cours entier, en un seul document.
Gamma excelle avec : titres H1/H2, tableaux markdown, listes, étapes numérotées, exemples, citations.

RÈGLES CRITIQUES :
- Commence par UNE SEULE slide de titre du cours (H1 avec le titre du cours + objectifs)
- Pour CHAQUE chapitre, utilise un H1 "# Chapitre X : Titre" comme séparateur clair
- Sous chaque H1 de chapitre, génère EXACTEMENT 6 sous-sections H2 avec du contenu riche
- Les 6 H2 par chapitre doivent couvrir : introduction, concepts clés, exemples, approfondissement, tableau récapitulatif, points essentiels à retenir
- Termine par UNE SEULE slide H1 "# Conclusion" avec un récapitulatif global
- Le markdown doit être propre et bien structuré pour Gamma
- IMPORTANT : Chaque H1 = début d'une nouvelle section Gamma (carte de titre)
- CRITIQUE : Respecter EXACTEMENT 6 H2 par chapitre, ni plus ni moins`,
      },
      {
        role: "user",
        content: `Cours : "${courseTitle}" — ${chapters.length} chapitres

${chapterBlocks}

Transforme tout ce contenu en UN SEUL storyboard Gamma unifié.
Structure OBLIGATOIRE : 1 slide titre cours (H1) + pour chaque chapitre [1 H1 titre + exactement 6 H2] + 1 slide conclusion (H1).
Total attendu : ${1 + chapters.length * 7 + 1} sections (1 titre + ${chapters.length}×7 + 1 conclusion).`,
      },
    ],
    { model: "gpt-4o-mini", temperature: 0.4, max_tokens: 8000 }
  );

  return result.content;
}

// ============================================================
// Gamma Prompt Content Generation — PER CHAPTER (legacy)
// Produces a "presentation-ready" storyboard for Gamma API
// ============================================================

/**
 * Génère le contenu markdown optimisé Gamma pour UN chapitre spécifique.
 * Le contenu est plus riche et détaillé qu'un simple résumé.
 */
export async function generateGammaChapterContent(
  courseTitle: string,
  chapterTitle: string,
  chapterContent: string,
  keyConcepts: string[],
  chapterIndex: number,
  totalChapters: number
): Promise<string> {
  const result = await chatCompletion(
    [
      {
        role: "system",
        content: `Tu es un expert en création de présentations pédagogiques pour Gamma App.
Tu génères un storyboard RICHE en markdown pour UN chapitre de cours.
Gamma excelle avec : titres H1/H2, tableaux markdown, listes, étapes numérotées, exemples, citations.

RÈGLES :
- Génère 6 à 10 "cards" (sections séparées par des H2)
- Chaque card doit avoir du contenu substantiel (pas juste des bullet-points)
- Inclure au moins 1 tableau comparatif/récapitulatif
- Inclure des exemples concrets
- Inclure une slide de résumé des points clés à la fin
- Le markdown doit être propre et bien structuré pour Gamma`,
      },
      {
        role: "user",
        content: `Cours : "${courseTitle}" — Chapitre ${chapterIndex + 1}/${totalChapters}

# ${chapterTitle}
Concepts clés : ${keyConcepts.join(", ")}

CONTENU DU CHAPITRE :
---
${chapterContent.substring(0, 15000)}
---

Transforme ce contenu en un storyboard Gamma riche et visuellement attractif.
Structure en cartes (H2) avec du contenu développé.`,
      },
    ],
    { model: "gpt-4o", temperature: 0.4, max_tokens: 5000 }
  );

  return result.content;
}

// ============================================================
// Gamma Prompt Content Generation (full course — legacy)
// Produces a "presentation-ready" storyboard for Gamma API
// ============================================================

export async function generateGammaPromptContent(
  courseTitle: string,
  courseObjectives: string,
  chapters: { title: string; summary: string; key_concepts: string[] }[],
  quizQuestions?: { question: string; options: string[]; correct_index: number; explanation: string }[]
): Promise<string> {
  const chapterList = chapters
    .map(
      (ch, i) =>
        `## Chapitre ${i + 1} : ${ch.title}\n${ch.summary}\nConcepts clés : ${ch.key_concepts.join(", ")}`
    )
    .join("\n\n");

  const quizSection =
    quizQuestions && quizQuestions.length > 0
      ? "\n\n## Quiz de validation\n" +
        quizQuestions
          .slice(0, 5)
          .map(
            (q, i) =>
              `**Q${i + 1}. ${q.question}**\n` +
              q.options.map((opt, j) => `- ${String.fromCharCode(65 + j)}) ${opt}`).join("\n") +
              `\n*(Réponse : ${String.fromCharCode(65 + q.correct_index)} — ${q.explanation})*`
          )
          .join("\n\n")
      : "";

  const result = await chatCompletion(
    [
      {
        role: "system",
        content: `Tu es un expert en création de présentations pédagogiques professionnelles pour Gamma App.
Tu génères un storyboard riche en markdown structuré, optimisé pour Gamma (titres H1/H2/H3, tableaux, listes, exemples, étapes numérotées).
Gamma excelle avec : tableaux comparatifs, listes à puces, étapes (1-2-3), exemples concrets, citations.
Génère DU CONTENU RICHE : au minimum 5-8 cards par chapitre, avec tableaux, exemples, cas pratiques.`,
      },
      {
        role: "user",
        content: `Cours : "${courseTitle}"
Objectifs : ${courseObjectives}

${chapterList}
${quizSection}

Génère un storyboard Gamma complet en markdown.
Structure requise :
1. Slide titre + sous-titre + objectifs (bullet points)
2. Pour chaque chapitre (minimum 5-8 slides) :
   - Slide introduction avec contexte
   - 1-2 slides de définitions/concepts avec tableau si possible
   - 1 slide d'exemples concrets (cas pratique avec tableau comparatif)
   - 1 slide d'étapes numérotées (processus)
   - 1 slide de points clés (bullets synthétiques)
   - 1 slide récapitulative du chapitre
3. Quiz : pour chaque question, slide "Q: ?" puis slide "Réponse : ✓"
4. Slide conclusion + récapitulatif global

IMPORTANT : Ne pas juste résumer, développer avec du contenu substantiel.
Tableaux : utiliser la syntaxe markdown | Col1 | Col2 | pour Gamma.
Exemples : toujours avec contexte professionnel réel.`,
      },
    ],
    { model: "gpt-4o", temperature: 0.4, max_tokens: 6000 }
  );

  return result.content;
}
