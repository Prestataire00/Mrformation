"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { useDebounce } from "@/hooks/useDebounce";
import { Trainer, TrainerCompetency } from "@/lib/types";
import { cn, getInitials, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Plus, Sparkles, Briefcase, Loader2,
  Search,
  Pencil,
  Trash2,
  UserCircle,
  Tag,
  X,
} from "lucide-react";
import Link from "next/link";

type TrainerWithCompetencies = Trainer & { competencies: TrainerCompetency[] };

const LEVEL_LABELS: Record<string, string> = {
  beginner: "Débutant",
  intermediate: "Intermédiaire",
  expert: "Expert",
};

const LEVEL_COLORS: Record<string, string> = {
  beginner: "bg-green-100 text-green-700",
  intermediate: "bg-yellow-100 text-yellow-700",
  expert: "bg-red-100 text-red-700",
};

interface TrainerFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  type: "internal" | "external";
  bio: string;
  hourly_rate: string;
}

const emptyForm: TrainerFormData = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  type: "internal",
  bio: "",
  hourly_rate: "",
};

interface CompetencyInput {
  competency: string;
  level: "beginner" | "intermediate" | "expert";
}

export default function TrainersPage() {
  const supabase = createClient();
  const { toast } = useToast();
  const { entityId } = useEntity();

  const [trainers, setTrainers] = useState<TrainerWithCompetencies[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [typeFilter, setTypeFilter] = useState<"all" | "internal" | "external">("all");
  const [competencyFilter, setCompetencyFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTrainer, setEditingTrainer] = useState<TrainerWithCompetencies | null>(null);
  const [formData, setFormData] = useState<TrainerFormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Competency management
  const [competencyDialogOpen, setCompetencyDialogOpen] = useState(false);
  const [managingTrainer, setManagingTrainer] = useState<TrainerWithCompetencies | null>(null);
  const [newCompetency, setNewCompetency] = useState<CompetencyInput>({
    competency: "",
    level: "intermediate",
  });
  const [localCompetencies, setLocalCompetencies] = useState<TrainerCompetency[]>([]);

  // Delete
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [trainerToDelete, setTrainerToDelete] = useState<TrainerWithCompetencies | null>(null);
  const [deleting, setDeleting] = useState(false);

  // CVthèque IA search
  const [aiSearching, setAiSearching] = useState(false);
  const [aiMode, setAiMode] = useState(false);

  const fetchTrainers = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);

    // Try with competencies join first
    let { data, error } = await supabase
      .from("trainers")
      .select("*, competencies:trainer_competencies(*)")
      .eq("entity_id", entityId)
      .order("last_name", { ascending: true });

    // Fallback: if join fails (table missing or RLS), fetch trainers alone
    if (error) {
      console.warn("trainer_competencies join failed, fetching trainers only:", error.message);
      const fallback = await supabase
        .from("trainers")
        .select("*")
        .eq("entity_id", entityId)
        .order("last_name", { ascending: true });
      data = fallback.data;
      error = fallback.error;
      if (data) {
        data = data.map((t: Record<string, unknown>) => ({ ...t, competencies: [] }));
      }
    }

    if (error) {
      toast({ title: "Erreur", description: `Impossible de charger les formateurs: ${error.message}`, variant: "destructive" });
    } else {
      setTrainers((data as TrainerWithCompetencies[]) || []);
    }
    setLoading(false);
  }, [entityId]);

  useEffect(() => {
    fetchTrainers();
  }, [fetchTrainers]);

  const filtered = trainers.filter((t) => {
    const searchLower = debouncedSearch.toLowerCase();
    const matchSearch =
      debouncedSearch === "" ||
      `${t.first_name} ${t.last_name}`.toLowerCase().includes(searchLower) ||
      t.email?.toLowerCase().includes(searchLower) ||
      t.competencies.some((c) => c.competency.toLowerCase().includes(searchLower));
    const matchType = typeFilter === "all" || t.type === typeFilter;
    const matchCompetency =
      competencyFilter === "" ||
      t.competencies.some((c) => c.competency.toLowerCase().includes(competencyFilter.toLowerCase()));
    const matchLevel =
      levelFilter === "all" ||
      t.competencies.some((c) => c.level === levelFilter);
    return matchSearch && matchType && matchCompetency && matchLevel;
  });

  const allCompetencies = [...new Set(trainers.flatMap((t) => t.competencies.map((c) => c.competency)))].sort();

  const openAddDialog = () => {
    setEditingTrainer(null);
    setFormData(emptyForm);
    setDialogOpen(true);
  };

  const openEditDialog = (trainer: TrainerWithCompetencies) => {
    setEditingTrainer(trainer);
    setFormData({
      first_name: trainer.first_name,
      last_name: trainer.last_name,
      email: trainer.email || "",
      phone: trainer.phone || "",
      type: trainer.type,
      bio: trainer.bio || "",
      hourly_rate: trainer.hourly_rate?.toString() || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      toast({ title: "Champs requis", description: "Prénom et nom sont obligatoires.", variant: "destructive" });
      return;
    }
    setSaving(true);

    const payload = {
      first_name: formData.first_name.trim(),
      last_name: formData.last_name.trim(),
      email: formData.email.trim() || null,
      phone: formData.phone.trim() || null,
      type: formData.type,
      bio: formData.bio.trim() || null,
      hourly_rate: formData.hourly_rate ? parseFloat(formData.hourly_rate) : null,
    };

    if (editingTrainer) {
      const { error } = await supabase
        .from("trainers")
        .update(payload)
        .eq("id", editingTrainer.id);
      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      toast({ title: "Formateur mis à jour", description: `${payload.first_name} ${payload.last_name} a été modifié.` });
      setDialogOpen(false);
      await fetchTrainers();
    } else {
      const insertPayload = entityId ? { ...payload, entity_id: entityId } : payload;
      const { data: newTrainer, error } = await supabase
        .from("trainers")
        .insert(insertPayload)
        .select()
        .single();
      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      toast({ title: "Formateur ajouté", description: `${payload.first_name} ${payload.last_name} a été créé.` });
      setDialogOpen(false);
      await fetchTrainers();
      // Open competency manager for new trainer
      if (newTrainer) {
        const created = { ...newTrainer, competencies: [] } as TrainerWithCompetencies;
        setManagingTrainer(created);
        setLocalCompetencies([]);
        setNewCompetency({ competency: "", level: "intermediate" });
        setCompetencyDialogOpen(true);
      }
    }
    setSaving(false);
  };

  const openCompetencyDialog = (trainer: TrainerWithCompetencies) => {
    setManagingTrainer(trainer);
    setLocalCompetencies([...trainer.competencies]);
    setNewCompetency({ competency: "", level: "intermediate" });
    setCompetencyDialogOpen(true);
  };

  const handleAddCompetency = async () => {
    if (!newCompetency.competency.trim() || !managingTrainer) return;
    const { data, error } = await supabase
      .from("trainer_competencies")
      .insert({
        trainer_id: managingTrainer.id,
        competency: newCompetency.competency.trim(),
        level: newCompetency.level,
      })
      .select()
      .single();
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    setLocalCompetencies((prev) => [...prev, data as TrainerCompetency]);
    setNewCompetency({ competency: "", level: "intermediate" });
    await fetchTrainers();
  };

  const handleRemoveCompetency = async (compId: string) => {
    const { error } = await supabase.from("trainer_competencies").delete().eq("id", compId);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    setLocalCompetencies((prev) => prev.filter((c) => c.id !== compId));
    await fetchTrainers();
  };

  const openDeleteDialog = (trainer: TrainerWithCompetencies) => {
    setTrainerToDelete(trainer);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!trainerToDelete) return;
    setDeleting(true);
    const { error } = await supabase.from("trainers").delete().eq("id", trainerToDelete.id);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Formateur supprimé", description: `${trainerToDelete.first_name} ${trainerToDelete.last_name} a été supprimé.` });
      setDeleteDialogOpen(false);
      setTrainerToDelete(null);
      await fetchTrainers();
    }
    setDeleting(false);
  };

  // AI search handler
  const handleAISearch = async () => {
    if (search.trim().length < 3) { setAiMode(false); return; }
    setAiSearching(true);
    setAiMode(true);
    try {
      const res = await fetch("/api/ai/search-trainers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: search.trim() }),
      });
      if (!res.ok) throw new Error("Recherche échouée");
      const data = await res.json();
      setTrainers(data.trainers || []);
    } catch {
      toast({ title: "Erreur recherche IA", variant: "destructive" });
    } finally {
      setAiSearching(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 bg-gray-50 min-h-screen">
      {/* Hero CVthèque */}
      <div className="rounded-2xl bg-gradient-to-br from-[#374151] to-[#1f2937] text-white p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
              <Briefcase className="h-6 w-6" /> CVthèque formateurs
            </h1>
            <p className="text-sm text-white/70">
              {trainers.length} formateur{trainers.length > 1 ? "s" : ""}
            </p>
          </div>
          <Button onClick={openAddDialog} variant="secondary" className="bg-white text-gray-800 hover:bg-gray-100">
            <Plus className="h-4 w-4 mr-1.5" /> Nouveau formateur
          </Button>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
            <Input
              className="bg-white/10 border-white/20 text-white placeholder:text-white/50 pl-10 h-11"
              placeholder='Recherche IA : "expert data science anglais"'
              value={search}
              onChange={(e) => { setSearch(e.target.value); if (aiMode && !e.target.value) { setAiMode(false); fetchTrainers(); } }}
              onKeyDown={(e) => e.key === "Enter" && handleAISearch()}
            />
          </div>
          <Button onClick={handleAISearch} disabled={aiSearching || search.length < 3} className="bg-[#DC2626] hover:bg-[#b91c1c] text-white">
            {aiSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="h-4 w-4 mr-1.5" /> Recherche IA</>}
          </Button>
        </div>
        {aiMode && <p className="text-xs text-white/60 mt-2">✨ Résultats classés par pertinence IA</p>}
      </div>

      {/* Filtres compacts */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
          <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous types</SelectItem>
            <SelectItem value="internal">Interne</SelectItem>
            <SelectItem value="external">Externe</SelectItem>
          </SelectContent>
        </Select>
        <Select value={competencyFilter || "all"} onValueChange={(v) => setCompetencyFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Compétence" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes compétences</SelectItem>
            {allCompetencies.map((comp) => (
              <SelectItem key={comp} value={comp}>{comp}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground ml-auto">{filtered.length} résultat{filtered.length > 1 ? "s" : ""}</p>
      </div>

      {/* Grille cards formateurs */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="rounded-xl border bg-white p-4 animate-pulse">
              <div className="flex gap-3 mb-3"><div className="h-12 w-12 rounded-full bg-gray-200" /><div className="flex-1 space-y-2"><div className="h-4 bg-gray-200 rounded w-3/4" /><div className="h-3 bg-gray-200 rounded w-1/2" /></div></div>
              <div className="space-y-2"><div className="h-3 bg-gray-200 rounded" /><div className="h-3 bg-gray-200 rounded w-5/6" /></div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border bg-white p-12 text-center">
          <Briefcase className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-700">{aiMode ? "Aucun résultat" : "Aucun formateur"}</p>
          <p className="text-xs text-muted-foreground mt-1">{aiMode ? "Essayez une recherche différente" : "Ajoutez votre premier formateur"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((trainer) => (
            <Link key={trainer.id} href={`/admin/trainers/${trainer.id}`} className="block group">
              <div className="rounded-xl border bg-white p-4 hover:shadow-md hover:border-gray-300 transition-all h-full flex flex-col">
                <div className="flex items-start gap-3 mb-3">
                  <Avatar className="h-12 w-12 flex-shrink-0">
                    <AvatarFallback className={cn("text-sm font-semibold", ["bg-blue-100 text-blue-700","bg-purple-100 text-purple-700","bg-pink-100 text-pink-700","bg-amber-100 text-amber-700","bg-emerald-100 text-emerald-700"][(trainer.first_name + trainer.last_name).split("").reduce((a,c)=>a+c.charCodeAt(0),0) % 5])}>
                      {getInitials(trainer.first_name, trainer.last_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate group-hover:text-[#DC2626]">{trainer.first_name} {trainer.last_name}</p>
                    <p className="text-xs text-muted-foreground">{trainer.email || ""}</p>
                  </div>
                </div>
                {trainer.bio && <p className="text-xs text-gray-600 line-clamp-2 mb-3">{trainer.bio}</p>}
                {trainer.competencies.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {trainer.competencies.slice(0, 3).map((c, i) => (
                      <span key={i} className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{c.competency}</span>
                    ))}
                    {trainer.competencies.length > 3 && <span className="text-[10px] text-muted-foreground">+{trainer.competencies.length - 3}</span>}
                  </div>
                )}
                <div className="flex items-center gap-3 text-xs text-muted-foreground pt-3 mt-auto border-t">
                  <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" /> {(trainer as any).total_sessions || 0} sessions</span>
                </div>
                {(trainer as any).relevance && (
                  <div className="mt-2 bg-purple-50 border border-purple-100 rounded-md p-2">
                    <span className="text-[10px] font-semibold text-purple-700">✨ Pertinence : {(trainer as any).relevance}%</span>
                    {(trainer as any).why && <p className="text-[11px] text-purple-900 mt-0.5">{(trainer as any).why}</p>}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Add/Edit Trainer Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingTrainer ? "Modifier le formateur" : "Ajouter un formateur"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="first_name">Prénom <span className="text-red-500">*</span></Label>
                <Input
                  id="first_name"
                  value={formData.first_name}
                  onChange={(e) => setFormData((p) => ({ ...p, first_name: e.target.value }))}
                  placeholder="Jean"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="last_name">Nom <span className="text-red-500">*</span></Label>
                <Input
                  id="last_name"
                  value={formData.last_name}
                  onChange={(e) => setFormData((p) => ({ ...p, last_name: e.target.value }))}
                  placeholder="Dupont"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                placeholder="jean.dupont@example.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="phone">Téléphone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="06 00 00 00 00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="type">Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(v) => setFormData((p) => ({ ...p, type: v as "internal" | "external" }))}
                >
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Interne</SelectItem>
                    <SelectItem value="external">Externe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hourly_rate">Taux horaire (€)</Label>
              <Input
                id="hourly_rate"
                type="number"
                min="0"
                step="0.01"
                value={formData.hourly_rate}
                onChange={(e) => setFormData((p) => ({ ...p, hourly_rate: e.target.value }))}
                placeholder="75.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bio">Biographie</Label>
              <Textarea
                id="bio"
                value={formData.bio}
                onChange={(e) => setFormData((p) => ({ ...p, bio: e.target.value }))}
                placeholder="Présentation du formateur..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Enregistrement..." : editingTrainer ? "Mettre à jour" : "Créer le formateur"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Competency Management Dialog */}
      <Dialog open={competencyDialogOpen} onOpenChange={setCompetencyDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Compétences — {managingTrainer?.first_name} {managingTrainer?.last_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Existing competencies */}
            <div className="space-y-2">
              {localCompetencies.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Aucune compétence renseignée.</p>
              ) : (
                localCompetencies.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-2 rounded-md bg-gray-50 border">
                    <div className="flex items-center gap-2">
                      <Badge className={cn("text-xs", LEVEL_COLORS[c.level])}>
                        {LEVEL_LABELS[c.level]}
                      </Badge>
                      <span className="text-sm text-gray-800">{c.competency}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-gray-400 hover:text-red-600"
                      onClick={() => handleRemoveCompetency(c.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>

            {/* Add new */}
            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">Ajouter une compétence</p>
              <Input
                placeholder="Ex: JavaScript, Gestion de projet..."
                value={newCompetency.competency}
                onChange={(e) => setNewCompetency((p) => ({ ...p, competency: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && handleAddCompetency()}
              />
              <div className="flex gap-2">
                <Select
                  value={newCompetency.level}
                  onValueChange={(v) => setNewCompetency((p) => ({ ...p, level: v as CompetencyInput["level"] }))}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Débutant</SelectItem>
                    <SelectItem value="intermediate">Intermédiaire</SelectItem>
                    <SelectItem value="expert">Expert</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleAddCompetency} className="gap-2" disabled={!newCompetency.competency.trim()}>
                  <Plus className="h-4 w-4" />
                  Ajouter
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setCompetencyDialogOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Supprimer le formateur</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Êtes-vous sûr de vouloir supprimer{" "}
            <strong>{trainerToDelete?.first_name} {trainerToDelete?.last_name}</strong> ?
            Cette action est irréversible.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Suppression..." : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
