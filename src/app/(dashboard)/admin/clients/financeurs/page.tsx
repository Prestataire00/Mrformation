"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { Plus, Search, Trash2, X, Check, Download, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { downloadXlsx } from "@/lib/export-xlsx";
import Link from "next/link";

interface Financeur {
  id: string;
  entity_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  type: string;
  notes: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  siret: string | null;
  code_opco: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  is_active: boolean;
  created_at: string;
}

type FinanceurType = "OPCO" | "Entreprise" | "CPF" | "Autre";

const TYPE_OPTIONS: FinanceurType[] = ["OPCO", "Entreprise", "CPF", "Autre"];

const TYPE_COLORS: Record<string, string> = {
  OPCO: "bg-blue-100 text-blue-700",
  Entreprise: "bg-green-100 text-green-700",
  CPF: "bg-purple-100 text-purple-700",
  Autre: "bg-gray-100 text-gray-600",
};

const EMPTY_FORM = { name: "", phone: "", email: "", type: "OPCO" as string, siret: "", code_opco: "", contact_name: "", contact_email: "", address: "", city: "", postal_code: "" };

export default function FinanceursPage() {
  const supabase = createClient();
  const { entityId } = useEntity();
  const { toast } = useToast();

  const [financeurs, setFinanceurs] = useState<Financeur[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchFinanceurs = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("financeurs")
      .select("*")
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      setFinanceurs(data || []);
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  useEffect(() => {
    fetchFinanceurs();
  }, [fetchFinanceurs]);

  const filtered = financeurs.filter((f) =>
    `${f.name} ${f.email || ""} ${f.type}`.toLowerCase().includes(search.toLowerCase())
  );

  /* ---- Add ---- */
  const handleAdd = async () => {
    if (!form.name.trim()) {
      toast({ title: "Erreur", description: "Le nom est requis.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("financeurs").insert({
      entity_id: entityId,
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      type: form.type,
      siret: form.siret.trim() || null,
      code_opco: form.code_opco.trim() || null,
      contact_name: form.contact_name.trim() || null,
      contact_email: form.contact_email.trim() || null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      postal_code: form.postal_code.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Financeur ajouté" });
    setForm(EMPTY_FORM);
    setShowAddForm(false);
    fetchFinanceurs();
  };

  /* ---- Edit ---- */
  const startEdit = (f: Financeur) => {
    setEditingId(f.id);
    setEditForm({ name: f.name, phone: f.phone || "", email: f.email || "", type: f.type, siret: f.siret || "", code_opco: f.code_opco || "", contact_name: f.contact_name || "", contact_email: f.contact_email || "", address: f.address || "", city: f.city || "", postal_code: f.postal_code || "" });
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editForm.name.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("financeurs")
      .update({
        name: editForm.name.trim(),
        phone: editForm.phone.trim() || null,
        email: editForm.email.trim() || null,
        type: editForm.type,
        siret: editForm.siret.trim() || null,
        code_opco: editForm.code_opco.trim() || null,
        contact_name: editForm.contact_name.trim() || null,
        contact_email: editForm.contact_email.trim() || null,
        address: editForm.address.trim() || null,
        city: editForm.city.trim() || null,
        postal_code: editForm.postal_code.trim() || null,
      })
      .eq("id", editingId);
    setSaving(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Financeur modifié" });
    setEditingId(null);
    fetchFinanceurs();
  };

  /* ---- Delete ---- */
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Supprimer ${name} ?`)) return;
    const { error } = await supabase.from("financeurs").delete().eq("id", id);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Supprimé", description: `${name} a été supprimé.` });
    fetchFinanceurs();
  };

  /* ---- Export ---- */
  const handleDownload = () => {
    const headers = ["Nom", "Téléphone", "Email", "Type"];
    const rows = filtered.map((f) => [f.name, f.phone || "", f.email || "", f.type]);
    downloadXlsx(headers, rows, "financeurs.xlsx");
  };

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm mb-4">
        <Link href="/admin" className="text-[#DC2626] hover:underline">Accueil</Link>
        <span className="text-gray-400">/</span>
        <Link href="/admin/clients" className="text-[#DC2626] hover:underline">Clients</Link>
        <span className="text-gray-400">/</span>
        <span className="text-gray-500">Financeurs</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-gray-900">Financeurs</h1>
          <span className="text-sm text-gray-500">({financeurs.length})</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowAddForm((v) => !v); setEditingId(null); }}
            className="text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1"
            style={{ background: "#DC2626" }}
          >
            <Plus className="h-4 w-4" />
            Ajouter
          </button>
          <button
            onClick={handleDownload}
            className="border border-[#DC2626] text-[#DC2626] px-4 py-2 rounded-lg text-sm flex items-center gap-1"
          >
            <Download className="h-4 w-4" />
            Excel
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-4">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm w-full focus:outline-none focus:border-[#DC2626]"
          />
        </div>
      </div>

      {/* Inline Add Form */}
      {showAddForm && (
        <div className="border border-[#DC2626] rounded-lg bg-white p-4 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nom <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#DC2626]"
                placeholder="Nom du financeur"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#DC2626]"
                placeholder="contact@exemple.fr"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Téléphone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#DC2626]"
                placeholder="01 23 45 67 89"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#DC2626]"
              >
                {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={() => { setShowAddForm(false); setForm(EMPTY_FORM); }}
              className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm"
            >
              Annuler
            </button>
            <button
              onClick={handleAdd}
              disabled={saving}
              className="text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1 disabled:opacity-50"
              style={{ background: "#DC2626" }}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Ajouter
            </button>
          </div>
        </div>
      )}

      {/* Count */}
      <p className="text-sm text-gray-500 mb-3">{filtered.length} financeur{filtered.length !== 1 ? "s" : ""}</p>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Chargement...
        </div>
      ) : (
        <div className="border rounded-lg bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Nom</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Tél</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Email</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Type</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Actions</th>
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
                    {editingId === f.id ? (
                      <>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-[#DC2626]"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="tel"
                            value={editForm.phone}
                            onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-[#DC2626]"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="email"
                            value={editForm.email}
                            onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-[#DC2626]"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={editForm.type}
                            onChange={(e) => setEditForm((p) => ({ ...p, type: e.target.value }))}
                            className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-[#DC2626]"
                          >
                            {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={handleSaveEdit}
                              disabled={saving}
                              className="text-green-600 hover:text-green-800"
                              title="Enregistrer"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="text-gray-400 hover:text-gray-600"
                              title="Annuler"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-medium text-gray-800">{f.name}</td>
                        <td className="px-4 py-3 text-gray-600">{f.phone || "—"}</td>
                        <td className="px-4 py-3 text-gray-600">{f.email || "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[f.type] || TYPE_COLORS.Autre}`}>
                            {f.type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => startEdit(f)}
                              className="text-[#DC2626] hover:underline text-xs font-medium"
                            >
                              Modifier
                            </button>
                            <button
                              onClick={() => handleDelete(f.id, f.name)}
                              className="text-red-500 hover:underline text-xs"
                            >
                              Supprimer
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
