"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Download, Filter } from "lucide-react";
import { downloadXlsx } from "@/lib/export-xlsx";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Amelioration {
  id: string;
  date: string;
  description: string;
  action_taken: string;
  result: string;
  responsible: string;
}

const EMPTY_FORM = {
  date: new Date().toISOString().split("T")[0],
  description: "",
  action_taken: "",
  result: "",
  responsible: "",
};

export default function AmeliorationPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<Amelioration[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editItem, setEditItem] = useState<Amelioration | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = items.filter((item) => {
    if (dateFrom && item.date < dateFrom) return false;
    if (dateTo && item.date > dateTo) return false;
    return true;
  });

  const handleAdd = () => {
    if (!form.description.trim()) {
      toast({ title: "Erreur", description: "La description est requise.", variant: "destructive" });
      return;
    }
    const newItem: Amelioration = { id: Date.now().toString(), ...form };
    setItems((prev) => [newItem, ...prev]);
    setForm({ ...EMPTY_FORM });
    setAddOpen(false);
    toast({ title: "Amélioration ajoutée", description: "L'entrée a été enregistrée." });
  };

  const handleSaveEdit = () => {
    if (!editItem) return;
    setItems((prev) => prev.map((i) => (i.id === editItem.id ? editItem : i)));
    setEditItem(null);
    toast({ title: "Modifié", description: "L'amélioration a été mise à jour." });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Supprimer cette amélioration ?")) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast({ title: "Supprimé" });
  };

  const handleDownloadCSV = () => {
    const headers = ["Date", "Description", "Action menée", "Résultat", "Responsable"];
    const rows = filtered.map((i) => [i.date, i.description, i.action_taken, i.result, i.responsible]);
    downloadXlsx(headers, rows, "amelioration-continue.xlsx");
  };

  const FormFields = ({ data, setData }: { data: typeof EMPTY_FORM | Amelioration; setData: (d: typeof EMPTY_FORM | Amelioration) => void }) => (
    <div className="space-y-4 py-2">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Date</label>
        <input
          type="date"
          value={data.date}
          onChange={(e) => setData({ ...data, date: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#DC2626]"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Description <span className="text-red-500">*</span></label>
        <textarea
          value={data.description}
          onChange={(e) => setData({ ...data, description: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#DC2626] resize-none"
          rows={3}
          placeholder="Décrivez le constat ou le problème identifié..."
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Action menée</label>
        <textarea
          value={data.action_taken}
          onChange={(e) => setData({ ...data, action_taken: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#DC2626] resize-none"
          rows={2}
          placeholder="Action corrective ou préventive mise en place..."
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Résultat</label>
        <input
          type="text"
          value={data.result}
          onChange={(e) => setData({ ...data, result: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#DC2626]"
          placeholder="Résultat observé après l'action..."
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Responsable</label>
        <input
          type="text"
          value={data.responsible}
          onChange={(e) => setData({ ...data, responsible: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#DC2626]"
          placeholder="Nom du responsable de l'action..."
        />
      </div>
    </div>
  );

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm mb-4">
        <Link href="/admin" className="text-[#DC2626] hover:underline">Accueil</Link>
        <span className="text-gray-400">/</span>
        <Link href="/admin/reports" className="text-[#DC2626] hover:underline">Suivis</Link>
        <span className="text-gray-400">/</span>
        <span className="text-gray-500">Amélioration Continue</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-gray-700 text-xl font-bold">Amélioration Continue (Indicateur 32)</h1>
          <p className="text-xs text-gray-500 mt-1">Suivi des actions d&apos;amélioration continue — Critère Qualiopi n°32</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setForm({ ...EMPTY_FORM }); setAddOpen(true); }}
            className="text-white px-4 py-2 rounded-lg text-sm font-medium uppercase flex items-center gap-1"
            style={{ background: "#DC2626" }}
          >
            <Plus className="h-4 w-4" />
            Ajouter une amélioration
          </button>
          <button
            onClick={handleDownloadCSV}
            className="border border-[#DC2626] text-[#DC2626] px-4 py-2 rounded-lg text-sm flex items-center gap-1"
          >
            <Download className="h-4 w-4" />
            Télécharger en Excel
          </button>
        </div>
      </div>

      {/* Date filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Date de début</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#DC2626]" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Date de fin</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#DC2626]" />
          </div>
          <button className="text-white px-4 py-2 rounded-lg text-sm font-medium uppercase flex items-center gap-1" style={{ background: "#DC2626" }}>
            <Filter className="h-4 w-4" /> Filtrer
          </button>
        </div>
      </div>

      {/* Count */}
      <p className="text-sm text-gray-500 mb-3">{filtered.length} Amélioration{filtered.length !== 1 ? "s" : ""}</p>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Date</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Description</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Action menée</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Résultat</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Responsable</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center text-gray-400">
                  <p className="text-4xl font-bold mb-2">0</p>
                  <p className="text-sm">Aucune amélioration enregistrée</p>
                  <p className="text-xs mt-1 text-gray-300">Utilisez le bouton ci-dessus pour ajouter votre première entrée</p>
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{item.date}</td>
                  <td className="px-4 py-3 text-gray-700 max-w-[200px] truncate" title={item.description}>{item.description}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate" title={item.action_taken}>{item.action_taken || "—"}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-[150px] truncate" title={item.result}>{item.result || "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{item.responsible || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button onClick={() => setEditItem({ ...item })} className="text-[#DC2626] hover:underline text-xs font-medium">Modifier</button>
                      <button onClick={() => handleDelete(item.id)} className="text-red-500 hover:underline text-xs">Supprimer</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Ajouter une amélioration continue</DialogTitle></DialogHeader>
          <FormFields data={form} setData={(d) => setForm(d as typeof EMPTY_FORM)} />
          <DialogFooter>
            <button onClick={() => setAddOpen(false)} className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm">Annuler</button>
            <button onClick={handleAdd} className="text-white px-4 py-2 rounded-lg text-sm font-medium" style={{ background: "#DC2626" }}>Ajouter</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Modifier l&apos;amélioration</DialogTitle></DialogHeader>
          {editItem && <FormFields data={editItem} setData={(d) => setEditItem(d as Amelioration)} />}
          <DialogFooter>
            <button onClick={() => setEditItem(null)} className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm">Annuler</button>
            <button onClick={handleSaveEdit} className="text-white px-4 py-2 rounded-lg text-sm font-medium" style={{ background: "#DC2626" }}>Enregistrer</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
