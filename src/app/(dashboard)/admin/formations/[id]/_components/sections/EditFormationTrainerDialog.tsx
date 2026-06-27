"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useToast } from "@/components/ui/use-toast";
import { createClient } from "@/lib/supabase/client";
import { updateFormationTrainer } from "@/lib/services/formation-trainers";
import {
  editFormationTrainerSchema,
  type EditFormationTrainerFormInput,
  type EditFormationTrainerInput,
} from "@/lib/validations/formation-trainer";
import type { FormationTrainer } from "@/lib/types";

interface Props {
  formationTrainer: FormationTrainer | null;
  sessionId: string;
  entityId: string;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

export function EditFormationTrainerDialog({
  formationTrainer,
  sessionId,
  entityId,
  onClose,
  onRefresh,
}: Props) {
  const { toast } = useToast();
  const supabase = createClient();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<EditFormationTrainerFormInput>({
    resolver: zodResolver(editFormationTrainerSchema) as never,
    values: formationTrainer
      ? {
          role: formationTrainer.role as EditFormationTrainerFormInput["role"],
          hourly_rate:
            formationTrainer.hourly_rate != null
              ? String(formationTrainer.hourly_rate)
              : "",
          daily_rate:
            formationTrainer.daily_rate != null
              ? String(formationTrainer.daily_rate)
              : "",
          hours_done:
            formationTrainer.hours_done != null
              ? String(formationTrainer.hours_done)
              : "",
          agreed_cost_ht:
            formationTrainer.agreed_cost_ht != null
              ? String(formationTrainer.agreed_cost_ht)
              : "",
        }
      : undefined,
  });

  const onSubmit = async (raw: EditFormationTrainerFormInput) => {
    if (!formationTrainer) return;

    // The zodResolver already validated+transformed, but TypeScript sees
    // the form input type. Cast to the output type for the service call.
    const data = raw as unknown as EditFormationTrainerInput;

    const result = await updateFormationTrainer(
      supabase,
      formationTrainer.id,
      sessionId,
      entityId,
      {
        role: data.role,
        hourly_rate: data.hourly_rate,
        daily_rate: data.daily_rate,
        hours_done: data.hours_done,
        agreed_cost_ht: data.agreed_cost_ht,
      },
    );

    if (!result.ok) {
      toast({
        title: "Erreur",
        description: result.error.message,
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Formateur mis à jour" });
    onClose();
    await onRefresh();
  };

  const trainerName = formationTrainer?.trainer
    ? `${formationTrainer.trainer.first_name} ${formationTrainer.trainer.last_name}`
    : "Formateur";

  return (
    <Dialog
      open={formationTrainer !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier — {trainerName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="edit-ft-role">Rôle</Label>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="edit-ft-role">
                    <SelectValue placeholder="Sélectionner un rôle" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="formateur">Formateur</SelectItem>
                    <SelectItem value="co-formateur">Co-formateur</SelectItem>
                    <SelectItem value="intervenant">Intervenant</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            {errors.role && (
              <p className="text-xs text-red-600 mt-1">
                {errors.role.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-ft-hourly-rate">Taux horaire (€/h)</Label>
              <Input
                id="edit-ft-hourly-rate"
                type="number"
                step="0.01"
                placeholder="0.00"
                {...register("hourly_rate")}
              />
              {errors.hourly_rate && (
                <p className="text-xs text-red-600 mt-1">
                  {errors.hourly_rate.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="edit-ft-daily-rate">Taux journalier (€/j)</Label>
              <Input
                id="edit-ft-daily-rate"
                type="number"
                step="0.01"
                placeholder="0.00"
                {...register("daily_rate")}
              />
              {errors.daily_rate && (
                <p className="text-xs text-red-600 mt-1">
                  {errors.daily_rate.message}
                </p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="edit-ft-hours-done">Heures effectuées</Label>
            <Input
              id="edit-ft-hours-done"
              type="number"
              step="0.5"
              placeholder="0"
              {...register("hours_done")}
            />
            {errors.hours_done && (
              <p className="text-xs text-red-600 mt-1">
                {errors.hours_done.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="edit-ft-agreed-cost">Coût total HT (€)</Label>
            <Input
              id="edit-ft-agreed-cost"
              type="number"
              step="0.01"
              placeholder="0.00"
              {...register("agreed_cost_ht")}
            />
            {errors.agreed_cost_ht && (
              <p className="text-xs text-red-600 mt-1">
                {errors.agreed_cost_ht.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
