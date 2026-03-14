import { CHARGE_LINES } from "./types";

interface SectionDProps {
  editingFinancial: boolean;
  sectionD: Record<string, number>;
  onSectionDChange: (updater: (prev: Record<string, number>) => Record<string, number>) => void;
  fmtEur: (val: number) => string;
}

export function SectionD({ editingFinancial, sectionD, onSectionDChange, fmtEur }: SectionDProps) {
  return (
    <div className="bg-[#e0f5f8] rounded-xl p-6 mb-4">
      <h2 className="font-bold text-gray-900 text-base mb-3">
        D. Bilan financier hors taxes : charges de l&apos;organisme
      </h2>
      <div className="space-y-2">
        {CHARGE_LINES.map((line) => (
          <div key={line.key} className={`flex justify-between ${line.indent ? "pl-6" : ""}`}>
            <span className="text-sm text-gray-700">{line.label}</span>
            {editingFinancial ? (
              <input
                type="number"
                step="0.01"
                min="0"
                value={sectionD[line.key] || ""}
                onChange={(e) => onSectionDChange((prev) => ({ ...prev, [line.key]: parseFloat(e.target.value) || 0 }))}
                className="w-36 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-[#3DB5C5]"
                placeholder="0.00"
              />
            ) : (
              <span className="text-sm text-gray-700">{fmtEur(sectionD[line.key] || 0)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
