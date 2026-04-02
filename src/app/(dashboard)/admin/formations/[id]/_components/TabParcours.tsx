"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Download, CheckCircle, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import type { Session } from "@/lib/types";

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

function formatSlotTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatSlotDate(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function slotDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  return m > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${h}h`;
}

export function TabParcours({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [editModule, setEditModule] = useState("");
  const [editObjectives, setEditObjectives] = useState("");

  const timeSlots = formation.formation_time_slots || [];

  async function handleMarkCompleted() {
    if (!confirm("Confirmer la fin de la formation ?")) return;
    setSaving(true);
    const { error } = await supabase
      .from("sessions")
      .update({ is_completed: true, status: "completed" })
      .eq("id", formation.id);
    setSaving(false);
    if (error) toast({ title: "Erreur", variant: "destructive" });
    else { toast({ title: "Formation terminée" }); onRefresh(); }
  }

  function openEdit(slot: any) {
    setEditingSlotId(slot.id);
    setEditModule(slot.module_title || "");
    setEditObjectives(slot.module_objectives || "");
  }

  async function handleSaveSlot() {
    if (!editingSlotId) return;
    const { error } = await supabase
      .from("formation_time_slots")
      .update({ module_title: editModule.trim() || null, module_objectives: editObjectives.trim() || null })
      .eq("id", editingSlotId);
    if (error) toast({ title: "Erreur", variant: "destructive" });
    else { toast({ title: "Créneau mis à jour" }); setEditingSlotId(null); onRefresh(); }
  }

  const handleDownloadBilan = () => {
    const headers = ["Créneau", "Date", "Début", "Fin", "Durée", "Module", "Objectifs"];
    const rows = timeSlots.map((slot, i) => [
      `${i + 1}`,
      formatSlotDate(slot.start_time),
      formatSlotTime(slot.start_time),
      formatSlotTime(slot.end_time),
      slotDuration(slot.start_time, slot.end_time),
      slot.module_title || "",
      slot.module_objectives || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `bilan-${formation.title}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4">
      {/* Header compact */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{timeSlots.length} créneau{timeSlots.length > 1 ? "x" : ""}</span>
          {formation.is_completed ? (
            <Badge className="bg-green-100 text-green-700 text-xs gap-1"><CheckCircle className="h-3 w-3" /> Terminée</Badge>
          ) : timeSlots.length > 0 ? (
            <Button size="sm" variant="outline" className="text-xs h-7 gap-1 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={handleMarkCompleted} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />} Terminer la formation
            </Button>
          ) : null}
        </div>
        <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={handleDownloadBilan}>
          <Download className="h-3 w-3" /> Bilan CSV
        </Button>
      </div>

      {/* Slots table */}
      {timeSlots.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Aucun créneau. Utilisez le planning pour en créer.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 w-8">#</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Date</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Horaires</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Durée</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Module</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {timeSlots.map((slot, i) => (
                <tr key={slot.id} className={cn("border-b border-gray-50 hover:bg-gray-50/50", editingSlotId === slot.id && "bg-blue-50/30")}>
                  <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                  <td className="px-3 py-2 text-gray-700">{formatSlotDate(slot.start_time)}</td>
                  <td className="px-3 py-2 text-gray-700">{formatSlotTime(slot.start_time)} — {formatSlotTime(slot.end_time)}</td>
                  <td className="px-3 py-2 text-gray-500">{slotDuration(slot.start_time, slot.end_time)}</td>
                  <td className="px-3 py-2">
                    {editingSlotId === slot.id ? (
                      <div className="space-y-1">
                        <Input value={editModule} onChange={(e) => setEditModule(e.target.value)} placeholder="Module..." className="h-7 text-xs" />
                        <Textarea value={editObjectives} onChange={(e) => setEditObjectives(e.target.value)} placeholder="Objectifs..." rows={2} className="text-xs resize-none" />
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="text-xs h-6" onClick={() => setEditingSlotId(null)}>Annuler</Button>
                          <Button size="sm" className="text-xs h-6" onClick={handleSaveSlot}>OK</Button>
                        </div>
                      </div>
                    ) : (
                      <span className={cn("text-xs", slot.module_title ? "text-gray-700" : "text-gray-300 italic")}>
                        {slot.module_title || "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editingSlotId !== slot.id && (
                      <button onClick={() => openEdit(slot)} className="text-gray-400 hover:text-gray-600 p-1">
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
