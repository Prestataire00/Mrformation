"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { Training } from "@/lib/types";
import { cn, formatCurrency, formatDate, truncate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  BookOpen,
  Clock,
  Euro,
  Users,
  Award,
  ChevronRight,
  Filter,
  GraduationCap,
  Library,
  FileText,
  ArrowRight,
  Settings,
  Palette,
  GripVertical,
} from "lucide-react";
import Link from "next/link";

type TrainingWithCount = Training & { sessions_count: number };

interface TrainingCategory {
  id: string;
  name: string;
  color: string;
  order_index: number;
}

// Palette de couleurs prédéfinies pour les catégories
const COLOR_PALETTE = [
  { label: "Bleu", value: "bg-blue-100 text-blue-700" },
  { label: "Violet", value: "bg-purple-100 text-purple-700" },
  { label: "Rose", value: "bg-pink-100 text-pink-700" },
  { label: "Orange", value: "bg-orange-100 text-orange-700" },
  { label: "Vert", value: "bg-green-100 text-green-700" },
  { label: "Jaune", value: "bg-yellow-100 text-yellow-700" },
  { label: "Rouge", value: "bg-red-100 text-red-700" },
  { label: "Sarcelle", value: "bg-teal-100 text-teal-700" },
  { label: "Indigo", value: "bg-indigo-100 text-indigo-700" },
  { label: "Gris", value: "bg-gray-100 text-gray-700" },
  { label: "Cyan", value: "bg-cyan-100 text-cyan-700" },
  { label: "Lime", value: "bg-lime-100 text-lime-700" },
];

// Catégories par défaut (seed) si la table est vide
const DEFAULT_CATEGORIES: Omit<TrainingCategory, "id">[] = [
  { name: "Informatique", color: "bg-blue-100 text-blue-700", order_index: 0 },
  { name: "Management", color: "bg-purple-100 text-purple-700", order_index: 1 },
  { name: "Communication", color: "bg-pink-100 text-pink-700", order_index: 2 },
  { name: "RH", color: "bg-orange-100 text-orange-700", order_index: 3 },
  { name: "Finance", color: "bg-green-100 text-green-700", order_index: 4 },
  { name: "Vente", color: "bg-yellow-100 text-yellow-700", order_index: 5 },
  { name: "Sécurité", color: "bg-red-100 text-red-700", order_index: 6 },
  { name: "Qualité", color: "bg-teal-100 text-teal-700", order_index: 7 },
  { name: "Langues", color: "bg-indigo-100 text-indigo-700", order_index: 8 },
  { name: "Autre", color: "bg-gray-100 text-gray-700", order_index: 9 },
];

const getCategoryColor = (cat: string | null, cats: TrainingCategory[]) => {
  if (!cat) return "bg-gray-100 text-gray-600";
  const found = cats.find((c) => c.name === cat);
  return found?.color || "bg-gray-100 text-gray-700";
};

const CLASSIFICATION_LABELS: Record<string, string> = {
  reglementaire: "Réglementaire",
  certifiant: "Certifiant",
  qualifiant: "Qualifiant",
};

const CLASSIFICATION_COLORS: Record<string, string> = {
  reglementaire: "bg-red-100 text-red-700",
  certifiant: "bg-amber-100 text-amber-700",
  qualifiant: "bg-emerald-100 text-emerald-700",
};

interface TrainingFormData {
  title: string;
  description: string;
  objectives: string;
  duration_hours: string;
  max_participants: string;
  price_per_person: string;
  category: string;
  certification: string;
  prerequisites: string;
  classification: string;
  is_active: boolean;
}

const emptyForm: TrainingFormData = {
  title: "",
  description: "",
  objectives: "",
  duration_hours: "",
  max_participants: "",
  price_per_person: "",
  category: "",
  certification: "",
  prerequisites: "",
  classification: "",
  is_active: true,
};

export default function TrainingsPage() {
  const supabase = createClient();
  const { toast } = useToast();
  const { entityId } = useEntity();

  const [trainings, setTrainings] = useState<TrainingWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [classificationFilter, setClassificationFilter] = useState("all");

  // Dynamic categories
  const [dynamicCategories, setDynamicCategories] = useState<TrainingCategory[]>([]);
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState(COLOR_PALETTE[0].value);
  const [savingCat, setSavingCat] = useState(false);
  const [deletingCatId, setDeletingCatId] = useState<string | null>(null);

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTraining, setEditingTraining] = useState<Training | null>(null);
  const [formData, setFormData] = useState<TrainingFormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Delete
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [trainingToDelete, setTrainingToDelete] = useState<Training | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Programs (for "create from program")
  const [programPickerOpen, setProgramPickerOpen] = useState(false);
  const [programs, setPrograms] = useState<Array<{
    id: string;
    title: string;
    description: string | null;
    objectives: string | null;
    content: Record<string, unknown>;
  }>>([]);
  const [programSearch, setProgramSearch] = useState("");
  const [loadingPrograms, setLoadingPrograms] = useState(false);

  const fetchCategories = useCallback(async () => {
    if (!entityId) return;
    const { data } = await supabase
      .from("training_categories")
      .select("*")
      .eq("entity_id", entityId)
      .order("order_index");
    if (data && data.length > 0) {
      setDynamicCategories(data as TrainingCategory[]);
    } else {
      // Seed les catégories par défaut si la table est vide
      const toInsert = DEFAULT_CATEGORIES.map((c) => ({ ...c, entity_id: entityId }));
      const { data: inserted } = await supabase
        .from("training_categories")
        .insert(toInsert)
        .select("*");
      if (inserted) setDynamicCategories(inserted as TrainingCategory[]);
    }
  }, [supabase, entityId]);

  const handleAddCategory = async () => {
    if (!newCatName.trim() || !entityId) return;
    setSavingCat(true);
    const { data, error } = await supabase
      .from("training_categories")
      .insert({ entity_id: entityId, name: newCatName.trim(), color: newCatColor, order_index: dynamicCategories.length })
      .select("*")
      .single();
    if (!error && data) {
      setDynamicCategories((prev) => [...prev, data as TrainingCategory]);
      setNewCatName("");
      setNewCatColor(COLOR_PALETTE[0].value);
      toast({ title: "Catégorie ajoutée", description: `"${data.name}" a été créée.` });
    }
    setSavingCat(false);
  };

  const handleDeleteCategory = async (catId: string) => {
    setDeletingCatId(catId);
    const { error } = await supabase.from("training_categories").delete().eq("id", catId);
    if (!error) {
      setDynamicCategories((prev) => prev.filter((c) => c.id !== catId));
      toast({ title: "Catégorie supprimée" });
    }
    setDeletingCatId(null);
  };

  const handleMoveCategoryUp = async (idx: number) => {
    if (idx === 0) return;
    const updated = [...dynamicCategories];
    [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
    const reindexed = updated.map((c, i) => ({ ...c, order_index: i }));
    setDynamicCategories(reindexed);
    await Promise.all(reindexed.map((c) =>
      supabase.from("training_categories").update({ order_index: c.order_index }).eq("id", c.id)
    ));
  };

  const handleMoveCategoryDown = async (idx: number) => {
    if (idx === dynamicCategories.length - 1) return;
    const updated = [...dynamicCategories];
    [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
    const reindexed = updated.map((c, i) => ({ ...c, order_index: i }));
    setDynamicCategories(reindexed);
    await Promise.all(reindexed.map((c) =>
      supabase.from("training_categories").update({ order_index: c.order_index }).eq("id", c.id)
    ));
  };

  const fetchPrograms = useCallback(async () => {
    setLoadingPrograms(true);
    let q = supabase
      .from("programs")
      .select("id, title, description, objectives, content")
      .eq("is_active", true)
      .order("title");
    if (entityId) q = q.eq("entity_id", entityId);
    const { data } = await q;
    setPrograms((data ?? []) as typeof programs);
    setLoadingPrograms(false);
  }, [supabase, entityId]);

  const openProgramPicker = () => {
    fetchPrograms();
    setProgramSearch("");
    setProgramPickerOpen(true);
  };

  const selectProgram = (program: typeof programs[number]) => {
    // Extract info from program content if available
    const content = program.content || {};
    const duration = content.duration_hours as number | undefined;
    const prerequisites = content.prerequisites as string | undefined;
    const category = content.category as string | undefined;

    setFormData({
      title: program.title,
      description: program.description || "",
      objectives: program.objectives || "",
      duration_hours: duration?.toString() || "",
      max_participants: "",
      price_per_person: "",
      category: category || "",
      certification: "",
      prerequisites: prerequisites || "",
      classification: "",
      is_active: true,
    });
    setEditingTraining(null);
    setProgramPickerOpen(false);
    setDialogOpen(true);
    toast({ title: "Programme chargé", description: `Le formulaire a été pré-rempli depuis "${program.title}".` });
  };

  const filteredPrograms = programs.filter(
    (p) => programSearch === "" || p.title.toLowerCase().includes(programSearch.toLowerCase())
  );

  const fetchTrainings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("trainings")
      .select("*, sessions:sessions(id)")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les formations.", variant: "destructive" });
    } else {
      const mapped = (data || []).map((t: Record<string, unknown>) => ({
        ...t,
        sessions_count: Array.isArray(t.sessions) ? (t.sessions as unknown[]).length : 0,
      }));
      setTrainings(mapped as TrainingWithCount[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTrainings();
    fetchCategories();
  }, [fetchTrainings, fetchCategories]);

  const filtered = trainings.filter((t) => {
    const matchSearch =
      search === "" || t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.category?.toLowerCase().includes(search.toLowerCase());
    const matchCategory = categoryFilter === "all" || t.category === categoryFilter;
    const matchActive =
      activeFilter === "all" ||
      (activeFilter === "active" && t.is_active) ||
      (activeFilter === "inactive" && !t.is_active);
    const matchClassification =
      classificationFilter === "all" || t.classification === classificationFilter;
    return matchSearch && matchCategory && matchActive && matchClassification;
  });

  const categories = dynamicCategories.map((c) => c.name);

  const openAddDialog = () => {
    setEditingTraining(null);
    setFormData(emptyForm);
    setDialogOpen(true);
  };

  const openEditDialog = (training: Training) => {
    setEditingTraining(training);
    setFormData({
      title: training.title,
      description: training.description || "",
      objectives: training.objectives || "",
      duration_hours: training.duration_hours?.toString() || "",
      max_participants: training.max_participants?.toString() || "",
      price_per_person: training.price_per_person?.toString() || "",
      category: training.category || "",
      certification: training.certification || "",
      prerequisites: training.prerequisites || "",
      classification: training.classification || "",
      is_active: training.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast({ title: "Titre requis", description: "Le titre de la formation est obligatoire.", variant: "destructive" });
      return;
    }
    setSaving(true);

    const payload = {
      title: formData.title.trim(),
      description: formData.description.trim() || null,
      objectives: formData.objectives.trim() || null,
      duration_hours: formData.duration_hours ? parseFloat(formData.duration_hours) : null,
      max_participants: formData.max_participants ? parseInt(formData.max_participants) : null,
      price_per_person: formData.price_per_person ? parseFloat(formData.price_per_person) : null,
      category: formData.category.trim() || null,
      certification: formData.certification.trim() || null,
      prerequisites: formData.prerequisites.trim() || null,
      classification: formData.classification || null,
      is_active: formData.is_active,
    };

    if (editingTraining) {
      const { error } = await supabase.from("trainings").update(payload).eq("id", editingTraining.id);
      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      toast({ title: "Formation mise à jour" });
    } else {
      const insertPayload = entityId ? { ...payload, entity_id: entityId } : payload;
      const { error } = await supabase.from("trainings").insert(insertPayload);
      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      toast({ title: "Formation créée", description: `"${payload.title}" a été ajoutée au catalogue.` });
    }

    setSaving(false);
    setDialogOpen(false);
    await fetchTrainings();
  };

  const handleToggleActive = async (training: Training) => {
    const { error } = await supabase
      .from("trainings")
      .update({ is_active: !training.is_active })
      .eq("id", training.id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: training.is_active ? "Formation désactivée" : "Formation activée",
        description: `"${training.title}" est maintenant ${training.is_active ? "inactive" : "active"}.`,
      });
      await fetchTrainings();
    }
  };

  const openDeleteDialog = (training: Training) => {
    setTrainingToDelete(training);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!trainingToDelete) return;
    setDeleting(true);
    const { error } = await supabase.from("trainings").delete().eq("id", trainingToDelete.id);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Formation supprimée" });
      setDeleteDialogOpen(false);
      setTrainingToDelete(null);
      await fetchTrainings();
    }
    setDeleting(false);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catalogue de formations</h1>
          <p className="text-sm text-gray-500 mt-1">
            {trainings.length} formation{trainings.length !== 1 ? "s" : ""} —{" "}
            {trainings.filter((t) => t.is_active).length} active{trainings.filter((t) => t.is_active).length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setCatDialogOpen(true)} className="gap-2">
            <Settings className="h-4 w-4" />
            Gérer les catégories
          </Button>
          <Button variant="outline" onClick={openProgramPicker} className="gap-2">
            <Library className="h-4 w-4" />
            Créer depuis un programme
          </Button>
          <Button onClick={openAddDialog} className="gap-2">
            <Plus className="h-4 w-4" />
            Ajouter une formation
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Rechercher par titre, catégorie..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Catégorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les catégories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={classificationFilter} onValueChange={setClassificationFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Classification" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes classifications</SelectItem>
            <SelectItem value="reglementaire">Réglementaire</SelectItem>
            <SelectItem value="certifiant">Certifiant</SelectItem>
            <SelectItem value="qualifiant">Qualifiant</SelectItem>
          </SelectContent>
        </Select>
        <Select value={activeFilter} onValueChange={(v) => setActiveFilter(v as typeof activeFilter)}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes</SelectItem>
            <SelectItem value="active">Actives</SelectItem>
            <SelectItem value="inactive">Inactives</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-64 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <BookOpen className="h-12 w-12 mb-3 text-gray-300" />
          <p className="font-medium text-gray-500">Aucune formation trouvée</p>
          <p className="text-sm mt-1">Modifiez vos filtres ou ajoutez une formation.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((training) => (
            <Card
              key={training.id}
              className={cn(
                "flex flex-col overflow-hidden transition-shadow hover:shadow-md",
                !training.is_active && "opacity-60"
              )}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {training.category && (
                        <Badge className={cn("text-xs font-medium", getCategoryColor(training.category, dynamicCategories))}>
                          {training.category}
                        </Badge>
                      )}
                      {training.classification && (
                        <Badge className={cn("text-xs", CLASSIFICATION_COLORS[training.classification] || "bg-gray-100 text-gray-600")}>
                          {CLASSIFICATION_LABELS[training.classification] || training.classification}
                        </Badge>
                      )}
                      {training.certification && (
                        <Badge className="text-xs bg-amber-100 text-amber-700 gap-1">
                          <Award className="h-3 w-3" />
                          {training.certification}
                        </Badge>
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-900 leading-tight line-clamp-2">{training.title}</h3>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDialog(training)} className="gap-2">
                        <Pencil className="h-4 w-4" />
                        Modifier
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleToggleActive(training)} className="gap-2">
                        <Filter className="h-4 w-4" />
                        {training.is_active ? "Désactiver" : "Activer"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => openDeleteDialog(training)}
                        className="gap-2 text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                        Supprimer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>

              <CardContent className="flex-1 space-y-3">
                {training.objectives && (
                  <p className="text-xs text-gray-500 line-clamp-3 leading-relaxed">
                    {training.objectives}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {training.duration_hours && (
                    <div className="flex items-center gap-1.5 text-gray-600">
                      <Clock className="h-3.5 w-3.5 text-gray-400" />
                      <span>{training.duration_hours}h</span>
                    </div>
                  )}
                  {training.max_participants && (
                    <div className="flex items-center gap-1.5 text-gray-600">
                      <Users className="h-3.5 w-3.5 text-gray-400" />
                      <span>Max {training.max_participants}</span>
                    </div>
                  )}
                  {training.price_per_person && (
                    <div className="flex items-center gap-1.5 text-gray-600">
                      <Euro className="h-3.5 w-3.5 text-gray-400" />
                      <span className="font-medium">{formatCurrency(training.price_per_person)}/pers.</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <GraduationCap className="h-3.5 w-3.5 text-gray-400" />
                    <span>{training.sessions_count} session{training.sessions_count !== 1 ? "s" : ""}</span>
                  </div>
                </div>

                {/* Active toggle */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-gray-500">
                    {training.is_active ? "Formation active" : "Formation inactive"}
                  </span>
                  <Switch
                    checked={training.is_active}
                    onCheckedChange={() => handleToggleActive(training)}
                    className="scale-75"
                  />
                </div>
              </CardContent>

              <CardFooter className="pt-3 border-t">
                <Link
                  href={`/admin/trainings/${training.id}`}
                  className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                >
                  Gerer la formation
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTraining ? "Modifier la formation" : "Ajouter une formation"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="title">Titre <span className="text-red-500">*</span></Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                placeholder="Ex: Introduction au management"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                rows={3}
                placeholder="Description générale de la formation..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="objectives">Objectifs pédagogiques</Label>
              <Textarea
                id="objectives"
                value={formData.objectives}
                onChange={(e) => setFormData((p) => ({ ...p, objectives: e.target.value }))}
                rows={3}
                placeholder="À l'issue de cette formation, les participants seront capables de..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="duration_hours">Durée (heures)</Label>
                <Input
                  id="duration_hours"
                  type="number"
                  min="0"
                  step="0.5"
                  value={formData.duration_hours}
                  onChange={(e) => setFormData((p) => ({ ...p, duration_hours: e.target.value }))}
                  placeholder="14"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="max_participants">Participants max</Label>
                <Input
                  id="max_participants"
                  type="number"
                  min="1"
                  value={formData.max_participants}
                  onChange={(e) => setFormData((p) => ({ ...p, max_participants: e.target.value }))}
                  placeholder="12"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="price_per_person">Prix par personne (€)</Label>
                <Input
                  id="price_per_person"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.price_per_person}
                  onChange={(e) => setFormData((p) => ({ ...p, price_per_person: e.target.value }))}
                  placeholder="490.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="category">Catégorie</Label>
                <Select
                  value={formData.category || "none"}
                  onValueChange={(v) => setFormData((p) => ({ ...p, category: v === "none" ? "" : v }))}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Sélectionner..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sans catégorie</SelectItem>
                    {dynamicCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="certification">Certification / Habilitation</Label>
                <Input
                  id="certification"
                  value={formData.certification}
                  onChange={(e) => setFormData((p) => ({ ...p, certification: e.target.value }))}
                  placeholder="Ex: Qualiopi, CLEA, SST..."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="classification">Classification</Label>
                <Select
                  value={formData.classification || "none"}
                  onValueChange={(v) => setFormData((p) => ({ ...p, classification: v === "none" ? "" : v }))}
                >
                  <SelectTrigger id="classification">
                    <SelectValue placeholder="Sélectionner..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucune</SelectItem>
                    <SelectItem value="reglementaire">Réglementaire</SelectItem>
                    <SelectItem value="certifiant">Certifiant</SelectItem>
                    <SelectItem value="qualifiant">Qualifiant</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prerequisites">Prérequis</Label>
              <Textarea
                id="prerequisites"
                value={formData.prerequisites}
                onChange={(e) => setFormData((p) => ({ ...p, prerequisites: e.target.value }))}
                rows={2}
                placeholder="Aucun prérequis / Maîtrise de base de l'informatique..."
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(v) => setFormData((p) => ({ ...p, is_active: v }))}
              />
              <Label htmlFor="is_active" className="cursor-pointer">Formation active (visible dans le catalogue)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Enregistrement..." : editingTraining ? "Mettre à jour" : "Créer la formation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Supprimer la formation</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Supprimer <strong>&quot;{trainingToDelete?.title}&quot;</strong> ?
            Cette action supprimera également toutes les sessions associées. Elle est irréversible.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Suppression..." : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Categories Management Dialog */}
      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-indigo-500" />
              Gérer les catégories de formation
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500">
            Créez, organisez et supprimez les catégories utilisées dans le catalogue.
          </p>

          {/* Existing categories */}
          <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
            {dynamicCategories.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">Aucune catégorie. Ajoutez-en une ci-dessous.</div>
            ) : (
              dynamicCategories.map((cat, idx) => (
                <div key={cat.id} className="flex items-center gap-3 p-2 rounded-lg border bg-white">
                  <GripVertical className="h-4 w-4 text-gray-300 flex-shrink-0" />
                  <span className={cn("px-2 py-0.5 rounded text-xs font-medium", cat.color)}>{cat.name}</span>
                  <span className="flex-1 text-sm text-gray-700">{cat.name}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleMoveCategoryUp(idx)}
                      disabled={idx === 0}
                      className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-500"
                      title="Monter"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => handleMoveCategoryDown(idx)}
                      disabled={idx === dynamicCategories.length - 1}
                      className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-500"
                      title="Descendre"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(cat.id)}
                      disabled={deletingCatId === cat.id}
                      className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 ml-1"
                      title="Supprimer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Add new category */}
          <div className="border-t pt-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">Ajouter une catégorie</p>
            <div className="flex gap-2">
              <Input
                placeholder="Nom de la catégorie..."
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
                className="flex-1"
              />
              <Button onClick={handleAddCategory} disabled={savingCat || !newCatName.trim()} size="sm">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-gray-500">Couleur</p>
              <div className="flex flex-wrap gap-2">
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setNewCatColor(c.value)}
                    className={cn(
                      "px-2.5 py-1 rounded text-xs font-medium transition-all",
                      c.value,
                      newCatColor === c.value ? "ring-2 ring-offset-1 ring-gray-400 scale-105" : "hover:scale-105"
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            {newCatName && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                Aperçu :
                <span className={cn("px-2 py-0.5 rounded font-medium", newCatColor)}>{newCatName}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialogOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Program Picker Dialog */}
      <Dialog open={programPickerOpen} onOpenChange={setProgramPickerOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Library className="h-5 w-5" style={{ color: "#3DB5C5" }} />
              Créer depuis un programme
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500">
            Sélectionnez un programme de la bibliothèque pour pré-remplir le formulaire de création.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Rechercher un programme..."
              value={programSearch}
              onChange={(e) => setProgramSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 min-h-0 max-h-[400px]">
            {loadingPrograms ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : filteredPrograms.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <FileText className="h-10 w-10 text-gray-300 mb-2" />
                <p className="text-sm font-medium text-gray-500">
                  {programs.length === 0 ? "Aucun programme disponible" : "Aucun résultat"}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {programs.length === 0
                    ? "Créez d'abord un programme dans la section Programmes."
                    : "Modifiez votre recherche."}
                </p>
              </div>
            ) : (
              filteredPrograms.map((prog) => (
                <button
                  key={prog.id}
                  onClick={() => selectProgram(prog)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-[#3DB5C5] hover:bg-[#e0f5f8]/30 transition text-left group"
                >
                  <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-[#e0f5f8] flex items-center justify-center">
                    <FileText className="h-5 w-5" style={{ color: "#3DB5C5" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{prog.title}</p>
                    {prog.description && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">{prog.description}</p>
                    )}
                    {prog.objectives && (
                      <p className="text-[11px] text-gray-400 truncate mt-0.5">{prog.objectives}</p>
                    )}
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-[#3DB5C5] transition flex-shrink-0" />
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
