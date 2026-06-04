/**
 * EL-9 audit BMAD — Helpers SSE pour la génération e-learning.
 *
 * Extraction des primitives SSE de generate/route.ts (auparavant 604 LOC
 * monolithique). Centralise :
 *  - le format d'événement (step, progress, message, data optionnels)
 *  - l'encodage texte SSE (`data: {...}\n\n`)
 *  - la création d'une fonction `send()` liée à un controller donné
 *
 * Le format est public : il est consommé côté client par
 * `src/components/elearning/GenerationProgress.tsx` (EventSource reader).
 * Toute modification doit rester rétro-compatible.
 */

export interface ElearningGenerationEvent {
  /** Étape symbolique : "outline" | "chapter" | "quiz" | "exam" | "gamma" | "complete" | "error" | ... */
  step: string;
  /** Pourcentage de progression 0–100. */
  progress: number;
  /** Message UI court (optionnel). */
  message?: string;
  /** Payload structuré optionnel (par ex. { chapter_id, deck_url }). */
  data?: unknown;
}

/**
 * Renvoie une fonction `send()` liée à un controller de ReadableStream.
 * Encode chaque event au format SSE (`data: <json>\n\n`).
 */
export function createSseSender(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder = new TextEncoder(),
) {
  return function send(
    step: string,
    progress: number,
    message?: string,
    data?: unknown,
  ) {
    const event: ElearningGenerationEvent = { step, progress, message, data };
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  };
}

export type SseSender = ReturnType<typeof createSseSender>;
