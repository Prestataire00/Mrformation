"use client";

import { useState, useCallback } from "react";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/client";
import {
  QrCode, Send, Printer, CheckSquare, Loader2, Copy, Download,
  FileDown, UserCheck, AlertTriangle, PenLine, CheckCircle2,
  XCircle, Mail, CheckCheck, CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
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
import { SignaturePad } from "@/components/signatures/SignaturePad";
import { useDocumentGeneration } from "@/hooks/useDocumentGeneration";
import { downloadBase64Pdf } from "@/lib/utils/download-blob";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

interface SlotTokensResponse {
  slots: {
    slot: { id: string; title: string | null; start_time: string; end_time: string; slot_order: number };
    learner_tokens: { token: string; person: { id: string; first_name: string; last_name: string; email: string | null } }[];
    trainer_tokens: { token: string; person: { id: string; first_name: string; last_name: string; email: string | null } }[];
  }[];
  total_tokens: number;
  debug?: {
    session_id: string;
    slots_count: number;
    enrollments_count: number;
    enrollment_statuses: string[];
    enrollments_with_learner: number;
    trainers_count: number;
    trainers_with_data: number;
    enrollments_error: string | null;
    profile_entity_id: string;
    insert_errors: { type: string; phase?: string; code: string | undefined; message: string; details?: string; hint?: string }[];
    first_iteration_trace: { existing_data: boolean; existing_error: string | null; insert_data: boolean; insert_error: string | null } | null;
  };
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
  const [signDialog, setSignDialog] = useState<{
    open: boolean;
    slotId: string;
    signerId: string;
    signerType: "learner" | "trainer";
    signerName: string;
  }>({ open: false, slotId: "", signerId: "", signerType: "learner", signerName: "" });
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

  interface BulkSignDialogState {
    open: boolean;
    step: "confirm" | "sign";
    slotId: string;
    unsignedLearners: { id: string; name: string }[];
    unsignedTrainers: { id: string; name: string }[];
    adminSignature: string | null;
  }

  const initialBulkSignState: BulkSignDialogState = {
    open: false,
    step: "confirm",
    slotId: "",
    unsignedLearners: [],
    unsignedTrainers: [],
    adminSignature: null,
  };

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
            signature_data: "admin_bulk",
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
    setBulkSignSlot(prev => ({ ...prev, open: false }));
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
      {formationKind === "inter" && companies.length > 0 && (
        <div className="flex items-center gap-2 text-sm border rounded-md px-3 py-2 bg-blue-50">
          <span className="text-muted-foreground">Filtrer par entreprise :</span>
          <Select
            value={filterClientId ?? "all"}
            onValueChange={(v) => setFilterClientId(v === "all" ? null : v)}
          >
            <SelectTrigger className="h-8 w-[240px]">
              <SelectValue placeholder="Toutes les entreprises" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les entreprises</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c.client_id} value={c.client_id}>
                  {c.client?.company_name || `Client ${c.client_id.slice(0, 8)}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            {enrollments.length}/{allEnrollments.length} apprenant{allEnrollments.length !== 1 ? "s" : ""}
          </span>
          {filterClientId && (
            <Button variant="ghost" size="sm" onClick={() => setFilterClientId(null)}>
              × Effacer
            </Button>
          )}
        </div>
      )}

      {/* ═══ HERO ROW ═══ */}
      {timeSlots.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Signatures</p>
            <p className="text-xl font-bold">{totalSigned}<span className="text-sm font-normal text-muted-foreground">/{totalExpected}</span></p>
            <div className="mt-1.5 bg-gray-100 rounded-full h-1.5">
              <div className={`h-1.5 rounded-full transition-all ${completionPct === 100 ? "bg-green-500" : completionPct > 0 ? "bg-amber-400" : "bg-gray-200"}`} style={{ width: `${completionPct}%` }} />
            </div>
          </div>
          <div className="border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Taux de présence</p>
            <p className="text-xl font-bold">{completionPct}%</p>
          </div>
          <div className="border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Créneaux</p>
            <p className="text-xl font-bold">{timeSlots.length}</p>
          </div>
        </div>
      )}

      {/* ═══ 3 CARDS WORKFLOW ═══ */}
      {timeSlots.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1 — PRÉPARER */}
          <div className="border rounded-xl p-4 bg-blue-50/50 border-blue-200">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <QrCode className="h-4 w-4 text-blue-700" />
              </div>
              <h3 className="font-semibold text-gray-900">📤 Préparer</h3>
            </div>
            <p className="text-xs text-gray-600 mb-3">Distribuer la signature aux apprenants</p>
            <a
              href={`/admin/formations/${formation.id}/emargement-live`}
              className="block w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2 rounded-lg text-center transition-colors mb-2"
              title="1 QR projeté pour toute la session — apprenants scannent et choisissent leur nom"
            >
              📱 Mode présentation
            </a>
            <div className="text-[11px] text-gray-500 space-y-1">
              <button
                type="button"
                onClick={handleGenerateAllTokens}
                disabled={generatingTokens}
                className="block w-full text-left hover:text-blue-700"
              >
                → Générer QR individuels (1 par apprenant)
              </button>
              <button
                type="button"
                onClick={handleSendToTrainer}
                disabled={sendingToTrainer || trainers.length === 0}
                className="block w-full text-left hover:text-blue-700"
              >
                → Envoyer les QR par email au formateur
              </button>
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={exportingPdf}
                className="block w-full text-left hover:text-blue-700"
              >
                → Télécharger PDF des QR à imprimer
              </button>
            </div>
          </div>

          {/* Card 2 — SUIVRE */}
          <div className="border rounded-xl p-4 bg-emerald-50/50 border-emerald-200">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <UserCheck className="h-4 w-4 text-emerald-700" />
              </div>
              <h3 className="font-semibold text-gray-900">✅ Suivre</h3>
            </div>
            <p className="text-xs text-gray-600 mb-3">Pendant la formation : vérifier les présences</p>
            <a
              href={`/admin/formations/${formation.id}/emargement-live`}
              className="block w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3 py-2 rounded-lg text-center transition-colors mb-2"
              title="Page live avec liste apprenants signés/en attente, mise à jour toutes les 3 sec"
            >
              👁 Voir les présences en direct
            </a>
            <div className="text-[11px] text-gray-500">
              Vous pouvez également faire signer manuellement chaque apprenant ci-dessous (mode &laquo; appel &raquo;).
            </div>
          </div>

          {/* Card 3 — EXPORTER */}
          <div className="border rounded-xl p-4 bg-purple-50/50 border-purple-200">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-lg bg-purple-100">
                <Download className="h-4 w-4 text-purple-700" />
              </div>
              <h3 className="font-semibold text-gray-900">📄 Exporter</h3>
            </div>
            <p className="text-xs text-gray-600 mb-3">Justificatifs Qualiopi après formation</p>
            <button
              type="button"
              onClick={handleExportEmargementPdf}
              className="block w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white text-sm font-medium px-3 py-2 rounded-lg text-center transition-colors mb-2"
              title="PDF complet avec toutes les signatures collectées"
            >
              📥 Feuille d&apos;émargement signée
            </button>
            {/* Story 3.4 — Export 1 PDF par entreprise (INTER uniquement, sans filtre actif) */}
            {formationKind === "inter" && !filterClientId && companies.length > 0 && (
              <button
                type="button"
                onClick={handleExportEmargementPerCompany}
                className="block w-full border border-purple-300 text-purple-700 hover:bg-purple-100 disabled:opacity-50 text-sm font-medium px-3 py-2 rounded-lg text-center transition-colors mb-2"
                title="Génère 1 feuille d'émargement par entreprise rattachée"
              >
                📥 1 PDF par entreprise ({companies.length})
              </button>
            )}
            <div className="text-[11px] text-gray-500 space-y-1">
              <button
                type="button"
                onClick={handleDownloadPlanningHebdo}
                className="block w-full text-left hover:text-purple-700"
              >
                → Planning hebdo signé (paysage)
              </button>
              <button
                type="button"
                onClick={handlePrintEmpty}
                className="block w-full text-left hover:text-purple-700"
              >
                → Imprimer une feuille vide
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* ── Dialog: Bulk sign ── */}
      <Dialog open={bulkSignSlot.open} onOpenChange={(open) => setBulkSignSlot(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cocher les présences en masse</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Marquer {bulkSignSlot.unsignedLearners.length} apprenant{bulkSignSlot.unsignedLearners.length !== 1 ? "s" : ""} et{" "}
            {bulkSignSlot.unsignedTrainers.length} formateur{bulkSignSlot.unsignedTrainers.length !== 1 ? "s" : ""} non
            encore signé{(bulkSignSlot.unsignedLearners.length + bulkSignSlot.unsignedTrainers.length) !== 1 ? "s" : ""} comme
            présent{(bulkSignSlot.unsignedLearners.length + bulkSignSlot.unsignedTrainers.length) !== 1 ? "s" : ""} sur ce créneau ?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkSignSlot(prev => ({ ...prev, open: false }))}>
              Annuler
            </Button>
            <Button onClick={handleBulkSign} disabled={bulkSigning}>
              {bulkSigning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Sign on behalf ── */}
      <Dialog open={signDialog.open} onOpenChange={(open) => setSignDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Signer pour {signDialog.signerName}
              {(() => {
                const slot = timeSlots.find(s => s.id === signDialog.slotId);
                return slot ? (
                  <span className="block text-sm font-normal text-muted-foreground mt-1">
                    Créneau : {formatSlotLabel(slot)}
                  </span>
                ) : null;
              })()}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-2">
            Dessinez la signature pour valider la présence de {signDialog.signerName}.
          </p>
          <SignaturePad
            label={`Signature pour ${signDialog.signerName}`}
            isSigned={false}
            onSign={handleAdminSign}
            onClear={() => { /* no-op : le dialog se ferme après onSign */ }}
            disabled={signing}
          />
          {signing && (
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Enregistrement...
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignDialog(prev => ({ ...prev, open: false }))}>
              Annuler
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: QR codes view ── */}
      <Dialog open={qrDialog} onOpenChange={setQrDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              QR Codes générés
              {qrSlotTokens && (
                <span className="text-sm font-normal text-gray-500 ml-2">
                  — {qrSlotTokens.slots.reduce((sum, s) => sum + (s.learner_tokens?.length ?? 0) + (s.trainer_tokens?.length ?? 0), 0)} QR
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {qrSlotTokens && (
            <div className="space-y-6">
              {/* Empty state global : aucun apprenant inscrit */}
              {qrSlotTokens.slots.every((s) => (s.learner_tokens?.length ?? 0) === 0 && (s.trainer_tokens?.length ?? 0) === 0) && (
                <div className="text-left py-6 px-4 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                  <p className="text-sm text-amber-900 font-medium">Aucun apprenant ni formateur inscrit dans cette session.</p>
                  {qrSlotTokens.debug && (
                    <div className="text-xs font-mono bg-white/70 border border-amber-200 rounded p-2 text-amber-900 space-y-0.5">
                      <div>session_id : <span className="font-semibold">{qrSlotTokens.debug.session_id}</span></div>
                      <div>profile.entity_id : <span className="font-semibold">{qrSlotTokens.debug.profile_entity_id}</span></div>
                      <div>slots trouvés : <span className="font-semibold">{qrSlotTokens.debug.slots_count}</span></div>
                      <div>enrollments trouvés : <span className="font-semibold">{qrSlotTokens.debug.enrollments_count}</span> (statuts : {qrSlotTokens.debug.enrollment_statuses.join(", ") || "aucun"})</div>
                      <div>enrollments avec learner lié : <span className="font-semibold">{qrSlotTokens.debug.enrollments_with_learner}</span></div>
                      <div>formation_trainers trouvés : <span className="font-semibold">{qrSlotTokens.debug.trainers_count}</span> (avec data : {qrSlotTokens.debug.trainers_with_data})</div>
                      {qrSlotTokens.debug.enrollments_error && (
                        <div className="text-red-700">erreur SQL enrollments : {qrSlotTokens.debug.enrollments_error}</div>
                      )}
                      {qrSlotTokens.debug.first_iteration_trace && (
                        <div className="mt-2 pt-2 border-t border-amber-300 text-amber-900">
                          <div className="font-semibold mb-1">1ère itération (slot 1 × learner 1) :</div>
                          <div className="ml-2">existing trouvé : <span className="font-semibold">{qrSlotTokens.debug.first_iteration_trace.existing_data ? "oui" : "non"}</span></div>
                          {qrSlotTokens.debug.first_iteration_trace.existing_error && <div className="ml-2 text-red-700">existing error : {qrSlotTokens.debug.first_iteration_trace.existing_error}</div>}
                          <div className="ml-2">INSERT data retourné : <span className="font-semibold">{qrSlotTokens.debug.first_iteration_trace.insert_data ? "oui" : "non"}</span></div>
                          {qrSlotTokens.debug.first_iteration_trace.insert_error && <div className="ml-2 text-red-700">INSERT error : {qrSlotTokens.debug.first_iteration_trace.insert_error}</div>}
                        </div>
                      )}
                      {qrSlotTokens.debug.insert_errors.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-amber-300">
                          <div className="font-semibold text-red-700 mb-1">Erreurs INSERT signing_tokens ({qrSlotTokens.debug.insert_errors.length}) :</div>
                          {qrSlotTokens.debug.insert_errors.map((err, i) => (
                            <div key={i} className="text-red-700 ml-2 mt-1">
                              <div>· [{err.type}] phase={err.phase ?? "?"} code={err.code ?? "?"} — {err.message}</div>
                              {err.details && <div className="ml-3 text-red-600">details : {err.details}</div>}
                              {err.hint && <div className="ml-3 text-red-600">hint : {err.hint}</div>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-amber-700">
                    Si <code>enrollments_count = 0</code> mais que vous voyez l&apos;apprenant en bas de la page, c&apos;est un problème de session_id ou de RLS service_role. Si <code>enrollments_with_learner</code> est inférieur à <code>enrollments_count</code>, la jointure FK <code>learners</code> est cassée.
                  </p>
                </div>
              )}

              {qrSlotTokens.slots.map(slotData => {
                const hasLearners = (slotData.learner_tokens?.length ?? 0) > 0;
                const hasTrainers = (slotData.trainer_tokens?.length ?? 0) > 0;
                if (!hasLearners && !hasTrainers) return null;
                return (
                <div key={slotData.slot.id} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {new Date(slotData.slot.start_time).toLocaleDateString("fr-FR")}{" "}
                      {formatTime(slotData.slot.start_time)} - {formatTime(slotData.slot.end_time)}
                    </Badge>
                  </div>

                  {hasTrainers && (
                    <>
                      <p className="text-xs font-semibold text-purple-700">Formateurs</p>
                      <div className="grid grid-cols-3 gap-2">
                        {slotData.trainer_tokens.map(t => {
                          if (!t.person) {
                            console.warn("[QR modal] trainer token sans person:", t);
                            return (
                              <div key={t.token} className="text-center p-2 border border-red-200 rounded-lg bg-red-50">
                                <p className="text-xs text-red-700">Formateur introuvable</p>
                                <p className="text-[10px] text-red-500 break-all">{t.token.slice(0, 8)}…</p>
                              </div>
                            );
                          }
                          return (
                            <div key={t.token} className="text-center p-2 border rounded-lg bg-purple-50/50">
                              <p className="text-xs font-medium mb-1 truncate">
                                {t.person.last_name} {t.person.first_name}
                              </p>
                              {qrImages[t.token] ? (
                                <img src={qrImages[t.token]} alt={`QR ${t.person.last_name}`} className="w-32 h-32 mx-auto" />
                              ) : (
                                <div className="w-32 h-32 mx-auto bg-gray-100 animate-pulse rounded flex items-center justify-center">
                                  <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {hasLearners && (
                    <>
                      <p className="text-xs font-semibold text-blue-700">Apprenants</p>
                      <div className="grid grid-cols-3 gap-2">
                        {slotData.learner_tokens.map(t => {
                          if (!t.person) {
                            console.warn("[QR modal] learner token sans person:", t);
                            return (
                              <div key={t.token} className="text-center p-2 border border-red-200 rounded-lg bg-red-50">
                                <p className="text-xs text-red-700">Apprenant introuvable</p>
                                <p className="text-[10px] text-red-500 break-all">{t.token.slice(0, 8)}…</p>
                              </div>
                            );
                          }
                          return (
                            <div key={t.token} className="text-center p-2 border rounded-lg">
                              <p className="text-xs font-medium mb-1 truncate">
                                {t.person.last_name} {t.person.first_name}
                              </p>
                              {qrImages[t.token] ? (
                                <img src={qrImages[t.token]} alt={`QR ${t.person.last_name}`} className="w-32 h-32 mx-auto" />
                              ) : (
                                <div className="w-32 h-32 mx-auto bg-gray-100 animate-pulse rounded flex items-center justify-center">
                                  <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={handleExportPdf} disabled={exportingPdf}>
              {exportingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Exporter en PDF
            </Button>
            <Button variant="outline" onClick={() => setQrDialog(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {incompleteDialog}
    </div>
  );
}
