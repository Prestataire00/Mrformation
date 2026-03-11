"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Download, Search } from "lucide-react";
import { downloadXlsx } from "@/lib/export-xlsx";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Financeur {
  id: string;
  nom: string;
  tel: string;
  email: string;
  type: "OPCO" | "Entreprise" | "CPF" | "Autre";
}

const INITIAL_FINANCEURS: Financeur[] = [
  { id: "1", nom: "OPCO Atlas", tel: "01 23 45 67 89", email: "contact@opco-atlas.fr", type: "OPCO" },
  { id: "2", nom: "Constructys", tel: "01 76 23 12 00", email: "info@constructys.fr", type: "OPCO" },
  { id: "3", nom: "Caisse des Dépôts (CPF)", tel: "03 69 20 17 17", email: "cpf@caissedesdepots.fr", type: "CPF" },
  { id: "4", nom: "Entreprise Dupont SA", tel: "04 56 78 90 12", email: "formation@dupont.fr", type: "Entreprise" },
];

const TYPE_OPTIONS: Financeur["type"][] = ["OPCO", "Entreprise", "CPF", "Autre"];

const TYPE_COLORS: Record<Financeur["type"], string> = {
  OPCO: "bg-blue-100 text-blue-700",
  Entreprise: "bg-green-100 text-green-700",
  CPF: "bg-purple-100 text-purple-700",
  Autre: "bg-gray-100 text-gray-600",
};

export default function FinanceursPage() {
  const { toast } = useToast();
  const [financeurs, setFinanceurs] = useState<Financeur[]>(INITIAL_FINANCEURS);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<Financeur | null>(null);

  const [form, setForm] = useState({ nom: "", tel: "", email: "", type: "OPCO" as Financeur["type"] });

  const filtered = financeurs.filter((f) =>
    `${f.nom} ${f.email} ${f.type}`.toLowerCase().includes(search.toLowerCase())
  );

  const handleSearch = () => setSearch(searchInput);

  const handleAdd = () => {
    if (!form.nom.trim()) {
      toast({ title: "Erreur", description: "Le nom est requis.", variant: "destructive" });
      return;
    }
    const newItem: Financeur = { id: Date.now().toString(), ...form };
    setFinanceurs((prev) => [...prev, newItem]);
    setForm({ nom: "", tel: "", email: "", type: "OPCO" });
    setAddOpen(false);
    toast({ title: "Financeur ajouté", description: `${newItem.nom} a été ajouté.` });
  };

  const handleEdit = () => {
    if (!editItem) return;
    setFinanceurs((prev) => prev.map((f) => (f.id === editItem.id ? editItem : f)));
    setEditItem(null);
    toast({ title: "Modifié", description: "Le financeur a été mis à jour." });
  };

  const handleDelete = (id: string, nom: string) => {
    if (!confirm(`Supprimer ${nom} ?`)) return;
    setFinanceurs((prev) => prev.filter((f) => f.id !== id));
    toast({ title: "Supprimé", description: `${nom} a été supprimé.` });
  };

  const handleDownloadCSV = () => {
    const headers = ["Nom", "Téléphone", "Email", "Type"];
    const rows = filtered.map((f) => [f.nom, f.tel, f.email, f.type]);
    downloadXlsx(headers, rows, "financeurs.xlsx");
  };

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm mb-4">
        <Link href="/admin" className="text-[#3DB5C5] hover:underline">Accueil</Link>
        <span className="text-gray-400">/</span>
        <Link href="/admin/clients" className="text-[#3DB5C5] hover:underline">Clients</Link>
        <span className="text-gray-400">/</span>
        <span className="text-gray-500">Financeurs</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-gray-700 text-xl font-bold">Clients & Financeurs / Tous les Financeurs</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setAddOpen(true)}
            className="text-white px-4 py-2 rounded-lg text-sm font-medium uppercase flex items-center gap-1"
            style={{ background: "#3DB5C5" }}
          >
            <Plus className="h-4 w-4" />
            Ajouter un financeur
          </button>
          <button
            onClick={handleDownloadCSV}
            className="border border-[#3DB5C5] text-[#3DB5C5] px-4 py-2 rounded-lg text-sm flex items-center gap-1"
          >
            <Download className="h-4 w-4" />
            Télécharger en Excel
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          placeholder="Rechercher..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="border border-gray-300 rounded-lg px-4 py-2 text-sm w-72 focus:outline-none focus:border-[#3DB5C5]"
        />
        <button
          onClick={handleSearch}
          className="text-white px-4 py-2 rounded-lg text-sm font-medium uppercase flex items-center gap-1"
          style={{ background: "#3DB5C5" }}
        >
          <Search className="h-4 w-4" />
          Rechercher
        </button>
      </div>

      {/* Count */}
      <p className="text-sm text-gray-500 mb-3">{filtered.length} Financeur{filtered.length !== 1 ? "s" : ""}</p>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Nom</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Tél</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Email</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Type</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                  Aucun financeur trouvé
                </td>
              </tr>
            ) : (
              filtered.map((f) => (
                <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-800">{f.nom}</td>
                  <td className="px-4 py-3 text-gray-600">{f.tel || "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{f.email || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[f.type]}`}>
                      {f.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setEditItem({ ...f })}
                        className="text-[#3DB5C5] hover:underline text-xs font-medium"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => handleDelete(f.id, f.nom)}
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajouter un financeur</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nom <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.nom}
                onChange={(e) => setForm((p) => ({ ...p, nom: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5]"
                placeholder="Nom du financeur"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Téléphone</label>
              <input
                type="tel"
                value={form.tel}
                onChange={(e) => setForm((p) => ({ ...p, tel: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5]"
                placeholder="01 23 45 67 89"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5]"
                placeholder="contact@exemple.fr"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as Financeur["type"] }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5]"
              >
                {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier le financeur</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-4 py-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nom</label>
                <input
                  type="text"
                  value={editItem.nom}
                  onChange={(e) => setEditItem((p) => p ? { ...p, nom: e.target.value } : p)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5]"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Téléphone</label>
                <input
                  type="tel"
                  value={editItem.tel}
                  onChange={(e) => setEditItem((p) => p ? { ...p, tel: e.target.value } : p)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5]"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Email</label>
                <input
                  type="email"
                  value={editItem.email}
                  onChange={(e) => setEditItem((p) => p ? { ...p, email: e.target.value } : p)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5]"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Type</label>
                <select
                  value={editItem.type}
                  onChange={(e) => setEditItem((p) => p ? { ...p, type: e.target.value as Financeur["type"] } : p)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5]"
                >
                  {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          )}
          <DialogFooter>
            <button onClick={() => setEditItem(null)} className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm">
              Annuler
            </button>
            <button onClick={handleEdit} className="text-white px-4 py-2 rounded-lg text-sm font-medium" style={{ background: "#3DB5C5" }}>
              Enregistrer
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
