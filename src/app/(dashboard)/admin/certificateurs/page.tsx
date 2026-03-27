"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import {
  Plus, Search, Pencil, Trash2, Download, Loader2, CheckCircle, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { downloadXlsx } from "@/lib/export-xlsx";

interface Certificateur {
  id: string;
  entity_id: string;
  name: string;
  type: string;
  code: string | null;
  website: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  rncp: "RNCP",
  cqp: "CQP",
  rs: "RS",
  titre_pro: "Titre Pro",
  autre: "Autre",
};

const TYPE_COLORS: Record<string, string> = {
  rncp: "bg-blue-100 text-blue-700",
  cqp: "bg-purple-100 text-purple-700",
  rs: "bg-teal-100 text-teal-700",
  titre_pro: "bg-amber-100 text-amber-700",
  autre: "bg-gray-100 text-gray-700",
};

const EMPTY_FORM = {
  name: "",
  type: "autre",
  code: "",
  website: "",
  contact_email: "",
  contact_phone: "",
  notes: "",
  is_active: true,
};

export default function CertificateursPage() {
  const supabase = createClient();
  const { entityId } = useEntity();
  const { toast } = useToast();

  const [items, setItems] = useState<Certificateur[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [activeOnly, setActiveOnly] = useState(false);

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const query = supabase
        .from("certificateurs")
        .select("*")
        .eq("entity_id", entityId)
        .order("name", { ascending: true });

      const { data } = await query;
      setItems((data as Certificateur[]) ?? []);
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [supabase, entityId, toast]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Filtered
  const filtered = items.filter((c) => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeFilter !== "all" && c.type !== typeFilter) return false;
    if (activeOnly && !c.is_active) return false;
    return true;
  });

  const totalActive = items.filter((c) => c.is_active).length;

  const openAdd = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (c: Certificateur) => {
    setEditId(c.id);
    setForm({
      name: c.name,
      type: c.type,
      code: c.code || "",
      website: c.website || "",
      contact_email: c.contact_email || "",
      contact_phone: c.contact_phone || "",
      notes: c.notes || "",
      is_active: c.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Le nom est requis", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      type: form.type,
      code: form.code || null,
      website: form.website || null,
      contact_email: form.contact_email || null,
      contact_phone: form.contact_phone || null,
      notes: form.notes || null,
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    };

    if (editId) {
      const { error } = await supabase
        .from("certificateurs")
        .update(payload)
        .eq("id", editId);
      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Certificateur modifié" });
      }
    } else {
      const { error } = await supabase
        .from("certificateurs")
        .insert({ ...payload, entity_id: entityId });
      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Certificateur ajouté" });
      }
    }

    setSaving(false);
    setDialogOpen(false);
    fetchItems();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("certificateurs").delete().eq("id", deleteId);
    if (error) {
      toast({ title: "Erreur", variant: "destructive" });
    } else {
      toast({ title: "Certificateur supprimé" });
    }
    setDeleteId(null);
    fetchItems();
  };

  const handleExport = () => {
    const headers = ["Nom", "Type", "Code", "Site web", "Email", "Téléphone", "Actif", "Date création"];
    const rows = filtered.map((c) => [
      c.name,
      TYPE_LABELS[c.type] || c.type,
      c.code || "",
      c.website || "",
      c.contact_email || "",
      c.contact_phone || "",
      c.is_active ? "Oui" : "Non",
      new Date(c.created_at).toLocaleDateString("fr-FR"),
    ]);
    downloadXlsx(headers, rows, "certificateurs.xlsx");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Formateurs & Certificateurs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organismes certificateurs liés à vos formations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
            style={{ background: "#3DB5C5" }}
          >
            <Download className="h-4 w-4" /> Excel
          </button>
          <Button onClick={openAdd} style={{ background: "#3DB5C5" }} className="text-white hover:opacity-90">
            <Plus className="h-4 w-4 mr-2" /> Ajouter
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 space-y-1 text-sm text-gray-700">
        <p>Total certificateurs : <strong>{items.length}</strong></p>
        <p>Actifs : <strong className="text-green-600">{totalActive}</strong></p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#3DB5C5]"
          >
            <option value="all">Tous types</option>
            <option value="rncp">RNCP</option>
            <option value="cqp">CQP</option>
            <option value="rs">RS</option>
            <option value="titre_pro">Titre Pro</option>
            <option value="autre">Autre</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 pb-1">
          <Switch checked={activeOnly} onCheckedChange={setActiveOnly} />
          Actifs uniquement
        </label>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Nom</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Type</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Code</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Email</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Téléphone</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">Actif</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-gray-400">
                  Aucun certificateur trouvé
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                  <td className="px-4 py-3">
                    <Badge className={`${TYPE_COLORS[c.type] ?? TYPE_COLORS.autre} hover:${TYPE_COLORS[c.type] ?? TYPE_COLORS.autre} text-xs`}>
                      {TYPE_LABELS[c.type] || c.type}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{c.code || "—"}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{c.contact_email || "—"}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{c.contact_phone || "—"}</td>
                  <td className="px-4 py-3 text-center">
                    {c.is_active ? (
                      <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                    ) : (
                      <XCircle className="h-4 w-4 text-gray-300 mx-auto" />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(c)}
                        className="text-gray-500 hover:text-gray-700 p-1"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteId(c.id)}
                        className="text-red-400 hover:text-red-600 p-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Dialog — Ajouter/Modifier */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Modifier le certificateur" : "Ajouter un certificateur"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nom *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nom de l'organisme"
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rncp">RNCP</SelectItem>
                  <SelectItem value="cqp">CQP</SelectItem>
                  <SelectItem value="rs">RS</SelectItem>
                  <SelectItem value="titre_pro">Titre Pro</SelectItem>
                  <SelectItem value="autre">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Code certification</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="Ex: RNCP12345"
              />
            </div>
            <div>
              <Label>Site web</Label>
              <Input
                value={form.website}
                onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                placeholder="https://..."
              />
            </div>
            <div>
              <Label>Email contact</Label>
              <Input
                type="email"
                value={form.contact_email}
                onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
                placeholder="contact@certificateur.fr"
              />
            </div>
            <div>
              <Label>Téléphone</Label>
              <Input
                value={form.contact_phone}
                onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
                placeholder="01 23 45 67 89"
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="Notes optionnelles..."
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
              Actif
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editId ? "Modifier" : "Ajouter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog — Supprimer */}
      <Dialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Supprimer ce certificateur ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Les formations liées perdront la référence à ce certificateur.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDelete}>Supprimer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
