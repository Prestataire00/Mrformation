import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

interface LearnerToClassify {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  client_name: string | null;
  client_siret: string | null;
}

interface TrainingToClassify {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  duration_hours: number | null;
}

export async function POST(request: NextRequest) {
  const authResult = await requireRole(["admin", "super_admin"]);
  if (authResult.error) return authResult.error;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      error: "ANTHROPIC_API_KEY non configurée. Ajoutez-la dans les variables d'environnement Netlify.",
    }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { type, items } = body as {
      type: "learner_type" | "bpf_objective" | "nsf_code";
      items: LearnerToClassify[] | TrainingToClassify[];
    };

    if (!type || !items || items.length === 0) {
      return NextResponse.json({ error: "type et items requis" }, { status: 400 });
    }

    // Limit batch size
    const batch = items.slice(0, 30);

    let systemPrompt = "";
    let userPrompt = "";

    if (type === "learner_type") {
      systemPrompt = `Tu es un assistant pour un organisme de formation professionnelle français.
Tu dois classifier chaque apprenant dans l'une de ces catégories EXACTES :
- "salarie" : salarié d'une entreprise privée (a une entreprise rattachée)
- "apprenti" : en contrat d'apprentissage
- "demandeur_emploi" : demandeur d'emploi, inscrit Pôle Emploi / France Travail
- "particulier" : personne qui finance sa formation elle-même, pas rattachée à une entreprise
- "autre" : si tu ne peux pas déterminer

Règles :
- Si l'apprenant est rattaché à une entreprise (client_name non null) → probablement "salarie"
- Si l'email contient "pole-emploi" ou "francetravail" → "demandeur_emploi"
- Si pas d'entreprise et email personnel (gmail, hotmail...) → "particulier"
- En cas de doute, mets "salarie" si entreprise, "particulier" sinon

Réponds UNIQUEMENT en JSON : [{"id": "...", "suggestion": "salarie|apprenti|demandeur_emploi|particulier|autre", "reason": "explication courte"}]`;

      const learners = batch as LearnerToClassify[];
      userPrompt = `Classifie ces ${learners.length} apprenants :\n\n${learners.map((l, i) =>
        `${i + 1}. ID: ${l.id} | ${l.last_name} ${l.first_name} | Email: ${l.email || "—"} | Entreprise: ${l.client_name || "Aucune"} | SIRET: ${l.client_siret || "—"}`
      ).join("\n")}`;
    }

    if (type === "bpf_objective") {
      systemPrompt = `Tu es un assistant pour un organisme de formation professionnelle français.
Tu dois classifier chaque formation selon son objectif BPF (Bilan Pédagogique et Financier) :
- "rncp_6_8" : diplôme niveau 6 à 8 (licence, master, doctorat) inscrit au RNCP
- "rncp_5" : diplôme niveau 5 (BTS, DUT) inscrit au RNCP
- "rncp_4" : diplôme niveau 4 (bac) inscrit au RNCP
- "rncp_3" : diplôme niveau 3 (CAP, BEP) inscrit au RNCP
- "rncp_2" : diplôme niveau 2 inscrit au RNCP
- "rncp_cqp" : CQP inscrit au RNCP
- "certification_rs" : certification inscrite au Répertoire Spécifique
- "cqp_non_enregistre" : CQP non enregistré
- "autre_pro" : autre formation professionnelle (développement de compétences, soft skills, management...)
- "bilan_competences" : bilan de compétences
- "vae" : validation des acquis de l'expérience

Pour un organisme de formation classique, la plupart des formations sont "autre_pro" (formation continue, soft skills, management, sécurité, bureautique...).

Réponds UNIQUEMENT en JSON : [{"id": "...", "suggestion": "...", "reason": "explication courte"}]`;

      const trainings = batch as TrainingToClassify[];
      userPrompt = `Classifie ces ${trainings.length} formations :\n\n${trainings.map((t, i) =>
        `${i + 1}. ID: ${t.id} | "${t.title}" | Catégorie: ${t.category || "—"} | Durée: ${t.duration_hours || "—"}h | Description: ${(t.description || "").slice(0, 100)}`
      ).join("\n")}`;
    }

    if (type === "nsf_code") {
      systemPrompt = `Tu es un assistant pour un organisme de formation professionnelle français.
Tu dois attribuer un code NSF (Nomenclature des Spécialités de Formation) à chaque formation.
Codes NSF courants :
- "310" : Spécialités plurivalentes des échanges et de la gestion (management, RH, commerce)
- "312" : Commerce, vente
- "313" : Finances, banque, assurances, immobilier
- "314" : Comptabilité, gestion
- "315" : Ressources humaines, gestion du personnel
- "320" : Spécialités plurivalentes de la communication et de l'information
- "326" : Informatique, traitement de l'information, réseaux
- "330" : Spécialités plurivalentes sanitaires et sociales
- "332" : Travail social
- "333" : Enseignement, formation
- "344" : Sécurité des biens et des personnes
- "413" : Développement des capacités comportementales (soft skills, leadership)

Réponds UNIQUEMENT en JSON : [{"id": "...", "suggestion": "CODE", "label": "Libellé NSF", "reason": "explication courte"}]`;

      const trainings = batch as TrainingToClassify[];
      userPrompt = `Attribue un code NSF à ces ${trainings.length} formations :\n\n${trainings.map((t, i) =>
        `${i + 1}. ID: ${t.id} | "${t.title}" | Catégorie: ${t.category || "—"} | Description: ${(t.description || "").slice(0, 100)}`
      ).join("\n")}`;
    }

    if (!systemPrompt) {
      return NextResponse.json({ error: `Type non supporté : ${type}` }, { status: 400 });
    }

    // Call Claude API
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("[ai-classify] Claude API error:", response.status, errBody);
      return NextResponse.json({
        error: `Erreur API Claude (${response.status})`,
      }, { status: 502 });
    }

    const result = await response.json();
    const textContent = result.content?.[0]?.text || "[]";

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = textContent.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Réponse IA invalide", raw: textContent }, { status: 500 });
    }

    const suggestions = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      suggestions,
      model: result.model,
      usage: result.usage,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    console.error("[ai-classify] Error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
