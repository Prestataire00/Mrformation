"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  FileText, Download, Trash2, Loader2, ExternalLink, BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import type { Session, Program } from "@/lib/types";

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

export function TabProgramme({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [showAssign, setShowAssign] = useState(false);
  const [selectedProgramId, setSelectedProgramId] = useState("");

  const program = formation.program;

  // Fetch available programs for assignment
  const fetchPrograms = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("entity_id")
      .eq("id", user.id)
      .single();
    if (!profile) return;
    const { data } = await supabase
      .from("programs")
      .select("id, title, description, is_active")
      .eq("entity_id", profile.entity_id)
      .eq("is_active", true)
      .order("title");
    setPrograms((data as Program[]) || []);
  }, [supabase]);

  useEffect(() => {
    if (!program) fetchPrograms();
  }, [program, fetchPrograms]);

  const handleToggleDpc = async (checked: boolean) => {
    const { error } = await supabase
      .from("sessions")
      .update({ is_dpc: checked })
      .eq("id", formation.id);
    if (error) {
      toast({ title: "Erreur", variant: "destructive" });
    } else {
      onRefresh();
    }
  };

  const handleRemoveProgram = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("sessions")
      .update({ program_id: null })
      .eq("id", formation.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erreur", variant: "destructive" });
    } else {
      toast({ title: "Programme dissocié" });
      setConfirmRemove(false);
      onRefresh();
    }
  };

  const handleAssignProgram = async () => {
    if (!selectedProgramId) return;
    setSaving(true);
    const { error } = await supabase
      .from("sessions")
      .update({ program_id: selectedProgramId })
      .eq("id", formation.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erreur", variant: "destructive" });
    } else {
      toast({ title: "Programme attribué" });
      setShowAssign(false);
      onRefresh();
    }
  };

  const handleDownloadPdf = async () => {
    if (!program) return;

    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const margin = 15;
    const pageWidth = 210;
    const maxW = pageWidth - margin * 2;
    let y = 20;

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text("PROGRAMME DE FORMATION", pageWidth / 2, y, { align: "center" });
    y += 12;

    doc.setFontSize(14);
    doc.setTextColor(59, 181, 197);
    const titleLines = doc.splitTextToSize(program.title || "", maxW);
    doc.text(titleLines, pageWidth / 2, y, { align: "center" });
    y += titleLines.length * 7 + 8;

    doc.setDrawColor(59, 181, 197);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    const checkPage = (needed: number) => {
      if (y + needed > 275) { doc.addPage(); y = 20; }
    };

    if (program.description) {
      checkPage(20);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      const descLines = doc.splitTextToSize(program.description, maxW);
      doc.text(descLines, margin, y);
      y += descLines.length * 5 + 8;
    }

    if (program.objectives) {
      checkPage(20);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 30, 30);
      doc.text("Objectifs", margin, y);
      y += 6;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      const objLines = doc.splitTextToSize(program.objectives, maxW - 5);
      doc.text(objLines, margin + 3, y);
      y += objLines.length * 5 + 8;
    }

    if (program.content && typeof program.content === "object") {
      checkPage(20);
      const contentStr = JSON.stringify(program.content, null, 2)
        .replace(/[{}"[\]]/g, "")
        .replace(/,\n/g, "\n")
        .trim();
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 30, 30);
      doc.text("Contenu", margin, y);
      y += 6;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      const contentLines = doc.splitTextToSize(contentStr, maxW - 5);
      for (const line of contentLines) {
        checkPage(6);
        doc.text(line, margin + 3, y);
        y += 5;
      }
      y += 8;
    }

    if (program.duration_hours) {
      checkPage(10);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 30, 30);
      doc.text(`Durée : ${program.duration_hours}h`, margin, y);
      y += 8;
    }

    if (program.price) {
      checkPage(10);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(`Prix : ${Number(program.price).toFixed(2)} € HT`, margin, y);
      y += 8;
    }

    if (program.nsf_code || program.nsf_label) {
      checkPage(10);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.text(`Code NSF : ${program.nsf_code || "—"} — ${program.nsf_label || ""}`, margin, y);
      y += 8;
    }

    const today = new Date().toLocaleDateString("fr-FR");
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Document généré le ${today} — MR FORMATION`, pageWidth / 2, 285, { align: "center" });

    const filename = `programme-${(program.title || "formation")
      .toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}.pdf`;
    doc.save(filename);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">{formation.title}</h2>

      {program ? (
        <>
          {/* Programme attribué */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                <span className="font-semibold">PROGRAMME ATTRIBUÉ À CETTE FORMATION:</span>
                <span className="font-bold">{program.title}</span>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  variant="default"
                  className="bg-teal-500 hover:bg-teal-600 text-white"
                  onClick={() => router.push(`/admin/programs/${program.id}`)}
                >
                  <FileText className="h-4 w-4 mr-2" /> Détails du programme
                </Button>
                <Button
                  variant="default"
                  className="bg-teal-500 hover:bg-teal-600 text-white"
                  onClick={() => router.push(`/admin/programs/${program.id}`)}
                >
                  <ExternalLink className="h-4 w-4 mr-2" /> Fichiers du programme
                </Button>
                <Button
                  variant="default"
                  className="bg-teal-500 hover:bg-teal-600 text-white"
                  onClick={handleDownloadPdf}
                >
                  <Download className="h-4 w-4 mr-2" /> Télécharger le programme en pdf
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setConfirmRemove(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Supprimer le programme de la formation
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* DPC Toggle */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Label className="text-base font-bold">DPC?</Label>
                <Switch
                  checked={formation.is_dpc || false}
                  onCheckedChange={handleToggleDpc}
                />
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        /* Aucun programme */
        <Card>
          <CardContent className="pt-6 space-y-4">
            <p className="text-muted-foreground">
              Aucun programme attribué à cette formation.
            </p>
            <Button onClick={() => setShowAssign(true)}>
              <BookOpen className="h-4 w-4 mr-2" /> Attribuer un programme
            </Button>

            {/* DPC Toggle même sans programme */}
            <div className="flex items-center gap-3 pt-4 border-t">
              <Label className="text-base font-bold">DPC?</Label>
              <Switch
                checked={formation.is_dpc || false}
                onCheckedChange={handleToggleDpc}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog confirmation suppression */}
      <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Dissocier le programme ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Le programme ne sera plus lié à cette formation. Le programme lui-même ne sera pas supprimé.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRemove(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleRemoveProgram} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Dissocier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog attribution programme */}
      <Dialog open={showAssign} onOpenChange={setShowAssign}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Attribuer un programme</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Programme</Label>
            <Select value={selectedProgramId} onValueChange={setSelectedProgramId}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un programme..." />
              </SelectTrigger>
              <SelectContent>
                {programs.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssign(false)}>Annuler</Button>
            <Button onClick={handleAssignProgram} disabled={saving || !selectedProgramId}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Attribuer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
