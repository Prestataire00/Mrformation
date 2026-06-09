import { CHARGE_LINES } from "./types";
import { EditableCell } from "./EditableCell";

interface SectionDProps {
  sectionD: Record<string, number>;
  fmtEur: (val: number) => string;
  overrides?: Record<string, number>;
  onOverride?: (key: string, value: number | null) => void;
}

export function SectionD({ sectionD, fmtEur, overrides, onOverride }: SectionDProps) {
  return (
    <div className="bg-[#e0f5f8] rounded-xl p-6 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-gray-900 text-base">
          D. Bilan financier hors taxes : charges de l&apos;organisme
        </h2>
        <span className="text-xs text-gray-500 bg-white/60 px-2 py-1 rounded">
          Calculé depuis les taux horaires formateurs
        </span>
      </div>
      <div className="space-y-2">
        {CHARGE_LINES.map((line) => {
          const calculated = sectionD[line.key] || 0;
          const override = overrides?.[line.key];
          return (
            <div key={line.key} className={`flex justify-between ${line.indent ? "pl-6" : ""}`}>
              <span className="text-sm text-gray-700">{line.label}</span>
              <span className="text-sm text-gray-700">
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
    </div>
  );
}
