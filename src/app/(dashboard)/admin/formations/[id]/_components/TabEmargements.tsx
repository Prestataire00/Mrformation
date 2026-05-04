"use client";

import { useState, useCallback } from "react";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/client";
import {
  QrCode, Send, Printer, CheckSquare, Loader2, Copy, Download,
  FileDown, UserCheck, AlertTriangle, PenLine, Trash2, CheckCircle2,
  XCircle, Mail, CheckCheck, CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import { downloadQRCodesPDF, type QRSlotData } from "@/lib/qr-pdf-export";
import { downloadEmargementPDF } from "@/lib/emargement-pdf-export";
import { useEntity } from "@/contexts/EntityContext";
import type { Session, FormationTimeSlot, Signature, Enrollment, FormationTrainer } from "@/lib/types";

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
}

// ──────────────────────────────────────────────
// Signature Pad (inline, lightweight)
// ──────────────────────────────────────────────

function InlineSignaturePad({ onSign, disabled }: { onSign: (svg: string) => void; disabled?: boolean }) {
  const [drawing, setDrawing] = useState(false);
  const [strokes, setStrokes] = useState<{ x: number; y: number }[][]>([]);
  const [currentStroke, setCurrentStroke] = useState<{ x: number; y: number }[]>([]);
  const canvasRef = useState<HTMLDivElement | null>(null);

  const getPos = (e: React.MouseEvent | React.TouchEvent, el: HTMLDivElement) => {
    const rect = el.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    const el = (e.target as HTMLElement).closest("[data-sigpad]") as HTMLDivElement;
    if (!el) return;
    setDrawing(true);
    setCurrentStroke([getPos(e, el)]);
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing || disabled) return;
    const el = (e.target as HTMLElement).closest("[data-sigpad]") as HTMLDivElement;
    if (!el) return;
    setCurrentStroke(prev => [...prev, getPos(e, el)]);
  };

  const handleEnd = () => {
    if (!drawing) return;
    setDrawing(false);
    if (currentStroke.length > 2) {
      setStrokes(prev => [...prev, currentStroke]);
    }
    setCurrentStroke([]);
  };

  const hasDrawing = strokes.length > 0;
  const allStrokes = currentStroke.length > 0 ? [...strokes, currentStroke] : strokes;

  const strokeToPath = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  const handleValidate = () => {
    const paths = strokes
      .map(pts => strokeToPath(pts))
      .filter(Boolean)
      .map(d => `<path d="${d}" stroke="#1d4ed8" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`)
      .join("");
    onSign(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100">${paths}</svg>`);
  };

  return (
    <div className="space-y-2">
      <div
        data-sigpad
        className="relative w-full h-24 border-2 border-dashed border-gray-300 bg-gray-50 rounded-lg select-none overflow-hidden cursor-crosshair touch-none"
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
      >
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {allStrokes.map((stroke, i) => (
            <path
              key={i}
              d={strokeToPath(stroke)}
              stroke="#1d4ed8"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>
        {!hasDrawing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-xs text-gray-400">Dessiner la signature ici</p>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setStrokes([]); setCurrentStroke([]); }}
          disabled={!hasDrawing || disabled}
          className="flex-1 text-xs"
        >
          <Trash2 className="h-3 w-3 mr-1" /> Effacer
        </Button>
        <Button
          size="sm"
          onClick={handleValidate}
          disabled={!hasDrawing || disabled}
          className="flex-1 text-xs"
        >
          <CheckCircle2 className="h-3 w-3 mr-1" /> Valider
        </Button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────

export function TabEmargements({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const { entity } = useEntity();
  const supabase = createClient();

  const [generatingTokens, setGeneratingTokens] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingSheet, setExportingSheet] = useState(false);
  const [pdfProgress, setPdfProgress] = useState({ current: 0, total: 0 });
  const [sendingToTrainer, setSendingToTrainer] = useState(false);

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

  const timeSlots = formation.formation_time_slots || [];
  const signatures = formation.signatures || [];
  const enrollments = formation.enrollments || [];
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

  const [bulkSignSlot, setBulkSignSlot] = useState<{
    open: boolean;
    slotId: string;
    unsignedLearners: { id: string; name: string }[];
    unsignedTrainers: { id: string; name: string }[];
  }>({ open: false, slotId: "", unsignedLearners: [], unsignedTrainers: [] });
  const [bulkSigning, setBulkSigning] = useState(false);

  const openBulkSign = (slot: FormationTimeSlot) => {
    const slotSigs = getSignaturesForSlot(slot);
    const unsignedLearners = enrollments
      .filter(e => e.learner && !slotSigs.find(s => s.signer_id === e.learner!.id && s.signer_type === "learner"))
      .map(e => ({ id: e.learner!.id, name: `${e.learner!.first_name} ${e.learner!.last_name}` }));
    const unsignedTrainers = trainers
      .filter(ft => ft.trainer && !slotSigs.find(s => s.signer_id === ft.trainer!.id && s.signer_type === "trainer"))
      .map(ft => ({ id: ft.trainer!.id, name: `${ft.trainer!.first_name} ${ft.trainer!.last_name}` }));
    setBulkSignSlot({ open: true, slotId: slot.id, unsignedLearners, unsignedTrainers });
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

  const handleExportEmargementPdf = async () => {
    setExportingSheet(true);
    try {
      // Calculate duration
      const totalMs = timeSlots.reduce((sum, slot) => {
        return sum + (new Date(slot.end_time).getTime() - new Date(slot.start_time).getTime());
      }, 0);
      const totalHours = (totalMs / (1000 * 60 * 60)).toFixed(2);

      await downloadEmargementPDF({
        formationTitle: formation.title,
        startDate: formation.start_date,
        endDate: formation.end_date,
        location: formation.location,
        duration: `${totalHours} heures`,
        entityName: entity?.name || "MR FORMATION",
        trainers: trainers
          .filter((ft) => ft.trainer)
          .map((ft) => ({
            first_name: ft.trainer!.first_name,
            last_name: ft.trainer!.last_name,
          })),
        learners: enrollments
          .filter((e) => e.learner)
          .map((e) => ({
            first_name: e.learner!.first_name,
            last_name: e.learner!.last_name,
          })),
        timeSlots: timeSlots.map((s) => ({
          id: s.id,
          title: s.title,
          start_time: s.start_time,
          end_time: s.end_time,
        })),
      });
      toast({ title: "Feuille d'émargement exportée" });
    } catch {
      toast({ title: "Erreur", description: "Impossible de générer le PDF", variant: "destructive" });
    } finally {
      setExportingSheet(false);
    }
  };

  // ── Print empty attendance sheet ──

  const handlePrintEmpty = () => {
    const rows = timeSlots
      .map((slot, i) => {
        const start = new Date(slot.start_time);
        const end = new Date(slot.end_time);
        const learnerRows = enrollments
          .map(e => {
            const l = e.learner;
            if (!l) return "";
            return `<tr><td style="padding:8px;border:1px solid #ddd;">${l.first_name} ${l.last_name}</td><td style="padding:8px;border:1px solid #ddd;width:200px;"></td></tr>`;
          })
          .join("");
        const trainerRows = trainers
          .map(t => {
            const tr = t.trainer;
            if (!tr) return "";
            return `<tr><td style="padding:8px;border:1px solid #ddd;">${tr.first_name} ${tr.last_name} (Formateur)</td><td style="padding:8px;border:1px solid #ddd;width:200px;"></td></tr>`;
          })
          .join("");
        return `
          <h3>Créneau ${i + 1} — ${start.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })} ${start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })} - ${end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}</h3>
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
            <thead><tr><th style="padding:8px;border:1px solid #ddd;text-align:left;">Nom</th><th style="padding:8px;border:1px solid #ddd;text-align:left;">Signature</th></tr></thead>
            <tbody>${trainerRows}${learnerRows}</tbody>
          </table>`;
      })
      .join("");
    const html = `<html><head><title>Feuille d'émargement — ${formation.title}</title></head><body style="font-family:sans-serif;padding:24px;"><h1>Feuille d'émargement</h1><h2>${formation.title}</h2>${rows}</body></html>`;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      w.print();
    }
  };

  // ── Compute stats ──

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
              disabled={exportingSheet}
              className="block w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white text-sm font-medium px-3 py-2 rounded-lg text-center transition-colors mb-2"
              title="PDF complet avec toutes les signatures collectées"
            >
              {exportingSheet ? "Génération..." : "📥 Feuille d'émargement signée"}
            </button>
            <div className="text-[11px] text-gray-500 space-y-1">
              <button
                type="button"
                onClick={async () => {
                  try {
                    toast({ title: "Génération en cours..." });
                    const res = await fetch("/api/documents/generate-from-template", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ doc_type: "planning_semaine", context: { session_id: formation.id } }),
                    });
                    const json = await res.json();
                    if (!res.ok) throw new Error(json.error ?? "Échec génération");
                    const byteChars = atob(json.base64);
                    const byteArray = new Uint8Array(byteChars.length);
                    for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
                    const blob = new Blob([byteArray], { type: "application/pdf" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `planning-hebdo-${formation.title?.replace(/\s+/g, "-") || "session"}.pdf`;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                    toast({ title: "Planning téléchargé" });
                  } catch (err) {
                    toast({ title: "Erreur", description: err instanceof Error ? err.message : "Erreur", variant: "destructive" });
                  }
                }}
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
            disabled={exportingSheet || timeSlots.length === 0}
          >
            {exportingSheet ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
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
            onClick={async () => {
              try {
                toast({ title: "Génération en cours..." });
                const res = await fetch("/api/documents/generate-from-template", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    doc_type: "planning_semaine",
                    context: { session_id: formation.id },
                  }),
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json.error ?? "Échec génération PDF");

                // base64 → Blob → download
                const byteChars = atob(json.base64);
                const byteArray = new Uint8Array(byteChars.length);
                for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
                const blob = new Blob([byteArray], { type: "application/pdf" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `planning-hebdo-${formation.title?.replace(/\s+/g, "-") || "session"}.pdf`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                toast({ title: "Planning téléchargé" });
              } catch (err) {
                const msg = err instanceof Error ? err.message : "Erreur inconnue";
                toast({ title: "Erreur génération", description: msg, variant: "destructive" });
              }
            }}
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
            <DialogTitle>Signer pour {signDialog.signerName}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-2">
            Dessinez la signature pour valider la présence de {signDialog.signerName}.
          </p>
          <InlineSignaturePad onSign={handleAdminSign} disabled={signing} />
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
            <DialogTitle>QR Codes générés</DialogTitle>
          </DialogHeader>
          {qrSlotTokens && (
            <div className="space-y-6">
              {qrSlotTokens.slots.map(slotData => (
                <div key={slotData.slot.id} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {new Date(slotData.slot.start_time).toLocaleDateString("fr-FR")}{" "}
                      {formatTime(slotData.slot.start_time)} - {formatTime(slotData.slot.end_time)}
                    </Badge>
                  </div>

                  {slotData.trainer_tokens.length > 0 && (
                    <>
                      <p className="text-xs font-semibold text-purple-700">Formateurs</p>
                      <div className="grid grid-cols-3 gap-2">
                        {slotData.trainer_tokens.map(t => (
                          <div key={t.token} className="text-center p-2 border rounded-lg bg-purple-50/50">
                            <p className="text-xs font-medium mb-1 truncate">
                              {t.person.last_name} {t.person.first_name}
                            </p>
                            {qrImages[t.token] ? (
                              <img src={qrImages[t.token]} alt={`QR ${t.person.last_name}`} className="w-32 h-32 mx-auto" />
                            ) : (
                              <div className="w-32 h-32 mx-auto bg-gray-100 animate-pulse rounded" />
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <p className="text-xs font-semibold text-blue-700">Apprenants</p>
                  <div className="grid grid-cols-3 gap-2">
                    {slotData.learner_tokens.map(t => (
                      <div key={t.token} className="text-center p-2 border rounded-lg">
                        <p className="text-xs font-medium mb-1 truncate">
                          {t.person.last_name} {t.person.first_name}
                        </p>
                        {qrImages[t.token] ? (
                          <img src={qrImages[t.token]} alt={`QR ${t.person.last_name}`} className="w-32 h-32 mx-auto" />
                        ) : (
                          <div className="w-32 h-32 mx-auto bg-gray-100 animate-pulse rounded" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
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
    </div>
  );
}
