"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  CompanySearch,
  type CompanySearchResult,
} from "@/components/crm/CompanySearch";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";

/**
 * Dialog "Créer un prospect" partagé (h-23 AC-3 + AC-4).
 *
 * Utilisé par la page liste `/admin/crm/prospects/liste` (nouveau bouton
 * créer). Pappers UPFRONT : le `CompanySearch` en haut auto-fill TOUS les
 * champs disponibles (company_name, siret, address, city, postal_code,
 * naf_code) ce qui élimine le besoin d'un bouton "Enrichir" post-création.
 *
 * Décisions résolues code review h-23 §9 :
 * - Q4 : tous les champs Pappers auto-fillés au onSelect
 * - Q6 : Pappers à la création seule (post-création masqué par feature flag
 *   dans `[id]/page.tsx`)
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  onCreated: (prospectId: string) => void;
}

interface FormState {
  company_name: string;
  siret: string;
  naf_code: string;
  address: string;
  city: string;
  postal_code: string;
  contact_name: string;
  email: string;
  phone: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  company_name: "",
  siret: "",
  naf_code: "",
  address: "",
  city: "",
  postal_code: "",
  contact_name: "",
  email: "",
  phone: "",
  notes: "",
};

export function AddProspectDialog({
  open,
  onOpenChange,
  entityId,
  onCreated,
}: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  // h-23 AC-4 : Pappers UPFRONT — auto-fill les champs vides uniquement.
  // P5 (code review h-23) : ne PAS overwrite les champs déjà saisis par
  // l'utilisateur (si le user a tapé un nom custom avant de selectionner
  // un resultat Pappers, on respecte sa saisie).
  function handleCompanySelect(company: CompanySearchResult) {
    setForm((f) => ({
      ...f,
      company_name: f.company_name || company.company_name,
      siret: f.siret || company.siret,
      naf_code: f.naf_code || (company.naf_code ?? ""),
      address: f.address || company.address,
      city: f.city || company.city,
      postal_code: f.postal_code || company.postal_code,
    }));
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function reset() {
    setForm(EMPTY_FORM);
    setSubmitting(false);
  }

  async function handleSubmit() {
    if (!form.company_name.trim()) {
      toast({
        title: "Nom de société requis",
        description: "Renseigne au moins le nom de la société.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        entity_id: entityId,
        company_name: form.company_name.trim(),
        siret: form.siret.trim() || null,
        naf_code: form.naf_code.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        postal_code: form.postal_code.trim() || null,
        contact_name: form.contact_name.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        notes: form.notes.trim() || null,
        status: "new" as const,
      };

      const { data: inserted, error } = await supabase
        .from("crm_prospects")
        .insert([payload])
        .select("id")
        .single();

      if (error) throw error;
      if (!inserted?.id) throw new Error("ID prospect manquant après insertion");

      toast({
        title: "Prospect créé",
        description: `${form.company_name.trim()} ajouté à la liste.`,
      });
      reset();
      onOpenChange(false);
      onCreated(inserted.id);
    } catch (err) {
      console.error("[AddProspectDialog] insert error:", err);
      toast({
        title: "Erreur création prospect",
        description:
          err instanceof Error ? err.message : "Erreur inconnue, réessaye.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Bloquer fermeture pendant submit (pattern h-22)
        if (submitting) return;
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Créer un prospect</DialogTitle>
          <DialogDescription>
            Recherche d&apos;abord la société via Pappers pour auto-remplir les champs (SIRET, adresse, code NAF), puis complète le contact.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto pr-1">
          {/* Pappers search en HAUT (h-23 AC-4) */}
          <div>
            <Label className="text-xs">Recherche société (Pappers)</Label>
            <CompanySearch
              onSelect={handleCompanySelect}
              placeholder="Nom de société ou SIRET…"
              disabled={submitting}
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Sélectionne une société dans les résultats pour auto-remplir les champs ci-dessous.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <Label htmlFor="prospect_company_name" className="text-xs">
                Nom société <span className="text-red-500">*</span>
              </Label>
              <Input
                id="prospect_company_name"
                value={form.company_name}
                onChange={(e) => update("company_name", e.target.value)}
                placeholder="Acme SARL"
                disabled={submitting}
              />
            </div>
            <div>
              <Label htmlFor="prospect_siret" className="text-xs">SIRET</Label>
              <Input
                id="prospect_siret"
                value={form.siret}
                onChange={(e) => update("siret", e.target.value)}
                placeholder="14 chiffres"
                disabled={submitting}
              />
            </div>
            <div>
              <Label htmlFor="prospect_naf" className="text-xs">Code NAF</Label>
              <Input
                id="prospect_naf"
                value={form.naf_code}
                onChange={(e) => update("naf_code", e.target.value)}
                placeholder="ex: 6202A"
                disabled={submitting}
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="prospect_address" className="text-xs">Adresse</Label>
              <Input
                id="prospect_address"
                value={form.address}
                onChange={(e) => update("address", e.target.value)}
                disabled={submitting}
              />
            </div>
            <div>
              <Label htmlFor="prospect_postal" className="text-xs">Code postal</Label>
              <Input
                id="prospect_postal"
                value={form.postal_code}
                onChange={(e) => update("postal_code", e.target.value)}
                disabled={submitting}
              />
            </div>
            <div>
              <Label htmlFor="prospect_city" className="text-xs">Ville</Label>
              <Input
                id="prospect_city"
                value={form.city}
                onChange={(e) => update("city", e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="border-t pt-3 grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <Label htmlFor="prospect_contact" className="text-xs">Contact principal</Label>
              <Input
                id="prospect_contact"
                value={form.contact_name}
                onChange={(e) => update("contact_name", e.target.value)}
                placeholder="Prénom Nom"
                disabled={submitting}
              />
            </div>
            <div>
              <Label htmlFor="prospect_email" className="text-xs">Email</Label>
              <Input
                id="prospect_email"
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                disabled={submitting}
              />
            </div>
            <div>
              <Label htmlFor="prospect_phone" className="text-xs">Téléphone</Label>
              <Input
                id="prospect_phone"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="prospect_notes" className="text-xs">Notes</Label>
              <Textarea
                id="prospect_notes"
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                rows={2}
                disabled={submitting}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2 border-t pt-3">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!form.company_name.trim() || submitting}
            className="gap-2"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {submitting ? "Création…" : "Créer le prospect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
