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

  const handleDownloadPdf = () => {
    if (!program) return;
    // Navigate to program detail page where PDF generation exists
    // For now, generate a simple text export
    const content = [
      `PROGRAMME: ${program.title}`,
      "",
      program.description || "",
      "",
      program.objectives ? `OBJECTIFS:\n${program.objectives}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `programme-${program.title}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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
