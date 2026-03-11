import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { extractText } from "@/lib/services/doc-extraction";

/**
 * POST /api/library-migration
 * Receives a PDF file, extracts text, matches to an existing program,
 * and returns structured content for review.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("entity_id, role")
      .eq("id", user.id)
      .single();
    if (!profile?.entity_id || profile.role !== "admin") {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });
    }

    // Extract text from PDF
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const { text, metadata } = await extractText(buffer, "pdf");

    if (!text || text.trim().length < 50) {
      return NextResponse.json(
        { error: "Le PDF semble vide ou illisible. Essayez avec un PDF non scanné." },
        { status: 400 }
      );
    }

    // Parse the extracted text to find the training title and content
    const parsed = parseProgramContent(text);

    // Fetch all programs to find a match
    const { data: programs, error: pgErr } = await supabase
      .from("programs")
      .select("id, title, description, objectives, content, version")
      .eq("entity_id", profile.entity_id);

    if (pgErr) {
      return NextResponse.json({ error: pgErr.message }, { status: 500 });
    }

    // Try to match by title similarity
    const match = findBestMatch(parsed.title, programs || []);

    return NextResponse.json({
      extracted_text: text.substring(0, 5000), // Preview only
      metadata,
      parsed,
      match: match
        ? { id: match.id, title: match.title, score: match.score, version: match.version }
        : null,
      programs: (programs || []).map((p) => ({ id: p.id, title: p.title })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/library-migration
 * Returns all programs with their migration status
 */
export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("entity_id, role")
      .eq("id", user.id)
      .single();
    if (!profile?.entity_id || profile.role !== "admin") {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    const { data: programs, error } = await supabase
      .from("programs")
      .select("id, title, description, objectives, content, version, is_active, updated_at")
      .eq("entity_id", profile.entity_id)
      .order("title");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Determine migration status for each program
    const result = (programs || []).map((p) => {
      const content = p.content as Record<string, unknown> | null;
      const modules = content?.modules as unknown[] | undefined;
      const hasModules = modules && modules.length > 0;
      // Check if modules have actual topics (not just the default template)
      const hasContent = hasModules && modules.some((m: unknown) => {
        const mod = m as { topics?: string[]; title?: string };
        return mod.topics && mod.topics.length > 0 && mod.title !== "Module 1";
      });
      const hasObjectives = !!(p.objectives && p.objectives.trim().length > 10);
      const hasDescription = !!(p.description && p.description.trim().length > 20);

      let status: "migrated" | "partial" | "empty";
      if (hasContent && hasObjectives) {
        status = "migrated";
      } else if (hasContent || hasObjectives || hasDescription) {
        status = "partial";
      } else {
        status = "empty";
      }

      return {
        id: p.id,
        title: p.title,
        status,
        module_count: modules?.length || 0,
        has_objectives: hasObjectives,
        has_description: hasDescription,
        has_content: !!hasContent,
        is_active: p.is_active,
        updated_at: p.updated_at,
      };
    });

    const migrated = result.filter((r) => r.status === "migrated").length;
    const partial = result.filter((r) => r.status === "partial").length;
    const empty = result.filter((r) => r.status === "empty").length;

    return NextResponse.json({
      programs: result,
      stats: { total: result.length, migrated, partial, empty },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/library-migration
 * Apply extracted content to a program
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("entity_id, role")
      .eq("id", user.id)
      .single();
    if (!profile?.entity_id || profile.role !== "admin") {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    const body = await request.json();
    const { program_id, title, description, objectives, content } = body;

    if (!program_id) {
      return NextResponse.json({ error: "program_id requis" }, { status: 400 });
    }

    // Validate content JSON
    let contentParsed;
    try {
      contentParsed = typeof content === "string" ? JSON.parse(content) : content;
    } catch {
      return NextResponse.json({ error: "Contenu JSON invalide" }, { status: 400 });
    }

    // Update program
    const { error } = await supabase
      .from("programs")
      .update({
        title: title || undefined,
        description: description || undefined,
        objectives: objectives || undefined,
        content: contentParsed,
        updated_at: new Date().toISOString(),
      })
      .eq("id", program_id)
      .eq("entity_id", profile.entity_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---- Parsing helpers ----

interface ParsedProgram {
  title: string;
  description: string;
  objectives: string;
  days: { label: string; modules: { title: string; duration_hours: number; topics: string[] }[] }[];
  duration_hours: number;
  duration_days: number;
  target_audience: string;
  prerequisites: string;
  evaluation_methods: string[];
  pedagogical_resources: string[];
  content: Record<string, unknown>;
}

function parseProgramContent(text: string): ParsedProgram {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Try to find the title: it's the line just before "Durée:" in MR FORMATION PDFs
  let title = "";
  let titleIdx = 0;
  const dureeLineIdx = lines.findIndex((l) => /^Dur[ée]+e?\s*:/i.test(l));

  if (dureeLineIdx > 0) {
    // Walk backwards from Durée to find the title (skip header/boilerplate lines)
    for (let i = dureeLineIdx - 1; i >= 0; i--) {
      const line = lines[i];
      if (
        line.length < 5 ||
        /^\d+$/.test(line) ||
        /^(MR|C3V)\s*(FORMATION|formation)/i.test(line) ||
        (line.includes("FORMATION") && line.length < 15) ||
        /programme\s*(de\s*)?formation/i.test(line) ||
        /^\d{1,2}\s*(jour|heure|h)/i.test(line) ||
        line.startsWith("http") ||
        line.startsWith("Tel:") ||
        line.startsWith("Email:") ||
        line.includes("Boulevard") ||
        line.includes("Marseille") ||
        line.includes("SIRET") ||
        line.includes("préfet") ||
        line.includes("déclaration") ||
        line.includes("contact@") ||
        line.includes("Version :") ||
        line.startsWith("•") ||
        line.startsWith("-")
      ) continue;
      title = line;
      titleIdx = i;
      break;
    }
  }

  // Fallback: search forward from the top
  if (!title) {
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
      const line = lines[i];
      if (line.length < 5 || /^\d+$/.test(line)) continue;
      if (/^(MR|C3V)\s*(FORMATION|formation)/i.test(line)) continue;
      if (/programme\s*(de\s*)?formation/i.test(line)) continue;
      if (/^\d{1,2}\s*(jour|heure|h)/i.test(line)) continue;
      if (line.startsWith("http") || line.startsWith("Tel:") || line.startsWith("Email:")) continue;
      if (line.includes("Boulevard") || line.includes("Marseille") || line.includes("SIRET")) continue;
      if (line.includes("préfet") || line.includes("déclaration") || line.includes("contact@")) continue;
      if (line.length >= 10 && !line.startsWith("•") && !line.startsWith("-")) {
        title = line;
        titleIdx = i;
        break;
      }
    }
  }

  // Try to find objectives
  const objectivesLines: string[] = [];
  let inObjectives = false;
  for (const line of lines) {
    if (/objectif/i.test(line) && !inObjectives) {
      inObjectives = true;
      // Sometimes the objectives header line itself contains the first objective
      const afterColon = line.split(":").slice(1).join(":").trim();
      if (afterColon) objectivesLines.push(afterColon);
      continue;
    }
    if (inObjectives) {
      if (/^(jour\s*\d|module|programme|contenu|déroulé|public|pré-?requis|évaluation|moyens)/i.test(line)) {
        break;
      }
      const cleaned = line.replace(/^[\s•\-\d.)+]+/, "").trim();
      if (cleaned.length > 5) objectivesLines.push(cleaned);
    }
  }

  // Find CONTENU section start and ORGANISATION section end
  const contenuIdx = lines.findIndex((l) => /CONTENU\s*\(PROGRESSION/i.test(l));
  const orgIdx = lines.findIndex((l) => /^ORGANISATION$/i.test(l));

  // Parse days and modules
  const days: { label: string; modules: { title: string; duration_hours: number; topics: string[] }[] }[] = [];
  let currentDay: typeof days[0] | null = null;
  let currentModule: { title: string; duration_hours: number; topics: string[] } | null = null;

  const startIdx = contenuIdx >= 0 ? contenuIdx + 1 : titleIdx + 1;
  const endIdx = orgIdx > startIdx ? orgIdx : lines.length;

  for (let i = startIdx; i < endIdx; i++) {
    const line = lines[i];

    // Stop at ORGANISATION or similar section markers
    if (/^(ORGANISATION|Formateur\s*&|Moyens\s+p[ée]dagogiques|Dispositif\s+de\s+suivi)/i.test(line)) break;

    // Detect day headers: "Jour 1", "Jour 2", etc.
    const dayMatch = line.match(/jour\s*(\d+)\s*[:\-–]?\s*(.*)/i);
    if (dayMatch) {
      if (currentModule && currentDay) currentDay.modules.push(currentModule);
      if (currentDay) days.push(currentDay);
      currentDay = { label: line, modules: [] };
      currentModule = null;
      continue;
    }

    // Detect module headers: Roman numerals (I., II., III., IV., V., VI.)
    const romanMatch = line.match(/^([IVXLC]+)\.\s+(.+)/);
    if (romanMatch && romanMatch[2].length > 3) {
      if (currentModule && currentDay) currentDay.modules.push(currentModule);
      if (currentModule && !currentDay) {
        currentDay = { label: "Jour 1", modules: [currentModule] };
        currentModule = null;
      }
      if (!currentDay) currentDay = { label: "Jour 1", modules: [] };
      currentModule = {
        title: romanMatch[2].trim(),
        duration_hours: 0,
        topics: [],
      };
      continue;
    }

    // Detect module headers: numbered items like "1.", "2.", etc. with a title
    const moduleMatch = line.match(/^(\d+)[.\-)\s]+(.+?)(?:\((\d+(?:[.,]\d+)?)\s*h(?:eure)?s?\))?$/i);
    if (moduleMatch && moduleMatch[2].length > 5) {
      if (currentModule && currentDay) currentDay.modules.push(currentModule);
      if (!currentDay) currentDay = { label: "Jour 1", modules: [] };
      const durationStr = moduleMatch[3]?.replace(",", ".") || "0";
      currentModule = {
        title: moduleMatch[2].trim(),
        duration_hours: parseFloat(durationStr) || 0,
        topics: [],
      };
      continue;
    }

    // Detect duration in separate format
    const durationMatch = line.match(/^\(?(\d+(?:[.,]\d+)?)\s*h(?:\s*(\d+))?\s*(?:min(?:utes?)?)?\)?$/i);
    if (durationMatch && currentModule) {
      const hours = parseFloat(durationMatch[1].replace(",", ".")) || 0;
      const minutes = parseInt(durationMatch[2] || "0") / 60;
      currentModule.duration_hours = hours + minutes;
      continue;
    }

    // Topics: bullet points or items starting with •, -, –, etc.
    if (currentModule && (/^[•\-–]/.test(line) || line.startsWith("-"))) {
      const topic = line.replace(/^[•\-–]\s*/, "").trim();
      if (topic.length > 3) currentModule.topics.push(topic);
      continue;
    }

    // Also catch plain text lines as topics when inside a module
    if (currentModule && line.length > 5 && !line.match(/^(objectif|public|pré-?requis|évaluation|moyens|remarque|note|a qui|profil)/i)) {
      currentModule.topics.push(line);
    }
  }

  if (currentModule && currentDay) currentDay.modules.push(currentModule);
  if (currentModule && !currentDay) {
    currentDay = { label: "Jour 1", modules: [currentModule] };
  }
  if (currentDay) days.push(currentDay);

  // Build flat modules list with IDs
  const allModules: { id: number; title: string; duration_hours: number; objectives: string[]; topics: string[] }[] = [];
  let moduleId = 1;
  for (const day of days) {
    for (const mod of day.modules) {
      allModules.push({
        id: moduleId++,
        title: mod.title,
        duration_hours: mod.duration_hours,
        objectives: [],
        topics: mod.topics,
      });
    }
  }

  // Parse duration from "Durée:" line
  let parsedHours = 0;
  let parsedDays = 0;
  const dureeLine = lines.find((l) => /^Dur[ée]+e?\s*:/i.test(l));
  if (dureeLine) {
    const hMatch = dureeLine.match(/([\d.]+)\s*heure/i);
    const dMatch = dureeLine.match(/([\d.]+)\s*jour/i);
    if (hMatch) parsedHours = parseFloat(hMatch[1]);
    if (dMatch) parsedDays = parseFloat(dMatch[1]);
  }

  // Calculate totals - prefer parsed from Durée line, fallback to module sum
  const moduleHours = allModules.reduce((sum, m) => sum + m.duration_hours, 0);
  const totalHours = parsedHours || moduleHours;
  const totalDays = parsedDays || days.length || Math.ceil(totalHours / 7);

  // Distribute hours evenly across modules if they have no individual durations
  if (allModules.length > 0 && totalHours > 0 && moduleHours === 0) {
    const perModule = Math.round((totalHours / allModules.length) * 100) / 100;
    allModules.forEach((m) => (m.duration_hours = perModule));
  }

  // Find target audience and prerequisites
  let targetAudience = "";
  let prerequisites = "";
  const evalMethods: string[] = [];
  const pedResources: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // MR FORMATION format: "Profil du stagiaire" then content until "Prérequis"
    if (/profil\s+du\s+stagiaire/i.test(line)) {
      const prereqIdx = lines.findIndex((l, idx) => idx > i && /^pr[ée]requis$/i.test(l));
      if (prereqIdx > i) {
        targetAudience = lines.slice(i + 1, prereqIdx).join(" ").trim();
      } else {
        const next = lines[i + 1];
        targetAudience = next?.replace(/^[•\-]\s*/, "").trim() || "";
      }
    }
    if (/public\s*(vis[ée]|cible|concern[ée])/i.test(line) && !targetAudience) {
      const next = lines[i + 1];
      targetAudience = next?.replace(/^[•\-]\s*/, "").trim() || "";
    }
    if (/^pr[ée]-?requis$/i.test(line)) {
      // Read until next section (OBJECTIFS)
      const objIdx = lines.findIndex((l, idx) => idx > i && /OBJECTIFS/i.test(l));
      if (objIdx > i) {
        prerequisites = lines.slice(i + 1, objIdx).join(" ").trim();
      } else {
        const next = lines[i + 1];
        prerequisites = next?.replace(/^[•\-]\s*/, "").trim() || "";
      }
    }
    // Match specifically "Dispositif de suivi..." section for evaluation methods
    if (/dispositif\s+de\s+suivi/i.test(line) && evalMethods.length === 0) {
      const certIdx = lines.findIndex((l, idx) => idx > i && /certification\/dipl[ôo]me/i.test(l));
      const stopIdx = certIdx > i ? certIdx : Math.min(i + 8, lines.length);
      for (let j = i + 1; j < stopIdx; j++) {
        const l = lines[j].trim();
        if (!l || /^(certification|qualit[ée]|indicateur|taux|nombre|accessib|formateur)/i.test(l)) break;
        const cleaned = l.replace(/^[•\-❖]\s*/, "").trim();
        // Join with previous line if it looks like a continuation (starts lowercase or with a closing paren)
        if (evalMethods.length > 0 && (/^[a-zà-ü]/.test(cleaned) || cleaned.startsWith("cas "))) {
          evalMethods[evalMethods.length - 1] += " " + cleaned;
        } else {
          evalMethods.push(cleaned);
        }
      }
    }
    if (/moyens\s*(p[ée]dagogiques|techniques)/i.test(line) && pedResources.length === 0) {
      const dispositifIdx = lines.findIndex((l, idx) => idx > i && /dispositif\s+de\s+suivi/i.test(l));
      const stopIdx = dispositifIdx > i ? dispositifIdx : Math.min(i + 8, lines.length);
      for (let j = i + 1; j < stopIdx; j++) {
        const l = lines[j].trim();
        if (!l || /^(dispositif|certification|qualit[ée]|formateur)/i.test(l)) break;
        pedResources.push(l.replace(/^[•\-❖]\s*/, "").trim());
      }
    }
  }

  // Description: leave empty since the content is in modules (no separate description in MR FORMATION PDFs)
  // The CONTENU section IS the modules, not a separate description
  const descriptionParts: string[] = [];

  const contentObj = {
    duration_hours: totalHours || undefined,
    duration_days: totalDays || undefined,
    target_audience: targetAudience || undefined,
    prerequisites: prerequisites || "aucun",
    evaluation_methods: evalMethods.length > 0 ? evalMethods : [
      "Test de positionnement.",
      "Évaluation des acquis (tests, exercices, études de cas et mises en situation)",
      "Évaluation de l'impact de la formation",
    ],
    pedagogical_resources: pedResources.length > 0 ? pedResources : [
      "Alternance d'apports théoriques et d'ateliers pratiques pour faire émerger les bonnes pratiques.",
      "Animée alternativement sous forme de formation, d'ateliers de mise en pratique, de groupe de parole, de séance de co-développement",
      "Pour faciliter l'ancrage et conformément à l'ADN MR FORMATION, nos ateliers utilisent la Ludo pédagogie.",
    ],
    modules: allModules,
  };

  return {
    title,
    description: descriptionParts.join("\n").trim(),
    objectives: objectivesLines.join("\n"),
    days,
    duration_hours: totalHours,
    duration_days: totalDays,
    target_audience: targetAudience,
    prerequisites,
    evaluation_methods: evalMethods,
    pedagogical_resources: pedResources,
    content: contentObj,
  };
}

function findBestMatch(
  title: string,
  programs: { id: string; title: string; version: number }[]
): { id: string; title: string; score: number; version: number } | null {
  if (!title || programs.length === 0) return null;

  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const normalizedTitle = normalize(title);
  const titleWords = normalizedTitle.split(" ").filter((w) => w.length > 2);

  let bestMatch: typeof programs[0] | null = null;
  let bestScore = 0;

  for (const program of programs) {
    const normalizedProgramTitle = normalize(program.title);

    // Exact match
    if (normalizedTitle === normalizedProgramTitle) {
      return { ...program, score: 1 };
    }

    // Contains match
    if (normalizedProgramTitle.includes(normalizedTitle) || normalizedTitle.includes(normalizedProgramTitle)) {
      const score = 0.9;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = program;
      }
      continue;
    }

    // Word overlap score
    const programWords = normalizedProgramTitle.split(" ").filter((w) => w.length > 2);
    const commonWords = titleWords.filter((w) => programWords.includes(w));
    const score = commonWords.length / Math.max(titleWords.length, programWords.length);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = program;
    }
  }

  if (bestMatch && bestScore >= 0.3) {
    return { ...bestMatch, score: bestScore };
  }

  return null;
}
