"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { OFFICIAL_TEMPLATES, type OfficialTemplate } from "@/lib/templates/official-templates";
import type { DocumentTemplate } from "@/lib/types";

interface ChooseTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customTemplates: DocumentTemplate[];
  onSelectOfficial: (ot: OfficialTemplate) => void;
  onSelectCustom: (tpl: DocumentTemplate) => void;
}

export function ChooseTemplateDialog({
  open,
  onOpenChange,
  customTemplates,
  onSelectOfficial,
  onSelectCustom,
}: ChooseTemplateDialogProps) {
  const [search, setSearch] = useState("");

  const lowerSearch = search.toLowerCase();
  const filteredOfficials = OFFICIAL_TEMPLATES.filter((ot) =>
    ot.name.toLowerCase().includes(lowerSearch),
  );
  const filteredCustom = customTemplates.filter((t) =>
    t.name.toLowerCase().includes(lowerSearch),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Choisir un modèle à envoyer</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un modèle..."
            className="pl-9"
            autoFocus
          />
        </div>

        {/* Officials */}
        {filteredOfficials.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-700">Modèles officiels</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filteredOfficials.map((ot) => (
                <button
                  key={ot.id}
                  onClick={() => {
                    onSelectOfficial(ot);
                    onOpenChange(false);
                  }}
                  className="text-left p-3 border rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors"
                >
                  <div className="font-medium text-sm">{ot.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{ot.categoryLabel}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Custom */}
        {filteredCustom.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-700">Mes modèles</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filteredCustom.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    onSelectCustom(t);
                    onOpenChange(false);
                  }}
                  className="text-left p-3 border rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors"
                >
                  <div className="font-medium text-sm">{t.name}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {filteredOfficials.length === 0 && filteredCustom.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-6">Aucun modèle trouvé pour cette recherche.</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
