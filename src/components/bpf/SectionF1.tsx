import { BPFData } from "./types";
import { EditableCell } from "./EditableCell";

// Keys matching the F1 row order for override lookup
const F1_KEYS = ["salarie", "apprenti", "demandeur_emploi", "particulier", "autre"];

interface SectionF1Props {
  bpf: BPFData;
  overrides?: Record<string, Record<string, number>>;
  onOverride?: (key: string, value: number | null) => void;
}

export function SectionF1({ bpf, overrides, onOverride }: SectionF1Props) {
  return (
    <div className="bg-[#e0f5f8] rounded-xl p-6 mb-4">
      <h2 className="font-bold text-gray-900 text-base mb-4">
        F – 1. Type de stagiaires de l&apos;organisme
      </h2>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left py-2 w-1/2"></th>
            <th className="text-left py-2">Nombre de stagiaires ou d&apos;apprentis</th>
            <th className="text-left py-2">Nombre total d&apos;heures de formation suivies par les stagiaires et les apprentis</th>
          </tr>
        </thead>
        <tbody>
          {bpf.f1.map((row, i) => {
            const isTotal = row.label === "Total";
            const rowKey = F1_KEYS[i];
            const stagOverride = rowKey ? (overrides?.[rowKey] as Record<string, number>)?.stagiaires ?? (overrides?.[`${rowKey}_stagiaires`] as unknown as number) : undefined;
            const heuresOverride = rowKey ? (overrides?.[rowKey] as Record<string, number>)?.heures ?? (overrides?.[`${rowKey}_heures`] as unknown as number) : undefined;

            return (
              <tr key={i} className="border-t border-gray-200">
                <td className={`py-3 text-gray-700 ${isTotal ? "font-semibold" : ""}`}>{row.label}</td>
                <td className="py-3 text-gray-800 font-medium">
                  {onOverride && rowKey && !isTotal ? (
                    <EditableCell
                      value={row.stagiaires}
                      override={typeof stagOverride === "number" ? stagOverride : undefined}
                      onOverride={(val) => onOverride(`${rowKey}_stagiaires`, val)}
                    />
                  ) : (
                    row.stagiaires
                  )}
                </td>
                <td className="py-3 text-gray-800 font-medium">
                  {onOverride && rowKey && !isTotal ? (
                    <EditableCell
                      value={row.heures}
                      override={typeof heuresOverride === "number" ? heuresOverride : undefined}
                      onOverride={(val) => onOverride(`${rowKey}_heures`, val)}
                    />
                  ) : (
                    row.heures
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-3 pt-3 border-t border-gray-300 text-sm text-gray-700">
        dont stagiaires et apprentis ayant suivi une action en tout ou partie à distance: <strong>{bpf.f1DistanceCount}</strong>
      </div>
    </div>
  );
}
