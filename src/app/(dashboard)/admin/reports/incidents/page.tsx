"use client";

import { useState } from "react";
import { Plus, Download, Filter, Pencil, Trash2, X } from "lucide-react";
import { downloadXlsx } from "@/lib/export-xlsx";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

type Statut = "Ouvert" | "Clos";
type Source = "Entreprise" | "Apprenant" | "Formateur";
type Sujet = "Pédagogique" | "Administratif" | "Technique";
type Gravite = "Faible" | "Modéré" | "Grave";

interface Incident {
  id: string;
  date: string;
  nom: string;
  description: string;
  statut: Statut;
  source: Source;
  sujet: Sujet;
  gravite: Gravite;
  formation: string;
  action_menee: string;
  date_cloture: string;
}

const STATUT_COLORS: Record<Statut, string> = {
  Ouvert: "bg-orange-100 text-orange-700",
  Clos: "bg-green-100 text-green-700",
};

const GRAVITE_COLORS: Record<Gravite, string> = {
  Faible: "bg-blue-100 text-blue-700",
  Modéré: "bg-yellow-100 text-yellow-700",
  Grave: "bg-red-100 text-red-700",
};

const EMPTY_FORM: Omit<Incident, "id"> = {
  date: new Date().toISOString().split("T")[0],
  nom: "",
  description: "",
  statut: "Ouvert",
  source: "Entreprise",
  sujet: "Pédagogique",
  gravite: "Faible",
  formation: "",
  action_menee: "",
  date_cloture: "",
};

export default function IncidentsPage() {
  const { toast } = useToast();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchText, setSearchText] = useState("");
  const [editItem, setEditItem] = useState<Incident | null>(null);

  const filtered = incidents.filter((inc) => {
    if (dateFrom && inc.date < dateFrom) return false;
    if (dateTo && inc.date > dateTo) return false;
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      if (!inc.nom.toLowerCase().includes(q) && !inc.description.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const handleAdd = () => {
    if (!form.nom.trim()) {
      toast({ title: "Erreur", description: "Le nom est requis.", variant: "destructive" });
      return;
    }
    const newInc: Incident = { id: Date.now().toString(), ...form };
    setIncidents((prev) => [newInc, ...prev]);
    setForm({ ...EMPTY_FORM });
    setAddOpen(false);
    toast({ title: "Incident ajouté", description: `"${newInc.nom}" a été enregistré.` });
  };

  const handleSaveEdit = () => {
    if (!editItem) return;
    setIncidents((prev) => prev.map((i) => (i.id === editItem.id ? editItem : i)));
    setEditItem(null);
    toast({ title: "Modifié", description: "L'incident a été mis à jour." });
  };

  const handleDelete = (id: string, nom: string) => {
    if (!confirm(`Supprimer l'incident "${nom}" ?`)) return;
    setIncidents((prev) => prev.filter((i) => i.id !== id));
    toast({ title: "Supprimé" });
  };

  const handleDownload = () => {
    const headers = ["Date", "Nom", "Statut", "Source", "Sujet", "Gravité"];
    const rows = filtered.map((i) => [i.date, i.nom, i.statut, i.source, i.sujet, i.gravite]);
    downloadXlsx(headers, rows, "incidents_qualite.xlsx");
  };

  // Shared form component for add/edit
  const IncidentForm = ({
    data,
    setData,
  }: {
    data: Omit<Incident, "id"> | Incident;
    setData: (d: Omit<Incident, "id"> | Incident) => void;
  }) => (
    <div className="space-y-5 py-2">
      {/* Nom */}
      <div>
        <label className="block text-sm text-gray-600 font-medium mb-1">
          Nom de l&apos;incident<span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={data.nom}
          onChange={(e) => setData({ ...data, nom: e.target.value })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5]"
        />
      </div>

      {/* Date */}
      <div>
        <label className="block text-sm text-gray-600 font-medium mb-1">
          Date de l&apos;incident<span className="text-red-500">*</span>
        </label>
        <input
          type="date"
          value={data.date}
          onChange={(e) => setData({ ...data, date: e.target.value })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5]"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm text-gray-600 font-medium mb-1">Description</label>
        <textarea
          value={data.description}
          onChange={(e) => setData({ ...data, description: e.target.value })}
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5] resize-y"
        />
      </div>

      {/* Statut */}
      <div>
        <label className="block text-sm text-gray-600 font-medium mb-1">Statut<span className="text-red-500">*</span></label>
        <select
          value={data.statut}
          onChange={(e) => setData({ ...data, statut: e.target.value as Statut })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5] bg-white"
        >
          <option value="Ouvert">Ouvert</option>
          <option value="Clos">Clos</option>
        </select>
      </div>

      {/* Source */}
      <div>
        <label className="block text-sm text-gray-600 font-medium mb-1">Source de l&apos;incident<span className="text-red-500">*</span></label>
        <select
          value={data.source}
          onChange={(e) => setData({ ...data, source: e.target.value as Source })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5] bg-white"
        >
          <option value="Entreprise">Entreprise</option>
          <option value="Apprenant">Apprenant</option>
          <option value="Formateur">Formateur</option>
        </select>
      </div>

      {/* Sujet */}
      <div>
        <label className="block text-sm text-gray-600 font-medium mb-1">Sujet de l&apos;incident<span className="text-red-500">*</span></label>
        <select
          value={data.sujet}
          onChange={(e) => setData({ ...data, sujet: e.target.value as Sujet })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5] bg-white"
        >
          <option value="Pédagogique">Pédagogique</option>
          <option value="Administratif">Administratif</option>
          <option value="Technique">Technique</option>
        </select>
      </div>

      {/* Gravité */}
      <div>
        <label className="block text-sm text-gray-600 font-medium mb-1">Gravité de l&apos;incident<span className="text-red-500">*</span></label>
        <select
          value={data.gravite}
          onChange={(e) => setData({ ...data, gravite: e.target.value as Gravite })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5] bg-white"
        >
          <option value="Faible">Faible</option>
          <option value="Modéré">Modéré</option>
          <option value="Grave">Grave</option>
        </select>
      </div>

      {/* Formation liée */}
      <div>
        <label className="block text-sm text-gray-600 font-medium mb-1">
          Incident lié à une formation?
          <span className="text-xs text-gray-400 ml-1">(Si non, laissez vide)</span>
        </label>
        <input
          type="text"
          value={data.formation}
          onChange={(e) => setData({ ...data, formation: e.target.value })}
          placeholder="Nom de la formation"
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5]"
        />
      </div>

      {/* Separator - INCIDENT RÉGLÉ? */}
      <div className="rounded-lg overflow-hidden">
        <div className="py-2 text-center text-sm font-semibold text-gray-500 uppercase tracking-wider" style={{ background: "linear-gradient(135deg, #e0f5f8, #d5f0f4)" }}>
          Incident réglé?
        </div>
      </div>

      {/* Action menée */}
      <div>
        <label className="block text-sm text-gray-600 font-medium mb-1">Action menée</label>
        <textarea
          value={data.action_menee}
          onChange={(e) => setData({ ...data, action_menee: e.target.value })}
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5] resize-y"
        />
      </div>

      {/* Date de clôture */}
      <div>
        <label className="block text-sm text-gray-600 font-medium mb-1">Date de clôture de l&apos;incident</label>
        <input
          type="date"
          value={data.date_cloture}
          onChange={(e) => setData({ ...data, date_cloture: e.target.value })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5]"
        />
      </div>
    </div>
  );

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Suivis / Incidents Qualité</h1>

      {/* Header actions */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => {
            setForm({ ...EMPTY_FORM });
            setAddOpen(true);
          }}
          className="text-white px-4 py-2 rounded-lg text-sm font-medium uppercase flex items-center gap-1.5"
          style={{ background: "#3DB5C5" }}
        >
          <Plus className="h-4 w-4" />
          Ajouter un incident
        </button>
        <button
          onClick={handleDownload}
          className="text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
          style={{ background: "#3DB5C5" }}
        >
          <Download className="h-4 w-4" />
          Télécharger en Excel
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <span className="text-sm text-gray-600">Du</span>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5]"
        />
        <span className="text-sm text-gray-600">au</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5]"
        />
        <span className="text-sm text-gray-600">contenant le texte:</span>
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Rechercher"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-44 focus:outline-none focus:border-[#3DB5C5]"
        />
        <button
          className="text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
          style={{ background: "#3DB5C5" }}
        >
          <Filter className="h-4 w-4" />
          Filtrer
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Date</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Nom</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Source</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Sujet</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Gravité</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-gray-400">
                  Aucun incident enregistré
                </td>
              </tr>
            ) : (
              filtered.map((inc) => (
                <tr key={inc.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-700">{inc.date}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{inc.nom}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUT_COLORS[inc.statut]}`}>
                      {inc.statut}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{inc.source}</td>
                  <td className="px-4 py-3 text-gray-600">{inc.sujet}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${GRAVITE_COLORS[inc.gravite]}`}>
                      {inc.gravite}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setEditItem({ ...inc })}
                        className="text-[#3DB5C5] hover:underline text-xs font-medium"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => handleDelete(inc.id, inc.nom)}
                        className="text-red-500 hover:underline text-xs"
                      >
                        Supprimer
                      </button>
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
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ajouter un incident qualité</DialogTitle>
          </DialogHeader>
          <IncidentForm data={form} setData={(d) => setForm(d as typeof EMPTY_FORM)} />
          <DialogFooter>
            <button onClick={() => setAddOpen(false)} className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm">
              Annuler
            </button>
            <button onClick={handleAdd} className="text-white px-4 py-2 rounded-lg text-sm font-medium" style={{ background: "#3DB5C5" }}>
              Ajouter
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Suivis / Modifier Un Incident Qualité</DialogTitle>
          </DialogHeader>
          {editItem && (
            <IncidentForm data={editItem} setData={(d) => setEditItem(d as Incident)} />
          )}
          <DialogFooter>
            <button onClick={() => setEditItem(null)} className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm">
              Annuler
            </button>
            <button onClick={handleSaveEdit} className="text-white px-4 py-2 rounded-lg text-sm font-medium" style={{ background: "#3DB5C5" }}>
              Modifier
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
