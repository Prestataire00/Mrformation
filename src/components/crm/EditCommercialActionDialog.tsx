"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Mini-dialog d'édition d'une action commerciale manuelle (call, email,
 * meeting, comment, relance) sur la timeline d'un prospect ou client CRM.
 *
 * Couvre UNIQUEMENT les types d'actions saisis manuellement par Loris.
 * Les autres types (status_change, quote_sent, quote_accepted/rejected,
 * task_created, document_sent) sont des LOGS SYSTÈME et l'UI les exclut
 * (filtre EDITABLE_ACTION_TYPES côté composant parent).
 *
 * ⚠ Défense en profondeur incomplète : le verrouillage des logs système
 * est UI-only. La RLS crm_commercial_actions permet à n'importe quel
 * admin/super_admin/commercial de son entité de UPDATE/DELETE n'importe
 * quelle action (y compris status_change). Un utilisateur déterminé
 * pourrait bypass via DevTools. Pour une protection BDD, prévoir un
 * trigger BEFORE UPDATE/DELETE qui RAISE EXCEPTION si action_type ∈
 * logs système — story future si besoin métier d'intégrité audit stricte.
 *
 * Pattern UPDATE supabase direct. RLS protège cross-entité serveur-side.
 */

export interface EditableCommercialAction {
  id: string;
  action_type: "call" | "email" | "meeting" | "comment" | "relance";
  subject: string | null;
  content: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: EditableCommercialAction | null;
  onUpdated: () => void;
}

const EDITABLE_TYPES = [
  { value: "call", label: "Appel" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Rendez-vous" },
  { value: "relance", label: "Relance" },
  { value: "comment", label: "Commentaire" },
];

export function EditCommercialActionDialog({
  open,
  onOpenChange,
  action,
  onUpdated,
}: Props) {
  const supabase = createClient();
  const { toast } = useToast();

  const [type, setType] = useState<string>("call");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!action) return;
    setType(action.action_type);
    setSubject(action.subject ?? "");
    setContent(action.content ?? "");
    // M4 : reset saving entre 2 ouvertures consécutives pour éviter un
    // dialog bloqué en état "Enregistrement…" si le précédent submit
    // s'est terminé pendant que le dialog se fermait.
    setSaving(false);
  }, [action]);

  const handleSubmit = async () => {
    if (!action) return;
    if (!subject.trim()) {
      toast({
        title: "Sujet obligatoire",
        description: "L'action doit avoir un sujet non vide.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("crm_commercial_actions")
        .update({
          action_type: type,
          subject: subject.trim(),
          content: content.trim() || null,
        })
        .eq("id", action.id);

      if (error) {
        toast({
          title: "Erreur",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Action modifiée" });
      onUpdated();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast({
        title: "Erreur",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Modifier l&apos;action</DialogTitle>
          <DialogDescription>
            Les actions générées automatiquement par le système (changement
            de statut, devis envoyé, etc.) ne sont pas modifiables.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="action-type">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="action-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EDITABLE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="action-subject">Sujet</Label>
            <Input
              id="action-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Sujet de l'action"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="action-content">Détails (optionnel)</Label>
            <Textarea
              id="action-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Détails ou commentaire"
              rows={3}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
