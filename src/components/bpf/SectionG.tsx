import { Loader2, Save } from "lucide-react";
import { useState } from "react";

interface SectionGProps {
  editingFinancial: boolean;
  sectionGManual: { stagiaires: number; heures: number };
  onSectionGChange: (updater: (prev: { stagiaires: number; heures: number }) => { stagiaires: number; heures: number }) => void;
  onSaveG?: () => Promise<void>;
}

export function SectionG({ editingFinancial, sectionGManual, onSectionGChange, onSaveG }: SectionGProps) {
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!onSaveG) return;
    setSaving(true);
    await onSaveG();
    setSaving(false);
  };

  return (
    <div className="bg-[#e0f5f8] rounded-xl p-6 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-gray-900 text-base">
          G. Bilan pédagogique : stagiaires dont la formation a été confiée à votre organisme par un autre organisme de formation
        </h2>
        {editingFinancial && onSaveG && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-white px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Sauvegarder
          </button>
        )}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left py-2 w-1/2"></th>
            <th className="text-left py-2">Nombre de stagiaires et d&apos;apprentis</th>
            <th className="text-left py-2">Nombre total d&apos;heures de formation suivies par les stagiaires et les apprentis</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-gray-200">
            <td className="py-3 text-gray-700">Formations confiées à votre organisme par un autre organisme de formation</td>
            {editingFinancial ? (
              <>
                <td className="py-3">
                  <input
                    type="number"
                    min="0"
                    value={sectionGManual.stagiaires || ""}
                    onChange={(e) => onSectionGChange((prev) => ({ ...prev, stagiaires: parseInt(e.target.value) || 0 }))}
                    className="w-24 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-[#374151]"
                  />
                </td>
                <td className="py-3">
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={sectionGManual.heures || ""}
                    onChange={(e) => onSectionGChange((prev) => ({ ...prev, heures: parseFloat(e.target.value) || 0 }))}
                    className="w-24 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-[#374151]"
                  />
                </td>
              </>
            ) : (
              <>
                <td className="py-3 text-gray-800 font-medium">{sectionGManual.stagiaires}</td>
                <td className="py-3 text-gray-800 font-medium">{sectionGManual.heures}</td>
              </>
            )}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
