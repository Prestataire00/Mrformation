import { BPFData } from "./types";
import { EditableCell } from "./EditableCell";

interface SectionF3Props {
  bpf: BPFData;
  overrides?: Record<string, Record<string, number>>;
  onOverride?: (key: string, value: number | null) => void;
}

export function SectionF3({ bpf, overrides, onOverride }: SectionF3Props) {
  return (
    <div className="bg-[#e0f5f8] rounded-xl p-6 mb-4">
      <h2 className="font-bold text-gray-900 text-base mb-4">
        F – 3. Objectif général des prestations dispensées
      </h2>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left py-2 w-1/2"></th>
            <th className="text-left py-2">Nombre de stagiaires et d&apos;apprentis</th>
            <th className="text-left py-2">Nombre total d&apos;heures de formation suivies par les stagiaires et les apprentis</th>
          </tr>
        </thead>
        <tbody>
          {bpf.f3.map((row, i) => {
            const isTotal = row.label === "Total";
            const rowKey = `f3_${i}`;
            const stagOverride = (overrides?.[rowKey] as Record<string, number>)?.stagiaires ?? (overrides?.[`${rowKey}_stagiaires`] as unknown as number);
            const heuresOverride = (overrides?.[rowKey] as Record<string, number>)?.heures ?? (overrides?.[`${rowKey}_heures`] as unknown as number);

            return (
              <tr key={i} className="border-t border-gray-200">
                <td className={`py-3 text-gray-700 ${row.indent ? "pl-6" : ""} ${isTotal ? "font-semibold" : ""}`}>
                  {row.label}
                </td>
                <td className="py-3 text-gray-800 font-medium">
                  {onOverride && !isTotal ? (
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
                  {onOverride && !isTotal ? (
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
    </div>
  );
}
