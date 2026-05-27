"use client";

import { useState, useCallback } from "react";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/client";
import {
  QrCode, Send, Printer, CheckSquare, Loader2, Copy, Download,
  FileDown, AlertTriangle, PenLine, CheckCircle2,
  XCircle, Mail, CheckCheck, CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import { downloadQRCodesPDF, type QRSlotData } from "@/lib/qr-pdf-export";
import { useEntity } from "@/contexts/EntityContext";
import { sortSlotsByStart } from "@/lib/utils/sort-time-slots";
import { getFormationKind, getLearnersForCompany } from "@/lib/utils/formation-companies";
import type { Session, FormationTimeSlot, Signature, Enrollment, FormationTrainer } from "@/lib/types";
import { useDocumentGeneration } from "@/hooks/useDocumentGeneration";
import { downloadBase64Pdf } from "@/lib/utils/download-blob";
import { isValidAdminBulkSignature } from "@/lib/utils/validate-bulk-signature";
import { HeroStatsAndWorkflow } from "./emargements/HeroStatsAndWorkflow";
import { CompanyFilter } from "./emargements/CompanyFilter";
import { QrCodesDialog, type SlotTokensResponse } from "./emargements/QrCodesDialog";
import { SingleSignDialog, type SignDialogState } from "./emargements/SingleSignDialog";
import { BulkSignDialog, type BulkSignDialogState, initialBulkSignState } from "./emargements/BulkSignDialog";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}


// InlineSignaturePad inline supprimé (story e-1.1) : remplacé par
// `SignaturePad` partagé (src/components/signatures/SignaturePad.tsx).
// Cohérence UI signature + maintenance unifiée.

// ──────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────

export function TabEmargements({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const { entity } = useEntity();
  const supabase = createClient();
  const { generate: generateDocument, incompleteDialog } = useDocumentGeneration();

  const [generatingTokens, setGeneratingTokens] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState({ current: 0, total: 0 });
  const [sendingToTrainer, setSendingToTrainer] = useState(false);

  // Story 3.4 — Filtre par entreprise (uniquement utile en INTER).
  // null = "Toutes les entreprises" (comportement par défaut, identique au pré-3.4).
  const [filterClientId, setFilterClientId] = useState<string | null>(null);
  const formationKind = getFormationKind(formation);
  const companies = formation.formation_companies || [];

  // Sign-on-behalf dialog state
  const [signDialog, setSignDialog] = useState<SignDialogState>({
    open: false, slotId: "", signerId: "", signerType: "learner", signerName: "",
  });
  const [signing, setSigning] = useState(false);

  // QR dialog state
  const [qrDialog, setQrDialog] = useState(false);
  const [qrSlotTokens, setQrSlotTokens] = useState<SlotTokensResponse | null>(null);
  const [qrImages, setQrImages] = useState<Record<string, string>>({});

  const generateQRImages = useCallback(async (tokens: SlotTokensResponse) => {
    const images: Record<string, string> = {};
    const baseUrl = window.location.origin;
    for (const slotData of tokens.slots) {
      for (const t of [...slotData.trainer_tokens, ...slotData.learner_tokens]) {
        const url = `${baseUrl}/emargement/${t.token}`;
        images[t.token] = await QRCode.toDataURL(url, {
          width: 200,
          margin: 1,
          color: { dark: "#000000", light: "#ffffff" },
        });
      }
    }
    setQrImages(images);
  }, []);

  // Tri chronologique strict (start_time ASC) : évite l'affichage aprem-avant-matin
  // qui survient quand un slot d'après-midi est créé en DB avant celui du matin.
  const timeSlots = sortSlotsByStart(formation.formation_time_slots || []);
  const signatures = formation.signatures || [];
  // Story 3.4 — `allEnrollments` = source brute (utilisée pour les stats globales).
  // `enrollments` = liste affichée (filtrée par entreprise en INTER si filtre actif).
  // En INTRA ou filtre = null, les deux sont identiques → 100% rétrocompatible.
  const allEnrollments = formation.enrollments || [];
  const enrollments = filterClientId
    ? allEnrollments.filter((e) => e.client_id === filterClientId)
    : allEnrollments;
  const trainers = formation.formation_trainers || [];

  // ── Helpers ──

  const getSignaturesForSlot = useCallback((slot: FormationTimeSlot) => {
    const slotSigs = signatures.filter(s => s.time_slot_id === slot.id);
    if (slotSigs.length > 0) return slotSigs;
    const slotDate = new Date(slot.start_time).toDateString();
    return signatures.filter(
      s => !s.time_slot_id && new Date(s.signed_at).toDateString() === slotDate
    );
  }, [signatures]);

  const isSlotPast = (slot: FormationTimeSlot) => new Date(slot.end_time) < new Date();

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

  const formatSlotLabel = (slot: FormationTimeSlot) => {
    const start = new Date(slot.start_time);
    const end = new Date(slot.end_time);
    return `${start.toLocaleDateString("fr-FR")} ${formatTime(slot.start_time)} - ${formatTime(slot.end_time)}`;
  };

  // ── Generate QR codes for all slots ──

  const handleGenerateAllTokens = async () => {
    setGeneratingTokens(true);
    try {
      const res = await fetch("/api/emargement/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: formation.id, include_trainers: true }),
      });
      const data: SlotTokensResponse = await res.json();
      if (res.ok && data.slots) {
        setQrSlotTokens(data);
        setQrDialog(true);
        generateQRImages(data);
        toast({ title: `${data.total_tokens} QR code(s) générés` });
      } else {
        toast({ title: "Erreur", description: "Impossible de générer les tokens", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setGeneratingTokens(false);
    }
  };

  // ── Export PDF ──

  const handleExportPdf = async () => {
    setExportingPdf(true);
    setPdfProgress({ current: 0, total: 0 });

    try {
      // Generate tokens first if not already generated
      let tokens = qrSlotTokens;
      if (!tokens) {
        const res = await fetch("/api/emargement/slots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: formation.id, include_trainers: true }),
        });
        tokens = await res.json();
        if (!res.ok || !tokens?.slots) {
          toast({ title: "Erreur", description: "Impossible de générer les tokens", variant: "destructive" });
          setExportingPdf(false);
          return;
        }
        setQrSlotTokens(tokens);
      }

      // Build slot data for PDF
      const baseUrl = window.location.origin;
      const pdfSlots: QRSlotData[] = tokens.slots.map(s => ({
        id: s.slot.id,
        title: s.slot.title,
        start_time: s.slot.start_time,
        end_time: s.slot.end_time,
        learners: s.learner_tokens.map(t => ({
          id: t.person.id,
          first_name: t.person.first_name,
          last_name: t.person.last_name,
          token: t.token,
        })),
        trainers: s.trainer_tokens.map(t => ({
          id: t.person.id,
          first_name: t.person.first_name,
          last_name: t.person.last_name,
          token: t.token,
        })),
      }));

      await downloadQRCodesPDF({
        sessionTitle: formation.title,
        trainingTitle: formation.training?.title || null,
        entityName: entity?.name || "MR FORMATION",
        location: formation.location,
        baseUrl,
        slots: pdfSlots,
        onProgress: (current, total) => setPdfProgress({ current, total }),
      }, `qr-emargements-${formation.title?.replace(/\s+/g, "-") || "session"}.pdf`);

      toast({ title: "PDF exporté avec succès" });
    } catch {
      toast({ title: "Erreur", description: "Erreur lors de l'export PDF", variant: "destructive" });
    } finally {
      setExportingPdf(false);
    }
  };

  // ── Send QR codes to trainer by email ──

  const handleSendToTrainer = async () => {
    if (trainers.length === 0) {
      toast({ title: "Aucun formateur assigné", variant: "destructive" });
      return;
    }
    setSendingToTrainer(true);

    try {
      // Generate tokens
      const res = await fetch("/api/emargement/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: formation.id, include_trainers: true }),
      });
      const tokens: SlotTokensResponse = await res.json();
      if (!res.ok || !tokens?.slots) {
        toast({ title: "Erreur", description: "Impossible de générer les tokens", variant: "destructive" });
        setSendingToTrainer(false);
        return;
      }

      // Build email body with QR code links
      const baseUrl = window.location.origin;
      let emailBody = `Bonjour,\n\nVoici les liens d'émargement pour la formation "${formation.title}".\n\n`;

      for (const slotData of tokens.slots) {
        const start = new Date(slotData.slot.start_time);
        const end = new Date(slotData.slot.end_time);
        emailBody += `━━━ Créneau: ${start.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })} ${start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })} - ${end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })} ━━━\n\n`;

        if (slotData.trainer_tokens.length > 0) {
          emailBody += "Formateurs:\n";
          for (const t of slotData.trainer_tokens) {
            emailBody += `  • ${t.person.first_name} ${t.person.last_name}: ${baseUrl}/emargement/${t.token}\n`;
          }
          emailBody += "\n";
        }

        emailBody += "Apprenants:\n";
        for (const t of slotData.learner_tokens) {
          emailBody += `  • ${t.person.first_name} ${t.person.last_name}: ${baseUrl}/emargement/${t.token}\n`;
        }
        emailBody += "\n";
      }

      emailBody += "Les liens expirent dans 48h.\n\nCordialement,\nL'équipe de formation";

      // Send to each trainer
      let sent = 0;
      for (const ft of trainers) {
        const trainer = ft.trainer;
        if (!trainer?.email) continue;

        try {
          await fetch("/api/emails/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: trainer.email,
              subject: `QR Codes Émargement - ${formation.title}`,
              body: emailBody,
              session_id: formation.id,
              trainer_id: trainer.id,
            }),
          });
          sent++;
        } catch {
          // continue
        }
      }

      toast({
        title: sent > 0 ? "Email(s) envoyé(s)" : "Erreur",
        description: sent > 0
          ? `${sent} email(s) envoyé(s) aux formateurs`
          : "Aucun formateur avec email trouvé",
        variant: sent > 0 ? "default" : "destructive",
      });
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setSendingToTrainer(false);
    }
  };

  // ── Admin sign on behalf ──

  const handleAdminSign = async (svgData: string) => {
    if (!signDialog.slotId || !signDialog.signerId) return;
    setSigning(true);

    try {
      const res = await fetch("/api/signatures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: formation.id,
          signature_data: svgData,
          time_slot_id: signDialog.slotId,
          signer_id: signDialog.signerId,
          signer_type: signDialog.signerType,
        }),
      });
      const result = await res.json();

      if (res.ok) {
        toast({ title: `Signature enregistrée pour ${signDialog.signerName}` });
        setSignDialog(prev => ({ ...prev, open: false }));
        await onRefresh();
      } else {
        toast({ title: "Erreur", description: result.error || "Erreur", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setSigning(false);
    }
  };

  // ── Delete signature ──

  const handleDeleteSignature = async (signatureId: string) => {
    try {
      const { error } = await supabase.from("signatures").delete().eq("id", signatureId).eq("session_id", formation.id);
      if (error) throw error;
      toast({ title: "Signature supprimée" });
      await onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible de supprimer";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    }
  };

  // ── Bulk sign all unsigned on a slot ──

  const [bulkSignSlot, setBulkSignSlot] = useState<BulkSignDialogState>(initialBulkSignState);
  const [bulkSigning, setBulkSigning] = useState(false);

  const openBulkSign = (slot: FormationTimeSlot) => {
    const slotSigs = getSignaturesForSlot(slot);
    const unsignedLearners = enrollments
      .filter(e => e.learner && !slotSigs.find(s => s.signer_id === e.learner!.id && s.signer_type === "learner"))
      .map(e => ({ id: e.learner!.id, name: `${e.learner!.first_name} ${e.learner!.last_name}` }));
    const unsignedTrainers = trainers
      .filter(ft => ft.trainer && !slotSigs.find(s => s.signer_id === ft.trainer!.id && s.signer_type === "trainer"))
      .map(ft => ({ id: ft.trainer!.id, name: `${ft.trainer!.first_name} ${ft.trainer!.last_name}` }));
    setBulkSignSlot({
      open: true,
      step: "confirm",
      slotId: slot.id,
      unsignedLearners,
      unsignedTrainers,
      adminSignature: null,
    });
  };

  const handleBulkSign = async () => {
    // Garde de sécurité : refuse si la signature admin n'est pas valide.
    // En pratique le bouton est disabled tant que adminSignature est null,
    // mais on garde la vérif en défense en profondeur (couvre une régression
    // future éventuelle du gate UI).
    if (!isValidAdminBulkSignature(bulkSignSlot.adminSignature)) {
      toast({
        title: "Signature manquante",
        description: "Dessinez votre signature avant de confirmer.",
        variant: "destructive",
      });
      return;
    }

    setBulkSigning(true);
    let signed = 0;
    const all = [
      ...bulkSignSlot.unsignedTrainers.map(t => ({ id: t.id, type: "trainer" as const })),
      ...bulkSignSlot.unsignedLearners.map(l => ({ id: l.id, type: "learner" as const })),
    ];

    for (const person of all) {
      try {
        const res = await fetch("/api/signatures", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: formation.id,
            signature_data: bulkSignSlot.adminSignature,
            time_slot_id: bulkSignSlot.slotId,
            signer_id: person.id,
            signer_type: person.type,
          }),
        });
        if (res.ok) signed++;
      } catch {
        // continue on error
      }
    }

    if (signed > 0) {
      toast({ title: `${signed} présence${signed !== 1 ? "s" : ""} cochée${signed !== 1 ? "s" : ""} sur ce créneau` });
    } else {
      toast({ title: "Tous déjà signés" });
    }
    setBulkSignSlot(initialBulkSignState);
    setBulkSigning(false);
    await onRefresh();
  };

  // ── Export PDF feuille d'émargement (format professionnel) ──

  const handleDownloadPlanningHebdo = async () => {
    await generateDocument(
      {
        doc_type: "planning_hebdo_signe",
        context: { session_id: formation.id },
      },
      {
        onSuccess: (result) => {
          downloadBase64Pdf(result.base64, result.filename);
          toast({ title: "Planning hebdo généré" });
        },
      },
    );
  };

  const handleExportEmargementPdf = async () => {
    await generateDocument(
      {
        doc_type: "feuille_emargement_collectif",
        context: { session_id: formation.id },
      },
      {
        onSuccess: (result) => {
          downloadBase64Pdf(result.base64, result.filename);
          toast({ title: "Feuille d'émargement générée" });
        },
      },
    );
  };

  // Story 3.4 — Export 1 PDF par entreprise (INTER uniquement, filtre "Toutes" actif).
  // Génère séquentiellement N feuilles d'émargement, 1 par entreprise rattachée,
  // chacune avec les apprenants filtrés par client_id et le nom de l'entreprise
  // dans le titre du document.
  const handleExportEmargementPerCompany = async () => {
    let succeeded = 0;
    let skippedNoLearners = 0;
    for (const fc of companies) {
      const learnersForCompany = getLearnersForCompany(formation, fc.client_id);
      if (learnersForCompany.length === 0) {
        skippedNoLearners++;
        continue;
      }

      await generateDocument(
        {
          doc_type: "feuille_emargement_collectif",
          context: { session_id: formation.id, client_id: fc.client_id },
        },
        {
          onSuccess: (result) => {
            const safeName = (fc.client?.company_name ?? fc.client_id).replace(/[^a-zA-Z0-9-_]+/g, "-");
            downloadBase64Pdf(result.base64, `emargement-${safeName}.pdf`);
            succeeded++;
          },
        },
      );
    }
    // Feedback différencié : silence trompeur (\"0/2 PDF générés\") remplaçé
    // par une erreur explicite quand AUCUN PDF n'est produit. La cause la plus
    // fréquente est des apprenants sans entreprise rattachée (enrollment.client_id null).
    if (succeeded === 0 && skippedNoLearners > 0) {
      toast({
        title: "Aucun PDF généré",
        description: `${skippedNoLearners} entreprise(s) sans apprenant rattaché. Vérifie le rattachement entreprise dans l'onglet Résumé.`,
        variant: "destructive",
      });
    } else if (succeeded === 0) {
      toast({ title: "Aucun PDF généré", description: "Erreur génération. Réessaie ou contacte le support.", variant: "destructive" });
    } else {
      toast({ title: `${succeeded}/${companies.length} PDF générés` });
    }
  };

  // ── Print empty attendance sheet ──

  const handlePrintEmpty = async () => {
    await generateDocument(
      {
        doc_type: "feuille_emargement_vierge",
        context: { session_id: formation.id },
      },
      {
        onSuccess: (result) => {
          downloadBase64Pdf(result.base64, result.filename);
          toast({ title: "Feuille vierge générée" });
        },
      },
    );
  };

  // ── Compute stats ──
  // Story 3.4 — Les stats globales (hero row) reflètent la liste affichée
  // (`enrollments`, donc filtrée si filtre INTER actif) pour que le taux de
  // signature corresponde visuellement aux personnes rendues plus bas.
  // Les signatures elles-mêmes restent toutes comptées au niveau du slot.
  const totalExpected = timeSlots.length * (enrollments.length + trainers.length);
  const totalSigned = timeSlots.reduce((sum, slot) => sum + getSignaturesForSlot(slot).length, 0);
  const completionPct = totalExpected > 0 ? Math.round((totalSigned / totalExpected) * 100) : 0;

  // ── Render person row (trainer or learner) ──
  const renderPersonRow = (
    personId: string,
    personName: string,
    signerType: "learner" | "trainer",
    slotSignatures: Signature[],
    slot: FormationTimeSlot,
    past: boolean,
    label?: string
  ) => {
    const sig = slotSignatures.find(
      s => s.signer_id === personId && s.signer_type === signerType
    );
    return (
      <div key={`${slot.id}-${personId}`} className="flex items-center justify-between px-4 py-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium">{personName}</span>
          {label && <span className="text-xs text-muted-foreground">({label})</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {sig ? (
            <>
              <span className="text-xs text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">Signé</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-red-600"
                onClick={() => handleDeleteSignature(sig.id)}
              >
                <XCircle className="h-3 w-3" />
              </Button>
            </>
          ) : (
            <>
              {past && (
                <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">Absent</span>
              )}
              <span className="text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full">En attente</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs gap-1"
                onClick={() => setSignDialog({
                  open: true,
                  slotId: slot.id,
                  signerId: personId,
                  signerType,
                  signerName: personName,
                })}
              >
                <PenLine className="h-3 w-3" /> Signer
              </Button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Story 3.4 — Filtre par entreprise (visible uniquement en INTER) */}
      <CompanyFilter
        isInter={formationKind === "inter"}
        companies={companies}
        filterClientId={filterClientId}
        onChange={setFilterClientId}
        enrollmentsCount={enrollments.length}
        allEnrollmentsCount={allEnrollments.length}
      />

      <HeroStatsAndWorkflow
        formationId={formation.id}
        hasTimeSlots={timeSlots.length > 0}
        totalSigned={totalSigned}
        totalExpected={totalExpected}
        completionPct={completionPct}
        timeSlotsCount={timeSlots.length}
        generatingTokens={generatingTokens}
        exportingPdf={exportingPdf}
        sendingToTrainer={sendingToTrainer}
        pdfProgress={pdfProgress}
        onGenerateAllTokens={handleGenerateAllTokens}
        onExportPdf={handleExportPdf}
        onSendToTrainer={handleSendToTrainer}
        onDownloadPlanningHebdo={handleDownloadPlanningHebdo}
        onExportEmargementPdf={handleExportEmargementPdf}
        onExportEmargementPerCompany={handleExportEmargementPerCompany}
        onPrintEmpty={handlePrintEmpty}
        hasMultipleCompanies={formationKind === "inter" && !filterClientId && companies.length > 0}
        companiesCount={companies.length}
        hasTrainers={trainers.length > 0}
      />

      {/* Quick actions (legacy — gardés pour compatibilité, accessibles aux power users) */}
      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Actions avancées</summary>
        <div className="mt-2 flex items-center justify-end flex-wrap gap-1.5">
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 gap-1"
            onClick={handleGenerateAllTokens}
            disabled={generatingTokens || timeSlots.length === 0}
          >
            {generatingTokens ? <Loader2 className="h-3 w-3 animate-spin" /> : <QrCode className="h-3 w-3" />}
            QR codes
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 gap-1"
            onClick={handleExportPdf}
            disabled={exportingPdf || timeSlots.length === 0}
          >
            {exportingPdf ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
            PDF QR
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 gap-1"
            onClick={handleExportEmargementPdf}
            disabled={timeSlots.length === 0}
          >
            <Download className="h-3 w-3" />
            Feuille PDF
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 gap-1"
            onClick={handleSendToTrainer}
            disabled={sendingToTrainer || trainers.length === 0 || timeSlots.length === 0}
          >
            {sendingToTrainer ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
            Envoyer
          </Button>
          <Button size="sm" variant="ghost" className="text-xs h-7 gap-1" onClick={handlePrintEmpty}>
            <Printer className="h-3 w-3" /> Imprimer
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 gap-1"
            onClick={handleDownloadPlanningHebdo}
            disabled={timeSlots.length === 0}
            title="Tableau hebdomadaire avec signatures collectées (paysage 1 page)"
          >
            <CalendarDays className="h-3 w-3" /> Planning hebdo
          </Button>
        </div>
        </div>
      </details>

      {/* PDF progress */}
      {exportingPdf && pdfProgress.total > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Génération QR codes... {pdfProgress.current}/{pdfProgress.total}
          </p>
          <Progress value={(pdfProgress.current / pdfProgress.total) * 100} className="h-1.5" />
        </div>
      )}

      {/* Par créneau */}
      {timeSlots.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Aucun créneau planifié. Créez des créneaux dans l&apos;onglet Planning.
        </p>
      ) : (
        <div className="space-y-4">
          {timeSlots.map((slot, index) => {
            const slotSignatures = getSignaturesForSlot(slot);
            const start = new Date(slot.start_time);
            const end = new Date(slot.end_time);
            const durationMs = end.getTime() - start.getTime();
            const durationH = Math.floor(durationMs / (1000 * 60 * 60));
            const durationM = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
            const durationStr = durationH > 0
              ? `${durationH}h${durationM > 0 ? durationM.toString().padStart(2, "0") : ""}`
              : `${durationM}min`;

            const slotTotal = enrollments.length + trainers.length;
            const slotSigned = slotSignatures.length;
            const slotPct = slotTotal > 0 ? Math.round((slotSigned / slotTotal) * 100) : 0;
            const past = isSlotPast(slot);

            return (
              <div key={slot.id} className={`border rounded-lg overflow-hidden ${past && slotPct < 100 ? "border-orange-300" : ""}`}>
                {/* Slot header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">Créneau {index + 1}</span>
                    <span className="text-xs text-muted-foreground">{formatSlotLabel(slot)}</span>
                    <span className="text-xs text-muted-foreground">{durationStr}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={slotPct} className="w-20 h-1.5" />
                    <span className="text-xs text-muted-foreground">{slotSigned}/{slotTotal}</span>
                    {slotPct === 100 ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">
                        <CheckCircle2 className="h-3 w-3" /> Complet
                      </span>
                    ) : past ? (
                      <span className="inline-flex items-center gap-1 text-xs text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded-full">
                        Incomplet
                      </span>
                    ) : null}
                    {slotPct < 100 && (
                      <Button size="sm" variant="ghost" className="text-xs h-6 gap-1" onClick={() => openBulkSign(slot)}>
                        <CheckCheck className="h-3 w-3" /> Cocher tous
                      </Button>
                    )}
                  </div>
                </div>

                {/* Person rows - flat list */}
                <div className="divide-y">
                  {trainers.map(ft => {
                    const trainer = ft.trainer;
                    if (!trainer) return null;
                    return renderPersonRow(
                      trainer.id,
                      `${trainer.first_name} ${trainer.last_name}`,
                      "trainer",
                      slotSignatures,
                      slot,
                      past,
                      "Formateur"
                    );
                  })}
                  {enrollments.map(enrollment => {
                    const learner = enrollment.learner;
                    if (!learner) return null;
                    return renderPersonRow(
                      learner.id,
                      `${learner.first_name} ${learner.last_name}`,
                      "learner",
                      slotSignatures,
                      slot,
                      past
                    );
                  })}
                  {enrollments.length === 0 && trainers.length === 0 && (
                    <p className="text-sm text-muted-foreground py-4 text-center">Aucun participant</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <BulkSignDialog
        bulkSignSlot={bulkSignSlot}
        setBulkSignSlot={setBulkSignSlot}
        bulkSigning={bulkSigning}
        onBulkSign={handleBulkSign}
      />

      <SingleSignDialog
        signDialog={signDialog}
        setSignDialog={setSignDialog}
        timeSlots={timeSlots}
        signing={signing}
        onAdminSign={handleAdminSign}
        formatSlotLabel={formatSlotLabel}
      />

      <QrCodesDialog
        open={qrDialog}
        onOpenChange={setQrDialog}
        qrSlotTokens={qrSlotTokens}
        qrImages={qrImages}
        exportingPdf={exportingPdf}
        onExportPdf={handleExportPdf}
      />

      {incompleteDialog}
    </div>
  );
}
