import { NextRequest, NextResponse } from "next/server";
import pdf from "pdf-parse";
import { sanitizeError } from "@/lib/api-error";

interface ParsedProgram {
  title: string;
  duration_hours: number;
  duration_days: number;
  target_audience: string;
  prerequisites: string;
  objectives: string[];
  description: string;
  modules: {
    id: number;
    title: string;
    duration_hours: number;
    topics: string[];
  }[];
  pedagogical_resources: string[];
  evaluation_methods: string[];
  certification_details: string;
  satisfaction_rate: string;
  max_participants: string;
}

function parsePdfText(text: string): ParsedProgram {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // ---- TITLE ----
  // Title is usually after the header block (address, email, tel, url) and before "Durée:"
  let title = "";
  const dureeIdx = lines.findIndex((l) => /^Dur[ée]+e?\s*:/i.test(l));
  if (dureeIdx > 0) {
    // Walk backwards from Durée to find the title (skip empty/header lines)
    for (let i = dureeIdx - 1; i >= 0; i--) {
      const line = lines[i];
      if (
        line.startsWith("http") ||
        line.startsWith("Tel:") ||
        line.startsWith("Email:") ||
        line.includes("Boulevard") ||
        line.includes("MR FORMATION") ||
        (line.includes("FORMATION") && line.length < 15) ||
        line.includes("SIRET") ||
        line.includes("préfet") ||
        line.includes("pr\u00e9fet") ||
        line.includes("Marseille") ||
        line.includes("contact@") ||
        line.includes("déclaration") ||
        line.includes("Version :") ||
        /^\d+$/.test(line)
      ) continue;
      title = line;
      break;
    }
  }

  // ---- DURATION ----
  let duration_hours = 0;
  let duration_days = 0;
  const dureeLine = lines.find((l) => /^Dur[ée]+e?\s*:/i.test(l));
  if (dureeLine) {
    const hMatch = dureeLine.match(/([\d.]+)\s*heure/i);
    const dMatch = dureeLine.match(/([\d.]+)\s*jour/i);
    if (hMatch) duration_hours = parseFloat(hMatch[1]);
    if (dMatch) duration_days = parseFloat(dMatch[1]);
  }

  // ---- TARGET AUDIENCE ----
  let target_audience = "";
  const profilIdx = lines.findIndex((l) => /profil\s+du\s+stagiaire/i.test(l));
  const prereqIdx = lines.findIndex((l) => /^pr[ée]requis$/i.test(l));
  if (profilIdx >= 0 && prereqIdx > profilIdx) {
    target_audience = lines
      .slice(profilIdx + 1, prereqIdx)
      .join(" ")
      .trim();
  }

  // ---- PREREQUISITES ----
  let prerequisites = "";
  if (prereqIdx >= 0) {
    const objIdx = lines.findIndex((l) => /OBJECTIFS\s+PEDAGOGIQUES/i.test(l));
    if (objIdx > prereqIdx) {
      prerequisites = lines
        .slice(prereqIdx + 1, objIdx)
        .join(" ")
        .trim();
    }
  }

  // ---- OBJECTIVES ----
  const objectives: string[] = [];
  const objStartIdx = lines.findIndex((l) => /OBJECTIFS\s+PEDAGOGIQUES/i.test(l));
  const contenuIdx = lines.findIndex((l) => /CONTENU\s*\(PROGRESSION/i.test(l));
  if (objStartIdx >= 0 && contenuIdx > objStartIdx) {
    for (let i = objStartIdx + 1; i < contenuIdx; i++) {
      let line = lines[i].replace(/^[•\-–]\s*/, "").trim();
      if (line) objectives.push(line);
    }
  }

  // ---- CONTENT / MODULES ----
  const orgIdx = lines.findIndex((l) => /^ORGANISATION$/i.test(l));
  const contentLines: string[] = [];
  if (contenuIdx >= 0) {
    const endIdx = orgIdx > contenuIdx ? orgIdx : lines.length;
    for (let i = contenuIdx + 1; i < endIdx; i++) {
      contentLines.push(lines[i]);
    }
  }

  // Parse modules from roman numeral sections
  const modules: ParsedProgram["modules"] = [];
  let currentModule: { id: number; title: string; topics: string[] } | null = null;
  const romanPattern = /^([IVXLC]+)\.\s*(.+)/;

  for (const line of contentLines) {
    const romanMatch = line.match(romanPattern);
    if (romanMatch) {
      if (currentModule) {
        modules.push({
          id: modules.length + 1,
          title: currentModule.title,
          duration_hours: 0,
          topics: currentModule.topics,
        });
      }
      currentModule = {
        id: modules.length + 1,
        title: romanMatch[2].trim(),
        topics: [],
      };
    } else if (currentModule) {
      const cleaned = line.replace(/^[-–•]\s*/, "").trim();
      if (cleaned) currentModule.topics.push(cleaned);
    }
  }
  if (currentModule) {
    modules.push({
      id: modules.length + 1,
      title: currentModule.title,
      duration_hours: 0,
      topics: currentModule.topics,
    });
  }

  // Distribute hours evenly across modules if we have duration
  if (modules.length > 0 && duration_hours > 0) {
    const perModule = Math.round((duration_hours / modules.length) * 100) / 100;
    modules.forEach((m) => (m.duration_hours = perModule));
  }

  // Build description from content
  const description = contentLines.join("\n");

  // ---- PEDAGOGICAL RESOURCES ----
  const pedagogical_resources: string[] = [];
  const moyensIdx = lines.findIndex((l) => /moyens\s+p[ée]dagogiques\s+et\s+techniques/i.test(l));
  const dispositifIdx = lines.findIndex((l) => /dispositif\s+de\s+suivi/i.test(l));
  if (moyensIdx >= 0) {
    const endIdx = dispositifIdx > moyensIdx ? dispositifIdx : (orgIdx > moyensIdx ? orgIdx + 20 : lines.length);
    for (let i = moyensIdx + 1; i < endIdx; i++) {
      const l = lines[i].trim();
      if (!l || /^(dispositif|certification|qualit|indicateur|taux|nombre|accessib)/i.test(l)) break;
      pedagogical_resources.push(l);
    }
  }

  // ---- EVALUATION METHODS ----
  const evaluation_methods: string[] = [];
  if (dispositifIdx >= 0) {
    const certIdx = lines.findIndex((l, idx) => idx > dispositifIdx && /certification\/dipl[ôo]me/i.test(l));
    const endIdx = certIdx > dispositifIdx ? certIdx : lines.length;
    for (let i = dispositifIdx + 1; i < endIdx; i++) {
      const l = lines[i].trim();
      if (!l || /^(certification|qualit)/i.test(l)) break;
      evaluation_methods.push(l);
    }
  }

  // ---- CERTIFICATION ----
  let certification_details = "";
  const certDetailIdx = lines.findIndex((l) => /d[ée]tails\s+sur\s+la\s+certification/i.test(l));
  if (certDetailIdx >= 0) {
    const qualIdx = lines.findIndex((l, idx) => idx > certDetailIdx && /^qualit[ée]$/i.test(l));
    if (qualIdx > certDetailIdx) {
      certification_details = lines.slice(certDetailIdx + 1, qualIdx).join(" ").trim();
    }
  }

  // ---- SATISFACTION / PARTICIPANTS ----
  let satisfaction_rate = "";
  let max_participants = "";
  const satLine = lines.find((l) => /taux\s+de\s+satisfaction/i.test(l));
  if (satLine) {
    const m = satLine.match(/([\d.,]+)\s*%/);
    if (m) satisfaction_rate = m[1] + " %";
  }
  const partLine = lines.find((l) => /nombre\s+de\s+stagiaires/i.test(l));
  if (partLine) {
    max_participants = partLine.replace(/.*:\s*/, "").trim();
  }

  return {
    title,
    duration_hours,
    duration_days,
    target_audience,
    prerequisites,
    objectives,
    description,
    modules,
    pedagogical_resources,
    evaluation_methods,
    certification_details,
    satisfaction_rate,
    max_participants,
  };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("pdf") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Aucun fichier PDF fourni" }, { status: 400 });
    }

    // Parse PDF - strip any bytes before %PDF- header (some files have corrupted headers)
    let buffer = Buffer.from(await file.arrayBuffer());
    const pdfHeaderIdx = buffer.indexOf("%PDF-");
    if (pdfHeaderIdx > 0) {
      buffer = buffer.subarray(pdfHeaderIdx);
    }
    const pdfData = await pdf(buffer);
    console.log("[PDF Import] Raw text (first 500):", JSON.stringify(pdfData.text.substring(0, 500)));
    const parsed = parsePdfText(pdfData.text);
    console.log("[PDF Import] Parsed title:", JSON.stringify(parsed.title));
    console.log("[PDF Import] Duration:", parsed.duration_hours, "h /", parsed.duration_days, "j");
    console.log("[PDF Import] Modules:", parsed.modules.length);

    if (!parsed.title) {
      return NextResponse.json(
        { error: "Impossible d'extraire le titre du PDF", parsed },
        { status: 422 }
      );
    }

    return NextResponse.json({ parsed });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: sanitizeError(err, "programs/import-pdf") },
      { status: 500 }
    );
  }
}
