"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Loader2, Eye, CheckCircle, Send, Copy, Clock, Download,
  ChevronDown, ChevronUp, Plus, FileDown, PenLine, Undo2, Pencil,
  AlertTriangle, Paperclip, X, Trash2,
} from "lucide-react";
import DOMPurify from "dompurify";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { EmailPreviewDialog, type EmailTemplateOption } from "@/components/emails/EmailPreviewDialog";
import { listFormationAttachments, type AvailableAttachment } from "@/lib/formations/formation-attachments";
import { useEntity } from "@/contexts/EntityContext";
import { renderSystemTemplate } from "@/lib/templates/registry";
import { resolveVariables } from "@/lib/utils/resolve-variables";
import { validateCompanyExport, findUncoveredLearners } from "@/lib/utils/formation-companies";
import { exportHtmlToPDF } from "@/lib/pdf-export";
import { SubcontractingContractsPanel } from "./sections/SubcontractingContractsPanel";
import { BatchOpsConfirmDialog } from "./BatchOpsConfirmDialog";
import { hasBatchEndpoint, downloadBatchZip } from "@/lib/utils/batch-doc-download";
import { hasBatchSendEndpoint } from "@/lib/utils/batch-doc-send";
import {
  hasBatchSignatureRequestEndpoint,
} from "@/lib/utils/batch-doc-signature-request";
import {
  getDocKeysForSession,
  insertDocs,
  markDocConfirmed,
  unmarkDocConfirmed,
  markDocSent,
  updateDocsByDocType,
  updateDocsForOwner,
  getTemplateById,
  getLatestSignatureForDoc,
  batchSendEmailWithRefetch,
  batchRequestSignaturesWithRefetch,
  batchConfirmDocumentsWithRefetch,
  batchAssignTemplateToLearnersWithRefetch,
  type OwnerType,
} from "@/lib/services/documents-store";
import { cn } from "@/lib/utils";
import { DocMatrixSection } from "@/components/formations/DocMatrixSection";
import { BulkDocActionsPanel, type BulkDocGroup } from "./BulkDocActionsPanel";
import {
  buildDownloadAllArgs,
  downloadAllSessionDocs,
  type RawSessionDoc,
} from "@/lib/utils/batch-doc-download-all";
import { useDocumentGeneration } from "@/hooks/useDocumentGeneration";
import { SecondaryDocCatalogDialog } from "./SecondaryDocCatalogDialog";
import {
  isSecondaryDocType,
  SECONDARY_TEMPLATE_CATEGORIES,
  type SecondaryDocType,
} from "@/lib/templates/secondary-categories";
import { isCustomDocType } from "@/lib/services/custom-secondary-doc-types";
import type {
  Session, ConventionDocType, ConventionOwnerType,
  FormationConventionDocument, DocumentTemplate,
} from "@/lib/types";

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

// ===== CONSTANTS =====

const DOC_COLORS: Record<string, string> = {
  convocation: "border-l-blue-500",
  certificat_realisation: "border-l-green-500",
  attestation_assiduite: "border-l-green-400",
  feuille_emargement: "border-l-amber-500",
  feuille_emargement_collectif: "border-l-amber-500",
  // micro_certificat retiré (Loris V1)
  cgv: "border-l-gray-400",
  politique_confidentialite: "border-l-gray-400",
  reglement_interieur: "border-l-gray-400",
  programme_formation: "border-l-gray-400",
  convention_entreprise: "border-l-purple-500",
  convention_intervention: "border-l-purple-400",
  planning_semaine: "border-l-teal-500",
  // h-22 secondaires : 4 couleurs par catégorie
  avis_hab_elec_generique: "border-l-orange-500",
  avis_hab_elec_b0_bf_bs: "border-l-orange-500",
  avis_hab_elec_b1v_b2v_br: "border-l-orange-500",
  avis_hab_elec_bf_hf: "border-l-orange-500",
  avis_hab_elec_bt: "border-l-orange-500",
  avis_hab_elec_bt_ht: "border-l-orange-500",
  avis_hab_elec_h0_b0: "border-l-orange-500",
  avis_hab_elec_h0_b0_bf_hf_bs: "border-l-orange-500",
  avis_hab_elec_h0_b0_initial: "border-l-orange-500",
  attestation_aipr: "border-l-emerald-500",
  attestation_competences: "border-l-emerald-500",
  attestation_abandon_formation: "border-l-emerald-500",
  certificat_travail_hauteur: "border-l-emerald-500",
  certificat_diplome: "border-l-emerald-500",
  autorisation_image: "border-l-slate-500",
  decharge_responsabilite: "border-l-slate-500",
  lettre_decharge_responsabilite: "border-l-slate-500",
  charte_formateur: "border-l-slate-500",
  contrat_engagement_stagiaire: "border-l-slate-500",
  bilan_poe: "border-l-sky-500",
  reponses_evaluations: "border-l-sky-500",
  reponses_satisfaction_session: "border-l-sky-500",
  resultats_evaluations: "border-l-sky-500",
  custom: "border-l-slate-500",
};

const DOC_BADGE_COLORS: Record<string, string> = {
  convocation: "bg-blue-50 text-blue-700 border-blue-200",
  certificat_realisation: "bg-green-50 text-green-700 border-green-200",
  attestation_assiduite: "bg-emerald-50 text-emerald-700 border-emerald-200",
  feuille_emargement: "bg-amber-50 text-amber-700 border-amber-200",
  feuille_emargement_collectif: "bg-amber-50 text-amber-700 border-amber-200",
  cgv: "bg-gray-50 text-gray-600 border-gray-200",
  politique_confidentialite: "bg-gray-50 text-gray-600 border-gray-200",
  reglement_interieur: "bg-gray-50 text-gray-600 border-gray-200",
  programme_formation: "bg-gray-50 text-gray-600 border-gray-200",
  convention_entreprise: "bg-purple-50 text-purple-700 border-purple-200",
  convention_intervention: "bg-purple-50 text-purple-700 border-purple-200",
  planning_semaine: "bg-teal-50 text-teal-700 border-teal-200",
  // h-22 secondaires : badges par catégorie
  avis_hab_elec_generique: "bg-orange-50 text-orange-700 border-orange-200",
  avis_hab_elec_b0_bf_bs: "bg-orange-50 text-orange-700 border-orange-200",
  avis_hab_elec_b1v_b2v_br: "bg-orange-50 text-orange-700 border-orange-200",
  avis_hab_elec_bf_hf: "bg-orange-50 text-orange-700 border-orange-200",
  avis_hab_elec_bt: "bg-orange-50 text-orange-700 border-orange-200",
  avis_hab_elec_bt_ht: "bg-orange-50 text-orange-700 border-orange-200",
  avis_hab_elec_h0_b0: "bg-orange-50 text-orange-700 border-orange-200",
  avis_hab_elec_h0_b0_bf_hf_bs: "bg-orange-50 text-orange-700 border-orange-200",
  avis_hab_elec_h0_b0_initial: "bg-orange-50 text-orange-700 border-orange-200",
  attestation_aipr: "bg-emerald-50 text-emerald-700 border-emerald-200",
  attestation_competences: "bg-emerald-50 text-emerald-700 border-emerald-200",
  attestation_abandon_formation: "bg-emerald-50 text-emerald-700 border-emerald-200",
  certificat_travail_hauteur: "bg-emerald-50 text-emerald-700 border-emerald-200",
  certificat_diplome: "bg-emerald-50 text-emerald-700 border-emerald-200",
  autorisation_image: "bg-slate-50 text-slate-700 border-slate-200",
  decharge_responsabilite: "bg-slate-50 text-slate-700 border-slate-200",
  lettre_decharge_responsabilite: "bg-slate-50 text-slate-700 border-slate-200",
  charte_formateur: "bg-slate-50 text-slate-700 border-slate-200",
  contrat_engagement_stagiaire: "bg-slate-50 text-slate-700 border-slate-200",
  bilan_poe: "bg-sky-50 text-sky-700 border-sky-200",
  reponses_evaluations: "bg-sky-50 text-sky-700 border-sky-200",
  reponses_satisfaction_session: "bg-sky-50 text-sky-700 border-sky-200",
  resultats_evaluations: "bg-sky-50 text-sky-700 border-sky-200",
  custom: "bg-slate-50 text-slate-600 border-slate-200",
};

const DOC_SHORT: Record<string, string> = {
  convocation: "Conv.",
  certificat_realisation: "Cert.",
  attestation_assiduite: "Att.",
  feuille_emargement: "Émarg.",
  feuille_emargement_collectif: "Émarg. coll.",
  cgv: "CGV",
  politique_confidentialite: "RGPD",
  reglement_interieur: "R.I.",
  programme_formation: "Prog.",
  convention_entreprise: "Convention",
  convention_intervention: "Conv. interv.",
  planning_semaine: "Planning",
  // h-22 secondaires : labels compacts (max 14 chars)
  avis_hab_elec_generique: "Hab. élec.",
  avis_hab_elec_b0_bf_bs: "Hab. B0/BF/BS",
  avis_hab_elec_b1v_b2v_br: "Hab. B1V/B2V",
  avis_hab_elec_bf_hf: "Hab. BF/HF",
  avis_hab_elec_bt: "Hab. BT",
  avis_hab_elec_bt_ht: "Hab. BT/HT",
  avis_hab_elec_h0_b0: "Hab. H0/B0",
  avis_hab_elec_h0_b0_bf_hf_bs: "Hab. H0/B0+",
  avis_hab_elec_h0_b0_initial: "Hab. H0/B0 ini",
  attestation_aipr: "AIPR",
  attestation_competences: "Att. compét.",
  attestation_abandon_formation: "Abandon",
  certificat_travail_hauteur: "Trav. hauteur",
  certificat_diplome: "Diplôme",
  autorisation_image: "Auto. image",
  decharge_responsabilite: "Décharge",
  lettre_decharge_responsabilite: "Lettre déch.",
  charte_formateur: "Charte form.",
  contrat_engagement_stagiaire: "Engagement",
  bilan_poe: "Bilan POE",
  reponses_evaluations: "Rép. éval.",
  reponses_satisfaction_session: "Rép. satis.",
  resultats_evaluations: "Résultats éval",
  custom: "Custom",
};

const DOC_LABELS: Record<string, string> = {
  convocation: "CONVOCATION À LA FORMATION",
  certificat_realisation: "CERTIFICAT DE RÉALISATION",
  attestation_assiduite: "ATTESTATION D'ASSIDUITÉ",
  feuille_emargement: "FEUILLE D'ÉMARGEMENT",
  // micro_certificat retiré (Loris V1)
  cgv: "CGV",
  politique_confidentialite: "POLITIQUE DE CONFIDENTIALITÉ",
  reglement_interieur: "RÈGLEMENT INTÉRIEUR",
  programme_formation: "PROGRAMME DE LA FORMATION",
  convention_entreprise: "CONVENTION ENTREPRISE",
  feuille_emargement_collectif: "FEUILLE D'ÉMARGEMENT COLLECTIF",
  convention_intervention: "CONVENTION D'INTERVENTION",
  planning_semaine: "PLANNING DE LA SEMAINE",
  // h-22 secondaires : labels longs (cf SECONDARY_TEMPLATE_CATEGORIES)
  avis_hab_elec_generique: "AVIS HABILITATION ÉLECTRIQUE",
  avis_hab_elec_b0_bf_bs: "AVIS HAB. ÉLEC. B0 / BF / BS",
  avis_hab_elec_b1v_b2v_br: "AVIS HAB. ÉLEC. B1V / B2V / BR",
  avis_hab_elec_bf_hf: "AVIS HAB. ÉLEC. BF / HF",
  avis_hab_elec_bt: "AVIS HAB. ÉLEC. BT",
  avis_hab_elec_bt_ht: "AVIS HAB. ÉLEC. BT / HT",
  avis_hab_elec_h0_b0: "AVIS HAB. ÉLEC. H0 / B0",
  avis_hab_elec_h0_b0_bf_hf_bs: "AVIS HAB. ÉLEC. H0 / B0 / BF / HF / BS",
  avis_hab_elec_h0_b0_initial: "AVIS HAB. ÉLEC. H0 / B0 (INITIAL)",
  attestation_aipr: "ATTESTATION AIPR",
  attestation_competences: "ATTESTATION DE COMPÉTENCES",
  attestation_abandon_formation: "ATTESTATION D'ABANDON DE FORMATION",
  certificat_travail_hauteur: "CERTIFICAT TRAVAIL EN HAUTEUR",
  certificat_diplome: "CERTIFICAT / DIPLÔME",
  autorisation_image: "AUTORISATION DROIT À L'IMAGE",
  decharge_responsabilite: "DÉCHARGE DE RESPONSABILITÉ",
  lettre_decharge_responsabilite: "LETTRE DÉCHARGE DE RESPONSABILITÉ",
  charte_formateur: "CHARTE FORMATEUR",
  contrat_engagement_stagiaire: "CONTRAT D'ENGAGEMENT STAGIAIRE",
  bilan_poe: "BILAN POE",
  reponses_evaluations: "RÉPONSES AUX ÉVALUATIONS",
  reponses_satisfaction_session: "RÉPONSES SATISFACTION SESSION",
  resultats_evaluations: "RÉSULTATS DES ÉVALUATIONS",
};

const DOC_LABELS_PLURAL: Record<string, string> = {
  convocation: "convocations",
  certificat_realisation: "certificats de réalisation",
  attestation_assiduite: "attestations d'assiduité",
  feuille_emargement: "feuilles d'émargement",
  // Lot G : compléter pour éviter le fallback majuscules sur DOC_LABELS
  convention_entreprise: "conventions entreprise",
  convention_intervention: "conventions d'intervention",
  feuille_emargement_collectif: "feuilles d'émargement collectives",
  planning_semaine: "plannings hebdomadaires",
  programme_formation: "programmes de formation",
};

const DEFAULT_LEARNER_DOCS: ConventionDocType[] = [
  "convocation", "certificat_realisation", "attestation_assiduite",
  "feuille_emargement",
];

const STATIC_DOCS: ConventionDocType[] = [
  "cgv", "politique_confidentialite", "reglement_interieur", "programme_formation",
];

const DEFAULT_COMPANY_DOCS: ConventionDocType[] = [
  "convention_entreprise", "feuille_emargement_collectif", "planning_semaine",
];

const DEFAULT_TRAINER_DOCS: ConventionDocType[] = [
  "convention_intervention",
];

const REQUIRES_SIGNATURE_TYPES: ConventionDocType[] = [
  "convention_entreprise", "convention_intervention",
];

export function TabConventionDocs({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const { generate: generateDocument, incompleteDialog } = useDocumentGeneration();

  const [saving, setSaving] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(true);
  const [dates, setDates] = useState<Record<string, string>>({});
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [initializing, setInitializing] = useState(false);
  const [massSending, setMassSending] = useState<string | null>(null);
  const [massDownloading, setMassDownloading] = useState<string | null>(null);
  const [massRequestingSig, setMassRequestingSig] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);

  // h-22 : Dialog catalogue documents secondaires
  const [secondaryCatalogOpen, setSecondaryCatalogOpen] = useState(false);
  // Désattribution : doc_type secondaire à retirer de la session (confirmation).
  const [desattribType, setDesattribType] = useState<string | null>(null);
  const [desattribBusy, setDesattribBusy] = useState(false);

  // E3-S05 : Batch ops confirmation dialogs
  const [confirmMassSend, setConfirmMassSend] = useState<{ docType: ConventionDocType } | null>(null);
  const [confirmAssignAll, setConfirmAssignAll] = useState<{ templateId: string } | null>(null);
  const [confirmOwner, setConfirmOwner] = useState<{ ownerType: ConventionOwnerType; ownerId: string; ownerName: string } | null>(null);

  // Custom doc template selections
  const [customSelections, setCustomSelections] = useState<Record<string, string>>({});
  const [matrixView, setMatrixView] = useState(true);

  // Preview state — supporte 2 modes : `html` (rendu HTML legacy) ou `pdfDataUrl`
  // (PDF blob URL pour les templates en mode docx_fidelity).
  const [previewDoc, setPreviewDoc] = useState<{
    open: boolean;
    html: string;
    title: string;
    filename: string;
    pdfDataUrl?: string;
  } | null>(null);

  const [emailPreview, setEmailPreview] = useState<{
    docId: string;
    recipientEmail: string;
    subject: string;
    body: string;
    pdfFilename: string;
    pdfBase64: string;
  } | null>(null);

  const { entity } = useEntity();
  const entityName = entity?.name || "MR FORMATION";

  // Modèles d'email + documents existants de la formation (pour le dialog d'envoi).
  const [docEmailTemplates, setDocEmailTemplates] = useState<EmailTemplateOption[]>([]);
  const [formationAtts, setFormationAtts] = useState<AvailableAttachment[]>([]);
  useEffect(() => {
    if (!formation.id) return;
    const entId = entity?.id ?? null;
    (async () => {
      let q = supabase.from("email_templates").select("id, name, subject, body").eq("is_active", true).order("name");
      if (entId) q = q.eq("entity_id", entId);
      const { data: tpls } = await q;
      setDocEmailTemplates((tpls ?? []) as EmailTemplateOption[]);
      try {
        setFormationAtts(await listFormationAttachments(supabase, formation.id, entId));
      } catch {
        /* liste PJ optionnelle : on n'empêche pas l'envoi */
      }
    })();
  }, [formation.id, entity?.id, supabase]);

  const docs = formation.formation_convention_documents || [];
  const enrollments = formation.enrollments || [];
  const companies = formation.formation_companies || [];
  const trainers = formation.formation_trainers || [];

  // ===== FETCH TEMPLATES =====
  const fetchTemplates = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("entity_id")
      .eq("id", user.id)
      .single();
    if (!profile) return;
    const { data } = await supabase
      .from("document_templates")
      .select("id, name, type")
      .eq("entity_id", profile.entity_id)
      .order("name");
    setTemplates((data as DocumentTemplate[]) || []);
    setLoadingTemplates(false);
  }, [supabase]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // ===== INITIALIZE DEFAULT DOCS =====
  // Crée les docs par défaut pour chaque (learner/company/trainer) qui n'en a pas encore.
  // Est ré-exécutée à chaque ajout d'apprenant/entreprise/formateur (le flag `initializing`
  // garantit qu'on ne lance qu'un seul appel concurrent). Le fetch direct depuis la DB
  // (au lieu du state local `docs`) évite les race conditions sur le state React.
  const initializeDefaultDocs = useCallback(async () => {
    if (initializing) return;
    if (loadingTemplates) return;
    if (enrollments.length === 0 && companies.length === 0 && trainers.length === 0) return;

    if (!entity?.id) {
      setInitializing(false);
      return;
    }

    setInitializing(true);
    try {
      // Fetch direct depuis la DB pour avoir la vue la plus à jour (évite race conditions)
      const existingDocs = await getDocKeysForSession(supabase, formation.id);
      const existingKeys = new Set(
        existingDocs.map((d) => `${d.doc_type}|${d.owner_type}|${d.owner_id}`)
      );

      const now = new Date().toISOString();
      const rows: Array<{
        entity_id: string;
        session_id: string;
        doc_type: string;
        owner_type: "learner" | "company" | "trainer";
        owner_id: string;
        requires_signature: boolean;
        template_id: null;
        is_confirmed?: boolean;
        confirmed_at?: string;
      }> = [];

      // For each learner: default docs + static docs
      for (const enrollment of enrollments) {
        if (!enrollment.learner) continue;
        const learnerId = enrollment.learner.id;
        for (const dt of [...DEFAULT_LEARNER_DOCS, ...STATIC_DOCS]) {
          if (existingKeys.has(`${dt}|learner|${learnerId}`)) continue;
          const isStatic = STATIC_DOCS.includes(dt);
          rows.push({
            entity_id: entity.id,
            session_id: formation.id,
            doc_type: dt,
            owner_type: "learner",
            owner_id: learnerId,
            requires_signature: false,
            template_id: null,
            ...(isStatic ? { is_confirmed: true, confirmed_at: now } : {}),
          });
        }
      }

      // For each company: default docs + static docs
      for (const fc of companies) {
        if (!fc.client) continue;
        const clientId = fc.client.id;
        for (const dt of [...DEFAULT_COMPANY_DOCS, ...STATIC_DOCS]) {
          if (existingKeys.has(`${dt}|company|${clientId}`)) continue;
          const isStatic = STATIC_DOCS.includes(dt);
          rows.push({
            entity_id: entity.id,
            session_id: formation.id,
            doc_type: dt,
            owner_type: "company",
            owner_id: clientId,
            requires_signature: REQUIRES_SIGNATURE_TYPES.includes(dt),
            template_id: null,
            ...(isStatic ? { is_confirmed: true, confirmed_at: now } : {}),
          });
        }
      }

      // For each trainer: default docs + static docs
      for (const ft of trainers) {
        if (!ft.trainer) continue;
        const trainerId = ft.trainer.id;
        for (const dt of [...DEFAULT_TRAINER_DOCS, ...STATIC_DOCS]) {
          if (existingKeys.has(`${dt}|trainer|${trainerId}`)) continue;
          const isStatic = STATIC_DOCS.includes(dt);
          rows.push({
            entity_id: entity.id,
            session_id: formation.id,
            doc_type: dt,
            owner_type: "trainer",
            owner_id: trainerId,
            requires_signature: REQUIRES_SIGNATURE_TYPES.includes(dt),
            template_id: null,
            ...(isStatic ? { is_confirmed: true, confirmed_at: now } : {}),
          });
        }
      }

      if (rows.length > 0) {
        try {
          await insertDocs(supabase, rows);
          console.log(`[initializeDefaultDocs] Created ${rows.length} default docs`);
          await onRefresh();
        } catch (err) {
          console.error("[initializeDefaultDocs] insert error:", err);
          toast({
            title: "Erreur",
            description: "Impossible de créer les documents par défaut",
            variant: "destructive",
          });
        }
      }
    } finally {
      setInitializing(false);
    }
  }, [formation.id, enrollments, companies, trainers, supabase, onRefresh, loadingTemplates, initializing, entity?.id]);

  // Re-déclenche l'init à chaque changement de count d'enrollments/companies/trainers.
  // Le check existingKeys (depuis DB) évite les doublons.
  // On utilise les .length comme dépendance pour éviter les re-renders infinis sur identité d'array.
  useEffect(() => {
    if (!loadingTemplates && (enrollments.length > 0 || companies.length > 0 || trainers.length > 0)) {
      initializeDefaultDocs();
    }
  }, [loadingTemplates, initializeDefaultDocs, enrollments.length]);

  // ===== EXPORT VALIDATION (multi-entreprises) =====

  // Bloque l'export PDF/email d'une convention entreprise si :
  //  - en INTER, ≥1 apprenant a client_id null (rattachement incomplet)
  //  - le montant de cette entreprise (formation_companies.amount) est NULL/0
  // Retourne true si OK, false (avec toast) sinon. Ne s'applique qu'aux docs
  // owner_type=company / doc_type=convention_entreprise — autres docs passent toujours.
  const canExportCompanyDoc = (doc: FormationConventionDocument): boolean => {
    if (doc.owner_type !== "company" || doc.doc_type !== "convention_entreprise") return true;
    const result = validateCompanyExport(formation, doc.owner_id);
    if (!result.ok) {
      toast({ title: "Export bloqué", description: result.reason, variant: "destructive" });
      return false;
    }
    return true;
  };

  // ===== GENERATE DOCUMENT HTML (reusable) =====

  const generateDocHtml = async (doc: FormationConventionDocument): Promise<string> => {
    const learner = enrollments.find((e) => e.learner?.id === doc.owner_id)?.learner;
    const company = companies.find((c) => c.client_id === doc.owner_id)?.client;
    const trainerData = trainers.find((t) => t.trainer_id === doc.owner_id)?.trainer;

    // Charger la signature client si le document est signé (B3 — entity_id check)
    let clientSignature: { signer_name: string | null; signed_at: string | null } | null = null;
    if (doc.is_signed) {
      const sigResult = await getLatestSignatureForDoc(supabase, formation.entity_id, doc.id);
      if (sigResult.ok && sigResult.signature) clientSignature = sigResult.signature;
    }

    const templateData = {
      formation,
      learner: learner ? { id: learner.id, first_name: learner.first_name, last_name: learner.last_name, email: learner.email ?? undefined } : undefined,
      company: company || undefined,
      trainer: trainerData || undefined,
      entityName,
      entity: entity ?? undefined,
      doc: { document_date: doc.document_date || null, confirmed_at: doc.confirmed_at || null },
      // signature_data omis intentionnellement (non utilisé par les templates, remplacé par B3)
      clientSignature: clientSignature
        ? { signature_data: "", signer_name: clientSignature.signer_name ?? "", signed_at: clientSignature.signed_at ?? "" }
        : null,
    };

    // Bug Story B0 — résolu : `entity` était oublié dans le contexte, ce qui
    // cassait toutes les variables organisme ({{logo_organisme}},
    // {{siret_organisme}}, {{signature_organisme}}, etc.). Le `entity` est
    // pourtant chargé plus haut et utilisé pour `templateData`.
    const resolveCtx = {
      session: formation,
      learner: learner || null,
      client: company || null,
      trainer: trainerData || null,
      entity: entity ?? null,
    };

    let htmlContent: string | null = null;

    if (doc.template_id) {
      const tplResult = await getTemplateById(supabase, formation.entity_id, doc.template_id);
      if (tplResult.ok && tplResult.template?.content?.trim()) {
        htmlContent = resolveVariables(tplResult.template.content, resolveCtx);
      }
    } else {
      const { data: systemTemplate } = await supabase
        .from("document_templates")
        .select("content")
        .eq("system_key", doc.doc_type)
        .eq("entity_id", formation.entity_id)
        .single();

      if (systemTemplate?.content?.trim()) {
        htmlContent = resolveVariables(systemTemplate.content, resolveCtx);
      } else {
        htmlContent = renderSystemTemplate(doc.doc_type, templateData);
      }
    }

    return DOMPurify.sanitize(htmlContent || "");
  };

  // ===== VIEW DOCUMENT =====

  const handleView = async (doc: FormationConventionDocument) => {
    const label = doc.custom_label || DOC_LABELS[doc.doc_type] || doc.doc_type;
    const ownerLearnerId = doc.owner_type === "learner" ? doc.owner_id : undefined;
    const ownerClientId = doc.owner_type === "company" ? doc.owner_id : undefined;
    const ownerTrainerId = doc.owner_type === "trainer" ? doc.owner_id : undefined;

    await generateDocument(
      {
        template_id: doc.template_id || undefined,
        doc_type: doc.template_id ? undefined : doc.doc_type,
        context: {
          session_id: formation.id,
          learner_id: ownerLearnerId,
          client_id: ownerClientId,
          trainer_id: ownerTrainerId,
        },
      },
      {
        onSuccess: (result) => {
          const byteChars = atob(result.base64);
          const byteArray = new Uint8Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
          const blob = new Blob([byteArray], { type: "application/pdf" });
          const pdfDataUrl = URL.createObjectURL(blob);

          setPreviewDoc({
            open: true,
            html: "",
            pdfDataUrl,
            title: label,
            filename: `${doc.doc_type}_${Date.now()}`,
          });
        },
      },
    );
  };

  // ===== HELPERS =====

  const getDoc = (docType: ConventionDocType, ownerType: ConventionOwnerType, ownerId: string) => {
    return docs.find(
      (d) => d.doc_type === docType && d.owner_type === ownerType && d.owner_id === ownerId
    );
  };

  const getDocsForOwner = (ownerType: ConventionOwnerType, ownerId: string) => {
    return docs.filter((d) => d.owner_type === ownerType && d.owner_id === ownerId);
  };

  const getDocsByType = (docType: ConventionDocType) => {
    return docs.filter((d) => d.doc_type === docType);
  };

  // ===== ACTIONS =====

  const handleConfirm = async (docId: string) => {
    setSaving(docId);
    try {
      await markDocConfirmed(supabase, docId);
      setSaving(null);
      toast({ title: "Document figé" });
      await onRefresh();
    } catch (err) {
      setSaving(null);
      toast({ title: "Erreur", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  };

  const handleResetConfirm = async (docId: string) => {
    if (!confirm("Réinitialiser la confirmation de ce document ?")) return;
    setSaving(`reset-${docId}`);
    try {
      await unmarkDocConfirmed(supabase, docId);
      setSaving(null);
      toast({ title: "Document déverrouillé" });
      await onRefresh();
    } catch (err) {
      setSaving(null);
      toast({ title: "Erreur", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  };

  const handleConfirmWithDate = async (docId: string) => {
    const dateValue = dates[docId];
    if (!dateValue) {
      toast({ title: "Veuillez sélectionner une date", variant: "destructive" });
      return;
    }
    setSaving(`date-${docId}`);
    try {
      await markDocConfirmed(supabase, docId, dateValue);
      setSaving(null);
      toast({ title: "Document figé avec date" });
      await onRefresh();
    } catch (err) {
      setSaving(null);
      toast({ title: "Erreur", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  };

  const handleSendPreview = async (docId: string, recipientEmail: string | null) => {
    if (!recipientEmail) {
      toast({ title: "Pas d'email pour ce destinataire", variant: "destructive" });
      return;
    }
    setSaving(`send-${docId}`);
    const doc = docs.find((d) => d.id === docId);
    if (!doc) { setSaving(null); return; }
    if (!canExportCompanyDoc(doc)) { setSaving(null); return; }
    const docLabel = DOC_LABELS[doc.doc_type] || doc.doc_type;

    try {
      let base64: string;

      // Si le doc est lié à un template DB (custom OU système enregistré),
      // on passe par la route serveur qui gère les 2 modes (HTML→PDF ou DOCX→PDF
      // via CloudConvert). Cela résout le bug html2canvas qui plantait silencieusement
      // côté serveur, et permet d'utiliser les templates Word custom uploadés
      // par l'admin (mode docx_fidelity = fidélité ~99%).
      const ownerLearnerId = doc.owner_type === "learner" ? doc.owner_id : undefined;
      const ownerClientId = doc.owner_type === "company" ? doc.owner_id : undefined;
      const ownerTrainerId = doc.owner_type === "trainer" ? doc.owner_id : undefined;

      // Appel unifié à la route serveur :
      //   - Si doc.template_id : génère depuis ce template explicite
      //   - Sinon : la route cherche un template Word custom marqué default_for_doc_type
      //     pour ce doc_type ; si trouvé l'utilise, sinon fallback sur getDefaultTemplate (HTML)
      const res = await fetch("/api/documents/generate-from-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: doc.template_id || undefined,
          doc_type: doc.template_id ? undefined : doc.doc_type,
          context: {
            session_id: formation.id,
            learner_id: ownerLearnerId,
            client_id: ownerClientId,
            trainer_id: ownerTrainerId,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Échec génération PDF serveur");
      base64 = json.base64;

      setEmailPreview({
        docId,
        recipientEmail,
        subject: `${docLabel} — ${formation.title}`,
        body: `Bonjour,\n\nVeuillez trouver ci-joint votre document "${docLabel}" pour la formation "${formation.title}".\n\nCordialement,\nL'équipe ${entityName}`,
        pdfFilename: `${doc.doc_type.replace(/_/g, "-")}.pdf`,
        pdfBase64: base64,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur génération PDF";
      console.error("[handleSendPreview] error:", err);
      toast({ title: "Erreur de génération du PDF", description: msg, variant: "destructive" });
    }
    setSaving(null);
  };

  const handleSendConfirmed = async ({ subject, body }: { subject: string; body: string }) => {
    if (!emailPreview) return;
    const { docId, recipientEmail, pdfFilename, pdfBase64 } = emailPreview;

    const res = await fetch("/api/emails/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: recipientEmail,
        subject,
        body,
        session_id: formation.id,
        attachments: [{
          filename: pdfFilename,
          content: pdfBase64,
          type: "application/pdf",
        }],
      }),
    });

    if (!res.ok) throw new Error("Erreur envoi");

    await markDocSent(supabase, docId);

    toast({ title: "Document envoyé par email" });
    setEmailPreview(null);
    await onRefresh();
  };

  // ===== MASS SEND WITH PDF =====

  // h-22 — nom + email d'affichage selon l'owner_type d'un doc. Sert à
  // regrouper les documents secondaires par destinataire dans leur section.
  const getOwnerInfo = (
    doc: FormationConventionDocument,
  ): { name: string; email: string | null } => {
    if (doc.owner_type === "learner") {
      const l = enrollments.find((e) => e.learner?.id === doc.owner_id)?.learner;
      return {
        name: l ? `${l.first_name} ${l.last_name}` : "Apprenant retiré",
        email: l?.email ?? null,
      };
    }
    if (doc.owner_type === "company") {
      const fc = companies.find((c) => c.client_id === doc.owner_id);
      return {
        name: fc?.client?.company_name ?? "Entreprise retirée",
        email: fc?.email ?? null,
      };
    }
    if (doc.owner_type === "trainer") {
      const t = trainers.find((tr) => tr.trainer_id === doc.owner_id)?.trainer;
      return {
        name: t ? `${t.first_name} ${t.last_name}` : "Formateur retiré",
        email: t?.email ?? null,
      };
    }
    return { name: "Propriétaire inconnu", email: null };
  };

  // P4a : auto-create accès des apprenants sans compte avant opération convention
  const ensureAccessBeforeConvention = async (clientId?: string): Promise<void> => {
    try {
      const res = await fetch(`/api/sessions/${formation.id}/ensure-learner-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clientId ? { client_id: clientId } : {}),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.created > 0) {
          toast({
            title: `${data.created} accès créés automatiquement`,
            description: "Les apprenants sans compte ont reçu identifiant + mot de passe (intégrés dans le document).",
          });
        }
        if (data.failed > 0) {
          toast({
            title: "Attention",
            description: `${data.failed} apprenants n'ont pas pu être activés — le document sera généré sans leurs credentials.`,
            variant: "destructive",
          });
        }
      } else {
        console.warn("[TabConventionDocs] ensure-learner-access failed, continuing without new access");
      }
    } catch (err) {
      console.warn("[TabConventionDocs] ensure-learner-access error:", err);
    }
  };

  const handleMassSendWithPDF = async (ownerType: ConventionOwnerType, docType: string) => {
    const key = `${ownerType}-${docType}`;
    setMassSending(key);
    try {
      // P4a : auto-create accès pour les apprenants avant envoi
      if (ownerType === "learner" || ownerType === "company") {
        await ensureAccessBeforeConvention();
      }

      const result = await batchSendEmailWithRefetch(
        supabase,
        { docType, sessionId: formation.id },
        onRefresh,
      );
      if (result.failureCount > 0) {
        const sample = result.errors.slice(0, 3).map((e) => `${e.itemLabel ?? e.itemId} (${e.error})`).join(", ");
        toast({
          title: `${result.successCount}/${result.totalRequested} ${DOC_LABELS_PLURAL[docType] ?? docType} envoyés`,
          description: `${result.failureCount} échec(s) : ${sample}${result.errors.length > 3 ? "…" : ""}`,
        });
      } else {
        toast({
          title: `${result.successCount} ${DOC_LABELS_PLURAL[docType] ?? docType} envoyés`,
          description: `Envoyé en ${((result.latencyMs ?? 0) / 1000).toFixed(1)}s`,
        });
      }
    } catch (err) {
      toast({
        title: "Erreur envoi batch",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setMassSending(null);
    }
  };

  // ===== MASS DOWNLOAD PDF =====

  const handleDownloadAllPDF = async (ownerType: ConventionOwnerType, docType: string) => {
    const key = `${ownerType}-${docType}`;
    setMassDownloading(key);

    // ─── PATH SERVER-SIDE (Story F1) ──────────────────────────────────
    // Si un endpoint batch server-side existe pour ce doc_type, on l'utilise :
    // Puppeteer + cache + Promise.allSettled + JSZip + fail-soft. Le ZIP
    // arrive d'un coup et est téléchargé via Blob — pas de saturation navigateur.
    if (hasBatchEndpoint(docType)) {
      try {
        const res = await downloadBatchZip({
          docType,
          sessionId: formation.id,
          sessionTitle: formation.title ?? formation.id,
        });
        if (res.failureCount > 0) {
          toast({
            title: `${res.successCount}/${res.totalRequested} PDF téléchargés`,
            description: `${res.failureCount} échec(s) — voir _erreurs.txt dans le ZIP`,
          });
        } else {
          toast({
            title: `${res.successCount} PDF téléchargés`,
            description: `Généré en ${(res.latencyMs / 1000).toFixed(1)}s`,
          });
        }
      } catch (err) {
        toast({
          title: "Erreur génération ZIP",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      }
      setMassDownloading(null);
      return;
    }

    // ─── FALLBACK LEGACY CLIENT-SIDE ──────────────────────────────────
    // BATCH_ENDPOINTS_BY_DOC_TYPE (ZIP) couvre 6 doc_types originaux.
    // Les 15 nouveaux doc_types (cgv, planning_semaine, bilan_poe, etc.)
    // n'ont pas encore d'endpoint generate-*-batch → on garde le fallback
    // client-side pour eux. Audit séparé requis pour les migrer.
    const targetDocs = docs.filter((d) => d.doc_type === docType && d.owner_type === ownerType);
    toast({ title: `Génération de ${targetDocs.length} PDF...` });

    for (const doc of targetDocs) {
      if (!canExportCompanyDoc(doc)) continue;
      const html = await generateDocHtml(doc);
      const label = DOC_LABELS[doc.doc_type] || doc.doc_type;

      const learner = enrollments.find((e) => e.learner?.id === doc.owner_id)?.learner;
      const suffix = learner
        ? `${learner.last_name}_${learner.first_name}`
        : doc.owner_id.slice(0, 8);

      await exportHtmlToPDF(label, html, `${doc.doc_type}_${suffix}.pdf`, entityName);

      // Delay to avoid saturating the browser
      await new Promise((r) => setTimeout(r, 600));
    }

    toast({ title: `${targetDocs.length} PDF téléchargés` });
    setMassDownloading(null);
  };

  // ===== TOUT TÉLÉCHARGER (ZIP agrégé tous types) — spec 2026-06-21 =====
  const handleDownloadAllSession = async () => {
    if (docs.length === 0) return;
    setDownloadingAll(true);
    const t0 = Date.now();
    try {
      const raw: RawSessionDoc[] = docs.map((d) => {
        const info = getOwnerInfo(d);
        return {
          docType: d.doc_type,
          ownerType: d.owner_type as "learner" | "company" | "trainer",
          ownerId: d.owner_id,
          ownerName: info.name,
          templateId: d.template_id ?? null,
          customLabel: d.custom_label ?? null,
        };
      });
      const args = buildDownloadAllArgs(raw, {
        sessionId: formation.id,
        sessionTitle: formation.title ?? formation.id,
        now: new Date(),
        staticDocTypes: STATIC_DOCS as unknown as string[],
        folderLabel: (dt) => DOC_LABELS[dt] ?? dt,
        fileLabel: (dt) => DOC_LABELS[dt] ?? dt,
      });
      const res = await downloadAllSessionDocs(args);
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      if (res.failedTypes > 0) {
        toast({
          title: `${res.totalFiles} document(s) téléchargé(s)`,
          description: `${res.failedTypes} en échec — voir _erreurs.txt (généré en ${secs}s)`,
        });
      } else {
        toast({
          title: `${res.totalFiles} document(s) téléchargé(s)`,
          description: `${res.successTypes} type(s) — généré en ${secs}s`,
        });
      }
    } catch (err) {
      toast({
        title: "Erreur téléchargement global",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setDownloadingAll(false);
    }
  };

  // ===== MASS SIGNATURE REQUEST (Story F3) =====

  const handleMassSignatureRequest = async (docType: string) => {
    if (!hasBatchSignatureRequestEndpoint(docType)) {
      toast({ title: `Signature batch non supportée pour ${docType}`, variant: "destructive" });
      return;
    }
    setMassRequestingSig(docType);
    try {
      const result = await batchRequestSignaturesWithRefetch(
        supabase,
        { docType, sessionId: formation.id },
        onRefresh,
      );
      if (result.failureCount > 0) {
        const sample = result.errors.slice(0, 3).map((e) => `${e.itemLabel ?? e.itemId} (${e.error})`).join(", ");
        toast({
          title: `${result.successCount}/${result.totalRequested} demandes de signature envoyées`,
          description: `${result.failureCount} échec(s) : ${sample}${result.errors.length > 3 ? "…" : ""}`,
        });
      } else {
        toast({
          title: `${result.successCount} demandes de signature envoyées`,
          description: `Envoyé en ${((result.latencyMs ?? 0) / 1000).toFixed(1)}s — liens valides 30 jours`,
        });
      }
    } catch (err) {
      toast({
        title: "Erreur envoi demandes signature",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setMassRequestingSig(null);
    }
  };

  // Mass confirm all docs of a type (B1 — entity_id via updateDocsByDocType)
  // Lot G : ownerType optionnel pour scoper le figeage à la section qui l'appelle
  // (évite que "Tout figer" depuis Apprenants ne touche les docs Formateurs si
  // un doc_type est partagé). Cf audit BMAD #2.
  const handleMassConfirm = async (docType: ConventionDocType, ownerType?: OwnerType) => {
    setSaving(`mass-confirm-${docType}`);
    try {
      // P4a : auto-create accès avant figeage documents (si learner/company scope)
      if (!ownerType || ownerType === "learner" || ownerType === "company" || ownerType === "session") {
        await ensureAccessBeforeConvention();
      }

      const result = await batchConfirmDocumentsWithRefetch(
        supabase,
        { entityId: formation.entity_id, sessionId: formation.id, docType, ownerType },
        onRefresh,
      );
      if (!result.success && result.errors.length > 0) {
        toast({ title: "Erreur", description: result.errors[0].error, variant: "destructive" });
      } else if (result.successCount === 0) {
        toast({ title: `Aucun document à figer (déjà tous figés ?)` });
      } else {
        toast({ title: `${result.successCount} document(s) figé(s)` });
      }
    } catch (err) {
      toast({
        title: "Erreur figeage batch",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  };

  // Mass send all confirmed docs of a type
  const handleMassSend = async (docType: ConventionDocType) => {
    setSaving(`mass-send-${docType}`);
    const typeDocs = getDocsByType(docType).filter((d) => d.is_confirmed && !d.is_sent);
    let sent = 0;
    for (const doc of typeDocs) {
      let email: string | null = null;
      if (doc.owner_type === "learner") {
        const enrollment = enrollments.find((e) => e.learner?.id === doc.owner_id);
        email = enrollment?.learner?.email || null;
      }
      if (email) {
        try {
          await fetch("/api/emails/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: email,
              subject: `${DOC_LABELS[docType]} - ${formation.title}`,
              body: `Veuillez trouver ci-joint le document "${DOC_LABELS[docType]}" pour la formation "${formation.title}".`,
              session_id: formation.id,
            }),
          });
          await markDocSent(supabase, doc.id);
          sent++;
        } catch (err) {
          // Continue à itérer même si un envoi échoue, mais log pour audit.
          console.error("[TabConventionDocs mass-send] envoi échoué:", err);
        }
      }
    }
    setSaving(null);
    toast({ title: `${sent} document(s) envoyé(s)` });
    await onRefresh();
  };

  // Mass confirm all docs for a specific owner (B1 — entity_id via updateDocsForOwner)
  const handleConfirmAllForOwner = async (ownerType: ConventionOwnerType, ownerId: string) => {
    setSaving(`confirm-all-owner-${ownerId}`);
    const result = await updateDocsForOwner(
      supabase, formation.entity_id, formation.id, ownerType as OwnerType, ownerId,
      { status: "generated", generated_at: new Date().toISOString() },
    );
    setSaving(null);
    if (!result.ok) {
      toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
      return;
    }
    toast({ title: `${result.updated} document(s) figé(s)` });
    await onRefresh();
  };

  // Add custom doc for a specific owner
  const handleAddCustomDoc = async (
    ownerType: ConventionOwnerType,
    ownerId: string,
    templateId: string,
    withSignature: boolean
  ) => {
    if (!templateId) return;
    if (!entity?.id) {
      toast({ title: "Entity non chargée", variant: "destructive" });
      return;
    }
    const template = templates.find((t) => t.id === templateId);
    setSaving(`add-custom-${ownerId}-${templateId}`);
    try {
      await insertDocs(supabase, [{
        entity_id: entity.id,
        session_id: formation.id,
        doc_type: "custom",
        owner_type: ownerType,
        owner_id: ownerId,
        template_id: templateId,
        custom_label: template?.name || "Document personnalisé",
        requires_signature: withSignature,
      }]);
      setSaving(null);
      toast({ title: "Document ajouté" });
      await onRefresh();
    } catch (err: unknown) {
      setSaving(null);
      const code = (err as { code?: string })?.code;
      if (code === "23505") {
        toast({ title: "Ce document est déjà attribué", variant: "destructive" });
      } else {
        toast({ title: "Erreur", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      }
    }
  };

  // Assign template to all learners
  // FIX B3 (E3-S06) : toast succès uniquement si upsert réussit (était hors try/catch)
  const handleAssignTemplateToAll = async (templateId: string) => {
    if (!templateId) return;
    if (!entity?.id) {
      toast({ title: "Entity non chargée", variant: "destructive" });
      return;
    }
    const template = templates.find((t) => t.id === templateId);
    setSaving("assign-all");
    try {
      const result = await batchAssignTemplateToLearnersWithRefetch(
        supabase,
        {
          entityId: entity.id,
          sessionId: formation.id,
          templateId,
          templateName: template?.name || "Document personnalisé",
          enrollments,
        },
        onRefresh,
      );
      if (result.success) {
        toast({ title: `${result.successCount} document(s) attribué(s) aux apprenants` });
      } else if (result.errors.length > 0) {
        toast({
          title: "Erreur attribution batch",
          description: result.errors[0].error,
          variant: "destructive",
        });
      } else {
        toast({ title: "Aucun apprenant à attribuer" });
      }
    } catch (err) {
      toast({
        title: "Erreur attribution",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  };

  // Send document for electronic signature via /api/documents/sign-request
  const handleSendForSignature = async (doc: FormationConventionDocument, signerEmail: string | null) => {
    if (!signerEmail) {
      toast({ title: "Aucun email trouvé pour le destinataire", variant: "destructive" });
      return;
    }
    const key = `sign-${doc.id}`;
    setSaving(key);
    try {
      const res = await fetch("/api/documents/sign-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_id: doc.id,
          signer_email: signerEmail,
          session_id: formation.id,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Erreur lors de l'envoi");
      }
      toast({ title: "Demande de signature envoyée" });
      await onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur lors de l'envoi pour signature";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  // ===== RENDER HELPERS =====

  const renderStatusBadge = (doc: FormationConventionDocument | undefined) => {
    if (!doc) return null;
    const signerEmail = doc.signer_email;

    // État progressif : Signé > En attente signature > Figé > Brouillon
    if (doc.is_signed) {
      return <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200 flex items-center gap-1" title="Document signé électroniquement"><CheckCircle className="h-3 w-3" />Signé</span>;
    }
    if (doc.requires_signature && doc.is_sent && doc.is_confirmed) {
      return <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200 flex items-center gap-1" title={signerEmail ? `Envoyé à ${signerEmail}` : "Envoyé pour signature"}><Clock className="h-3 w-3" />En attente</span>;
    }
    if (doc.is_confirmed) {
      return <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 flex items-center gap-1" title="Document figé — prêt pour envoi"><CheckCircle className="h-3 w-3" />Figé</span>;
    }
    if (STATIC_DOCS.includes(doc.doc_type as ConventionDocType)) {
      return <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 flex items-center gap-1"><CheckCircle className="h-3 w-3" />Auto</span>;
    }
    return <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200 flex items-center gap-1"><Pencil className="h-3 w-3" />Brouillon</span>;
  };

  // Compact document row
  const renderDocRow = (doc: FormationConventionDocument | undefined, docType: ConventionDocType, signerEmail?: string | null) => {
    if (!doc) return null;
    const label = doc.custom_label || DOC_LABELS[docType] || docType;
    const isSaving = saving === doc.id || saving === `date-${doc.id}` || saving === `sign-${doc.id}`;

    // Story 3.5 — Warn if confirmed company convention has learners added afterwards
    const uncovered = doc.doc_type === "convention_entreprise"
      ? findUncoveredLearners(formation, doc)
      : [];

    return (
      <div key={doc.id} className={cn("flex items-center justify-between py-2 border-b last:border-b-0 gap-2 border-l-2 pl-3", DOC_COLORS[docType] || "border-l-slate-300")}>
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0", DOC_BADGE_COLORS[docType] || DOC_BADGE_COLORS.custom)}>
            {DOC_SHORT[docType] || (isCustomDocType(docType) ? "Perso." : docType)}
          </span>
          <span className="text-xs font-medium truncate">{label}</span>
          {renderStatusBadge(doc)}
          {uncovered.length > 0 && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1"
              title={`Apprenants ajoutés après confirmation (non couverts par la convention figée) : ${uncovered.map((e) => `${e.learner?.last_name?.toUpperCase() ?? ""} ${e.learner?.first_name ?? ""}`.trim()).join(", ")}. Émettre un avenant si nécessaire.`}
            >
              <AlertTriangle className="h-3 w-3" />
              {uncovered.length} apprenant{uncovered.length > 1 ? "s" : ""} non couvert{uncovered.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={() => handleView(doc)}>
            <Eye className="h-3 w-3" /> Voir
          </Button>
          {!doc.is_confirmed && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs gap-1"
                onClick={() => handleConfirm(doc.id)}
                disabled={isSaving}
              >
                {saving === doc.id && <Loader2 className="h-3 w-3 animate-spin" />}
                <CheckCircle className="h-3 w-3" /> Figer
              </Button>
              <Input
                type="date"
                className="w-[130px] h-6 text-xs"
                value={dates[doc.id] || ""}
                onChange={(e) => setDates((prev) => ({ ...prev, [doc.id]: e.target.value }))}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs gap-1"
                onClick={() => handleConfirmWithDate(doc.id)}
                disabled={saving === `date-${doc.id}`}
              >
                {saving === `date-${doc.id}` && <Loader2 className="h-3 w-3 animate-spin" />}
                Date + Figer
              </Button>
            </>
          )}
          {doc.is_confirmed && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-gray-400 hover:text-gray-600"
              onClick={() => handleResetConfirm(doc.id)}
              disabled={saving === `reset-${doc.id}`}
              title="Réinitialiser la confirmation"
            >
              <Undo2 className="h-3 w-3" />
            </Button>
          )}
          {doc.requires_signature && !doc.is_signed && (
            <Button
              size="sm"
              variant="outline"
              className={`h-6 text-xs gap-1 ${doc.is_confirmed ? "border-orange-300 text-orange-700 hover:bg-orange-50" : "text-gray-400"}`}
              onClick={() => doc.is_confirmed ? handleSendForSignature(doc, signerEmail || null) : toast({ title: "Figez d'abord le document", description: "Le document doit être figé avant de pouvoir être envoyé pour signature.", variant: "destructive" })}
              disabled={saving === `sign-${doc.id}`}
              title={doc.is_confirmed ? "Envoyer pour signature électronique" : "Figez d'abord le document pour l'envoyer en signature"}
            >
              {saving === `sign-${doc.id}` && <Loader2 className="h-3 w-3 animate-spin" />}
              <PenLine className="h-3 w-3" /> {doc.is_confirmed ? "Envoyer pour signature" : "Signature"}
            </Button>
          )}
        </div>
      </div>
    );
  };

  // Compact static doc row
  const renderStaticDocRow = (doc: FormationConventionDocument | undefined, docType: ConventionDocType, email: string | null) => {
    if (!doc) return null;
    const label = DOC_LABELS[docType] || docType;

    return (
      <div key={doc.id} className={cn("flex items-center justify-between py-2 border-b last:border-b-0 gap-2 border-l-2 pl-3", DOC_COLORS[docType] || "border-l-slate-300")}>
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0", DOC_BADGE_COLORS[docType] || DOC_BADGE_COLORS.custom)}>
            {DOC_SHORT[docType] || docType}
          </span>
          <span className="text-xs font-medium truncate">{label}</span>
          {renderStatusBadge(doc)}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={() => handleView(doc)}>
            <Download className="h-3 w-3" /> PDF
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-xs gap-1"
            onClick={() => handleSendPreview(doc.id, email)}
            disabled={saving === `send-${doc.id}`}
          >
            {saving === `send-${doc.id}` && <Loader2 className="h-3 w-3 animate-spin" />}
            <Send className="h-3 w-3" /> Email
          </Button>
        </div>
      </div>
    );
  };

  // Compact add custom doc
  const renderAddCustomDoc = (
    ownerType: ConventionOwnerType,
    ownerId: string,
    withSignature: boolean,
    label: string
  ) => {
    const key = `${ownerType}-${ownerId}-${withSignature ? "sig" : "nosig"}`;
    return (
      <div className="flex items-center gap-2 pt-2">
        <span className="text-xs text-muted-foreground shrink-0">{label}</span>
        <Select
          value={customSelections[key] || ""}
          onValueChange={(val) => setCustomSelections((prev) => ({ ...prev, [key]: val }))}
        >
          <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
            <SelectValue placeholder="Modèle..." />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="h-7 text-xs shrink-0"
          onClick={() => {
            const templateId = customSelections[key];
            if (templateId) handleAddCustomDoc(ownerType, ownerId, templateId, withSignature);
          }}
          disabled={!customSelections[key]}
        >
          <Plus className="h-3 w-3 mr-1" /> Ajouter
        </Button>
      </div>
    );
  };

  // ===== MAIN RENDER =====

  // Helper: render owner section (learner, company, trainer)
  const renderOwnerSection = (
    ownerType: ConventionOwnerType,
    ownerId: string,
    ownerName: string,
    email: string | null,
    defaultDocTypes: ConventionDocType[],
    index: number
  ) => {
    const ownerDocs = getDocsForOwner(ownerType, ownerId);
    const customDocs = ownerDocs.filter((d) => d.doc_type === "custom");

    return (
      <div key={`${ownerType}-${ownerId}`} className={index > 0 ? "border-t" : ""}>
        {/* Owner header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-muted/10">
          <span className="text-sm font-medium">{ownerName}</span>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs gap-1"
              onClick={() => setConfirmOwner({ ownerType, ownerId, ownerName })}
              disabled={saving === `confirm-all-owner-${ownerId}`}
            >
              {saving === `confirm-all-owner-${ownerId}` && <Loader2 className="h-3 w-3 animate-spin" />}
              <CheckCircle className="h-3 w-3" /> Tout figer
            </Button>
          </div>
        </div>
        {/* Documents */}
        <div className="px-4 pb-2">
          {defaultDocTypes.map((docType) => renderDocRow(getDoc(docType, ownerType, ownerId), docType, email))}
          {STATIC_DOCS.map((docType) => renderStaticDocRow(getDoc(docType, ownerType, ownerId), docType, email))}
          {customDocs.map((doc) => renderDocRow(doc, "custom", email))}
          {templates.length > 0 && (
            <div className="flex items-center gap-2 pt-2">
              <Select
                value={customSelections[`${ownerType}-${ownerId}`] || ""}
                onValueChange={(val) => setCustomSelections((prev) => ({ ...prev, [`${ownerType}-${ownerId}`]: val }))}
              >
                <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
                  <SelectValue placeholder="Ajouter un document personnalisé..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-7 text-xs shrink-0"
                onClick={() => {
                  const templateId = customSelections[`${ownerType}-${ownerId}`];
                  if (templateId) handleAddCustomDoc(ownerType, ownerId, templateId, false);
                }}
                disabled={!customSelections[`${ownerType}-${ownerId}`]}
              >
                <Plus className="h-3 w-3 mr-1" /> Ajouter
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const isInitializing = initializing && docs.length === 0 && enrollments.length > 0;

  // ── Compute progress stats for hero row ──
  const docProgress = (() => {
    const types = ["convocation", "certificat_realisation", "attestation_assiduite", "feuille_emargement", "convention_entreprise"] as const;
    const labels: Record<string, string> = { convocation: "Convocations", certificat_realisation: "Certificats", attestation_assiduite: "Attestations", feuille_emargement: "Émargements", convention_entreprise: "Conventions" };
    return types.map(t => {
      const typeDocs = docs.filter(d => d.doc_type === t);
      const total = typeDocs.length;
      const confirmed = typeDocs.filter(d => d.is_confirmed).length;
      const sent = typeDocs.filter(d => d.is_sent).length;
      const signed = typeDocs.filter(d => d.is_signed).length;
      return { type: t, label: labels[t], total, confirmed, sent, signed };
    }).filter(p => p.total > 0);
  })();

  // ── Build learner × docType matrix ──
  const learnerMatrix = enrollments.filter(e => e.learner).map(e => {
    const learner = e.learner!;
    const row: Record<string, { status: "signed" | "sent" | "confirmed" | "none"; docId?: string }> = {};
    for (const dt of DEFAULT_LEARNER_DOCS) {
      const doc = docs.find(d => d.doc_type === dt && d.owner_type === "learner" && d.owner_id === learner.id);
      if (!doc) { row[dt] = { status: "none" }; continue; }
      if (doc.is_signed) row[dt] = { status: "signed", docId: doc.id };
      else if (doc.is_sent) row[dt] = { status: "sent", docId: doc.id };
      else if (doc.is_confirmed) row[dt] = { status: "confirmed", docId: doc.id };
      else row[dt] = { status: "none", docId: doc.id };
    }
    return { id: learner.id, name: `${learner.first_name} ${learner.last_name?.charAt(0)}.`, row };
  });

  // ── Build company × docType matrix ──
  const companyMatrix = companies.filter(c => c.client).map(fc => {
    const client = fc.client!;
    const row: Record<string, { status: "signed" | "sent" | "confirmed" | "none"; docId?: string }> = {};
    for (const dt of DEFAULT_COMPANY_DOCS) {
      const doc = docs.find(d => d.doc_type === dt && d.owner_type === "company" && d.owner_id === client.id);
      if (!doc) { row[dt] = { status: "none" }; continue; }
      if (doc.is_signed) row[dt] = { status: "signed", docId: doc.id };
      else if (doc.is_sent) row[dt] = { status: "sent", docId: doc.id };
      else if (doc.is_confirmed) row[dt] = { status: "confirmed", docId: doc.id };
      else row[dt] = { status: "none", docId: doc.id };
    }
    return { id: client.id, name: client.company_name, row };
  });

  // ── Build trainer × docType matrix ──
  const trainerMatrix = trainers.filter(t => t.trainer).map(ft => {
    const trainer = ft.trainer!;
    const row: Record<string, { status: "signed" | "sent" | "confirmed" | "none"; docId?: string }> = {};
    for (const dt of DEFAULT_TRAINER_DOCS) {
      const doc = docs.find(d => d.doc_type === dt && d.owner_type === "trainer" && d.owner_id === trainer.id);
      if (!doc) { row[dt] = { status: "none" }; continue; }
      if (doc.is_signed) row[dt] = { status: "signed", docId: doc.id };
      else if (doc.is_sent) row[dt] = { status: "sent", docId: doc.id };
      else if (doc.is_confirmed) row[dt] = { status: "confirmed", docId: doc.id };
      else row[dt] = { status: "none", docId: doc.id };
    }
    return { id: trainer.id, name: `${trainer.first_name} ${trainer.last_name}`, row };
  });

  // ── h-22 — Documents secondaires ─────────────────────────────────────
  // Les doc_types secondaires (∈ SECONDARY_DOC_TYPES) ne sont ni dans
  // DEFAULT_*_DOCS, ni STATIC_DOCS, ni "custom" : ils étaient bien chargés
  // dans `docs` mais aucun rendu ne les itérait → invisibles. On les
  // regroupe ici par destinataire pour la section dédiée (2 vues).
  const secondaryDocs = docs.filter(
    (d) => isSecondaryDocType(d.doc_type) || isCustomDocType(d.doc_type),
  );
  const secondaryDocTypesPresent = Array.from(
    new Set(secondaryDocs.map((d) => d.doc_type)),
  );

  // Groupes pour le panneau d'actions en masse (visible dans les 2 vues).
  // ⚠ DOIT rester APRÈS `secondaryDocTypesPresent` : le builder le référence
  // (via secondaryByOwner) et l'IIFE s'exécute au render → sinon TDZ runtime
  // "Cannot access ... before initialization" qui crashe la page (hotfix).
  const bulkGroups: BulkDocGroup[] = (() => {
    const countOf = (ownerType: ConventionOwnerType, docType: string) =>
      docs.filter((d) => d.owner_type === ownerType && d.doc_type === docType).length;

    const buildRows = (ownerType: ConventionOwnerType, docTypes: readonly string[]) =>
      docTypes
        .map((dt) => ({
          docType: dt,
          label: DOC_LABELS_PLURAL[dt] ?? DOC_LABELS[dt] ?? dt,
          count: countOf(ownerType, dt),
          canDownload: hasBatchEndpoint(dt),
          canSend: hasBatchSendEndpoint(dt),
          signable: REQUIRES_SIGNATURE_TYPES.includes(dt as ConventionDocType) && hasBatchSignatureRequestEndpoint(dt),
        }))
        .filter((r) => r.count > 0);

    const secondaryByOwner = (ownerType: ConventionOwnerType) =>
      secondaryDocTypesPresent
        .map((dt) => ({
          docType: dt,
          label: DOC_LABELS[dt] ?? dt,
          count: countOf(ownerType, dt),
          canDownload: hasBatchEndpoint(dt),
          canSend: hasBatchSendEndpoint(dt),
          signable: hasBatchSignatureRequestEndpoint(dt),
        }))
        .filter((r) => r.count > 0);

    return [
      {
        ownerType: "learner" as const,
        ownerLabel: "Apprenants",
        rows: [...buildRows("learner", DEFAULT_LEARNER_DOCS), ...secondaryByOwner("learner")],
      },
      {
        ownerType: "company" as const,
        ownerLabel: "Entreprises",
        rows: [...buildRows("company", DEFAULT_COMPANY_DOCS), ...secondaryByOwner("company")],
      },
      {
        ownerType: "trainer" as const,
        ownerLabel: "Formateurs",
        rows: [...buildRows("trainer", DEFAULT_TRAINER_DOCS), ...secondaryByOwner("trainer")],
      },
    ];
  })();

  const secondaryGroups = (() => {
    const ownerRank: Record<string, number> = { learner: 0, company: 1, trainer: 2 };
    const map = new Map<
      string,
      {
        key: string;
        ownerType: string;
        name: string;
        email: string | null;
        docs: FormationConventionDocument[];
      }
    >();
    for (const d of secondaryDocs) {
      const key = `${d.owner_type}-${d.owner_id}`;
      let group = map.get(key);
      if (!group) {
        const info = getOwnerInfo(d);
        group = { key, ownerType: d.owner_type, name: info.name, email: info.email, docs: [] };
        map.set(key, group);
      }
      group.docs.push(d);
    }
    return Array.from(map.values()).sort(
      (a, b) =>
        (ownerRank[a.ownerType] ?? 9) - (ownerRank[b.ownerType] ?? 9) ||
        a.name.localeCompare(b.name),
    );
  })();

  // ── Désattribution d'un type secondaire (retire toutes ses lignes de la session) ──
  const desattribDocs = desattribType
    ? secondaryDocs.filter((d) => d.doc_type === desattribType)
    : [];
  const desattribLabel =
    desattribDocs[0]?.custom_label ||
    (desattribType ? DOC_LABELS[desattribType] || desattribType : "");
  const desattribHasSensitive = desattribDocs.some(
    (d) => d.is_confirmed || d.is_signed || d.is_sent,
  );

  const handleDesattribuer = async () => {
    if (!desattribType) return;
    setDesattribBusy(true);
    try {
      const res = await fetch(
        `/api/documents/attribute-secondary?formationId=${encodeURIComponent(
          formation.id,
        )}&docType=${encodeURIComponent(desattribType)}`,
        { method: "DELETE" },
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erreur serveur");
      const n = (result.deleted ?? 0) as number;
      toast({
        title: "Document retiré",
        description: `${n} ligne${n > 1 ? "s" : ""} supprimée${n > 1 ? "s" : ""}.`,
      });
      setDesattribType(null);
      await onRefresh();
    } catch (err) {
      toast({
        title: "Erreur",
        description:
          err instanceof Error ? err.message : "Impossible de retirer le document.",
        variant: "destructive",
      });
    } finally {
      setDesattribBusy(false);
    }
  };

  // ── Avatar color helper ──
  const getAvatarColor = (name: string) => {
    const colors = ["bg-blue-100 text-blue-700", "bg-purple-100 text-purple-700", "bg-pink-100 text-pink-700", "bg-amber-100 text-amber-700", "bg-emerald-100 text-emerald-700", "bg-indigo-100 text-indigo-700", "bg-rose-100 text-rose-700", "bg-teal-100 text-teal-700"];
    const hash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  const statusDot = (s: "signed" | "sent" | "confirmed" | "none") => {
    if (s === "signed") return <span className="inline-block w-3 h-3 rounded-full bg-green-500" title="Signé" />;
    if (s === "sent") return <span className="inline-block w-3 h-3 rounded-full bg-amber-400" title="Envoyé" />;
    if (s === "confirmed") return <span className="inline-block w-3 h-3 rounded-full bg-blue-400" title="Figé" />;
    return <span className="inline-block w-3 h-3 rounded-full bg-gray-200" title="Non traité" />;
  };

  if (isInitializing) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Matrix cell overlay: download button on hover
  const renderMatrixOverlay = (_ownerId: string, _docType: string, docId?: string) => {
    if (!docId) return null;
    const doc = docs.find(d => d.id === docId);
    if (!doc) return null;
    return (
      <button
        onClick={async (e) => {
          e.stopPropagation();
          if (!canExportCompanyDoc(doc)) return;
          const html = await generateDocHtml(doc);
          const label = doc.custom_label || DOC_LABELS[doc.doc_type] || doc.doc_type;
          await exportHtmlToPDF(label, html, `${doc.doc_type}_${doc.id}`, entityName);
          toast({ title: "PDF téléchargé" });
        }}
        className="bg-white border shadow-sm rounded-full p-1 hover:bg-gray-50"
        title="Télécharger PDF"
      >
        <Download className="h-3 w-3 text-gray-600" />
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* ═══ CONTRATS DE SOUS-TRAITANCE FORMATEURS — Lot Sub audit BMAD ═══ */}
      <SubcontractingContractsPanel formation={formation} />

      {/* ═══ HERO ROW — Progress par type ═══ */}
      {docProgress.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {docProgress.map(p => {
            const pct = p.total > 0 ? Math.round(((p.confirmed + p.sent + p.signed) / p.total) * 100) : 0;
            const barColor = pct === 100 ? "bg-green-500" : pct > 0 ? "bg-amber-400" : "bg-gray-200";
            return (
              <div key={p.type} className="border rounded-lg p-3">
                <p className="text-xs font-medium text-gray-700">{p.label}</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground">{p.confirmed + p.sent + p.signed}/{p.total}</span>
                </div>
                <div className="flex gap-2 mt-1.5 text-[10px] text-muted-foreground">
                  {p.signed > 0 && <span className="text-green-600">{p.signed} signé{p.signed > 1 ? "s" : ""}</span>}
                  {p.sent > 0 && <span className="text-amber-600">{p.sent} envoyé{p.sent > 1 ? "s" : ""}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ QUICK ACTIONS ═══ */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          className="text-xs h-7 gap-1"
          onClick={async () => {
            const unfrozenCount = docs.filter(d => !d.is_confirmed).length;
            if (unfrozenCount === 0) { toast({ title: "Tous les documents sont déjà figés" }); return; }
            if (!confirm(`Figer ${unfrozenCount} document(s) ? Les informations ne seront plus modifiables ensuite.`)) return;
            setSaving("confirm-all-learners");
            // B1 — entity_id ajouté inline (scope "tous les types" non couvert par updateDocsByDocType)
            // TODO: extraire dans updateAllDocsForSession() quand le helper sera créé
            const { error } = await supabase
              .from("documents")
              .update({ status: "generated", generated_at: new Date().toISOString() })
              .eq("entity_id", formation.entity_id)
              .eq("source_table", "sessions")
              .eq("source_id", formation.id)
              .eq("status", "draft");
            setSaving(null);
            if (!error) {
              toast({ title: `${unfrozenCount} document(s) figé(s)` });
              await onRefresh();
            } else {
              toast({ title: "Erreur", description: error.message, variant: "destructive" });
            }
          }}
          disabled={saving === "confirm-all-learners"}
        >
          {saving === "confirm-all-learners" && <Loader2 className="h-3 w-3 animate-spin" />}
          <CheckCircle className="h-3 w-3" /> Tout figer
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-xs h-7 gap-1"
          onClick={handleDownloadAllSession}
          disabled={downloadingAll || docs.length === 0}
          title="Tous les documents de la session en un seul ZIP"
        >
          {downloadingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
          Tout télécharger (ZIP)
        </Button>
        {/* h-22 : bouton catalogue documents secondaires
            P10 (code review 2026-05-19) — libellé aligné sur spec AC-3 */}
        <Button
          size="sm"
          variant="outline"
          className="text-xs h-7 gap-1"
          onClick={() => setSecondaryCatalogOpen(true)}
          title="Attribuer des documents secondaires (avis habilitation, attestations métier, autorisations…)"
        >
          <Plus className="h-3 w-3 mr-1" /> Ajouter doc secondaire
        </Button>
        <div className="flex-1" />
        <Button
          size="sm"
          variant={matrixView ? "default" : "ghost"}
          className="text-xs h-7"
          onClick={() => setMatrixView(true)}
        >
          Matrice
        </Button>
        <Button
          size="sm"
          variant={!matrixView ? "default" : "ghost"}
          className="text-xs h-7"
          onClick={() => setMatrixView(false)}
        >
          Détail
        </Button>
      </div>

      {/* Actions en masse — visibles dans les 2 vues (spec 2026-06-21) */}
      <BulkDocActionsPanel
        groups={bulkGroups}
        savingKey={saving}
        massSending={massSending}
        massDownloading={massDownloading}
        massRequestingSig={massRequestingSig}
        onConfirmAll={(docType, ownerType) => handleMassConfirm(docType as ConventionDocType, ownerType)}
        onDownloadAll={(ownerType, docType) => handleDownloadAllPDF(ownerType, docType)}
        onSendAll={(ownerType, docType) => handleMassSendWithPDF(ownerType, docType)}
        onRequestSignature={(docType) => handleMassSignatureRequest(docType)}
      />

      {/* ═══ VUE MATRICE — Composants réutilisables ═══ */}
      {matrixView && (
        <div className="space-y-4">
          {learnerMatrix.length > 0 && (
            <DocMatrixSection
              title="Apprenants"
              rows={learnerMatrix.map(lr => ({
                id: lr.id, name: lr.name,
                cells: Object.fromEntries(Object.entries(lr.row).map(([k, v]) => [k, { ...v, status: v.status === "signed" ? "completed" : v.status === "confirmed" ? "assigned" : v.status === "none" ? "not_assigned" : v.status }])),
              }))}
              docTypes={DEFAULT_LEARNER_DOCS}
              docLabels={DOC_LABELS}
              avatarColorFn={getAvatarColor}
              onCellClick={(_ownerId, _docType, docId) => { if (docId) { const d = docs.find(x => x.id === docId); if (d) handleView(d); } }}
              renderCellOverlay={renderMatrixOverlay}
            />
          )}
          {companyMatrix.length > 0 && (
            <DocMatrixSection
              title="Entreprises"
              rows={companyMatrix.map(cr => ({
                id: cr.id, name: cr.name,
                cells: Object.fromEntries(Object.entries(cr.row).map(([k, v]) => [k, { ...v, status: v.status === "signed" ? "completed" : v.status === "confirmed" ? "assigned" : v.status === "none" ? "not_assigned" : v.status }])),
              }))}
              docTypes={DEFAULT_COMPANY_DOCS}
              docLabels={DOC_LABELS}
              avatarColorFn={getAvatarColor}
              onCellClick={(_ownerId, _docType, docId) => { if (docId) { const d = docs.find(x => x.id === docId); if (d) handleView(d); } }}
              renderCellOverlay={renderMatrixOverlay}
            />
          )}
          {trainerMatrix.length > 0 && (
            <DocMatrixSection
              title="Formateurs"
              rows={trainerMatrix.map(tr => ({
                id: tr.id, name: tr.name,
                cells: Object.fromEntries(Object.entries(tr.row).map(([k, v]) => [k, { ...v, status: v.status === "signed" ? "completed" : v.status === "confirmed" ? "assigned" : v.status === "none" ? "not_assigned" : v.status }])),
              }))}
              docTypes={DEFAULT_TRAINER_DOCS}
              docLabels={DOC_LABELS}
              avatarColorFn={getAvatarColor}
              onCellClick={(_ownerId, _docType, docId) => { if (docId) { const d = docs.find(x => x.id === docId); if (d) handleView(d); } }}
              renderCellOverlay={renderMatrixOverlay}
            />
          )}

          {/* Lien vers gestion des templates (avec breadcrumb retour) */}
          <div className="flex justify-end">
            <Link
              href={`/admin/documents?from=formation&from_id=${formation.id}&from_tab=documents`}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
            >
              Gérer les modèles de documents →
            </Link>
          </div>

          {/* Documents communs — auto-confirmés */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-2">
              <h3 className="text-sm font-semibold text-emerald-900 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Documents communs — auto-confirmés
              </h3>
              <p className="text-xs text-emerald-700 mt-0.5">
                Disponibles automatiquement pour tous les apprenants et entreprises
              </p>
            </div>
            <div className="divide-y">
              {STATIC_DOCS.map(dt => (
                <div key={dt} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm font-medium">{DOC_LABELS[dt] || dt}</span>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                      const doc = docs.find(d => d.doc_type === dt);
                      if (doc) handleView(doc);
                    }}>
                      <Eye className="h-3 w-3 mr-1" /> PDF
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* ═══ VUE DÉTAIL (existante) ═══ */}
      {!matrixView && (
        <>

      {/* Mass actions — compact */}
      <div className="border rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 bg-muted/30 border-b">
          <span className="text-sm font-medium">Documents personnalisés (masse)</span>
        </div>

        {/* Mass custom docs */}
        <div className="px-4 py-2.5 border-t">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">Autres documents (masse)</span>
            <Select
              value={customSelections["mass-nosig"] || ""}
              onValueChange={(val) => setCustomSelections((prev) => ({ ...prev, ["mass-nosig"]: val }))}
            >
              <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
                <SelectValue placeholder="Modèle..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-7 text-xs shrink-0"
              onClick={() => {
                const tid = customSelections["mass-nosig"];
                if (tid) setConfirmAssignAll({ templateId: tid });
              }}
              disabled={!customSelections["mass-nosig"] || saving === "assign-all"}
            >
              {saving === "assign-all" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Attribuer à tous
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs shrink-0"
              onClick={async () => {
                setSaving("confirm-custom");
                // B1 — entity_id via updateDocsByDocType
                const r = await updateDocsByDocType(
                  supabase, formation.entity_id, formation.id, "custom",
                  { status: "generated", generated_at: new Date().toISOString() },
                  { onlyStatus: "draft" },
                );
                setSaving(null);
                if (!r.ok) {
                  toast({ title: "Erreur", description: r.error.message, variant: "destructive" });
                  return;
                }
                toast({ title: `${r.updated} document(s) figé(s)` });
                await onRefresh();
              }}
              disabled={saving === "confirm-custom"}
            >
              Tout figer
            </Button>
          </div>
        </div>
      </div>

      {/* ===== APPRENANTS ===== */}
      {showAll && (
        <div className="border rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/30 border-b">
            <span className="text-sm font-medium">Apprenants ({enrollments.length})</span>
          </div>

          {enrollments.length === 0 ? (
            <p className="text-sm text-muted-foreground px-4 py-4 text-center italic">Aucun apprenant inscrit.</p>
          ) : (
            enrollments.map((enrollment, i) => {
              const learner = enrollment.learner;
              if (!learner) return null;
              return renderOwnerSection("learner", learner.id, `${learner.first_name} ${learner.last_name}`, learner.email, DEFAULT_LEARNER_DOCS, i);
            })
          )}
        </div>
      )}

      {/* ===== ENTREPRISES ===== */}
      {showAll && (
        <div className="border rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/30 border-b">
            <span className="text-sm font-medium">Entreprises ({companies.length})</span>
          </div>

          {companies.length === 0 ? (
            <p className="text-sm text-muted-foreground px-4 py-4 text-center italic">Aucune entreprise.</p>
          ) : (
            companies.map((fc, i) => {
              const client = fc.client;
              if (!client) return null;
              return renderOwnerSection("company", client.id, client.company_name, fc.email, DEFAULT_COMPANY_DOCS, i);
            })
          )}
        </div>
      )}

      {/* ===== FORMATEURS ===== */}
      {showAll && (
        <div className="border rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/30 border-b">
            <span className="text-sm font-medium">Formateurs ({trainers.length})</span>
          </div>

          {trainers.length === 0 ? (
            <p className="text-sm text-muted-foreground px-4 py-4 text-center italic">Aucun formateur.</p>
          ) : (
            trainers.map((ft, i) => {
              const trainer = ft.trainer;
              if (!trainer) return null;
              return renderOwnerSection("trainer", trainer.id, `${trainer.first_name} ${trainer.last_name}`, trainer.email, DEFAULT_TRAINER_DOCS, i);
            })
          )}
        </div>
      )}

        </>
      )}

      {/* ═══ DOCUMENTS SECONDAIRES (h-22) — visibles dans les 2 vues ═══ */}
      {secondaryDocs.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-sky-50 border-b border-sky-100 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-sky-900 flex items-center gap-2">
              <Paperclip className="h-4 w-4" />
              Documents secondaires ({secondaryDocs.length})
            </h3>
            <p className="text-xs text-sky-700 mt-0.5">
              Attribués via « Ajouter doc secondaire ». Figez, générez (Voir) et signez-les comme les documents officiels.
            </p>
            {/* Désattribution : retirer un type (toute la session) */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[11px] text-sky-700">Retirer un type :</span>
              {secondaryDocTypesPresent.map((dt) => {
                const sample = secondaryDocs.find((d) => d.doc_type === dt);
                const lbl =
                  sample?.custom_label || DOC_LABELS[dt] || DOC_SHORT[dt] || dt;
                return (
                  <button
                    key={dt}
                    type="button"
                    onClick={() => setDesattribType(dt)}
                    title={`Retirer « ${lbl} » de la session`}
                    className="inline-flex items-center gap-1 text-[11px] bg-white border border-sky-200 text-sky-800 rounded-full px-2 py-0.5 transition hover:bg-red-50 hover:border-red-200 hover:text-red-700"
                  >
                    <span className="truncate max-w-[160px]">{lbl}</span>
                    <X className="h-3 w-3 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Documents groupés par destinataire */}
          <div className="divide-y">
            {secondaryGroups.map((group) => (
              <div key={group.key} className="px-4 py-2">
                <p className="text-xs font-semibold text-gray-700 py-1">{group.name}</p>
                {group.docs.map((doc) =>
                  renderDocRow(doc, doc.doc_type as ConventionDocType, group.email),
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Dialog: Document preview ── */}
      {previewDoc && (
        <Dialog open={previewDoc.open} onOpenChange={(open) => {
          if (!open) {
            // Cleanup blob URL pour éviter fuite mémoire
            if (previewDoc.pdfDataUrl?.startsWith("blob:")) {
              URL.revokeObjectURL(previewDoc.pdfDataUrl);
            }
            setPreviewDoc(null);
          }
        }}>
          <DialogContent className="max-w-4xl h-[85vh] flex flex-col overflow-hidden">
            <DialogHeader>
              <DialogTitle>{previewDoc.title}</DialogTitle>
            </DialogHeader>
            {previewDoc.pdfDataUrl ? (
              /* Mode docx_fidelity : aperçu PDF généré par CloudConvert */
              <div className="flex-1 border rounded-lg overflow-hidden bg-gray-50">
                <iframe
                  src={previewDoc.pdfDataUrl}
                  className="w-full h-full"
                  title={previewDoc.title}
                />
              </div>
            ) : (
              /* Mode editable / legacy : rendu HTML inline */
              <div
                className="prose prose-sm max-w-none flex-1 overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: previewDoc.html }}
              />
            )}
            <DialogFooter>
              {previewDoc.pdfDataUrl ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = previewDoc.pdfDataUrl!;
                    a.download = `${previewDoc.filename}.pdf`;
                    a.click();
                  }}
                >
                  <FileDown className="h-4 w-4 mr-2" /> Télécharger PDF
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={async () => {
                    await exportHtmlToPDF(
                      previewDoc.title,
                      previewDoc.html,
                      previewDoc.filename,
                      entityName
                    );
                  }}
                >
                  <FileDown className="h-4 w-4 mr-2" /> Télécharger PDF
                </Button>
              )}
              <Button variant="outline" onClick={() => setPreviewDoc(null)}>
                Fermer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {/* Email Preview Dialog */}
      {emailPreview && (
        <EmailPreviewDialog
          open={!!emailPreview}
          onClose={() => setEmailPreview(null)}
          onSend={handleSendConfirmed}
          defaultSubject={emailPreview.subject}
          defaultBody={emailPreview.body}
          recipientEmail={emailPreview.recipientEmail}
          attachments={[{ filename: emailPreview.pdfFilename, content: emailPreview.pdfBase64, type: "application/pdf" }]}
          entityName={entityName}
          allowExtraAttachments
          templates={docEmailTemplates}
          templateVars={{ titre_formation: formation.title ?? "", entite: entityName }}
          availableAttachments={formationAtts}
        />
      )}

      {/* Incomplete data dialog (422 INCOMPLETE_DATA from useDocumentGeneration) */}
      {incompleteDialog}

      {/* h-22 : Dialog catalogue documents secondaires */}
      <SecondaryDocCatalogDialog
        open={secondaryCatalogOpen}
        onOpenChange={setSecondaryCatalogOpen}
        formationId={formation.id}
        onAttributed={async () => {
          await onRefresh();
        }}
      />

      {/* Désattribution : confirmation de retrait d'un type secondaire */}
      <Dialog
        open={desattribType !== null}
        onOpenChange={(open) => {
          if (desattribBusy) return;
          if (!open) setDesattribType(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-red-600" />
              Retirer « {desattribLabel} » ?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-gray-600">
            <p>
              Cette action retire ce type de document pour{" "}
              <strong>toute la session</strong> ({desattribDocs.length} ligne
              {desattribDocs.length > 1 ? "s" : ""}, tous destinataires). Vous
              pourrez le ré-attribuer ensuite.
            </p>
            {desattribHasSensitive && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-800">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="text-xs">
                  Au moins un document de ce type a déjà été généré, envoyé ou
                  signé. Le retrait supprimera ces lignes de la session.
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDesattribType(null)}
              disabled={desattribBusy}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleDesattribuer}
              disabled={desattribBusy}
              className="gap-2"
            >
              {desattribBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Retirer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* E3-S05 : Batch ops confirmation dialogs */}
      <BatchOpsConfirmDialog
        open={!!confirmMassSend}
        onOpenChange={(open) => { if (!open) setConfirmMassSend(null); }}
        title={`Envoyer ${confirmMassSend ? getDocsByType(confirmMassSend.docType).filter(d => d.is_confirmed && !d.is_sent).length : 0} document(s) par email`}
        itemsCount={confirmMassSend ? getDocsByType(confirmMassSend.docType).filter(d => d.is_confirmed && !d.is_sent).length : 0}
        itemsLabel="documents"
        failureMode="partial"
        onConfirm={async () => {
          if (confirmMassSend) await handleMassSend(confirmMassSend.docType);
        }}
      />

      <BatchOpsConfirmDialog
        open={!!confirmAssignAll}
        onOpenChange={(open) => { if (!open) setConfirmAssignAll(null); }}
        title={`Attribuer le document à ${enrollments.filter(e => e.learner).length} apprenant(s)`}
        itemsCount={enrollments.filter(e => e.learner).length}
        itemsLabel="apprenants"
        failureMode="partial"
        onConfirm={async () => {
          if (confirmAssignAll) await handleAssignTemplateToAll(confirmAssignAll.templateId);
        }}
      />

      <BatchOpsConfirmDialog
        open={!!confirmOwner}
        onOpenChange={(open) => { if (!open) setConfirmOwner(null); }}
        title={`Figer tous les documents de ${confirmOwner?.ownerName ?? ""}`}
        itemsCount={confirmOwner ? getDocsForOwner(confirmOwner.ownerType, confirmOwner.ownerId).filter(d => !d.is_confirmed).length : 0}
        itemsLabel="documents"
        failureMode="atomic"
        onConfirm={async () => {
          if (confirmOwner) await handleConfirmAllForOwner(confirmOwner.ownerType, confirmOwner.ownerId);
        }}
      />
    </div>
  );
}
