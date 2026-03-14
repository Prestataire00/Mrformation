import { Loader2, Pencil, Save } from "lucide-react";
import { FinancialLine, FINANCIAL_LINES } from "./types";

interface SectionCProps {
  editingFinancial: boolean;
  savingFinancial: boolean;
  sectionC: Record<string, number>;
  onSectionCChange: (updater: (prev: Record<string, number>) => Record<string, number>) => void;
  onSaveFinancial: () => void;
  onStartEditing: () => void;
  getLineValue: (key: string) => number;
  totalProduits: number;
  fmtEur: (val: number) => string;
}

export function SectionC({
  editingFinancial,
  savingFinancial,
  sectionC,
  onSectionCChange,
  onSaveFinancial,
  onStartEditing,
  getLineValue,
  totalProduits,
  fmtEur,
}: SectionCProps) {
  return (
    <div className="bg-[#e0f5f8] rounded-xl p-6 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-gray-900 text-base">
          C. Bilan financier hors taxes : origine des produits de l&apos;organisme
        </h2>
        <div className="flex items-center gap-2">
          {editingFinancial ? (
            <button
              onClick={onSaveFinancial}
              disabled={savingFinancial}
              className="text-white px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50"
            >
              {savingFinancial ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Sauvegarder
            </button>
          ) : (
            <button
              onClick={onStartEditing}
              className="text-gray-600 px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 border border-gray-300 hover:bg-white"
            >
              <Pencil className="h-3.5 w-3.5" />
              Modifier
            </button>
          )}
        </div>
      </div>
      <p className="text-sm text-gray-700 mb-4">Produits provenant :</p>

      <div className="space-y-2">
        {FINANCIAL_LINES.map((line) => (
          <div
            key={line.key}
            className="flex items-start justify-between gap-4"
            style={{ paddingLeft: line.indent ? `${line.indent * 24}px` : undefined }}
          >
            <p className={`text-sm text-gray-700 flex-1 ${line.bold ? "font-semibold" : ""}`}>
              {line.label}
            </p>
            {editingFinancial && !line.isTotal ? (
              <input
                type="number"
                step="0.01"
                min="0"
                value={sectionC[line.key] || ""}
                onChange={(e) => onSectionCChange((prev) => ({ ...prev, [line.key]: parseFloat(e.target.value) || 0 }))}
                className="w-36 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-[#3DB5C5]"
                placeholder="0.00"
              />
            ) : (
              <span className="text-sm text-gray-700 whitespace-nowrap shrink-0">
                {fmtEur(getLineValue(line.key))}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-gray-300">
        <p className="text-sm text-gray-700">
          des pouvoirs publics pour la formation de publics spécifiques :
        </p>
      </div>

      <div className="mt-6 pt-3 border-t border-gray-300 flex items-start justify-between gap-4">
        <p className="text-sm text-gray-700 font-semibold flex-1">
          Total des produits réalisés au titre de la formation professionnelle
        </p>
        <span className="text-sm text-gray-900 font-bold whitespace-nowrap">
          {fmtEur(totalProduits)}
        </span>
      </div>
    </div>
  );
}
