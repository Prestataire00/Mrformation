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
import { updateFormationLearnerSheet } from "@/lib/services/formation-learners";
import { editFormationLearnerSchema, type EditFormationLearnerInput } from "@/lib/validations/formation-learner";
import { BPF_TRAINEE_TYPE_VALUES } from "@/lib/bpf-enums";
import { BPF_TRAINEE_TYPE_LABELS } from "@/lib/bpf-labels";

/** Inscription minimale attendue par le dialog (learner + type BPF). */
export interface EditableEnrollment {
  id: string;
  bpf_trainee_type?: string | null;
  learner?: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  } | null;
}

interface Props {
  enrollment: EditableEnrollment | null;
  sessionId: string;
  entityId: string;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

export function EditFormationLearnerDialog({ enrollment, sessionId, entityId, onClose, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<EditFormationLearnerInput>({
    resolver: zodResolver(editFormationLearnerSchema) as never,
    values: enrollment
      ? {
          first_name: enrollment.learner?.first_name ?? "",
          last_name: enrollment.learner?.last_name ?? "",
          email: enrollment.learner?.email ?? "",
          bpf_trainee_type: (BPF_TRAINEE_TYPE_VALUES.includes(
            (enrollment.bpf_trainee_type ?? "") as (typeof BPF_TRAINEE_TYPE_VALUES)[number],
          )
            ? enrollment.bpf_trainee_type
            : "salarie_prive") as EditFormationLearnerInput["bpf_trainee_type"],
        }
      : undefined,
  });

  const onSubmit = async (data: EditFormationLearnerInput) => {
    if (!enrollment?.learner?.id) return;

    const result = await updateFormationLearnerSheet(supabase, {
      learnerId: enrollment.learner.id,
      enrollmentId: enrollment.id,
      sessionId,
      entityId,
      learner: { first_name: data.first_name, last_name: data.last_name, email: data.email },
      bpfTraineeType: data.bpf_trainee_type,
    });

    if (!result.ok) {
      toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Stagiaire mis à jour" });
    onClose();
    await onRefresh();
  };

  const learnerName = enrollment?.learner
    ? `${enrollment.learner.first_name ?? ""} ${enrollment.learner.last_name ?? ""}`.trim() || "Stagiaire"
    : "Stagiaire";

  return (
    <Dialog open={enrollment !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier — {learnerName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-fl-first">Prénom</Label>
              <Input id="edit-fl-first" {...register("first_name")} />
              {errors.first_name && <p className="text-xs text-red-600 mt-1">{errors.first_name.message}</p>}
            </div>
            <div>
              <Label htmlFor="edit-fl-last">Nom</Label>
              <Input id="edit-fl-last" {...register("last_name")} />
              {errors.last_name && <p className="text-xs text-red-600 mt-1">{errors.last_name.message}</p>}
            </div>
          </div>

          <div>
            <Label htmlFor="edit-fl-email">Email</Label>
            <Input id="edit-fl-email" type="email" placeholder="email@exemple.fr" {...register("email")} />
            {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <Label htmlFor="edit-fl-bpf">Type de stagiaire (BPF)</Label>
            <Controller
              control={control}
              name="bpf_trainee_type"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="edit-fl-bpf">
                    <SelectValue placeholder="Sélectionner un type" />
                  </SelectTrigger>
                  <SelectContent>
                    {BPF_TRAINEE_TYPE_VALUES.map((v) => (
                      <SelectItem key={v} value={v}>{BPF_TRAINEE_TYPE_LABELS[v]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.bpf_trainee_type && (
              <p className="text-xs text-red-600 mt-1">{errors.bpf_trainee_type.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
