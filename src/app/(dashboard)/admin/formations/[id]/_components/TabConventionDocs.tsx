"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Loader2, Eye, CheckCircle, Send, Copy, Clock, Download,
  ChevronDown, ChevronUp, Plus, FileDown, PenLine,
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
import { useEntity } from "@/contexts/EntityContext";
import { getDefaultTemplate } from "@/lib/document-templates-defaults";
import { resolveVariables } from "@/lib/utils/resolve-variables";
import { exportHtmlToPDF, exportHtmlToPDFBase64 } from "@/lib/pdf-export";
import type {
  Session, ConventionDocType, ConventionOwnerType,
  FormationConventionDocument, DocumentTemplate,
} from "@/lib/types";

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

// ===== CONSTANTS =====

const DOC_LABELS: Record<string, string> = {
  convocation: "CONVOCATION À LA FORMATION",
  certificat_realisation: "CERTIFICAT DE RÉALISATION",
  attestation_assiduite: "ATTESTATION D'ASSIDUITÉ",
  feuille_emargement: "FEUILLE D'ÉMARGEMENT",
  micro_certificat: "MICRO-CERTIFICAT",
  cgv: "CGV",
  politique_confidentialite: "POLITIQUE DE CONFIDENTIALITÉ",
  reglement_interieur: "RÈGLEMENT INTÉRIEUR",
  programme_formation: "PROGRAMME DE LA FORMATION",
  convention_entreprise: "CONVENTION ENTREPRISE",
  feuille_emargement_collectif: "FEUILLE D'ÉMARGEMENT COLLECTIF",
  convention_intervention: "CONVENTION D'INTERVENTION",
  contrat_sous_traitance: "CONTRAT CADRE DE SOUS-TRAITANCE",
};

const DOC_LABELS_PLURAL: Record<string, string> = {
  convocation: "convocations",
  certificat_realisation: "certificats de réalisation",
  attestation_assiduite: "attestations d'assiduité",
  feuille_emargement: "feuilles d'émargement",
  micro_certificat: "micro-certificats",
};

const DEFAULT_LEARNER_DOCS: ConventionDocType[] = [
  "convocation", "certificat_realisation", "attestation_assiduite",
  "feuille_emargement", "micro_certificat",
];

const STATIC_DOCS: ConventionDocType[] = [
  "cgv", "politique_confidentialite", "reglement_interieur", "programme_formation",
];

const DEFAULT_COMPANY_DOCS: ConventionDocType[] = [
  "convention_entreprise", "feuille_emargement_collectif",
];

const DEFAULT_TRAINER_DOCS: ConventionDocType[] = [
  "convention_intervention", "contrat_sous_traitance",
];

const REQUIRES_SIGNATURE_TYPES: ConventionDocType[] = [
  "convention_entreprise", "convention_intervention", "contrat_sous_traitance",
];

export function TabConventionDocs({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();

  const [saving, setSaving] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(true);
  const [dates, setDates] = useState<Record<string, string>>({});
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [massSending, setMassSending] = useState<string | null>(null);
  const [massDownloading, setMassDownloading] = useState<string | null>(null);

  // Custom doc template selections
  const [customSelections, setCustomSelections] = useState<Record<string, string>>({});

  // Preview state
  const [previewDoc, setPreviewDoc] = useState<{
    open: boolean;
    html: string;
    title: string;
    filename: string;
  } | null>(null);

  const { entity } = useEntity();
  const entityName = entity?.name || "MR FORMATION";

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
  const initializeDefaultDocs = useCallback(async () => {
    if (initialized) return;
    const rows: {
      session_id: string;
      doc_type: string;
      owner_type: string;
      owner_id: string;
      requires_signature: boolean;
    }[] = [];

    // For each learner: default docs + static docs
    for (const enrollment of enrollments) {
      if (!enrollment.learner) continue;
      const learnerId = enrollment.learner.id;
      for (const dt of [...DEFAULT_LEARNER_DOCS, ...STATIC_DOCS]) {
        rows.push({
          session_id: formation.id,
          doc_type: dt,
          owner_type: "learner",
          owner_id: learnerId,
          requires_signature: false,
        });
      }
    }

    // For each company: default docs + static docs
    for (const fc of companies) {
      if (!fc.client) continue;
      const clientId = fc.client.id;
      for (const dt of [...DEFAULT_COMPANY_DOCS, ...STATIC_DOCS]) {
        rows.push({
          session_id: formation.id,
          doc_type: dt,
          owner_type: "company",
          owner_id: clientId,
          requires_signature: REQUIRES_SIGNATURE_TYPES.includes(dt),
        });
      }
    }

    // For each trainer: default docs + static docs
    for (const ft of trainers) {
      if (!ft.trainer) continue;
      const trainerId = ft.trainer.id;
      for (const dt of [...DEFAULT_TRAINER_DOCS, ...STATIC_DOCS]) {
        rows.push({
          session_id: formation.id,
          doc_type: dt,
          owner_type: "trainer",
          owner_id: trainerId,
          requires_signature: REQUIRES_SIGNATURE_TYPES.includes(dt),
        });
      }
    }

    if (rows.length > 0) {
      await supabase
        .from("formation_convention_documents")
        .upsert(rows, { onConflict: "session_id,doc_type,owner_type,owner_id,template_id", ignoreDuplicates: true });
      await onRefresh();
    }
    setInitialized(true);
  }, [formation.id, enrollments, companies, trainers, supabase, onRefresh, initialized]);

  useEffect(() => {
    if (!loadingTemplates && enrollments.length > 0) {
      initializeDefaultDocs();
    }
  }, [loadingTemplates, initializeDefaultDocs, enrollments.length]);

  // ===== GENERATE DOCUMENT HTML (reusable) =====

  const generateDocHtml = async (doc: FormationConventionDocument): Promise<string> => {
    const learner = enrollments.find((e) => e.learner?.id === doc.owner_id)?.learner;
    const company = companies.find((c) => c.client_id === doc.owner_id)?.client;
    const trainerData = trainers.find((t) => t.trainer_id === doc.owner_id)?.trainer;

    const templateData = {
      formation,
      learner: learner ? { first_name: learner.first_name, last_name: learner.last_name, email: learner.email ?? undefined } : undefined,
      company: company || undefined,
      trainer: trainerData || undefined,
      entityName,
    };

    const resolveCtx = {
      session: formation,
      learner: learner || null,
      client: company || null,
      trainer: trainerData || null,
    };

    let htmlContent: string | null = null;

    if (doc.template_id) {
      const { data: template } = await supabase
        .from("document_templates")
        .select("content")
        .eq("id", doc.template_id)
        .single();
      if (template?.content?.trim()) {
        htmlContent = resolveVariables(template.content, resolveCtx);
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
        htmlContent = getDefaultTemplate(doc.doc_type, templateData);
      }
    }

    return DOMPurify.sanitize(htmlContent || "");
  };

  // ===== VIEW DOCUMENT =====

  const handleView = async (doc: FormationConventionDocument) => {
    const html = await generateDocHtml(doc);
    if (!html) {
      toast({ title: "Aucun modèle disponible pour ce type de document", variant: "destructive" });
      return;
    }
    const label = doc.custom_label || DOC_LABELS[doc.doc_type] || doc.doc_type;
    setPreviewDoc({ open: true, html, title: label, filename: `${doc.doc_type}_${Date.now()}` });
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
    const { error } = await supabase
      .from("formation_convention_documents")
      .update({ is_confirmed: true, confirmed_at: new Date().toISOString() })
      .eq("id", docId);
    setSaving(null);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Document confirmé" });
      onRefresh();
    }
  };

  const handleConfirmWithDate = async (docId: string) => {
    const dateValue = dates[docId];
    if (!dateValue) {
      toast({ title: "Veuillez sélectionner une date", variant: "destructive" });
      return;
    }
    setSaving(`date-${docId}`);
    const { error } = await supabase
      .from("formation_convention_documents")
      .update({
        is_confirmed: true,
        confirmed_at: new Date().toISOString(),
        document_date: dateValue,
      })
      .eq("id", docId);
    setSaving(null);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Document confirmé avec date" });
      onRefresh();
    }
  };

  const handleSend = async (docId: string, recipientEmail: string | null) => {
    if (!recipientEmail) {
      toast({ title: "Pas d'email pour ce destinataire", variant: "destructive" });
      return;
    }
    setSaving(`send-${docId}`);
    const doc = docs.find((d) => d.id === docId);
    if (!doc) { setSaving(null); return; }
    const docLabel = DOC_LABELS[doc.doc_type] || doc.doc_type;

    try {
      const html = await generateDocHtml(doc);
      const base64 = await exportHtmlToPDFBase64(docLabel, html, entityName);

      const res = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipientEmail,
          subject: `${docLabel} — ${formation.title}`,
          body: `Bonjour,\n\nVeuillez trouver ci-joint votre document "${docLabel}" pour la formation "${formation.title}".\n\nCordialement,\nL'équipe formation`,
          session_id: formation.id,
          attachments: [{
            filename: `${doc.doc_type.replace(/_/g, "-")}.pdf`,
            content: base64,
            type: "application/pdf",
          }],
        }),
      });

      if (!res.ok) throw new Error("Erreur envoi");

      await supabase
        .from("formation_convention_documents")
        .update({ is_sent: true, sent_at: new Date().toISOString() })
        .eq("id", docId);

      toast({ title: `${docLabel} envoyé avec PDF` });
      onRefresh();
    } catch {
      toast({ title: "Erreur d'envoi", variant: "destructive" });
    }
    setSaving(null);
  };

  // ===== MASS SEND WITH PDF =====

  const getRecipientEmail = (doc: FormationConventionDocument): string | null => {
    if (doc.owner_type === "learner") {
      return enrollments.find((e) => e.learner?.id === doc.owner_id)?.learner?.email || null;
    }
    if (doc.owner_type === "company") {
      return companies.find((c) => c.client_id === doc.owner_id)?.email || null;
    }
    if (doc.owner_type === "trainer") {
      return trainers.find((t) => t.trainer_id === doc.owner_id)?.trainer?.email || null;
    }
    return null;
  };

  const handleMassSendWithPDF = async (ownerType: ConventionOwnerType, docType: string) => {
    const key = `${ownerType}-${docType}`;
    setMassSending(key);

    const targetDocs = docs.filter((d) => d.doc_type === docType && d.owner_type === ownerType);
    let sent = 0;
    let failed = 0;

    for (const doc of targetDocs) {
      const email = getRecipientEmail(doc);
      if (!email) { failed++; continue; }

      try {
        const html = await generateDocHtml(doc);
        const base64 = await exportHtmlToPDFBase64(
          DOC_LABELS[doc.doc_type] || doc.doc_type, html, entityName
        );

        const res = await fetch("/api/emails/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: email,
            subject: `${DOC_LABELS[doc.doc_type] || doc.doc_type} — ${formation.title}`,
            body: `Bonjour,\n\nVeuillez trouver ci-joint votre document pour la formation "${formation.title}".\n\nCordialement,\nL'équipe formation`,
            session_id: formation.id,
            attachments: [{
              filename: `${doc.doc_type.replace(/_/g, "-")}.pdf`,
              content: base64,
              type: "application/pdf",
            }],
          }),
        });

        if (res.ok) {
          await supabase
            .from("formation_convention_documents")
            .update({ is_sent: true, sent_at: new Date().toISOString() })
            .eq("id", doc.id);
          sent++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }

      // Anti-spam delay
      await new Promise((r) => setTimeout(r, 800));
    }

    toast({
      title: `${sent} envoyé${sent > 1 ? "s" : ""}${failed > 0 ? `, ${failed} échec${failed > 1 ? "s" : ""}` : ""}`,
    });
    setMassSending(null);
    onRefresh();
  };

  // ===== MASS DOWNLOAD PDF =====

  const handleDownloadAllPDF = async (ownerType: ConventionOwnerType, docType: string) => {
    const key = `${ownerType}-${docType}`;
    setMassDownloading(key);

    const targetDocs = docs.filter((d) => d.doc_type === docType && d.owner_type === ownerType);
    toast({ title: `Génération de ${targetDocs.length} PDF...` });

    for (const doc of targetDocs) {
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

  // Mass confirm all docs of a type
  const handleMassConfirm = async (docType: ConventionDocType) => {
    setSaving(`mass-confirm-${docType}`);
    const { error } = await supabase
      .from("formation_convention_documents")
      .update({ is_confirmed: true, confirmed_at: new Date().toISOString() })
      .eq("session_id", formation.id)
      .eq("doc_type", docType)
      .eq("is_confirmed", false);
    setSaving(null);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Toutes les ${DOC_LABELS_PLURAL[docType] || docType} confirmées` });
      onRefresh();
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
          await supabase
            .from("formation_convention_documents")
            .update({ is_sent: true, sent_at: new Date().toISOString() })
            .eq("id", doc.id);
          sent++;
        } catch { /* continue */ }
      }
    }
    setSaving(null);
    toast({ title: `${sent} document(s) envoyé(s)` });
    onRefresh();
  };

  // Mass confirm all docs for a specific owner
  const handleConfirmAllForOwner = async (ownerType: ConventionOwnerType, ownerId: string) => {
    setSaving(`confirm-all-${ownerId}`);
    const { error } = await supabase
      .from("formation_convention_documents")
      .update({ is_confirmed: true, confirmed_at: new Date().toISOString() })
      .eq("session_id", formation.id)
      .eq("owner_type", ownerType)
      .eq("owner_id", ownerId)
      .eq("is_confirmed", false);
    setSaving(null);
    if (error) {
      toast({ title: "Erreur", variant: "destructive" });
    } else {
      toast({ title: "Tous les documents confirmés" });
      onRefresh();
    }
  };

  // Add custom doc for a specific owner
  const handleAddCustomDoc = async (
    ownerType: ConventionOwnerType,
    ownerId: string,
    templateId: string,
    withSignature: boolean
  ) => {
    if (!templateId) return;
    const template = templates.find((t) => t.id === templateId);
    setSaving(`add-custom-${ownerId}-${templateId}`);
    const { error } = await supabase.from("formation_convention_documents").insert({
      session_id: formation.id,
      doc_type: "custom",
      owner_type: ownerType,
      owner_id: ownerId,
      template_id: templateId,
      custom_label: template?.name || "Document personnalisé",
      requires_signature: withSignature,
    });
    setSaving(null);
    if (error) {
      if (error.code === "23505") {
        toast({ title: "Ce document est déjà attribué", variant: "destructive" });
      } else {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
      }
    } else {
      toast({ title: "Document ajouté" });
      onRefresh();
    }
  };

  // Assign template to all learners
  const handleAssignTemplateToAll = async (templateId: string) => {
    if (!templateId) return;
    const template = templates.find((t) => t.id === templateId);
    setSaving("assign-all");
    const rows = enrollments
      .filter((e) => e.learner)
      .map((e) => ({
        session_id: formation.id,
        doc_type: "custom" as const,
        owner_type: "learner" as const,
        owner_id: e.learner!.id,
        template_id: templateId,
        custom_label: template?.name || "Document personnalisé",
        requires_signature: false,
      }));
    if (rows.length > 0) {
      await supabase
        .from("formation_convention_documents")
        .upsert(rows, { onConflict: "session_id,doc_type,owner_type,owner_id,template_id", ignoreDuplicates: true });
    }
    setSaving(null);
    toast({ title: "Document attribué à tous les apprenants" });
    onRefresh();
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
      onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur lors de l'envoi pour signature";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  // ===== RENDER HELPERS =====

  const renderStatusBadges = (doc: FormationConventionDocument | undefined) => {
    if (!doc) return null;
    return (
      <div className="flex items-center gap-1.5">
        {!STATIC_DOCS.includes(doc.doc_type as ConventionDocType) && (
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${doc.is_confirmed ? "bg-green-100 text-green-700" : "bg-red-50 text-red-600"}`}>
            {doc.is_confirmed ? "Confirmé" : "Non confirmé"}
          </span>
        )}
        <span className={`text-xs px-1.5 py-0.5 rounded-full ${doc.is_sent ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
          {doc.is_sent ? "Envoyé" : "Non envoyé"}
        </span>
        {doc.requires_signature && (
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${doc.is_signed ? "bg-green-100 text-green-700" : "bg-orange-50 text-orange-600"}`}>
            {doc.is_signed ? "Signé" : "Non signé"}
          </span>
        )}
      </div>
    );
  };

  // Compact document row
  const renderDocRow = (doc: FormationConventionDocument | undefined, docType: ConventionDocType, signerEmail?: string | null) => {
    if (!doc) return null;
    const label = doc.custom_label || DOC_LABELS[docType] || docType;
    const isSaving = saving === doc.id || saving === `date-${doc.id}` || saving === `sign-${doc.id}`;

    return (
      <div key={doc.id} className="flex items-center justify-between py-2 border-b last:border-b-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium truncate">{label}</span>
          {renderStatusBadges(doc)}
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
                <CheckCircle className="h-3 w-3" /> Confirmer
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
                Date + Confirmer
              </Button>
            </>
          )}
          {doc.requires_signature && doc.is_confirmed && !doc.is_signed && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs gap-1 border-orange-300 text-orange-700 hover:bg-orange-50"
              onClick={() => handleSendForSignature(doc, signerEmail || null)}
              disabled={saving === `sign-${doc.id}`}
            >
              {saving === `sign-${doc.id}` && <Loader2 className="h-3 w-3 animate-spin" />}
              <PenLine className="h-3 w-3" /> Envoyer pour signature
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
      <div key={doc.id} className="flex items-center justify-between py-2 border-b last:border-b-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium truncate">{label}</span>
          {renderStatusBadges(doc)}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={() => handleView(doc)}>
            <Download className="h-3 w-3" /> PDF
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-xs gap-1"
            onClick={() => handleSend(doc.id, email)}
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
              onClick={() => handleConfirmAllForOwner(ownerType, ownerId)}
              disabled={saving === `confirm-all-${ownerId}`}
            >
              {saving === `confirm-all-${ownerId}` && <Loader2 className="h-3 w-3 animate-spin" />}
              <CheckCircle className="h-3 w-3" /> Tout confirmer
            </Button>
          </div>
        </div>
        {/* Documents */}
        <div className="px-4 pb-2">
          {defaultDocTypes.map((docType) => renderDocRow(getDoc(docType, ownerType, ownerId), docType, email))}
          {STATIC_DOCS.map((docType) => renderStaticDocRow(getDoc(docType, ownerType, ownerId), docType, email))}
          {customDocs.map((doc) => renderDocRow(doc, "custom", email))}
          {renderAddCustomDoc(ownerType, ownerId, true, "Avec e-signature")}
          {renderAddCustomDoc(ownerType, ownerId, false, "Sans e-signature")}
        </div>
      </div>
    );
  };

  if (!initialized && enrollments.length > 0) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Documents de convention
          </h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl">
            Les documents avec signature électronique restent dynamiques jusqu&apos;à la signature du destinataire.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 gap-1"
            onClick={async () => {
              setSaving("confirm-all-learners");
              const { error } = await supabase
                .from("formation_convention_documents")
                .update({ is_confirmed: true, confirmed_at: new Date().toISOString() })
                .eq("session_id", formation.id)
                .eq("owner_type", "learner")
                .eq("is_confirmed", false);
              setSaving(null);
              if (!error) { toast({ title: "Tous les documents des apprenants confirmés" }); onRefresh(); }
            }}
            disabled={saving === "confirm-all-learners"}
          >
            {saving === "confirm-all-learners" && <Loader2 className="h-3 w-3 animate-spin" />}
            <CheckCircle className="h-3 w-3" /> Tout confirmer (apprenants)
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-7 gap-1"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showAll ? "Masquer" : "Afficher"}
          </Button>
        </div>
      </div>

      {/* Mass actions — compact */}
      <div className="border rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 bg-muted/30 border-b">
          <span className="text-sm font-medium">Actions en masse — documents par défaut</span>
        </div>
        <div className="px-4 py-2 space-y-1.5">
          {DEFAULT_LEARNER_DOCS.map((docType) => {
            const label = DOC_LABELS_PLURAL[docType] || docType;
            const isMassConfirming = saving === `mass-confirm-${docType}`;
            const isMassSending = saving === `mass-send-${docType}`;

            return (
              <div key={docType} className="flex items-center justify-between py-1">
                <span className="text-xs font-medium text-muted-foreground capitalize">{label}</span>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs gap-1"
                    onClick={() => handleMassConfirm(docType)}
                    disabled={isMassConfirming}
                  >
                    {isMassConfirming && <Loader2 className="h-3 w-3 animate-spin" />}
                    <CheckCircle className="h-3 w-3" /> Confirmer
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs gap-1"
                    onClick={() => handleMassSend(docType)}
                    disabled={isMassSending}
                  >
                    {isMassSending && <Loader2 className="h-3 w-3 animate-spin" />}
                    <Send className="h-3 w-3" /> Envoyer
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={() => {
                      navigator.clipboard.writeText(`${DOC_LABELS[docType]} - ${formation.title}`);
                      toast({ title: "Copié" });
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
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
                if (tid) handleAssignTemplateToAll(tid);
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
                await supabase
                  .from("formation_convention_documents")
                  .update({ is_confirmed: true, confirmed_at: new Date().toISOString() })
                  .eq("session_id", formation.id)
                  .eq("doc_type", "custom")
                  .eq("is_confirmed", false);
                setSaving(null);
                toast({ title: "Autres documents confirmés" });
                onRefresh();
              }}
              disabled={saving === "confirm-custom"}
            >
              Tout confirmer
            </Button>
          </div>
        </div>
      </div>

      {/* ===== APPRENANTS ===== */}
      {showAll && (
        <div className="border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b">
            <span className="text-sm font-medium">Apprenants ({enrollments.length})</span>
            {enrollments.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs gap-1"
                  onClick={() => handleMassSendWithPDF("learner", "convocation")}
                  disabled={massSending !== null}
                >
                  {massSending?.startsWith("learner") ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  Envoyer tout
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs gap-1"
                  onClick={() => handleDownloadAllPDF("learner", "convocation")}
                  disabled={massDownloading !== null}
                >
                  {massDownloading?.startsWith("learner") ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                  PDF tout
                </Button>
              </div>
            )}
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
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b">
            <span className="text-sm font-medium">Entreprises ({companies.length})</span>
            {companies.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" className="h-6 text-xs gap-1"
                  onClick={() => handleMassSendWithPDF("company", "convention_entreprise")}
                  disabled={massSending !== null}
                >
                  {massSending?.startsWith("company") ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  Envoyer tout
                </Button>
              </div>
            )}
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
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b">
            <span className="text-sm font-medium">Formateurs ({trainers.length})</span>
            {trainers.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" className="h-6 text-xs gap-1"
                  onClick={() => handleMassSendWithPDF("trainer", "convention_intervention")}
                  disabled={massSending !== null}
                >
                  {massSending?.startsWith("trainer") ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  Envoyer tout
                </Button>
              </div>
            )}
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

      {/* ── Dialog: Document preview ── */}
      {previewDoc && (
        <Dialog open={previewDoc.open} onOpenChange={(open) => { if (!open) setPreviewDoc(null); }}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{previewDoc.title}</DialogTitle>
            </DialogHeader>
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: previewDoc.html }}
            />
            <DialogFooter>
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
              <Button variant="outline" onClick={() => setPreviewDoc(null)}>
                Fermer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
