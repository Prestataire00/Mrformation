"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Pencil, Check, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { createCustomTypeFieldsSchema } from "@/lib/services/custom-secondary-doc-types";
import {
  SECONDARY_CATEGORY_LABELS,
  type SecondaryCategory,
} from "@/lib/templates/secondary-categories";
import type { CustomSecondaryDocType } from "@/lib/types";

/**
 * Dialog de gestion des types de documents secondaires CUSTOM de l'entité :
 * création (libellé + catégorie + destinataire + template .docx), renommage et
 * (dé)activation soft. Le destinataire est figé à la création.
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Notifie le parent (catalogue) qu'il doit rafraîchir sa liste. */
  onChanged: () => void;
}

type FormValues = z.infer<typeof createCustomTypeFieldsSchema>;

const OWNER_LABELS: Record<FormValues["ownerType"], string> = {
  learner: "Apprenant (1 doc / apprenant)",
  trainer: "Formateur (1 doc / formateur)",
  session: "Session (1 doc unique)",
};

const orderedCategories = (
  Object.entries(SECONDARY_CATEGORY_LABELS) as Array<
    [SecondaryCategory, (typeof SECONDARY_CATEGORY_LABELS)[SecondaryCategory]]
  >
).sort((a, b) => a[1].order - b[1].order);

export function CustomSecondaryTypeDialog({ open, onOpenChange, onChanged }: Props) {
  const { toast } = useToast();
  const [types, setTypes] = useState<CustomSecondaryDocType[]>([]);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(createCustomTypeFieldsSchema) as never,
    defaultValues: { label: "", category: "administratif", ownerType: "learner" },
  });

  const fetchTypes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        "/api/documents/custom-secondary-types?includeInactive=true",
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur serveur");
      setTypes((data.types ?? []) as CustomSecondaryDocType[]);
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Chargement impossible.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (open) fetchTypes();
  }, [open, fetchTypes]);

  const onSubmit = async (values: FormValues) => {
    if (!file) {
      toast({
        title: "Template requis",
        description: "Uploadez un fichier .docx pour ce type.",
        variant: "destructive",
      });
      return;
    }
    try {
      const fd = new FormData();
      fd.append("label", values.label);
      fd.append("category", values.category);
      fd.append("ownerType", values.ownerType);
      fd.append("file", file);
      const res = await fetch("/api/documents/custom-secondary-types", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur serveur");
      toast({ title: "Type créé", description: `« ${values.label} » ajouté au catalogue.` });
      reset({ label: "", category: values.category, ownerType: values.ownerType });
      setFile(null);
      await fetchTypes();
      onChanged();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Création impossible.",
        variant: "destructive",
      });
    }
  };

  const patchType = async (
    id: string,
    body: { label?: string; isActive?: boolean },
    successMsg: string,
  ) => {
    setRowBusyId(id);
    try {
      const res = await fetch(`/api/documents/custom-secondary-types/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur serveur");
      toast({ title: successMsg });
      setEditingId(null);
      await fetchTypes();
      onChanged();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Mise à jour impossible.",
        variant: "destructive",
      });
    } finally {
      setRowBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Types de documents secondaires personnalisés</DialogTitle>
          <DialogDescription>
            Créez vos propres types de documents secondaires à partir d&apos;un
            template Word. Ils apparaîtront dans le catalogue d&apos;attribution de
            votre organisme.
          </DialogDescription>
        </DialogHeader>

        {/* Formulaire de création */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-3 border rounded-lg p-4 bg-gray-50/60"
        >
          <div>
            <Label htmlFor="cst-label">Libellé</Label>
            <Input
              id="cst-label"
              placeholder="Ex. Fiche de remise EPI"
              {...register("label")}
            />
            {errors.label && (
              <p className="text-xs text-red-600 mt-1">{errors.label.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cst-category">Catégorie</Label>
              <Controller
                control={control}
                name="category"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="cst-category">
                      <SelectValue placeholder="Catégorie" />
                    </SelectTrigger>
                    <SelectContent>
                      {orderedCategories.map(([cat, meta]) => (
                        <SelectItem key={cat} value={cat}>
                          {meta.icon} {meta.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div>
              <Label htmlFor="cst-owner">Destinataire (figé)</Label>
              <Controller
                control={control}
                name="ownerType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="cst-owner">
                      <SelectValue placeholder="Destinataire" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(OWNER_LABELS) as Array<FormValues["ownerType"]>).map(
                        (o) => (
                          <SelectItem key={o} value={o}>
                            {OWNER_LABELS[o]}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="cst-file">Template Word (.docx)</Label>
            <Input
              id="cst-file"
              type="file"
              accept=".docx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Le document sera généré à partir de ce template. Les types custom ne
              sont pas signables pour l&apos;instant.
            </p>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting || !file} className="gap-2">
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Créer le type
            </Button>
          </div>
        </form>

        {/* Liste des types existants */}
        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-600 mb-2">
            Types existants ({types.length})
          </h3>
          {loading ? (
            <p className="text-sm text-gray-400 py-6 text-center">Chargement…</p>
          ) : types.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">
              Aucun type personnalisé pour le moment.
            </p>
          ) : (
            <div className="divide-y border rounded-lg">
              {types.map((t) => {
                const catMeta = SECONDARY_CATEGORY_LABELS[t.category];
                const busy = rowBusyId === t.id;
                return (
                  <div key={t.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      {editingId === t.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            className="h-8"
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            disabled={busy || !editLabel.trim()}
                            onClick={() =>
                              patchType(t.id, { label: editLabel.trim() }, "Type renommé")
                            }
                          >
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => setEditingId(null)}
                          >
                            <X className="h-4 w-4 text-gray-500" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span
                            className={
                              "text-sm font-medium truncate " +
                              (t.is_active ? "text-gray-900" : "text-gray-400 line-through")
                            }
                          >
                            {t.label}
                          </span>
                          <Badge variant="outline" className="h-4 text-[9px] px-1">
                            {catMeta?.icon} {catMeta?.label ?? t.category}
                          </Badge>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(t.id);
                              setEditLabel(t.label);
                            }}
                            className="text-gray-400 hover:text-gray-700"
                            title="Renommer"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-500">
                        {t.is_active ? "Actif" : "Inactif"}
                      </span>
                      <Switch
                        checked={t.is_active}
                        disabled={busy}
                        onCheckedChange={(checked) =>
                          patchType(
                            t.id,
                            { isActive: checked },
                            checked ? "Type réactivé" : "Type désactivé",
                          )
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
