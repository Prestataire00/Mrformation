"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { GraduationCap, Plus, Pencil, Trash2, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { getInitials } from "@/lib/utils";
import type { Session, Learner, Enrollment } from "@/lib/types";

const ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  registered: "Inscrit",
  confirmed: "Confirmé",
  cancelled: "Annulé",
  completed: "Terminé",
};

const ENROLLMENT_STATUS_COLORS: Record<string, string> = {
  registered: "bg-blue-100 text-blue-800",
  confirmed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  completed: "bg-emerald-100 text-emerald-800",
};

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

export function ResumeLearners({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [allLearners, setAllLearners] = useState<Learner[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedLearnerId, setSelectedLearnerId] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const enrollments = formation.enrollments || [];

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("learners")
        .select("*")
        .eq("entity_id", formation.entity_id)
        .order("last_name");
      if (data) setAllLearners(data);
    };
    fetch();
  }, [formation.entity_id, supabase]);

  const handleAdd = async () => {
    if (!selectedLearnerId) return;
    setSaving(true);
    const { error } = await supabase.from("enrollments").insert({
      session_id: formation.id,
      learner_id: selectedLearnerId,
      client_id: selectedClientId || null,
      status: "registered",
    });
    setSaving(false);
    if (error) {
      if (error.code === "23505") {
        toast({ title: "Cet apprenant est déjà inscrit", variant: "destructive" });
      } else {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
      }
    } else {
      toast({ title: "Apprenant ajouté" });
      setDialogOpen(false);
      setSelectedLearnerId("");
      setSelectedClientId("");
      onRefresh();
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("enrollments").delete().eq("id", deleteId);
    if (error) {
      toast({ title: "Erreur", variant: "destructive" });
    } else {
      toast({ title: "Apprenant retiré" });
      setDeleteId(null);
      onRefresh();
    }
  };

  const handleExportExcel = () => {
    // Export CSV simple
    const headers = ["Nom", "Prénom", "Email", "Téléphone", "Statut"];
    const rows = enrollments.map((e) => [
      e.learner?.last_name || "",
      e.learner?.first_name || "",
      e.learner?.email || "",
      e.learner?.phone || "",
      ENROLLMENT_STATUS_LABELS[e.status] || e.status,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `apprenants-${formation.title}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtrer les apprenants déjà inscrits
  const enrolledIds = enrollments.map((e) => e.learner_id).filter(Boolean);
  const availableLearners = allLearners.filter((l) => !enrolledIds.includes(l.id));

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <GraduationCap className="h-4 w-4" /> Apprenants & Particuliers ({enrollments.length})
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {enrollments.map((e) => (
              <div key={e.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">
                      {getInitials(e.learner?.first_name, e.learner?.last_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-sm">
                      {e.learner?.last_name?.toUpperCase()} {e.learner?.first_name}
                    </p>
                    {e.learner?.email && (
                      <p className="text-xs text-muted-foreground">{e.learner.email}</p>
                    )}
                  </div>
                  {e.client && (
                    <Badge variant="outline" className="text-xs">{e.client.company_name}</Badge>
                  )}
                  <Badge className={ENROLLMENT_STATUS_COLORS[e.status] || "bg-gray-100"}>
                    {ENROLLMENT_STATUS_LABELS[e.status] || e.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => setDeleteId(e.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {enrollments.length === 0 && (
              <p className="text-sm text-muted-foreground">Aucun apprenant inscrit</p>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Ajouter un Apprenant
            </Button>
            <Button size="sm" variant="outline" onClick={handleExportExcel}>
              <Download className="h-4 w-4 mr-1" /> Exporter la liste (CSV)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un Apprenant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Select value={selectedLearnerId} onValueChange={setSelectedLearnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un apprenant" />
                </SelectTrigger>
                <SelectContent>
                  {availableLearners.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.last_name?.toUpperCase()} {l.first_name} — {l.email || ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleAdd} disabled={saving || !selectedLearnerId}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Retirer cet apprenant ?</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDelete}>Retirer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
