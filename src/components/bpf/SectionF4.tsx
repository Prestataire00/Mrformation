import { BPFData } from "./types";

interface SectionF4Props {
  bpf: BPFData;
}

export function SectionF4({ bpf }: SectionF4Props) {
  return (
    <div className="bg-[#e0f5f8] rounded-xl p-6 mb-4">
      <h2 className="font-bold text-gray-900 text-base mb-4">
        F – 4. Spécialité(s) de formation dispensée(s)
      </h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#3DB5C5] text-white">
            <th className="text-left py-2 px-3">Code & Libellé</th>
            <th className="text-left py-2 px-3">Nombre de stagiaires</th>
            <th className="text-left py-2 px-3">Nombre total d&apos;heures de formation suivies par l&apos;ensemble des stagiaires</th>
          </tr>
        </thead>
        <tbody>
          {bpf.f4.length === 0 ? (
            <tr>
              <td colSpan={3} className="py-6 text-center text-gray-400 text-sm">
                Aucune spécialité enregistrée — Ajoutez des codes NSF aux formations pour remplir cette section
              </td>
            </tr>
          ) : (
            bpf.f4.map((row, i) => (
              <tr key={i} className="border-t border-gray-200">
                <td className="py-2 px-3 text-gray-700">{row.code}</td>
                <td className="py-2 px-3 text-gray-800 font-medium">{row.stagiaires}</td>
                <td className="py-2 px-3 text-gray-800 font-medium">{row.heures}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
