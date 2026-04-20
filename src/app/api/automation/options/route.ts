import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";

const DOCUMENT_TYPES = [
  { key: "convocation", label: "Convocation à la formation", category: "communication", icon: "📅" },
  { key: "convention_entreprise", label: "Convention entreprise", category: "contract", icon: "📜" },
  { key: "convention_intervention", label: "Convention d'intervention", category: "contract", icon: "📜" },
  { key: "contrat_sous_traitance", label: "Contrat de sous-traitance", category: "contract", icon: "🤝" },
  { key: "certificat_realisation", label: "Certificat de réalisation", category: "certificate", icon: "🏆" },
  { key: "attestation_assiduite", label: "Attestation d'assiduité", category: "certificate", icon: "🏆" },
  { key: "feuille_emargement", label: "Feuille d'émargement", category: "attendance", icon: "✍️" },
  { key: "feuille_emargement_collectif", label: "Feuille d'émargement collective", category: "attendance", icon: "✍️" },
  { key: "planning_semaine", label: "Planning de la semaine", category: "attendance", icon: "📋" },
  { key: "cgv", label: "Conditions Générales de Vente", category: "informative", icon: "📖" },
  { key: "reglement_interieur", label: "Règlement intérieur", category: "informative", icon: "📖" },
  { key: "politique_confidentialite", label: "Politique RGPD", category: "informative", icon: "📖" },
  { key: "programme_formation", label: "Programme de formation", category: "informative", icon: "📖" },
];

const SATISFACTION_TYPES = [
  { key: "satisfaction_chaud", label: "Satisfaction à chaud", description: "Ressenti immédiat en fin de formation" },
  { key: "satisfaction_froid", label: "Satisfaction à froid", description: "Recul à J+30 sur l'impact" },
  { key: "quest_financeurs", label: "Satisfaction financeur", description: "Retour du financeur OPCO" },
  { key: "quest_managers", label: "Satisfaction manager", description: "Retour du manager sur la mise en pratique" },
  { key: "quest_entreprises", label: "Satisfaction entreprise", description: "Retour global de l'entreprise" },
];

const EVALUATION_TYPES = [
  { key: "eval_preformation", label: "Positionnement (avant)", description: "Diagnostique le niveau de départ" },
  { key: "eval_pendant", label: "Évaluation intermédiaire", description: "Vérifie la compréhension à mi-parcours" },
  { key: "eval_postformation", label: "Évaluation des acquis", description: "Mesure ce que les apprenants ont appris" },
  { key: "auto_eval_pre", label: "Auto-évaluation pré", description: "L'apprenant s'évalue avant" },
  { key: "auto_eval_post", label: "Auto-évaluation post", description: "L'apprenant s'évalue après" },
];

export async function GET() {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  const entityId = auth.profile.entity_id;

  // Fetch email templates
  const { data: emailTemplates } = await auth.supabase
    .from("email_templates")
    .select("id, name, subject")
    .eq("entity_id", entityId)
    .order("name");

  // Fetch questionnaires
  const { data: questionnaires } = await auth.supabase
    .from("questionnaires")
    .select("id, title, type")
    .eq("entity_id", entityId)
    .order("title");

  return NextResponse.json({
    email_templates: (emailTemplates || []).map(t => ({ id: t.id, name: t.name || t.subject, subject: t.subject })),
    document_types: DOCUMENT_TYPES,
    satisfaction_types: SATISFACTION_TYPES,
    evaluation_types: EVALUATION_TYPES,
    questionnaires: (questionnaires || []).map(q => ({ id: q.id, name: q.title, type: q.type })),
  });
}
