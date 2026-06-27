"use client";

import { useState } from "react";
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
import { useToast } from "@/components/ui/use-toast";
import { createClient } from "@/lib/supabase/client";
import { updateCompanyOnSession } from "@/lib/services/formation-companies";
import { editCompanyOnSessionSchema } from "@/lib/validations/formation-company";
import type { FormationCompany } from "@/lib/types";

interface Props {
  company: FormationCompany;
  sessionId: string;
  entityId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}

export function EditCompanyDialog({
  company,
  sessionId,
  entityId,
  open,
  onOpenChange,
  onSaved,
}: Props) {
  const { toast } = useToast();
  const supabase = createClient();

  const [amount, setAmount] = useState(company.amount != null ? String(company.amount) : "");
  const [email, setEmail] = useState(company.email ?? "");
  const [reference, setReference] = useState(company.reference ?? "");
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});

    const parsed = editCompanyOnSessionSchema.safeParse({ amount, email, reference });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        if (!errs[key]) errs[key] = issue.message;
      }
      setFieldErrors(errs);
      return;
    }

    setSaving(true);
    try {
      const result = await updateCompanyOnSession(supabase, {
        companyId: company.id,
        sessionId,
        entityId,
        amount: parsed.data.amount,
        email: parsed.data.email,
        reference: parsed.data.reference,
      });

      if (!result.ok) {
        toast({
          title: "Erreur",
          description: result.error.message,
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Entreprise mise à jour" });
      onOpenChange(false);
      await onSaved();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Impossible de modifier l'entreprise";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Modifier — {company.client?.company_name ?? "Entreprise"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="edit-company-amount">Montant (EUR)</Label>
            <Input
              id="edit-company-amount"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {fieldErrors.amount && (
              <p className="text-xs text-red-600 mt-1">{fieldErrors.amount}</p>
            )}
          </div>
          <div>
            <Label htmlFor="edit-company-email">Email de contact</Label>
            <Input
              id="edit-company-email"
              type="email"
              placeholder="email@entreprise.fr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {fieldErrors.email && (
              <p className="text-xs text-red-600 mt-1">{fieldErrors.email}</p>
            )}
          </div>
          <div>
            <Label htmlFor="edit-company-reference">Référence</Label>
            <Input
              id="edit-company-reference"
              type="text"
              placeholder="N° bon de commande, référence…"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
            {fieldErrors.reference && (
              <p className="text-xs text-red-600 mt-1">{fieldErrors.reference}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && (
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
