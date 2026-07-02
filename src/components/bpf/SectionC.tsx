import { CheckCircle2, AlertTriangle } from "lucide-react";
import { FINANCIAL_LINES } from "./types";
import { EditableCell } from "./EditableCell";

interface SectionCProps {
  sectionC: Record<string, number>;
  getLineValue: (key: string) => number;
  totalProduits: number;
  fmtEur: (val: number) => string;
  overrides?: Record<string, number>;
  onOverride?: (key: string, value: number | null) => void;
  /** Split fiable/à-vérifier (mode factures). Si absent, le split n'est pas affiché. */
  fiableTotal?: number;
  aVerifierTotal?: number;
  aVerifierCount?: number;
  onScrollToGaps?: () => void;
}

export function SectionC({
  sectionC,
  getLineValue,
  totalProduits,
  fmtEur,
  overrides,
  onOverride,
  fiableTotal,
  aVerifierTotal,
  aVerifierCount,
  onScrollToGaps,
}: SectionCProps) {
  return (
    <div className="bg-[#e0f5f8] rounded-xl p-6 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-gray-900 text-base">
          C. Bilan financier hors taxes : origine des produits de l&apos;organisme
        </h2>
        <span className="text-xs text-gray-500 bg-white/60 px-2 py-1 rounded">
          Calculé automatiquement depuis les factures
        </span>
      </div>
      <p className="text-sm text-gray-700 mb-4">Produits provenant :</p>

      <div className="space-y-2">
        {FINANCIAL_LINES.map((line) => {
          const calculated = getLineValue(line.key);
          const override = overrides?.[line.key];
          return (
            <div
              key={line.key}
              className="flex items-start justify-between gap-4"
              style={{ paddingLeft: line.indent ? `${line.indent * 24}px` : undefined }}
            >
              <p className={`text-sm text-gray-700 flex-1 ${line.bold ? "font-semibold" : ""}`}>
                {line.label}
              </p>
              <span className="text-sm text-gray-700 whitespace-nowrap shrink-0">
                {onOverride ? (
                  <EditableCell
                    value={calculated}
                    override={override}
                    onOverride={(val) => onOverride(line.key, val)}
                    suffix="EUR"
                  />
                ) : (
                  fmtEur(calculated)
                )}
              </span>
            </div>
          );
        })}
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

      {aVerifierTotal !== undefined && ((fiableTotal ?? 0) !== 0 || aVerifierTotal !== 0) && (
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-green-700">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              dont Total fiable (dates confirmées)
            </span>
            <span className="font-semibold text-green-700 whitespace-nowrap">
              {fmtEur(fiableTotal ?? 0)}
            </span>
          </div>
          {aVerifierCount !== undefined && aVerifierCount > 0 && (
            <button
              type="button"
              onClick={onScrollToGaps}
              className="flex w-full items-center justify-between gap-4 text-sm text-left rounded-md -mx-1 px-1 hover:bg-amber-100/60 transition-colors"
            >
              <span className="flex items-center gap-1.5 text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                dont À vérifier ({aVerifierCount} facture{aVerifierCount > 1 ? "s" : ""} importée{aVerifierCount > 1 ? "s" : ""})
              </span>
              <span className="font-semibold text-amber-700 whitespace-nowrap">
                {fmtEur(aVerifierTotal)}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
