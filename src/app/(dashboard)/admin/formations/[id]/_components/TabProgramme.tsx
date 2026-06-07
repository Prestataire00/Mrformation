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
import { isPedagogieV2Epic2Enabled } from "@/lib/feature-flags";
import { copyProgramElearningToSession } from "@/lib/services/pedagogie-v2-snapshot";
import type { Session, Program } from "@/lib/types";
import { getFormationKind } from "@/lib/utils/formation-companies";

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
    try {
      const { error } = await supabase
        .from("sessions")
        .update({ is_dpc: checked })
        .eq("id", formation.id)
        .eq("entity_id", formation.entity_id);
      if (error) throw error;
      toast({ title: checked ? "DPC activé" : "DPC désactivé" });
      await onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible de modifier le DPC";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    }
  };

  const handleRemoveProgram = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("sessions")
        .update({ program_id: null })
        .eq("id", formation.id)
        .eq("entity_id", formation.entity_id);
      if (error) throw error;
      toast({ title: "Programme dissocié" });
      setConfirmRemove(false);
      await onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible de dissocier le programme";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleAssignProgram = async () => {
    if (!selectedProgramId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("sessions")
        .update({ program_id: selectedProgramId })
        .eq("id", formation.id)
        .eq("entity_id", formation.entity_id);
      if (error) throw error;

      // Pédagogie V2 Epic 2 : déclencher le snapshot des e-learning du
      // programme vers session_elearning_courses. Idempotent (no-op si la
      // session a déjà des e-learning attachés, ex: assignation antérieure
      // déjà fait le snapshot).
      let copiedCount = 0;
      if (isPedagogieV2Epic2Enabled()) {
        try {
          const result = await copyProgramElearningToSession(supabase, {
            sessionId: formation.id,
            programId: selectedProgramId,
          });
          copiedCount = result.copied;
        } catch (err) {
          // Non-bloquant : l'assignation du programme reste valide même
          // si le snapshot e-learning échoue.
          console.error("[pedagogie-v2] copyProgramElearningToSession failed:", err);
        }
      }

      toast({
        title: "Programme attribué",
        description: copiedCount > 0
          ? `${copiedCount} module(s) e-learning du programme attaché(s) à cette session.`
          : undefined,
      });
      setShowAssign(false);
      await onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible d'attribuer le programme";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!program) return;
    setSaving(true);
    try {
      const res = await fetch("/api/documents/generate-programme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: formation.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);

      const bytes = atob(data.pdfBase64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `programme-${(program.title || "formation")
        .toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 60)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: "Programme exporté", description: "PDF téléchargé." });
    } catch (err) {
      toast({
        title: "Export échoué",
        description: err instanceof Error ? err.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {getFormationKind(formation) === "inter" && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <strong>Programme commun</strong> — Le programme pédagogique est commun à toutes les entreprises de la formation.
        </div>
      )}

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
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                  {saving ? "Génération…" : "Télécharger le programme en pdf"}
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
