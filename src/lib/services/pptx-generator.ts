import PptxGenJS from "pptxgenjs";
import type { SlideSpec } from "@/lib/types/elearning";

const COLORS = {
  primary: "2563EB",
  secondary: "7C3AED",
  dark: "1E293B",
  gray: "64748B",
  light: "F1F5F9",
  white: "FFFFFF",
  green: "059669",
  red: "DC2626",
};

export async function generatePptxBuffer(slideSpec: SlideSpec): Promise<ArrayBuffer> {
  const pptx = new PptxGenJS();
  const deck = slideSpec.deck;

  // Set presentation properties
  pptx.layout = "LAYOUT_WIDE"; // 16:9
  pptx.author = "MR FORMATION - IA";
  pptx.title = deck.title;

  const fontFamily = deck.theme?.font_family || "Calibri";

  for (const slide of deck.slides) {
    const pptSlide = pptx.addSlide();

    // Background based on slide type
    if (slide.type === "title") {
      pptSlide.background = { color: COLORS.primary };
    } else if (slide.type === "recap") {
      pptSlide.background = { color: COLORS.dark };
    } else if (slide.type === "quiz_question") {
      pptSlide.background = { color: COLORS.secondary };
    } else if (slide.type === "flashcard") {
      pptSlide.background = { color: COLORS.light };
    }

    // Title
    if (slide.title) {
      const isLight = ["title", "recap", "quiz_question", "quiz_answer"].includes(slide.type);
      pptSlide.addText(slide.title, {
        x: 0.5,
        y: slide.type === "title" ? 2.5 : 0.3,
        w: 9,
        h: slide.type === "title" ? 1.5 : 0.8,
        fontSize: slide.type === "title" ? 32 : 24,
        fontFace: fontFamily,
        bold: true,
        color: isLight ? COLORS.white : COLORS.dark,
        align: slide.type === "title" ? "center" : "left",
      });
    }

    // Subtitle
    if (slide.subtitle) {
      const isLight = ["title", "recap", "quiz_question"].includes(slide.type);
      pptSlide.addText(slide.subtitle, {
        x: 0.5,
        y: slide.type === "title" ? 4.0 : 1.0,
        w: 9,
        h: 0.6,
        fontSize: 16,
        fontFace: fontFamily,
        color: isLight ? "CBDBFC" : COLORS.gray,
        align: slide.type === "title" ? "center" : "left",
      });
    }

    // Elements
    for (const el of slide.elements || []) {
      const x = el.x || 0.5;
      const y = el.y || 1.5;
      const w = el.w || 9;
      const h = el.h || 4.5;

      if (el.kind === "text" && el.text) {
        pptSlide.addText(el.text, {
          x, y, w, h,
          fontSize: 16,
          fontFace: fontFamily,
          color: slide.type === "recap" ? COLORS.white : COLORS.dark,
          valign: "top",
        });
      } else if (el.kind === "bullets" && el.bullets) {
        const isLight = ["recap", "quiz_question", "quiz_answer"].includes(slide.type);
        pptSlide.addText(
          el.bullets.map((b) => ({
            text: b,
            options: {
              bullet: true,
              fontSize: 16,
              fontFace: fontFamily,
              color: isLight ? COLORS.white : COLORS.dark,
              breakLine: true,
              paraSpaceAfter: 8,
            },
          })),
          { x, y, w, h, valign: "top" }
        );
      } else if (el.kind === "table" && el.bullets) {
        // Use bullets as simple table rows
        const rows = el.bullets.map((b) => [{ text: b, options: { fontSize: 14, fontFace: fontFamily } }]);
        if (rows.length > 0) {
          pptSlide.addTable(rows as PptxGenJS.TableRow[], {
            x, y, w, h: Math.min(h, rows.length * 0.5),
            fontSize: 14,
            fontFace: fontFamily,
          });
        }
      }
    }

    // Speaker notes
    if (slide.speaker_notes) {
      pptSlide.addNotes(slide.speaker_notes);
    }

    // Citations footer
    if (slide.citations && slide.citations.length > 0) {
      const citText = slide.citations.map((c) => c.text).join(" | ");
      pptSlide.addText(`Réf: ${citText}`, {
        x: 0.5,
        y: 6.8,
        w: 9,
        h: 0.4,
        fontSize: 8,
        fontFace: fontFamily,
        color: COLORS.gray,
        italic: true,
      });
    }
  }

  // Generate buffer
  const output = await pptx.write({ outputType: "arraybuffer" });
  return output as ArrayBuffer;
}
