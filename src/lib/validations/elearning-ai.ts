/**
 * Schémas Zod pour valider les sorties IA du module e-learning (tâche B3).
 *
 * Philosophie : tolérance maximale pour éviter les faux rejets.
 * - .passthrough() sur tous les objets → champs inconnus acceptés
 * - .optional() sur tout champ dont l'absence ne casse pas le flux
 * - .min(1) / required UNIQUEMENT sur les champs structurellement indispensables
 *   (ex. un quiz sans question = inutilisable ; une question sans texte = inutilisable)
 *
 * Champs obligatoires retenus par schéma (voir rapport final) :
 * - outlineSchema        : title, chapters (non vide), chapters[].title, chapters[].key_concepts
 * - chapterContentSchema : title, sections (non vide), sections[].title, sections[].content_html
 * - quizDataSchema       : quiz_questions (non vide), quiz_questions[].question, quiz_questions[].options (≥2), quiz_questions[].correct_answer, flashcards
 * - finalExamBatchSchema : questions (non vide), questions[].question, questions[].correct_answer
 */

import { z } from "zod";

// ─── CourseOutline ────────────────────────────────────────────────────────────

const chapterOutlineSchema = z
  .object({
    id: z.number().optional(),
    title: z.string().min(1),
    summary: z.string().optional(),
    key_concepts: z.array(z.string()),
    estimated_duration_minutes: z.number().optional(),
  })
  .passthrough();

export const outlineSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    objectives: z.string().optional(),
    target_audience: z.string().optional(),
    prerequisites: z.string().optional(),
    estimated_duration_minutes: z.number().optional(),
    chapters: z.array(chapterOutlineSchema).min(1),
  })
  .passthrough();

export type OutlineOutput = z.infer<typeof outlineSchema>;

// ─── GeneratedChapterContent ──────────────────────────────────────────────────

const chapterSectionSchema = z
  .object({
    title: z.string().min(1),
    content_html: z.string().min(1),
    key_points: z.array(z.string()).optional(),
  })
  .passthrough();

export const chapterContentSchema = z
  .object({
    title: z.string().min(1),
    introduction: z.string().optional(),
    sections: z.array(chapterSectionSchema).min(1),
    summary: z.string().optional(),
    duration_minutes: z.number().optional(),
  })
  .passthrough();

export type ChapterContentOutput = z.infer<typeof chapterContentSchema>;

// ─── GeneratedQuizData ────────────────────────────────────────────────────────

const quizQuestionSchema = z
  .object({
    chapter_index: z.number().optional(),
    question: z.string().min(1),
    type: z.string().optional(),
    // options obligatoire uniquement pour multiple_choice — on exige ≥2 si présent
    options: z.array(z.string()).min(2).optional(),
    correct_answer: z.union([z.number(), z.boolean(), z.string()]),
    explanation: z.string().optional(),
  })
  .passthrough();

const flashcardSchema = z
  .object({
    chapter_index: z.number().optional(),
    front: z.string().min(1),
    back: z.string().min(1),
  })
  .passthrough();

export const quizDataSchema = z
  .object({
    quiz_questions: z.array(quizQuestionSchema).min(1),
    flashcards: z.array(flashcardSchema),
  })
  .passthrough();

export type QuizDataOutput = z.infer<typeof quizDataSchema>;

// ─── GeneratedFinalExamBatch ──────────────────────────────────────────────────

const citationSchema = z
  .object({
    chunk_index: z.number().optional(),
    text: z.string().optional(),
  })
  .passthrough();

const finalExamQuestionSchema = z
  .object({
    question: z.string().min(1),
    type: z.string().optional(),
    options: z.array(z.string()).min(2).optional(),
    correct_answer: z.union([z.number(), z.boolean(), z.string()]),
    explanation: z.string().optional(),
    difficulty: z.number().optional(),
    topic: z.string().optional(),
    objective_ref: z.string().optional(),
    estimated_time_sec: z.number().optional(),
    citations: z.array(citationSchema).optional(),
  })
  .passthrough();

export const finalExamBatchSchema = z
  .object({
    questions: z.array(finalExamQuestionSchema).min(1),
  })
  .passthrough();

export type FinalExamBatchOutput = z.infer<typeof finalExamBatchSchema>;
