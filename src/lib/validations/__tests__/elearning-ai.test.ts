import { describe, it, expect } from "vitest";
import {
  outlineSchema,
  chapterContentSchema,
  quizDataSchema,
  finalExamBatchSchema,
} from "../elearning-ai";

// ─── outlineSchema ────────────────────────────────────────────────────────────

describe("outlineSchema", () => {
  const validOutline = {
    title: "Introduction au droit social en entreprise",
    description: "Cours couvrant les bases du droit du travail pour managers.",
    objectives: "1 - Identifier les obligations légales\n2 - Gérer les contrats de travail",
    target_audience: "Managers RH et chefs d'équipe",
    prerequisites: "Aucun",
    estimated_duration_minutes: 45,
    chapters: [
      {
        id: 1,
        title: "Le contrat de travail",
        summary: "Types et clauses essentielles du contrat de travail",
        key_concepts: ["CDI", "CDD", "clause de non-concurrence"],
        estimated_duration_minutes: 10,
      },
      {
        id: 2,
        title: "La durée du travail",
        summary: "Règles sur le temps de travail et les heures supplémentaires",
        key_concepts: ["35h", "heures sup", "forfait jour"],
        estimated_duration_minutes: 12,
      },
    ],
  };

  it("accepte un outline réaliste complet", () => {
    expect(outlineSchema.safeParse(validOutline).success).toBe(true);
  });

  it("accepte un outline minimal (sans champs optionnels)", () => {
    const minimal = {
      title: "Titre du cours",
      chapters: [
        { title: "Chapitre 1", key_concepts: ["concept A"] },
      ],
    };
    expect(outlineSchema.safeParse(minimal).success).toBe(true);
  });

  it("laisse passer les champs inconnus (.passthrough)", () => {
    const withExtra = { ...validOutline, extra_field_from_ai: "quelque chose" };
    expect(outlineSchema.safeParse(withExtra).success).toBe(true);
  });

  it("rejette un outline sans chapters", () => {
    const bad = { ...validOutline, chapters: [] };
    expect(outlineSchema.safeParse(bad).success).toBe(false);
  });

  it("rejette un outline sans title", () => {
    const bad = { ...validOutline, title: "" };
    expect(outlineSchema.safeParse(bad).success).toBe(false);
  });

  it("rejette un chapitre sans title", () => {
    const bad = {
      ...validOutline,
      chapters: [{ id: 1, title: "", key_concepts: ["x"] }],
    };
    expect(outlineSchema.safeParse(bad).success).toBe(false);
  });
});

// ─── chapterContentSchema ─────────────────────────────────────────────────────

describe("chapterContentSchema", () => {
  const validChapter = {
    title: "Le contrat de travail",
    introduction: "Le contrat de travail est le fondement de la relation salariale.",
    sections: [
      {
        title: "Définition et formes",
        content_html: "<p>Le contrat de travail est un accord entre un employeur et un salarié.</p>",
        key_points: ["CDI = contrat par défaut", "CDD = contrat d'exception"],
      },
      {
        title: "Les clauses essentielles",
        content_html: "<p>Tout contrat doit préciser la rémunération, la durée et les fonctions.</p>",
        key_points: ["Rémunération minimale", "Lieu de travail"],
      },
    ],
    summary: "Le contrat de travail structure la relation employeur-salarié.",
    duration_minutes: 10,
  };

  it("accepte un contenu de chapitre réaliste complet", () => {
    expect(chapterContentSchema.safeParse(validChapter).success).toBe(true);
  });

  it("accepte un chapitre sans champs optionnels", () => {
    const minimal = {
      title: "Chapitre X",
      sections: [
        { title: "Section 1", content_html: "<p>Contenu.</p>" },
      ],
    };
    expect(chapterContentSchema.safeParse(minimal).success).toBe(true);
  });

  it("laisse passer les champs inconnus (.passthrough)", () => {
    const withExtra = { ...validChapter, ai_confidence: 0.95 };
    expect(chapterContentSchema.safeParse(withExtra).success).toBe(true);
  });

  it("rejette un chapitre sans sections", () => {
    const bad = { ...validChapter, sections: [] };
    expect(chapterContentSchema.safeParse(bad).success).toBe(false);
  });

  it("rejette une section avec content_html vide", () => {
    const bad = {
      ...validChapter,
      sections: [{ title: "Section 1", content_html: "" }],
    };
    expect(chapterContentSchema.safeParse(bad).success).toBe(false);
  });
});

// ─── quizDataSchema ───────────────────────────────────────────────────────────

describe("quizDataSchema", () => {
  const validQuizData = {
    quiz_questions: [
      {
        chapter_index: 0,
        question: "Quel est le contrat de travail le plus courant en France ?",
        type: "multiple_choice",
        options: ["CDI", "CDD", "Intérim", "Stage"],
        correct_answer: 0,
        explanation: "Le CDI est le contrat de droit commun, il est le plus répandu.",
      },
      {
        chapter_index: 0,
        question: "Vrai ou Faux : Le CDD peut être renouvelé indéfiniment.",
        type: "true_false",
        correct_answer: false,
        explanation: "Le CDD ne peut être renouvelé que dans des cas stricts et limités.",
      },
    ],
    flashcards: [
      {
        chapter_index: 0,
        front: "Qu'est-ce qu'un CDI ?",
        back: "Contrat à Durée Indéterminée, contrat de travail sans terme fixé.",
      },
    ],
  };

  it("accepte un quizData réaliste complet", () => {
    expect(quizDataSchema.safeParse(validQuizData).success).toBe(true);
  });

  it("accepte des flashcards vides ([])", () => {
    const withEmpty = { ...validQuizData, flashcards: [] };
    expect(quizDataSchema.safeParse(withEmpty).success).toBe(true);
  });

  it("laisse passer les champs inconnus (.passthrough)", () => {
    const withExtra = { ...validQuizData, metadata: { generated_at: "2026-06-16" } };
    expect(quizDataSchema.safeParse(withExtra).success).toBe(true);
  });

  it("rejette quiz_questions vide", () => {
    const bad = { ...validQuizData, quiz_questions: [] };
    expect(quizDataSchema.safeParse(bad).success).toBe(false);
  });

  it("rejette une question avec 1 seule option (multiple_choice mal formé)", () => {
    const bad = {
      ...validQuizData,
      quiz_questions: [
        { chapter_index: 0, question: "Question ?", type: "multiple_choice", options: ["Une seule option"], correct_answer: 0, explanation: "..." },
      ],
    };
    expect(quizDataSchema.safeParse(bad).success).toBe(false);
  });

  it("accepte une question true_false sans options (options absentes)", () => {
    const trueFalseOnly = {
      quiz_questions: [
        { question: "Affirmation ?", type: "true_false", correct_answer: true, explanation: "..." },
      ],
      flashcards: [],
    };
    expect(quizDataSchema.safeParse(trueFalseOnly).success).toBe(true);
  });
});

// ─── finalExamBatchSchema ─────────────────────────────────────────────────────

describe("finalExamBatchSchema", () => {
  const validBatch = {
    questions: [
      {
        question: "Quelle est la durée légale du travail hebdomadaire en France ?",
        type: "multiple_choice",
        options: ["32 heures", "35 heures", "39 heures", "40 heures"],
        correct_answer: 1,
        explanation: "La durée légale est fixée à 35h par la loi Aubry de 2000.",
        difficulty: 2,
        topic: "Durée du travail",
        objective_ref: "Connaître les seuils légaux de la durée du travail",
        estimated_time_sec: 60,
        citations: [{ chunk_index: 0, text: "La durée légale du travail est de 35 heures." }],
      },
      {
        question: "Vrai ou Faux : La rupture conventionnelle est unilatérale.",
        type: "true_false",
        correct_answer: false,
        explanation: "La rupture conventionnelle est toujours bilatérale, signée par les deux parties.",
        difficulty: 3,
        topic: "Rupture du contrat",
        objective_ref: "Distinguer les modes de rupture du contrat de travail",
        estimated_time_sec: 30,
        citations: [{ chunk_index: 1, text: "La rupture conventionnelle est un accord mutuel." }],
      },
      {
        question: "Définissez la notion de force majeure dans le droit du travail.",
        type: "short_answer",
        correct_answer: "Événement imprévisible, irrésistible et extérieur rendant impossible l'exécution du contrat.",
        explanation: "La force majeure exonère l'employeur de ses obligations si les 3 critères sont réunis.",
        difficulty: 4,
        topic: "Rupture du contrat",
        objective_ref: "Identifier les cas de force majeure",
        estimated_time_sec: 90,
        citations: [{ chunk_index: 2, text: "La force majeure doit être imprévisible et irrésistible." }],
      },
    ],
  };

  it("accepte un batch d'examen réaliste complet", () => {
    expect(finalExamBatchSchema.safeParse(validBatch).success).toBe(true);
  });

  it("accepte des questions sans champs optionnels (citations, difficulty, etc.)", () => {
    const minimal = {
      questions: [
        { question: "Question minimale ?", correct_answer: 0 },
      ],
    };
    expect(finalExamBatchSchema.safeParse(minimal).success).toBe(true);
  });

  it("laisse passer les champs inconnus (.passthrough)", () => {
    const withExtra = { ...validBatch, batch_index: 0, total_batches: 3 };
    expect(finalExamBatchSchema.safeParse(withExtra).success).toBe(true);
  });

  it("rejette questions: [] (tableau vide)", () => {
    const bad = { questions: [] };
    expect(finalExamBatchSchema.safeParse(bad).success).toBe(false);
  });

  it("rejette une question sans texte", () => {
    const bad = {
      questions: [{ question: "", correct_answer: 0 }],
    };
    expect(finalExamBatchSchema.safeParse(bad).success).toBe(false);
  });

  it("rejette une question multiple_choice avec 1 seule option", () => {
    const bad = {
      questions: [
        {
          question: "Question ?",
          type: "multiple_choice",
          options: ["Une seule option"],
          correct_answer: 0,
        },
      ],
    };
    expect(finalExamBatchSchema.safeParse(bad).success).toBe(false);
  });
});
