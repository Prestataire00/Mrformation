import { BPFData } from "./types";

interface SectionF3Props {
  bpf: BPFData;
}

export function SectionF3({ bpf }: SectionF3Props) {
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
          {bpf.f3.map((row, i) => (
            <tr key={i} className="border-t border-gray-200">
              <td className={`py-3 text-gray-700 ${row.indent ? "pl-6" : ""} ${row.label === "Total" ? "font-semibold" : ""}`}>
                {row.label}
              </td>
              <td className="py-3 text-gray-800 font-medium">{row.stagiaires}</td>
              <td className="py-3 text-gray-800 font-medium">{row.heures}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
