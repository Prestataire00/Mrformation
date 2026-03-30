"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Loader2, Eye, CheckCircle, Send, Copy, Clock, Download,
  ChevronDown, ChevronUp, Plus, FileDown,
} from "lucide-react";
import DOMPurify from "dompurify";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { exportHtmlToPDF } from "@/lib/pdf-export";
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

  // ===== VIEW DOCUMENT =====

  const handleView = async (doc: FormationConventionDocument) => {
    let htmlContent: string | null = null;

    if (doc.template_id) {
      const { data: template } = await supabase
        .from("document_templates")
        .select("content")
        .eq("id", doc.template_id)
        .single();

      if (template?.content) {
        const learner = enrollments.find((e) => e.learner?.id === doc.owner_id)?.learner;
        htmlContent = resolveVariables(template.content, {
          session: formation,
          learner: learner || null,
          client: null,
          trainer: null,
        });
      }
    } else {
      const learner = enrollments.find((e) => e.learner?.id === doc.owner_id)?.learner;
      const company = companies.find((c) => c.client_id === doc.owner_id)?.client;
      const trainerData = trainers.find((t) => t.trainer_id === doc.owner_id)?.trainer;

      htmlContent = getDefaultTemplate(doc.doc_type, {
        formation,
        learner: learner ? { first_name: learner.first_name, last_name: learner.last_name, email: learner.email ?? undefined } : undefined,
        company: company || undefined,
        trainer: trainerData || undefined,
        entityName,
      });
    }

    if (!htmlContent) {
      toast({ title: "Aucun modèle disponible pour ce type de document", variant: "destructive" });
      return;
    }

    const label = doc.custom_label || DOC_LABELS[doc.doc_type] || doc.doc_type;
    setPreviewDoc({
      open: true,
      html: DOMPurify.sanitize(htmlContent),
      title: label,
      filename: `${doc.doc_type}_${Date.now()}`,
    });
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
    const docLabel = doc ? DOC_LABELS[doc.doc_type] || doc.doc_type : "Document";

    try {
      const res = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipientEmail,
          subject: `${docLabel} - ${formation.title}`,
          body: `Veuillez trouver ci-joint le document "${docLabel}" pour la formation "${formation.title}".`,
          session_id: formation.id,
        }),
      });

      if (!res.ok) throw new Error("Erreur envoi");

      await supabase
        .from("formation_convention_documents")
        .update({ is_sent: true, sent_at: new Date().toISOString() })
        .eq("id", docId);

      toast({ title: "Document envoyé" });
      onRefresh();
    } catch {
      toast({ title: "Erreur d'envoi", variant: "destructive" });
    }
    setSaving(null);
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

  // ===== RENDER HELPERS =====

  const renderStatusBadges = (doc: FormationConventionDocument | undefined) => {
    if (!doc) return null;
    const badges: JSX.Element[] = [];

    if (!STATIC_DOCS.includes(doc.doc_type as ConventionDocType)) {
      badges.push(
        <span key="confirmed" className={doc.is_confirmed ? "text-green-600 font-semibold" : "text-red-500 font-semibold"}>
          {doc.is_confirmed ? "CONFIRMÉ" : "NON CONFIRMÉ"}
        </span>
      );
    }

    badges.push(
      <span key="sent" className={doc.is_sent ? "text-green-600 font-semibold" : "text-red-500 font-semibold"}>
        {doc.is_sent ? "ENVOYÉ" : "NON ENVOYÉ"}
      </span>
    );

    if (doc.requires_signature) {
      badges.push(
        <span key="signed" className={doc.is_signed ? "text-green-600 font-semibold" : "text-red-500 font-semibold"}>
          {doc.is_signed ? "SIGNÉ" : "NON SIGNÉ"}
        </span>
      );
    }

    return (
      <span className="text-sm">
        ({badges.reduce((prev, curr, i) => (
          <>{prev}{i > 0 && " - "}{curr}</>
        ) as unknown as JSX.Element, <></> as JSX.Element)})
      </span>
    );
  };

  // Render a confirmable document row (convocation, certificat, etc.)
  const renderDocRow = (doc: FormationConventionDocument | undefined, docType: ConventionDocType) => {
    if (!doc) return null;
    const label = doc.custom_label || DOC_LABELS[docType] || docType;
    const isSaving = saving === doc.id || saving === `date-${doc.id}`;

    return (
      <div key={doc.id} className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm">{label}</span>
          {renderStatusBadges(doc)}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            className="bg-teal-500 hover:bg-teal-600 text-white"
            onClick={() => handleView(doc)}
          >
            <Eye className="h-4 w-4 mr-1" /> Voir
          </Button>
          {!doc.is_confirmed && (
            <Button
              size="sm"
              className="bg-teal-500 hover:bg-teal-600 text-white"
              onClick={() => handleConfirm(doc.id)}
              disabled={isSaving}
            >
              {saving === doc.id && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Confirmer le document
            </Button>
          )}
          {!doc.is_confirmed && (
            <>
              <Input
                type="date"
                className="w-[160px] h-9"
                value={dates[doc.id] || ""}
                onChange={(e) => setDates((prev) => ({ ...prev, [doc.id]: e.target.value }))}
              />
              <Button
                size="sm"
                className="bg-teal-500 hover:bg-teal-600 text-white"
                onClick={() => handleConfirmWithDate(doc.id)}
                disabled={saving === `date-${doc.id}`}
              >
                {saving === `date-${doc.id}` && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Modifier la date et confirmer
              </Button>
            </>
          )}
        </div>
      </div>
    );
  };

  // Render a static document row (CGV, Politique, etc.)
  const renderStaticDocRow = (doc: FormationConventionDocument | undefined, docType: ConventionDocType, email: string | null) => {
    if (!doc) return null;
    const label = DOC_LABELS[docType] || docType;

    return (
      <div key={doc.id} className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm">{label}</span>
          {renderStatusBadges(doc)}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            className="bg-teal-500 hover:bg-teal-600 text-white"
            onClick={() => handleView(doc)}
          >
            <Download className="h-4 w-4 mr-1" /> Voir/Télécharger
          </Button>
          <Button
            size="sm"
            className="bg-teal-500 hover:bg-teal-600 text-white"
            onClick={() => handleSend(doc.id, email)}
            disabled={saving === `send-${doc.id}`}
          >
            {saving === `send-${doc.id}` && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            <Send className="h-4 w-4 mr-1" /> Envoyer par e-mail
          </Button>
        </div>
      </div>
    );
  };

  // Add custom document selector
  const renderAddCustomDoc = (
    ownerType: ConventionOwnerType,
    ownerId: string,
    withSignature: boolean,
    label: string
  ) => {
    const key = `${ownerType}-${ownerId}-${withSignature ? "sig" : "nosig"}`;
    return (
      <div className="space-y-1 pt-3">
        <p className="text-sm">
          <span className="font-semibold">{label}</span>
          {" | "}
          <span className="text-muted-foreground text-xs">
            Vous pouvez créer d&apos;autres modèles de documents {withSignature ? "avec" : "sans"} e-signature en{" "}
            <Link href="/admin/documents" className="text-teal-600 underline cursor-pointer" target="_blank">cliquant ici</Link>
          </span>
        </p>
        <div className="flex items-center gap-2">
          <Select
            value={customSelections[key] || ""}
            onValueChange={(val) => setCustomSelections((prev) => ({ ...prev, [key]: val }))}
          >
            <SelectTrigger className="w-[300px]">
              <SelectValue placeholder="Sélectionner un modèle..." />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="bg-teal-500 hover:bg-teal-600 text-white"
            onClick={() => {
              const templateId = customSelections[key];
              if (templateId) handleAddCustomDoc(ownerType, ownerId, templateId, withSignature);
            }}
            disabled={!customSelections[key]}
          >
            <Plus className="h-4 w-4 mr-1" /> Ajouter
          </Button>
        </div>
      </div>
    );
  };

  // ===== MAIN RENDER =====

  if (!initialized && enrollments.length > 0) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">{formation.title}</h2>

      {/* Explanatory text */}
      <p className="text-sm text-muted-foreground">
        Les documents des clients et des formateurs qui exigent une signature électronique restent dynamiques
        jusqu&apos;à la signature du destinataire. Après la signature du destinataire, le document final sera
        enregistré et non modifiable. Vous pouvez toujours nous contacter par chat pour vous aider en cas d&apos;erreur.
      </p>

      {/* Global actions */}
      <div className="flex flex-wrap gap-3">
        <Button
          className="bg-orange-400 hover:bg-orange-500 text-white"
          onClick={async () => {
            setSaving("confirm-all-learners");
            const { error } = await supabase
              .from("formation_convention_documents")
              .update({ is_confirmed: true, confirmed_at: new Date().toISOString() })
              .eq("session_id", formation.id)
              .eq("owner_type", "learner")
              .eq("is_confirmed", false);
            setSaving(null);
            if (!error) {
              toast({ title: "Tous les documents des apprenants confirmés" });
              onRefresh();
            }
          }}
          disabled={saving === "confirm-all-learners"}
        >
          {saving === "confirm-all-learners" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          <CheckCircle className="h-4 w-4 mr-2" />
          Confirmer tous les documents des apprenants
        </Button>
        <Button
          className="bg-teal-500 hover:bg-teal-600 text-white"
          onClick={() => toast({ title: "Téléchargement ZIP (à implémenter)" })}
        >
          <Download className="h-4 w-4 mr-2" />
          Télécharger les documents de fin de formation confirmés de tous les apprenants
        </Button>
      </div>

      {/* ===== MASS DEFAULT DOCS ===== */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <h3 className="text-lg font-bold">Confirmer et envoyer en masse les document défauts</h3>
          {DEFAULT_LEARNER_DOCS.map((docType) => {
            const label = DOC_LABELS_PLURAL[docType] || docType;
            const isMassConfirming = saving === `mass-confirm-${docType}`;
            const isMassSending = saving === `mass-send-${docType}`;

            return (
              <div key={docType} className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  className="bg-orange-400 hover:bg-orange-500 text-white"
                  onClick={() => handleMassConfirm(docType)}
                  disabled={isMassConfirming}
                >
                  {isMassConfirming && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Confirmer toutes les {label}
                </Button>
                <Button
                  size="sm"
                  className="bg-teal-500 hover:bg-teal-600 text-white"
                  onClick={() => handleMassSend(docType)}
                  disabled={isMassSending}
                >
                  {isMassSending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Envoyer toutes les {label} confirmées aux apprenants
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(`${DOC_LABELS[docType]} - ${formation.title}`);
                    toast({ title: "Copié" });
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  className="bg-orange-400 hover:bg-orange-500 text-white"
                  onClick={() => toast({ title: "Planification (à implémenter)" })}
                >
                  <Clock className="h-4 w-4 mr-1" /> Planifier
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ===== MASS OTHER DOCS ===== */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <h3 className="text-lg font-bold">Attribuer, confirmer &amp; télécharger en masse d&apos;autres documents</h3>
          <div className="space-y-2">
            <p className="text-sm">
              <span className="font-semibold">Ajouter d&apos;autres documents (Sans signature electronique)</span>
              {" | "}
              <span className="text-muted-foreground text-xs">
                Vous pouvez créer d&apos;autres modèles de documents sans e-signature en{" "}
                <Link href="/admin/documents" className="text-teal-600 underline cursor-pointer" target="_blank">cliquant ici</Link>
              </span>
            </p>
            <div className="flex items-center gap-2">
              <Select
                value={customSelections["mass-nosig"] || ""}
                onValueChange={(val) => setCustomSelections((prev) => ({ ...prev, ["mass-nosig"]: val }))}
              >
                <SelectTrigger className="w-[300px]">
                  <SelectValue placeholder="Sélectionner un modèle..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                className="bg-teal-500 hover:bg-teal-600 text-white"
                onClick={() => {
                  const tid = customSelections["mass-nosig"];
                  if (tid) handleAssignTemplateToAll(tid);
                }}
                disabled={!customSelections["mass-nosig"] || saving === "assign-all"}
              >
                {saving === "assign-all" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Attribuer à tous les apprenants
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              className="bg-teal-500 hover:bg-teal-600 text-white"
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
              Confirmer tous les autres documents attribués (sans e-signature)
            </Button>
            <Button
              className="bg-teal-500 hover:bg-teal-600 text-white"
              onClick={() => toast({ title: "Téléchargement (à implémenter)" })}
            >
              Télécharger tous les autres documents attribués confirmés
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ===== SHOW/HIDE TOGGLE ===== */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-lg font-bold mb-3">Masquer/Afficher Tout</h3>
          <div className="flex gap-2">
            <Button
              className="bg-orange-400 hover:bg-orange-500 text-white"
              onClick={() => setShowAll(false)}
            >
              <ChevronUp className="h-4 w-4 mr-1" /> Masquer Tout
            </Button>
            <Button
              className="bg-orange-400 hover:bg-orange-500 text-white"
              onClick={() => setShowAll(true)}
            >
              <ChevronDown className="h-4 w-4 mr-1" /> Afficher Tout
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ===== DOCUMENTS POUR LES APPRENANTS ===== */}
      <div className="bg-teal-500 text-white text-center py-3 font-bold text-sm uppercase rounded">
        Documents pour les apprenants &amp; particuliers
      </div>

      {showAll && enrollments.map((enrollment) => {
        const learner = enrollment.learner;
        if (!learner) return null;
        const ownerDocs = getDocsForOwner("learner", learner.id);
        const customDocs = ownerDocs.filter((d) => d.doc_type === "custom");

        return (
          <Card key={enrollment.id}>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h4 className="font-bold text-lg">{learner.first_name} {learner.last_name}</h4>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-teal-500 hover:bg-teal-600 text-white"
                    onClick={() => handleConfirmAllForOwner("learner", learner.id)}
                    disabled={saving === `confirm-all-${learner.id}`}
                  >
                    {saving === `confirm-all-${learner.id}` && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Confirmer tous les documents de cet apprenant
                  </Button>
                  <Button
                    size="sm"
                    className="bg-teal-500 hover:bg-teal-600 text-white"
                    onClick={() => toast({ title: "Téléchargement (à implémenter)" })}
                  >
                    Télécharger les documents de fin de formation confirmés
                  </Button>
                </div>
              </div>

              {/* Default learner docs */}
              {DEFAULT_LEARNER_DOCS.map((docType) =>
                renderDocRow(getDoc(docType, "learner", learner.id), docType)
              )}

              {/* Static docs */}
              {STATIC_DOCS.map((docType) =>
                renderStaticDocRow(getDoc(docType, "learner", learner.id), docType, learner.email)
              )}

              {/* Custom docs */}
              {customDocs.map((doc) =>
                renderDocRow(doc, "custom")
              )}

              {/* Add custom docs */}
              {renderAddCustomDoc("learner", learner.id, true, "Ajouter d'autres documents (Avec signature electronique)")}
              {renderAddCustomDoc("learner", learner.id, false, "Ajouter d'autres documents (Sans signature electronique)")}
            </CardContent>
          </Card>
        );
      })}

      {enrollments.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            Aucun apprenant inscrit.
          </CardContent>
        </Card>
      )}

      {/* ===== DOCUMENTS POUR LES ENTREPRISES ===== */}
      <div className="bg-teal-500 text-white text-center py-3 font-bold text-sm uppercase rounded">
        Documents pour les entreprises
      </div>

      {showAll && companies.map((fc) => {
        const client = fc.client;
        if (!client) return null;
        const customDocs = getDocsForOwner("company", client.id).filter((d) => d.doc_type === "custom");

        return (
          <Card key={fc.id}>
            <CardContent className="pt-6 space-y-4">
              <h4 className="font-bold text-lg">{client.company_name}</h4>

              {/* Company default docs */}
              {DEFAULT_COMPANY_DOCS.map((docType) => {
                const doc = getDoc(docType, "company", client.id);
                if (!doc) return null;
                const label = DOC_LABELS[docType];
                return (
                  <div key={doc.id} className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm">{label}</span>
                      {renderStatusBadges(doc)}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        size="sm"
                        className="bg-teal-500 hover:bg-teal-600 text-white"
                        onClick={() => toast({ title: "Aperçu (à implémenter)" })}
                      >
                        <Eye className="h-4 w-4 mr-1" /> Voir
                      </Button>
                      {!doc.is_confirmed && (
                        <Button
                          size="sm"
                          className="bg-teal-500 hover:bg-teal-600 text-white"
                          onClick={() => handleConfirm(doc.id)}
                          disabled={saving === doc.id}
                        >
                          {saving === doc.id && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                          Confirmer le document
                        </Button>
                      )}
                      {docType === "feuille_emargement_collectif" && !doc.is_confirmed && (
                        <>
                          <Input
                            type="date"
                            className="w-[160px] h-9"
                            value={dates[doc.id] || ""}
                            onChange={(e) => setDates((prev) => ({ ...prev, [doc.id]: e.target.value }))}
                          />
                          <Button
                            size="sm"
                            className="bg-teal-500 hover:bg-teal-600 text-white"
                            onClick={() => handleConfirmWithDate(doc.id)}
                            disabled={saving === `date-${doc.id}`}
                          >
                            Modifier la date et confirmer
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Static docs */}
              {STATIC_DOCS.map((docType) =>
                renderStaticDocRow(getDoc(docType, "company", client.id), docType, fc.email)
              )}

              {/* Custom docs */}
              {customDocs.map((doc) => renderDocRow(doc, "custom"))}

              {/* Add custom */}
              {renderAddCustomDoc("company", client.id, true, "Ajouter d'autres documents (Avec signature electronique)")}
            </CardContent>
          </Card>
        );
      })}

      {companies.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            Aucune entreprise attribuée.
          </CardContent>
        </Card>
      )}

      {/* ===== DOCUMENTS POUR LES FORMATEURS ===== */}
      <div className="bg-teal-500 text-white text-center py-3 font-bold text-sm uppercase rounded">
        Documents pour les formateurs
      </div>

      {showAll && trainers.map((ft) => {
        const trainer = ft.trainer;
        if (!trainer) return null;
        const customDocs = getDocsForOwner("trainer", trainer.id).filter((d) => d.doc_type === "custom");

        return (
          <Card key={ft.id}>
            <CardContent className="pt-6 space-y-4">
              <h4 className="font-bold text-lg">{trainer.first_name} {trainer.last_name}</h4>

              {/* Trainer default docs */}
              {DEFAULT_TRAINER_DOCS.map((docType) => {
                const doc = getDoc(docType, "trainer", trainer.id);
                if (!doc) return null;
                const label = DOC_LABELS[docType];
                return (
                  <div key={doc.id} className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm">{label}</span>
                      {renderStatusBadges(doc)}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        size="sm"
                        className="bg-teal-500 hover:bg-teal-600 text-white"
                        onClick={() => toast({ title: "Aperçu (à implémenter)" })}
                      >
                        <Eye className="h-4 w-4 mr-1" /> Voir
                      </Button>
                      {!doc.is_confirmed && (
                        <Button
                          size="sm"
                          className="bg-teal-500 hover:bg-teal-600 text-white"
                          onClick={() => handleConfirm(doc.id)}
                          disabled={saving === doc.id}
                        >
                          {saving === doc.id && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                          Confirmer le document
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Static docs */}
              {STATIC_DOCS.map((docType) =>
                renderStaticDocRow(getDoc(docType, "trainer", trainer.id), docType, trainer.email)
              )}

              {/* Custom docs */}
              {customDocs.map((doc) => renderDocRow(doc, "custom"))}

              {/* Add custom */}
              {renderAddCustomDoc("trainer", trainer.id, true, "Ajouter d'autres documents (Avec signature electronique)")}
            </CardContent>
          </Card>
        );
      })}

      {trainers.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            Aucun formateur attribué.
          </CardContent>
        </Card>
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
