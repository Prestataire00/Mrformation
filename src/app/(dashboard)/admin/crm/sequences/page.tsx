"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Trash2, Mail, ClipboardList, Clock, Loader2, ChevronDown, ChevronUp, Zap, Play, Pause, Users,
} from "lucide-react";

interface Sequence {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  steps?: Step[];
  _enrollments_count?: number;
}

interface Step {
  id: string;
  sequence_id: string;
  step_order: number;
  delay_days: number;
  action_type: "email" | "task" | "wait";
  email_subject: string | null;
  email_body: string | null;
  task_title: string | null;
}

export default function SequencesPage() {
  const supabase = createClient();
  const { entityId } = useEntity();
  const { toast } = useToast();

  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<Omit<Step, "id" | "sequence_id">[]>([]);

  // Enroll dialog
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollSequenceId, setEnrollSequenceId] = useState<string | null>(null);
  const [prospects, setProspects] = useState<{ id: string; company_name: string }[]>([]);
  const [selectedProspectId, setSelectedProspectId] = useState("");

  const fetchSequences = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    const { data } = await supabase
      .from("crm_sequences")
      .select("*, steps:crm_sequence_steps(*)")
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false });

    if (data) {
      // Count enrollments per sequence
      const enriched = await Promise.all(
        data.map(async (seq: any) => {
          const { count } = await supabase
            .from("crm_sequence_enrollments")
            .select("id", { count: "exact", head: true })
            .eq("sequence_id", seq.id)
            .eq("status", "active");
          return { ...seq, _enrollments_count: count ?? 0 };
        })
      );
      setSequences(enriched);
    }
    setLoading(false);
  }, [entityId, supabase]);

  useEffect(() => { fetchSequences(); }, [fetchSequences]);

  function openCreate() {
    setEditingId(null);
    setName("");
    setDescription("");
    setSteps([{ step_order: 1, delay_days: 0, action_type: "email", email_subject: "", email_body: "", task_title: null }]);
    setDialogOpen(true);
  }

  function openEdit(seq: Sequence) {
    setEditingId(seq.id);
    setName(seq.name);
    setDescription(seq.description || "");
    setSteps(
      (seq.steps || [])
        .sort((a, b) => a.step_order - b.step_order)
        .map(s => ({
          step_order: s.step_order,
          delay_days: s.delay_days,
          action_type: s.action_type,
          email_subject: s.email_subject,
          email_body: s.email_body,
          task_title: s.task_title,
        }))
    );
    setDialogOpen(true);
  }

  function addStep() {
    setSteps(prev => [
      ...prev,
      { step_order: prev.length + 1, delay_days: 3, action_type: "email", email_subject: "", email_body: "", task_title: null },
    ]);
  }

  function removeStep(idx: number) {
    setSteps(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_order: i + 1 })));
  }

  function updateStep(idx: number, field: string, value: unknown) {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  }

  async function handleSave() {
    if (!name.trim() || !entityId) return;
    setSaving(true);

    if (editingId) {
      await supabase.from("crm_sequences").update({ name: name.trim(), description: description.trim() || null }).eq("id", editingId);
      await supabase.from("crm_sequence_steps").delete().eq("sequence_id", editingId);
      if (steps.length > 0) {
        await supabase.from("crm_sequence_steps").insert(steps.map(s => ({ ...s, sequence_id: editingId })));
      }
    } else {
      const { data: seq } = await supabase
        .from("crm_sequences")
        .insert({ entity_id: entityId, name: name.trim(), description: description.trim() || null })
        .select("id")
        .single();
      if (seq && steps.length > 0) {
        await supabase.from("crm_sequence_steps").insert(steps.map(s => ({ ...s, sequence_id: seq.id })));
      }
    }

    setSaving(false);
    setDialogOpen(false);
    fetchSequences();
    toast({ title: editingId ? "Séquence mise à jour" : "Séquence créée" });
  }

  async function handleDelete(id: string) {
    await supabase.from("crm_sequences").delete().eq("id", id);
    fetchSequences();
    toast({ title: "Séquence supprimée" });
  }

  async function handleToggle(id: string, isActive: boolean) {
    await supabase.from("crm_sequences").update({ is_active: !isActive }).eq("id", id);
    setSequences(prev => prev.map(s => s.id === id ? { ...s, is_active: !isActive } : s));
  }

  async function openEnroll(sequenceId: string) {
    setEnrollSequenceId(sequenceId);
    setSelectedProspectId("");
    if (prospects.length === 0 && entityId) {
      const { data } = await supabase.from("crm_prospects").select("id, company_name").eq("entity_id", entityId).not("status", "in", '("won","lost","dormant")').order("company_name");
      setProspects(data ?? []);
    }
    setEnrollOpen(true);
  }

  async function handleEnroll() {
    if (!enrollSequenceId || !selectedProspectId) return;
    const seq = sequences.find(s => s.id === enrollSequenceId);
    const firstStep = seq?.steps?.sort((a, b) => a.step_order - b.step_order)[0];
    const nextAction = new Date();
    if (firstStep) nextAction.setDate(nextAction.getDate() + firstStep.delay_days);

    const { error } = await supabase.from("crm_sequence_enrollments").insert({
      sequence_id: enrollSequenceId,
      prospect_id: selectedProspectId,
      current_step: 1,
      status: "active",
      next_action_at: nextAction.toISOString(),
    });

    if (error?.code === "23505") {
      toast({ title: "Ce prospect est déjà inscrit dans cette séquence", variant: "destructive" });
    } else {
      toast({ title: "Prospect inscrit dans la séquence" });
      setEnrollOpen(false);
      fetchSequences();
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Séquences automatisées</h1>
          <p className="text-sm text-muted-foreground mt-1">Automatisez vos relances avec des séquences multi-étapes</p>
        </div>
        <Button size="sm" onClick={openCreate} style={{ background: "#374151" }} className="text-white gap-1.5">
          <Plus className="h-4 w-4" /> Nouvelle séquence
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : sequences.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Zap className="h-10 w-10 text-gray-300 mb-3" />
            <p className="font-medium text-gray-600">Aucune séquence</p>
            <p className="text-sm text-gray-400 mt-1">Créez votre première séquence de relance automatique</p>
            <Button size="sm" onClick={openCreate} className="mt-4 gap-1.5" style={{ background: "#374151" }}>
              <Plus className="h-4 w-4" /> Créer une séquence
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {sequences.map(seq => (
            <Card key={seq.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      <Zap className="h-5 w-5 text-gray-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{seq.name}</h3>
                        <Badge variant={seq.is_active ? "default" : "secondary"} className="text-[10px]">
                          {seq.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      {seq.description && <p className="text-xs text-muted-foreground mt-0.5">{seq.description}</p>}
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{(seq.steps || []).length} étape{(seq.steps || []).length > 1 ? "s" : ""}</span>
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{seq._enrollments_count} inscrit{(seq._enrollments_count ?? 0) > 1 ? "s" : ""}</span>
                      </div>

                      {/* Steps preview */}
                      <div className="flex items-center gap-1 mt-3">
                        {(seq.steps || []).sort((a, b) => a.step_order - b.step_order).map((step, i) => (
                          <div key={step.id} className="flex items-center gap-1">
                            {i > 0 && <span className="text-gray-300 text-[10px]">→ J+{step.delay_days}</span>}
                            <div className="flex items-center gap-1 bg-gray-50 rounded px-2 py-0.5 text-[10px] text-gray-600">
                              {step.action_type === "email" ? <Mail className="h-2.5 w-2.5" /> : <ClipboardList className="h-2.5 w-2.5" />}
                              {step.action_type === "email" ? "Email" : "Tâche"}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => openEnroll(seq.id)}>
                      <Plus className="h-3 w-3" /> Inscrire
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => handleToggle(seq.id, seq.is_active)}>
                      {seq.is_active ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => openEdit(seq)}>Modifier</Button>
                    <Button size="sm" variant="ghost" className="text-xs h-7 text-red-500" onClick={() => handleDelete(seq.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Create/Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Modifier la séquence" : "Nouvelle séquence"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Nom <span className="text-red-500">*</span></label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Séquence de bienvenue" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Description</label>
                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optionnel" />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Étapes</h3>
                <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={addStep}>
                  <Plus className="h-3 w-3" /> Ajouter une étape
                </Button>
              </div>

              {steps.map((step, idx) => (
                <div key={idx} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500">Étape {idx + 1}</span>
                    {steps.length > 1 && (
                      <button onClick={() => removeStep(idx)} className="text-xs text-red-400 hover:text-red-600">Supprimer</button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-gray-500">Délai</label>
                      <div className="flex items-center gap-1">
                        <Input type="number" min={0} value={step.delay_days} onChange={e => updateStep(idx, "delay_days", parseInt(e.target.value) || 0)} className="h-8 w-20 text-xs" />
                        <span className="text-xs text-gray-500">jours</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-gray-500">Type</label>
                      <Select value={step.action_type} onValueChange={v => updateStep(idx, "action_type", v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="task">Tâche</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {step.action_type === "email" ? (
                    <div className="space-y-2">
                      <Input value={step.email_subject || ""} onChange={e => updateStep(idx, "email_subject", e.target.value)} placeholder="Objet de l'email" className="h-8 text-xs" />
                      <Textarea value={step.email_body || ""} onChange={e => updateStep(idx, "email_body", e.target.value)} placeholder="Corps de l'email..." rows={3} className="text-xs" />
                    </div>
                  ) : (
                    <Input value={step.task_title || ""} onChange={e => updateStep(idx, "task_title", e.target.value)} placeholder="Titre de la tâche" className="h-8 text-xs" />
                  )}
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()} style={{ background: "#374151" }} className="text-white">
              {saving ? "Enregistrement..." : editingId ? "Mettre à jour" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Enroll Dialog ── */}
      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Inscrire un prospect</DialogTitle>
          </DialogHeader>
          <div className="py-3">
            <Select value={selectedProspectId} onValueChange={setSelectedProspectId}>
              <SelectTrigger><SelectValue placeholder="Choisir un prospect..." /></SelectTrigger>
              <SelectContent>
                {prospects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.company_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrollOpen(false)}>Annuler</Button>
            <Button onClick={handleEnroll} disabled={!selectedProspectId} style={{ background: "#374151" }} className="text-white">
              Inscrire
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
