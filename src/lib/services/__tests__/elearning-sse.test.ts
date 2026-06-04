import { describe, it, expect, vi } from "vitest";
import { createSseSender, type ElearningGenerationEvent } from "../elearning-sse";

function makeController() {
  const chunks: Uint8Array[] = [];
  return {
    chunks,
    controller: {
      enqueue: vi.fn((c: Uint8Array) => chunks.push(c)),
    } as unknown as ReadableStreamDefaultController<Uint8Array>,
  };
}

function decode(chunks: Uint8Array[]): string {
  const dec = new TextDecoder();
  return chunks.map((c) => dec.decode(c)).join("");
}

function parseSse(raw: string): ElearningGenerationEvent[] {
  return raw
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const line = block.replace(/^data:\s*/, "");
      return JSON.parse(line) as ElearningGenerationEvent;
    });
}

describe("createSseSender", () => {
  it("encode un event au format SSE valide `data: {json}\\n\\n`", () => {
    const { chunks, controller } = makeController();
    const send = createSseSender(controller);
    send("outline", 25, "Génération du plan");
    const raw = decode(chunks);
    expect(raw.startsWith("data: ")).toBe(true);
    expect(raw.endsWith("\n\n")).toBe(true);
  });

  it("inclut tous les champs (step, progress, message, data)", () => {
    const { chunks, controller } = makeController();
    const send = createSseSender(controller);
    send("chapter", 50, "Chapitre 2/4", { chapter_id: "abc" });
    const events = parseSse(decode(chunks));
    expect(events[0]).toEqual({
      step: "chapter",
      progress: 50,
      message: "Chapitre 2/4",
      data: { chapter_id: "abc" },
    });
  });

  it("message et data sont optionnels (undefined sérialisé absent)", () => {
    const { chunks, controller } = makeController();
    const send = createSseSender(controller);
    send("ping", 10);
    const events = parseSse(decode(chunks));
    expect(events[0].step).toBe("ping");
    expect(events[0].progress).toBe(10);
    expect(events[0].message).toBeUndefined();
    expect(events[0].data).toBeUndefined();
  });

  it("supporte plusieurs events séquentiels", () => {
    const { chunks, controller } = makeController();
    const send = createSseSender(controller);
    send("a", 10);
    send("b", 50);
    send("c", 100);
    const events = parseSse(decode(chunks));
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.step)).toEqual(["a", "b", "c"]);
  });

  it("appelle bien controller.enqueue à chaque send", () => {
    const { controller } = makeController();
    const enqueue = controller.enqueue as unknown as ReturnType<typeof vi.fn>;
    const send = createSseSender(controller);
    send("x", 1);
    send("y", 2);
    expect(enqueue).toHaveBeenCalledTimes(2);
  });
});
