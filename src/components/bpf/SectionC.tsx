import { FINANCIAL_LINES } from "./types";

interface SectionCProps {
  sectionC: Record<string, number>;
  getLineValue: (key: string) => number;
  totalProduits: number;
  fmtEur: (val: number) => string;
}

export function SectionC({
  sectionC,
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
        <span className="text-xs text-gray-500 bg-white/60 px-2 py-1 rounded">
          Calculé automatiquement depuis les devis validés
        </span>
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
            <span className="text-sm text-gray-700 whitespace-nowrap shrink-0">
              {fmtEur(getLineValue(line.key))}
            </span>
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
