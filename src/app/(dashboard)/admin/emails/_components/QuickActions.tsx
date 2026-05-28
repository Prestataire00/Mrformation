"use client";

import { Pencil, Send } from "lucide-react";
import type { EmailTemplateCategory } from "@/lib/types";

export interface QuickActionsProps {
  /** Click sur "Créer un modèle" — pré-sélectionne la catégorie passée */
  onCreateTemplate: (category: EmailTemplateCategory) => void;
  /** Click sur "Envoyer un mail maintenant" — ouvre le ChooseRecipient flow */
  onSendOneShot: () => void;
  /** Catégorie pré-sélectionnée pour le "Créer un modèle" (default: custom) */
  defaultCreateCategory?: EmailTemplateCategory;
}

/**
 * Quick actions header du panel /admin/emails (UX Sally §4.2).
 * 2 cards emerald-50 — cohérence avec /admin/documents V2.2.
 */
export function QuickActions({
  onCreateTemplate,
  onSendOneShot,
  defaultCreateCategory = "custom",
}: QuickActionsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      <button
        type="button"
        onClick={() => onCreateTemplate(defaultCreateCategory)}
        className="group text-left p-5 rounded-xl border-2 border-dashed border-emerald-200 bg-emerald-50/50 hover:border-emerald-400 hover:bg-emerald-50 transition-all flex items-start gap-4"
        aria-label="Créer un nouveau modèle d'email"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 group-hover:bg-emerald-200 transition-colors">
          <Pencil className="h-5 w-5 text-emerald-700" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 text-sm">Créer un modèle</h3>
          <p className="text-xs text-gray-600 mt-0.5">
            Ajoute un nouveau template d&apos;email à ta bibliothèque.
          </p>
        </div>
      </button>

      <button
        type="button"
        onClick={onSendOneShot}
        className="group text-left p-5 rounded-xl border-2 border-dashed border-emerald-200 bg-emerald-50/50 hover:border-emerald-400 hover:bg-emerald-50 transition-all flex items-start gap-4"
        aria-label="Envoyer un email maintenant à un destinataire"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 group-hover:bg-emerald-200 transition-colors">
          <Send className="h-5 w-5 text-emerald-700" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 text-sm">
            Envoyer un mail maintenant
          </h3>
          <p className="text-xs text-gray-600 mt-0.5">
            Choisis un destinataire et un template, ou écris tout à la main.
          </p>
        </div>
      </button>
    </div>
  );
}
