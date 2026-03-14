// ===== E-LEARNING COURSE TYPES =====

export type CourseStatus = "processing" | "draft" | "review" | "published" | "archived";
export type GenerationStatus = "pending" | "extracting" | "generating" | "completed" | "failed";
export type DifficultyLevel = "beginner" | "intermediate" | "advanced";
export type QuestionType = "multiple_choice" | "true_false" | "short_answer";
export type EnrollmentStatus = "enrolled" | "in_progress" | "completed";

export interface ElearningCourse {
  id: string;
  entity_id: string;
  program_id: string | null;
  created_by: string | null;
  source_file_name: string | null;
  source_file_url: string | null;
  source_file_type: string | null;
  extracted_text: string | null;
  title: string;
  description: string | null;
  objectives: string | null;
  thumbnail_url: string | null;
  estimated_duration_minutes: number;
  status: CourseStatus;
  generation_status: GenerationStatus;
  generation_error: string | null;
  generation_log: GenerationLogEntry[];
  language: string;
  difficulty_level: DifficultyLevel;
  final_quiz_target_count: number;
  flashcards_target_count: number;
  final_exam_passing_score: number;
  created_at: string;
  updated_at: string;
  // Joined
  chapters?: ElearningChapter[];
  final_exam_questions?: ElearningFinalExamQuestion[];
  global_flashcards?: ElearningGlobalFlashcard[];
  _enrollment_count?: number;
}

export interface GenerationLogEntry {
  step: string;
  timestamp: string;
  message?: string;
}

export interface ElearningChapter {
  id: string;
  course_id: string;
  title: string;
  summary: string | null;
  content_html: string | null;
  content_markdown: string | null;
  key_concepts: string[];
  order_index: number;
  estimated_duration_minutes: number;
  // Gamma per-chapter presentation
  gamma_deck_id: string | null;
  gamma_deck_url: string | null;
  gamma_embed_url: string | null;
  gamma_export_pdf: string | null;
  gamma_export_pptx: string | null;
  gamma_prompt_content: string | null;
  is_enriched: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  quiz?: ElearningQuiz;
  flashcards?: ElearningFlashcard[];
}

export interface ElearningQuiz {
  id: string;
  chapter_id: string;
  title: string;
  passing_score: number;
  created_at: string;
  questions?: ElearningQuizQuestion[];
}

export interface ElearningQuizQuestion {
  id: string;
  quiz_id: string;
  question_text: string;
  question_type: QuestionType;
  options: QuizOption[];
  explanation: string | null;
  order_index: number;
  created_at: string;
}

export interface QuizOption {
  text: string;
  is_correct: boolean;
}

export interface ElearningFlashcard {
  id: string;
  chapter_id: string;
  front_text: string;
  back_text: string;
  order_index: number;
  created_at: string;
}

export interface ElearningEnrollment {
  id: string;
  course_id: string;
  learner_id: string;
  status: EnrollmentStatus;
  started_at: string | null;
  completed_at: string | null;
  completion_rate: number;
  enrolled_at: string;
  // Joined
  learner?: { id: string; first_name: string | null; last_name: string | null; email: string | null };
  course?: ElearningCourse;
  chapter_progress?: ElearningChapterProgress[];
}

export interface ElearningChapterProgress {
  id: string;
  enrollment_id: string;
  chapter_id: string;
  is_completed: boolean;
  completed_at: string | null;
  time_spent_seconds: number;
  quiz_score: number | null;
  quiz_passed: boolean;
  quiz_attempts: number;
  last_quiz_answers: Record<string, number | string> | null;
  created_at: string;
  updated_at: string;
}

// ===== V2: Final Exam =====

export interface Citation {
  chunk_index: number;
  text: string;
}

export interface ElearningFinalExamQuestion {
  id: string;
  course_id: string;
  question_text: string;
  question_type: QuestionType;
  options: QuizOption[];
  correct_answer: string | null;
  explanation: string | null;
  difficulty: number;
  topic: string | null;
  objective_ref: string | null;
  estimated_time_sec: number;
  citations: Citation[];
  tags: string[];
  order_index: number;
  created_at: string;
}

export interface ElearningGlobalFlashcard {
  id: string;
  course_id: string;
  front_text: string;
  back_text: string;
  tags: string[];
  citations: Citation[];
  order_index: number;
  created_at: string;
}

export interface ElearningFinalExamProgress {
  id: string;
  enrollment_id: string;
  score: number | null;
  passed: boolean;
  attempts: number;
  last_answers: Record<string, { answer: string | number | boolean; is_correct: boolean }> | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ===== V2: Slide Deck =====

export interface SlideTheme {
  aspect_ratio: "16:9";
  font_family: string;
  title_style: string;
  body_style: string;
}

export interface SlideElement {
  kind: "text" | "bullets" | "image" | "shape" | "table";
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  bullets?: string[];
  image_asset_ref?: string | null;
}

export interface Slide {
  slide_id: string;
  type: "title" | "content" | "two_columns" | "image" | "quiz_question" | "quiz_answer" | "flashcard" | "recap";
  title: string;
  subtitle: string | null;
  elements: SlideElement[];
  speaker_notes: string;
  citations: Citation[];
}

export interface SlideSpec {
  deck: {
    title: string;
    theme: SlideTheme;
    slides: Slide[];
  };
}

export interface ElearningSlideSpec {
  id: string;
  course_id: string;
  slide_spec: SlideSpec;
  version: number;
  created_at: string;
}

// ===== V2: Live Sessions =====

export interface ElearningLiveSession {
  id: string;
  course_id: string;
  presenter_id: string | null;
  status: "active" | "ended";
  current_slide_index: number;
  current_state: Record<string, unknown>;
  started_at: string;
  ended_at: string | null;
}

// ===== AI Generation Types =====

export interface CourseOutline {
  title: string;
  description: string;
  objectives: string;
  target_audience: string;
  prerequisites: string;
  estimated_duration_minutes: number;
  chapters: ChapterOutline[];
}

export interface ChapterOutline {
  id: number;
  title: string;
  summary: string;
  key_concepts: string[];
  estimated_duration_minutes: number;
}

export interface GeneratedChapterContent {
  title: string;
  introduction: string;
  sections: {
    title: string;
    content_html: string;
    key_points: string[];
  }[];
  summary: string;
  duration_minutes: number;
}

export interface GeneratedQuizData {
  quiz_questions: {
    chapter_index: number;
    question: string;
    type: QuestionType;
    options?: string[];
    correct_answer: number | boolean;
    explanation: string;
  }[];
  flashcards: {
    chapter_index: number;
    front: string;
    back: string;
  }[];
}

export interface GeneratedFinalExamBatch {
  questions: {
    question: string;
    type: QuestionType;
    options?: string[];
    correct_answer: number | boolean | string;
    explanation: string;
    difficulty: number;
    topic: string;
    objective_ref: string;
    estimated_time_sec: number;
    citations: Citation[];
  }[];
}

export interface GeneratedGlobalFlashcardsBatch {
  flashcards: {
    front: string;
    back: string;
    tags: string[];
    citations: Citation[];
  }[];
}

export interface GeneratedSlideSpecBatch {
  slides: {
    type: Slide["type"];
    title: string;
    subtitle: string | null;
    elements: SlideElement[];
    speaker_notes: string;
    citations: Citation[];
  }[];
}

// ===== SSE Events =====

export interface GenerationProgressEvent {
  step: string;
  progress: number;
  message?: string;
  data?: unknown;
  error?: string;
}
