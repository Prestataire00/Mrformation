"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle, Info } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface AutomationRule {
  id: string;
  label: string;
  days: string;
}

const INITIAL_RULES: AutomationRule[] = [
  { id: "evaluations", label: "Relancer les évaluations non remplies", days: "3" },
  { id: "satisfaction", label: "Relancer les questionnaires de satisfaction non remplis", days: "7" },
  { id: "signatures", label: "Relancer les enseignements non signés", days: "2" },
];

export default function AutomationPage() {
  const { toast } = useToast();
  const [rules, setRules] = useState<AutomationRule[]>(INITIAL_RULES);
  const [saving, setSaving] = useState(false);

  const updateDays = (id: string, value: string) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, days: value } : r)));
  };

  const handleSave = async () => {
    setSaving(true);
    await new Promise((res) => setTimeout(res, 800));
    setSaving(false);
    toast({
      title: "Réglages enregistrés",
      description: "Les règles d'automatisation ont été mises à jour.",
    });
  };

  return (
    <div className="p-6 max-w-3xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm mb-4">
        <Link href="/admin" className="text-[#3DB5C5] hover:underline">Accueil</Link>
        <span className="text-gray-400">/</span>
        <Link href="/admin/trainings" className="text-[#3DB5C5] hover:underline">Formations</Link>
        <span className="text-gray-400">/</span>
        <span className="text-gray-500">Automatisation</span>
      </div>

      {/* Title */}
      <h1 className="text-gray-700 text-xl font-bold mb-6">Formations / Réglages d&apos;Automatisation</h1>

      {/* Success banner */}
      <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl p-4 mb-8">
        <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
        <p className="text-green-700 text-sm font-medium">
          L&apos;automatisation des emails est activée dans votre compte
        </p>
      </div>

      {/* Rules section */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-gray-700 font-semibold text-base mb-1">Réglages des relances :</h2>
        <p className="text-sm text-gray-500 mb-6">
          Configurez le délai en jours avant l&apos;envoi automatique des rappels.
        </p>

        <div className="space-y-6">
          {rules.map((rule, index) => (
            <div key={rule.id}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-6 h-6 rounded-full text-white text-xs flex items-center justify-center font-bold flex-shrink-0" style={{ background: "#3DB5C5" }}>
                  {index + 1}
                </span>
                <span className="text-sm text-gray-700 flex-1 min-w-[200px]">{rule.label}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={rule.days}
                    onChange={(e) => updateDays(rule.id, e.target.value)}
                    className="w-20 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:border-[#3DB5C5]"
                  />
                  <span className="text-sm text-gray-500 whitespace-nowrap">jour(s) après l&apos;envoi</span>
                </div>
              </div>
              {index < rules.length - 1 && <hr className="mt-6 border-gray-100" />}
            </div>
          ))}
        </div>

        <div className="mt-8 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-white px-6 py-2 rounded-lg text-sm font-medium uppercase"
            style={{ background: "#3DB5C5" }}
          >
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </div>

      {/* Info note */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 mt-6">
        <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-blue-700 text-sm font-medium mb-1">Fonctionnalités à venir</p>
          <p className="text-blue-600 text-sm">
            D&apos;autres fonctionnalités d&apos;automatisation sont en cours de développement ! 
            Bientôt disponibles : relances de devis, rappels de sessions, et bien plus.
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mt-6">
        <h3 className="text-sm font-semibold text-gray-600 mb-3">Récapitulatif des relances actives</h3>
        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-600">{rule.label}</span>
              <span className="font-medium text-gray-800 bg-white border border-gray-200 px-2 py-0.5 rounded">
                J+{rule.days}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
