"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Download, ChevronLeft, ChevronRight, Plus, Loader2 } from "lucide-react";
import { downloadXlsx } from "@/lib/export-xlsx";
import { useToast } from "@/components/ui/use-toast";
import { useEntity } from "@/contexts/EntityContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

interface Learner {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  client_id?: string;
  clients?: { company_name: string } | null;
  sessions_count?: number;
}

const PAGE_SIZE = 15;

export default function ApprenantsListePage() {
  const supabase = createClient();
  const { toast } = useToast();

  const [learners, setLearners] = useState<Learner[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [nameFilter, setNameFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [sessionsMin, setSessionsMin] = useState("");
  const [debouncedName, setDebouncedName] = useState("");
  const [debouncedCompany, setDebouncedCompany] = useState("");

  const { entityId } = useEntity();

  // Add learner dialog
  const [addDialog, setAddDialog] = useState(false);
  const [addForm, setAddForm] = useState({
    first_name: "", last_name: "", email: "", phone: "", client_id: "",
  });
  const [addSaving, setAddSaving] = useState(false);
  const [clients, setClients] = useState<Array<{ id: string; company_name: string }>>([]);

  useEffect(() => {
    if (!entityId) return;
    supabase
      .from("clients")
      .select("id, company_name")
      .eq("entity_id", entityId)
      .order("company_name")
      .then(({ data }) => setClients(data ?? []));
  }, [supabase, entityId]);

  // Debounce name filter (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedName(nameFilter);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [nameFilter]);

  // Debounce company filter (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCompany(companyFilter);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [companyFilter]);

  const fetchLearners = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("learners")
        .select("id, first_name, last_name, email, phone, client_id, clients(company_name)", { count: "exact" })
        .order("last_name", { ascending: true });

      if (debouncedName.trim()) {
        query = query.or(`first_name.ilike.%${debouncedName.trim()}%,last_name.ilike.%${debouncedName.trim()}%`);
      }

      const from = (page - 1) * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data, error, count } = await query;
      if (error) throw error;
      setLearners((data as unknown as Learner[]) ?? []);
      setTotal(count ?? 0);
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les apprenants.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [supabase, debouncedName, page, toast]);

  useEffect(() => { fetchLearners(); }, [fetchLearners]);

  const handleDownloadExcel = () => {
    const headers = ["Nom", "Entreprise", "Téléphone", "Email", "Sessions"];
    const rows = learners.map((l) => [
      `${l.last_name} ${l.first_name}`,
      l.clients?.company_name ?? "",
      l.phone ?? "",
      l.email,
      l.sessions_count ?? 0,
    ]);
    downloadXlsx(headers, rows, "apprenants.xlsx");
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Supprimer ${name} ?`)) return;
    const { error } = await supabase.from("learners").delete().eq("id", id);
    if (error) {
      toast({ title: "Erreur", description: "Impossible de supprimer.", variant: "destructive" });
    } else {
      toast({ title: "Supprimé", description: `${name} a été supprimé.` });
      fetchLearners();
    }
  };

  const handleAddLearner = async () => {
    if (!addForm.first_name.trim() || !addForm.last_name.trim()) {
      toast({ title: "Prénom et nom sont requis", variant: "destructive" });
      return;
    }
    setAddSaving(true);
    const { error } = await supabase.from("learners").insert({
      entity_id: entityId,
      first_name: addForm.first_name.trim(),
      last_name: addForm.last_name.trim(),
      email: addForm.email.trim() || null,
      phone: addForm.phone.trim() || null,
      client_id: addForm.client_id || null,
    });
    setAddSaving(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Apprenant ajouté" });
      setAddDialog(false);
      setAddForm({ first_name: "", last_name: "", email: "", phone: "", client_id: "" });
      fetchLearners();
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const filteredLearners = debouncedCompany.trim()
    ? learners.filter((l) =>
        l.clients?.company_name?.toLowerCase().includes(debouncedCompany.toLowerCase())
      )
    : learners;

  const displayLearners = sessionsMin.trim()
    ? filteredLearners.filter((l) => (l.sessions_count ?? 0) >= parseInt(sessionsMin))
    : filteredLearners;

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm mb-4">
        <Link href="/admin" className="text-[#3DB5C5] hover:underline">Accueil</Link>
        <span className="text-gray-400">/</span>
        <Link href="/admin/clients" className="text-[#3DB5C5] hover:underline">Clients</Link>
        <span className="text-gray-400">/</span>
        <Link href="/admin/clients/apprenants" className="text-[#3DB5C5] hover:underline">Apprenants</Link>
        <span className="text-gray-400">/</span>
        <span className="text-gray-500">Liste</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-gray-700 text-xl font-bold">Clients / Tous Les Apprenants</h1>
        <div className="flex gap-2">
          <button
            onClick={handleDownloadExcel}
            className="border border-[#3DB5C5] text-[#3DB5C5] px-4 py-2 rounded-lg text-sm flex items-center gap-1"
          >
            <Download className="h-4 w-4" />
            Télécharger en Excel
          </button>
          <Button
            onClick={() => setAddDialog(true)}
            style={{ background: "#3DB5C5" }}
            className="text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4 mr-2" /> Ajouter un apprenant
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nom de l&apos;apprenant</label>
            <input
              type="text"
              placeholder="Rechercher par nom..."
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5] w-52"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nom de l&apos;entreprise</label>
            <input
              type="text"
              placeholder="Rechercher par entreprise..."
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5] w-52"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Plus que... sessions</label>
            <input
              type="number"
              placeholder="Ex: 3"
              value={sessionsMin}
              onChange={(e) => setSessionsMin(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5] w-32"
            />
          </div>
        </div>
      </div>

      {/* Count */}
      <p className="text-sm text-gray-500 mb-3">{total} apprenant{total !== 1 ? "s" : ""}</p>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3DB5C5] border-t-transparent" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Nom</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Entreprise</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Tél</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Email</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Sessions</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayLearners.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                    Aucun apprenant trouvé
                  </td>
                </tr>
              ) : (
                displayLearners.map((learner) => {
                  const fullName = `${learner.first_name} ${learner.last_name}`;
                  return (
                    <tr key={learner.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800">{fullName}</td>
                      <td className="px-4 py-3 text-gray-600">{learner.clients?.company_name ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{learner.phone ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600 truncate max-w-[200px]">{learner.email}</td>
                      <td className="px-4 py-3 text-gray-600">{learner.sessions_count ?? 0}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Link
                            href={`/admin/clients/apprenants/${learner.id}`}
                            className="text-[#3DB5C5] hover:underline text-xs font-medium"
                          >
                            Modifier
                          </Link>
                          <Link
                            href={`/admin/crm/quotes/new?learner_name=${encodeURIComponent(fullName)}`}
                            className="text-gray-500 hover:underline text-xs"
                          >
                            Créer un devis
                          </Link>
                          <button
                            onClick={() => handleDelete(learner.id, fullName)}
                            className="text-red-500 hover:underline text-xs"
                          >
                            Supprimer
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            Page {page} sur {totalPages} — {total} résultats
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded border border-gray-300 text-sm text-gray-600 disabled:opacity-40 hover:border-[#3DB5C5]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className="px-3 py-1.5 rounded border text-sm font-medium"
                  style={p === page ? { background: "#3DB5C5", color: "white", borderColor: "#3DB5C5" } : { borderColor: "#d1d5db", color: "#4b5563" }}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded border border-gray-300 text-sm text-gray-600 disabled:opacity-40 hover:border-[#3DB5C5] flex items-center gap-1"
            >
              Suivant <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      {/* Dialog — Ajouter un apprenant */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajouter un apprenant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Prénom *</Label>
                <Input
                  value={addForm.first_name}
                  onChange={(e) => setAddForm((f) => ({ ...f, first_name: e.target.value }))}
                  placeholder="Jean"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Nom *</Label>
                <Input
                  value={addForm.last_name}
                  onChange={(e) => setAddForm((f) => ({ ...f, last_name: e.target.value }))}
                  placeholder="Dupont"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={addForm.email}
                onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="jean.dupont@exemple.fr"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Téléphone</Label>
              <Input
                value={addForm.phone}
                onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="06 00 00 00 00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Entreprise</Label>
              <select
                value={addForm.client_id}
                onChange={(e) => setAddForm((f) => ({ ...f, client_id: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5] bg-white"
              >
                <option value="">— Aucune entreprise —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.company_name}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>Annuler</Button>
            <Button onClick={handleAddLearner} disabled={addSaving}>
              {addSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
