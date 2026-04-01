"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import {
  Search,
  Plus,
  Settings2,
  ChevronUp,
  ChevronDown,
  GripVertical,
  LayoutGrid,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatDate } from "@/lib/utils";
import type { CrmProspect, CrmTag, ProspectStatus } from "@/lib/types";
import { CompanySearch, type CompanySearchResult } from "@/components/crm/CompanySearch";
import { createFirstContactTask, createProposalPrepTask } from "@/lib/crm/automations";
import { TagBadges } from "@/components/crm/TagManager";
import { Badge } from "@/components/ui/badge";

// ─── Types ───────────────────────────────────────────────────────────────────

interface KanbanColumn {
  id: string;          // clé status côté DB
  label: string;       // label affiché
  color: string;       // couleur de l'en-tête
}

interface ProspectForm {
  company_name: string;
  siret: string;
  naf_code: string;
  contact_name: string;
  email: string;
  phone: string;
  source: string;
  status: ProspectStatus;
  notes: string;
  amount: string;
}

// ─── Colonnes par défaut ──────────────────────────────────────────────────────

const DEFAULT_COLUMNS: KanbanColumn[] = [
  { id: "new",       label: "Lead",        color: "#3DB5C5" },
  { id: "contacted", label: "Contacté",    color: "#f97316" },
  { id: "qualified", label: "Qualifié",    color: "#8b5cf6" },
  { id: "proposal",  label: "Proposition", color: "#2563EB" },
  { id: "won",       label: "Gagné",       color: "#22c55e" },
  { id: "lost",      label: "Refus",       color: "#ef4444" },
  { id: "dormant",   label: "Dormant",     color: "#9ca3af" },
];

const SOURCE_OPTIONS = [
  "Bouche à oreille",
  "Réseaux sociaux",
  "Site web",
  "Email",
  "Téléphone",
  "Événement",
  "Partenaire",
  "Autre",
];

const EMPTY_FORM: ProspectForm = {
  company_name: "",
  siret: "",
  naf_code: "",
  contact_name: "",
  email: "",
  phone: "",
  source: "",
  status: "new",
  notes: "",
  amount: "",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitialsFromName(company: string, contact: string | null): string {
  const name = contact ?? company;
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function getColumnLabel(columns: KanbanColumn[], status: string): string {
  return columns.find((c) => c.id === status)?.label ?? status;
}

function extractAmount(_notes: string | null): number {
  return 0;
}

function formatEUR(amount: number): string {
  return amount.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " EUR";
}

function getQuoteAmount(quotes: Array<{amount: number; status: string}> | null): number {
  if (!quotes || quotes.length === 0) return 0;
  return quotes
    .filter(q => q.status !== "rejected" && q.status !== "expired")
    .reduce((sum, q) => sum + Number(q.amount), 0);
}

function getProspectAmount(p: any): number {
  const fromQuotes = getQuoteAmount(p.quotes);
  if (fromQuotes > 0) return fromQuotes;
  return Number(p.amount) || 0;
}

function extractField(notes: string | null, field: string): string | null {
  if (!notes) return null;
  const regex = new RegExp(`${field}\\s*:\\s*([^|]+)`);
  const match = notes.match(regex);
  if (!match) return null;
  const val = match[1].trim();
  return val && val !== "—" ? val : null;
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function CrmProspectsPage() {
  const supabase = createClient();
  const router = useRouter();
  const { entityId } = useEntity();

  const [prospects,        setProspects]         = useState<CrmProspect[]>([]);
  const [loading,          setLoading]           = useState(true);

  // Filtres — par défaut sur l'année en cours
  const currentYear = new Date().getFullYear();
  const [search,           setSearch]            = useState("");
  const [dateFrom,         setDateFrom]          = useState(`${currentYear}-01-01`);
  const [dateTo,           setDateTo]            = useState(`${currentYear}-12-31`);

  // Colonnes kanban (modifiables via config) — persistées dans localStorage
  const [columns,          setColumns]           = useState<KanbanColumn[]>(DEFAULT_COLUMNS);
  const [columnsLoaded,    setColumnsLoaded]     = useState(false);

  // Dialogues
  const [addOpen,          setAddOpen]           = useState(false);
  const [editOpen,         setEditOpen]          = useState(false);
  const [configOpen,       setConfigOpen]        = useState(false);
  const [deleteConfirmId,  setDeleteConfirmId]   = useState<string | null>(null);

  // Formulaires
  const [form,             setForm]              = useState<ProspectForm>(EMPTY_FORM);
  const [editingProspect,  setEditingProspect]   = useState<CrmProspect | null>(null);
  const [defaultStatus,    setDefaultStatus]     = useState<ProspectStatus>("new");
  const [saving,           setSaving]            = useState(false);

  // Tags
  const [allTags,          setAllTags]           = useState<CrmTag[]>([]);
  const [prospectTags,     setProspectTags]      = useState<Record<string, string[]>>({}); // prospect_id -> tag_id[]
  const [tagFilter,        setTagFilter]         = useState<string>(""); // tag_id to filter by

  // Config tunnel — édition temporaire
  const [tempColumns,      setTempColumns]       = useState<KanbanColumn[]>(DEFAULT_COLUMNS);

  // Drag & drop colonnes
  const [draggedColIdx,    setDraggedColIdx]     = useState<number | null>(null);
  const [dragOverColIdx,   setDragOverColIdx]    = useState<number | null>(null);

  // Drag & drop cartes (leads)
  const [draggedCardId,    setDraggedCardId]     = useState<string | null>(null);
  const [dragOverCardCol,  setDragOverCardCol]   = useState<string | null>(null);

  // ── Charger colonnes depuis localStorage quand entityId est prêt ─────────
  useEffect(() => {
    if (entityId === undefined) return;
    try {
      const stored = localStorage.getItem(`crm-columns-${entityId}`);
      if (stored) {
        const parsed = JSON.parse(stored) as KanbanColumn[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setColumns(parsed);
        }
      }
    } catch { /* ignore */ }
    setColumnsLoaded(true);
  }, [entityId]);

  // Helper pour persister les colonnes
  function persistColumns(cols: KanbanColumn[]) {
    setColumns(cols);
    if (entityId) {
      try { localStorage.setItem(`crm-columns-${entityId}`, JSON.stringify(cols)); } catch { /* ignore */ }
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (entityId === undefined) return;
    fetchProspects();
    fetchAllTags();
    fetchProspectTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  // ── Tags ─────────────────────────────────────────────────────────────────
  const fetchAllTags = useCallback(async () => {
    if (!entityId) return;
    const { data } = await supabase
      .from("crm_tags")
      .select("*")
      .eq("entity_id", entityId)
      .order("name");
    setAllTags((data as CrmTag[]) ?? []);
  }, [entityId, supabase]);

  const fetchProspectTags = useCallback(async () => {
    const { data } = await supabase.from("crm_prospect_tags").select("prospect_id, tag_id");
    if (data) {
      const map: Record<string, string[]> = {};
      for (const row of data) {
        if (!map[row.prospect_id]) map[row.prospect_id] = [];
        map[row.prospect_id].push(row.tag_id);
      }
      setProspectTags(map);
    }
  }, [supabase]);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchProspects = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("crm_prospects")
      .select("*, quotes:crm_quotes(amount, status)")
      .order("created_at", { ascending: false });
    if (entityId) q = q.eq("entity_id", entityId);

    const { data } = await q;
    setProspects((data as CrmProspect[]) ?? []);
    setLoading(false);
  }, [entityId, supabase]);

  // ── Filtrage local ────────────────────────────────────────────────────────
  const filtered = prospects.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      p.company_name.toLowerCase().includes(q) ||
      (p.contact_name ?? "").toLowerCase().includes(q) ||
      (p.email ?? "").toLowerCase().includes(q);

    const createdDate = p.created_at.slice(0, 10);
    const matchFrom = !dateFrom || createdDate >= dateFrom;
    const matchTo   = !dateTo   || createdDate <= dateTo;

    const matchTag = !tagFilter || (prospectTags[p.id] ?? []).includes(tagFilter);

    return matchSearch && matchFrom && matchTo && matchTag;
  });

  // ── Groupement par colonne ────────────────────────────────────────────────
  function getProspectsForColumn(colId: string): CrmProspect[] {
    return filtered.filter((p) => p.status === colId);
  }

  // ── Ajout ─────────────────────────────────────────────────────────────────
  function openAdd(status: ProspectStatus = "new") {
    setForm({ ...EMPTY_FORM, status });
    setDefaultStatus(status);
    setAddOpen(true);
  }

  async function handleAdd() {
    if (!form.company_name.trim()) return;
    setSaving(true);
    const payload = {
      company_name: form.company_name.trim(),
      siret:        form.siret.trim()        || null,
      naf_code:     form.naf_code.trim()     || null,
      contact_name: form.contact_name.trim() || null,
      email:        form.email.trim()        || null,
      phone:        form.phone.trim()        || null,
      source:       form.source              || null,
      status:       form.status,
      notes:        form.notes.trim()        || null,
      amount:       form.amount ? parseFloat(form.amount) : null,
      entity_id:    entityId ?? undefined,
    };
    const { data: inserted, error } = await supabase.from("crm_prospects").insert([payload]).select("id").single();
    if (error) {
      console.error("handleAdd error:", error);
    } else {
      // Auto-create "Premier contact" task + calculate score
      if (inserted && entityId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await createFirstContactTask(
            supabase, inserted.id, form.company_name.trim(), entityId, null, user.id
          );
        }
      }
      setAddOpen(false);
      setForm(EMPTY_FORM);
      fetchProspects();
    }
    setSaving(false);
  }

  // ── Edition ───────────────────────────────────────────────────────────────
  function openEdit(p: CrmProspect) {
    setEditingProspect(p);
    setForm({
      company_name: p.company_name,
      siret:        p.siret        ?? "",
      naf_code:     p.naf_code     ?? "",
      contact_name: p.contact_name ?? "",
      email:        p.email        ?? "",
      phone:        p.phone        ?? "",
      source:       p.source       ?? "",
      status:       p.status,
      notes:        p.notes        ?? "",
      amount:       p.amount ? String(p.amount) : "",
    });
    setEditOpen(true);
  }

  async function handleEdit() {
    if (!editingProspect || !form.company_name.trim()) return;
    setSaving(true);
    const payload = {
      company_name: form.company_name.trim(),
      siret:        form.siret.trim()        || null,
      naf_code:     form.naf_code.trim()     || null,
      contact_name: form.contact_name.trim() || null,
      email:        form.email.trim()        || null,
      phone:        form.phone.trim()        || null,
      source:       form.source              || null,
      status:       form.status,
      notes:        form.notes.trim()        || null,
      amount:       form.amount ? parseFloat(form.amount) : null,
      updated_at:   new Date().toISOString(),
    };
    const { error } = await supabase
      .from("crm_prospects")
      .update(payload)
      .eq("id", editingProspect.id);
    if (error) {
      console.error("handleEdit error:", error);
    } else {
      setEditOpen(false);
      setEditingProspect(null);
      fetchProspects();
    }
    setSaving(false);
  }

  // ── Suppression ───────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    const { error } = await supabase.from("crm_prospects").delete().eq("id", id);
    if (error) {
      console.error("handleDelete error:", error);
    }
    setDeleteConfirmId(null);
    fetchProspects();
  }

  // ── Config tunnel ─────────────────────────────────────────────────────────
  function openConfig() {
    setTempColumns([...columns]);
    setConfigOpen(true);
  }
  function saveConfig() {
    persistColumns([...tempColumns]);
    setConfigOpen(false);
  }

  // ── Drag & drop colonnes ──────────────────────────────────────────────────
  function handleColDragStart(idx: number) {
    setDraggedColIdx(idx);
  }
  function handleColDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (draggedColIdx === null || draggedColIdx === idx) return;
    setDragOverColIdx(idx);
  }
  function handleColDrop(idx: number) {
    if (draggedColIdx === null || draggedColIdx === idx) {
      setDraggedColIdx(null);
      setDragOverColIdx(null);
      return;
    }
    const updated = [...columns];
    const [moved] = updated.splice(draggedColIdx, 1);
    updated.splice(idx, 0, moved);
    persistColumns(updated);
    setDraggedColIdx(null);
    setDragOverColIdx(null);
  }
  function handleColDragEnd() {
    setDraggedColIdx(null);
    setDragOverColIdx(null);
  }

  // ── Drag & drop cartes ────────────────────────────────────────────────────
  function handleCardDragStart(e: React.DragEvent, cardId: string) {
    e.stopPropagation(); // empêche le drag colonne
    setDraggedCardId(cardId);
  }
  function handleCardDragOverCol(e: React.DragEvent, colId: string) {
    e.preventDefault();
    if (draggedCardId) setDragOverCardCol(colId);
  }
  async function handleCardDropOnCol(e: React.DragEvent, colId: string) {
    e.stopPropagation();
    const cardId = draggedCardId;
    setDraggedCardId(null);
    setDragOverCardCol(null);
    if (!cardId) return;
    const card = prospects.find((p) => p.id === cardId);
    if (!card || card.status === colId) return;
    // Optimistic update
    setProspects((prev) =>
      prev.map((p) => p.id === cardId ? { ...p, status: colId as ProspectStatus } : p)
    );
    await supabase
      .from("crm_prospects")
      .update({ status: colId, updated_at: new Date().toISOString() })
      .eq("id", cardId);

    // Auto-create "Préparer proposition" task when prospect moves to "qualified"
    if (colId === "qualified" && card && entityId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await createProposalPrepTask(
          supabase, cardId, card.company_name, entityId, card.assigned_to, user.id
        );
      }
    }

  }
  function handleCardDragEnd() {
    setDraggedCardId(null);
    setDragOverCardCol(null);
  }

  // ─── Autofill depuis Pappers ──────────────────────────────────────────────
  function handleCompanySelect(company: CompanySearchResult) {
    setForm((f) => ({
      ...f,
      company_name: company.company_name,
      siret: company.siret,
    }));
  }

  // (ProspectFormFields est défini en dehors du composant principal)

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-gray-50">

      {/* ── En-tête ─────────────────────────────────────────────────── */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">

        {/* Fil d'Ariane */}
        <p className="mb-3 text-xs text-gray-400">
          <span className="font-medium text-gray-600">CRM</span>
          <span className="mx-1">/</span>
          Prospects
        </p>

        {/* Barre actions */}
        <div className="flex flex-wrap items-center gap-3">

          <Button size="sm" onClick={() => openAdd("new")} style={{ background: "#3DB5C5" }} className="text-white gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" /> Ajouter un prospect
          </Button>
          <Button size="sm" variant="outline" onClick={openConfig} className="gap-1.5 text-xs">
            <Settings2 className="h-3.5 w-3.5" /> Config
          </Button>
          <Button size="sm" variant="ghost" asChild className="text-xs gap-1.5">
            <Link href="/admin/crm/prospects/portfolio"><LayoutGrid className="h-3.5 w-3.5" /></Link>
          </Button>

          <div className="flex-1" />

          {/* Filtres date */}
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="font-medium">Du</span>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-8 w-36 text-xs"
            />
            <span className="font-medium">Au</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-8 w-36 text-xs"
            />
          </div>

          {/* Filtre par tag */}
          {allTags.length > 0 && (
            <Select value={tagFilter || "all"} onValueChange={(v) => setTagFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue placeholder="Filtrer par tag…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les tags</SelectItem>
                {allTags.map((tag) => (
                  <SelectItem key={tag.id} value={tag.id}>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full inline-block" style={{ backgroundColor: tag.color }} />
                      {tag.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Recherche */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Rechercher…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-48 pl-8 text-xs"
            />
          </div>
        </div>
      </div>

      {/* ── Kanban ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3DB5C5] border-t-transparent" />
        </div>
      ) : (
        <div className="flex flex-1 gap-4 overflow-x-auto p-6">
          {columns.map((col, colIdx) => {
            const cards = getProspectsForColumn(col.id);
            const isDragging = draggedColIdx === colIdx;
            const isDragOver = dragOverColIdx === colIdx;
            const isCardDragTarget = dragOverCardCol === col.id && draggedCardId !== null;
            return (
              <div
                key={col.id}
                onDragOver={(e) => handleCardDragOverCol(e, col.id)}
                onDrop={(e) => handleCardDropOnCol(e, col.id)}
                className={cn(
                  "flex w-72 flex-shrink-0 flex-col rounded-lg bg-white border shadow-sm transition-all duration-150",
                  isDragging && "opacity-40 scale-95",
                  isDragOver && !isDragging ? "border-[#3DB5C5] border-2 shadow-lg" : "border-gray-200",
                  isCardDragTarget && "border-[#3DB5C5] border-2 bg-[#3DB5C5]/5"
                )}
                style={{ minWidth: "288px" }}
              >
                {/* En-tête colonne — draggable pour réordonner */}
                <div
                  draggable
                  onDragStart={() => handleColDragStart(colIdx)}
                  onDragOver={(e) => handleColDragOver(e, colIdx)}
                  onDrop={() => handleColDrop(colIdx)}
                  onDragEnd={handleColDragEnd}
                  className="flex items-center justify-between px-3 py-2.5 bg-gray-50/80 rounded-t-lg border-b border-gray-100 cursor-grab active:cursor-grabbing select-none"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: col.color }} />
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">
                      {col.label}
                    </span>
                    <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5 font-medium">
                      {cards.length}
                    </span>
                  </div>
                  {cards.reduce((sum, p) => sum + getProspectAmount(p), 0) > 0 && (
                    <span className="text-[10px] font-medium text-gray-400">
                      {formatEUR(cards.reduce((sum, p) => sum + getProspectAmount(p), 0))}
                    </span>
                  )}
                </div>

                {/* Cartes */}
                <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
                  {cards.length === 0 && (
                    <p className="py-6 text-center text-xs text-gray-300">
                      Aucun prospect
                    </p>
                  )}

                  {cards.map((p) => {
                    const amount = getProspectAmount(p);
                    const product = extractField(p.notes, "Produit");
                    const isBeingDragged = draggedCardId === p.id;
                    return (
                      <div
                        key={p.id}
                        draggable
                        onDragStart={(e) => handleCardDragStart(e, p.id)}
                        onDragEnd={handleCardDragEnd}
                        onClick={() => !draggedCardId && router.push(`/admin/crm/prospects/${p.id}`)}
                        className={cn(
                          "group rounded-lg border border-gray-100 bg-white p-3 shadow-sm hover:border-[#3DB5C5] hover:shadow-md transition-all cursor-grab active:cursor-grabbing",
                          isBeingDragged && "opacity-40 scale-95"
                        )}
                      >
                        <p className="text-sm font-semibold text-gray-900 leading-snug">{p.company_name}</p>
                        {p.contact_name && (
                          <p className="text-xs text-gray-500 mt-0.5">{p.contact_name}</p>
                        )}

                        {/* Tags */}
                        {(prospectTags[p.id] ?? []).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            <TagBadges tags={allTags.filter((t) => (prospectTags[p.id] ?? []).includes(t.id))} />
                          </div>
                        )}

                        {/* Footer */}
                        {(p.source || amount > 0) && (
                          <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-gray-50">
                            {p.source ? (
                              <span className="text-[10px] text-gray-400">{p.source}</span>
                            ) : <span />}
                            {amount > 0 && (
                              <span className="text-xs font-semibold text-green-600">{formatEUR(amount)}</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Bouton + en bas */}
                <div className="border-t border-gray-100 p-2">
                  <button
                    onClick={() => openAdd(col.id as ProspectStatus)}
                    className="flex w-full items-center justify-center gap-1 rounded py-1.5 text-xs font-medium text-gray-400 hover:bg-gray-50 hover:text-[#3DB5C5] transition"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Ajouter un prospect
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* Dialogue AJOUTER                                                    */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle style={{ color: "#3DB5C5" }}>Ajouter un prospect</DialogTitle>
          </DialogHeader>
          <ProspectFormFields form={form} setForm={setForm} columns={columns} onCompanySelect={handleCompanySelect} />
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm">Annuler</Button>
            </DialogClose>
            <button
              onClick={handleAdd}
              disabled={saving || !form.company_name.trim()}
              className="rounded px-4 py-2 text-sm font-bold uppercase tracking-wide text-white transition disabled:opacity-50"
              style={{ backgroundColor: "#3DB5C5" }}
            >
              {saving ? "Enregistrement…" : "AJOUTER"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───────────────────────────────────────────��──────────────────────── */}
      {/* Dialogue MODIFIER                                                   */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle style={{ color: "#3DB5C5" }}>
              Modifier — {editingProspect?.company_name}
            </DialogTitle>
          </DialogHeader>
          <ProspectFormFields form={form} setForm={setForm} columns={columns} onCompanySelect={handleCompanySelect} />
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm">Annuler</Button>
            </DialogClose>
            <button
              onClick={handleEdit}
              disabled={saving || !form.company_name.trim()}
              className="rounded px-4 py-2 text-sm font-bold uppercase tracking-wide text-white transition disabled:opacity-50"
              style={{ backgroundColor: "#3DB5C5" }}
            >
              {saving ? "Enregistrement…" : "ENREGISTRER"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* Dialogue SUPPRIMER                                                  */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600">Confirmer la suppression</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Cette action est irréversible. Le prospect sera définitivement supprimé.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(null)}>
              Annuler
            </Button>
            <button
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              className="rounded px-4 py-2 text-sm font-bold uppercase tracking-wide text-white transition"
              style={{ backgroundColor: "#ef4444" }}
            >
              SUPPRIMER
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* Dialogue CONFIGURATION DU TUNNEL                                   */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle style={{ color: "#3DB5C5" }}>Configuration du tunnel</DialogTitle>
          </DialogHeader>

          <p className="text-xs text-gray-400 mb-3">
            Renommez, réordonnez, ajoutez ou supprimez les colonnes du kanban.
          </p>

          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {tempColumns.map((col, idx) => (
              <div key={col.id} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="flex flex-col gap-0.5">
                  <button
                    disabled={idx === 0}
                    onClick={() => {
                      const updated = [...tempColumns];
                      [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
                      setTempColumns(updated);
                    }}
                    className="rounded p-0.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition disabled:opacity-20 disabled:cursor-not-allowed"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    disabled={idx === tempColumns.length - 1}
                    onClick={() => {
                      const updated = [...tempColumns];
                      [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
                      setTempColumns(updated);
                    }}
                    className="rounded p-0.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition disabled:opacity-20 disabled:cursor-not-allowed"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <input
                  type="color"
                  value={col.color}
                  onChange={(e) => {
                    const updated = [...tempColumns];
                    updated[idx] = { ...col, color: e.target.value };
                    setTempColumns(updated);
                  }}
                  className="h-7 w-7 flex-shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                  title="Changer la couleur"
                />
                <div className="flex-1">
                  <Input
                    value={col.label}
                    onChange={(e) => {
                      const updated = [...tempColumns];
                      updated[idx] = { ...col, label: e.target.value };
                      setTempColumns(updated);
                    }}
                    placeholder={`Colonne ${idx + 1}`}
                    className="h-8 text-sm"
                  />
                </div>
                <span className="text-xs text-gray-300 italic whitespace-nowrap">({col.id})</span>
                <button
                  onClick={() => {
                    setTempColumns((prev) => prev.filter((_, i) => i !== idx));
                  }}
                  className="rounded p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 transition"
                  title="Supprimer cette colonne"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Ajouter une colonne */}
          <button
            onClick={() => {
              const id = `custom-${Date.now()}`;
              setTempColumns((prev) => [
                ...prev,
                { id, label: "Nouvelle colonne", color: "#6b7280" },
              ]);
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-gray-300 py-2.5 text-sm font-medium text-gray-400 hover:border-[#3DB5C5] hover:text-[#3DB5C5] transition"
          >
            <Plus className="h-4 w-4" />
            Ajouter une colonne
          </button>

          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => setConfigOpen(false)}>
              Annuler
            </Button>
            <button
              onClick={saveConfig}
              className="rounded px-4 py-2 text-sm font-bold uppercase tracking-wide text-white transition"
              style={{ backgroundColor: "#3DB5C5" }}
            >
              ENREGISTRER
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

// ─── Composant formulaire (défini hors du composant principal pour éviter la perte de focus) ───

interface ProspectFormFieldsProps {
  form: ProspectForm;
  setForm: React.Dispatch<React.SetStateAction<ProspectForm>>;
  columns: KanbanColumn[];
  onCompanySelect: (company: CompanySearchResult) => void;
}

function ProspectFormFields({ form, setForm, columns, onCompanySelect }: ProspectFormFieldsProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">
          Recherche entreprise (Pappers)
        </label>
        <CompanySearch
          onSelect={onCompanySelect}
          placeholder="Tapez le nom ou SIRET pour auto-remplir…"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Entreprise <span className="text-red-500">*</span>
          </label>
          <Input
            placeholder="Nom de l'entreprise"
            value={form.company_name}
            onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">SIRET</label>
          <Input
            placeholder="14 chiffres"
            value={form.siret}
            onChange={(e) => setForm((f) => ({ ...f, siret: e.target.value }))}
            maxLength={14}
            className="font-mono text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Code NAF</label>
        <Input
          placeholder="Ex : 8559A"
          value={form.naf_code}
          onChange={(e) => setForm((f) => ({ ...f, naf_code: e.target.value }))}
          className="max-w-[200px]"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Contact</label>
        <Input
          placeholder="Prénom Nom du contact"
          value={form.contact_name}
          onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Email</label>
          <Input
            type="email"
            placeholder="email@exemple.com"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Téléphone</label>
          <Input
            placeholder="06 00 00 00 00"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Source</label>
          <Select
            value={form.source}
            onValueChange={(v) => setForm((f) => ({ ...f, source: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner…" />
            </SelectTrigger>
            <SelectContent>
              {SOURCE_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Statut</label>
          <Select
            value={form.status}
            onValueChange={(v) => setForm((f) => ({ ...f, status: v as ProspectStatus }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Colonne…" />
            </SelectTrigger>
            <SelectContent>
              {columns.map((col) => (
                <SelectItem key={col.id} value={col.id}>{col.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Montant HT (EUR)</label>
        <Input
          type="number"
          placeholder="0.00"
          step="0.01"
          min="0"
          value={form.amount}
          onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Notes</label>
        <Textarea
          placeholder="Notes internes…"
          rows={3}
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />
      </div>
    </div>
  );
}
