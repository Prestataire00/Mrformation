import { BPFData } from "./types";

interface SectionF2Props {
  bpf: BPFData;
}

export function SectionF2({ bpf }: SectionF2Props) {
  return (
    <div className="bg-[#e0f5f8] rounded-xl p-6 mb-4">
      <h2 className="font-bold text-gray-900 text-base mb-4">
        F – 2. Dont activité sous-traitée de l&apos;organisme
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
          <tr className="border-t border-gray-200">
            <td className="py-3 text-gray-700">a. Stagiaires ou apprentis dont l&apos;action a été confiée par votre organisme à un autre organisme</td>
            <td className="py-3 text-gray-800 font-medium">{bpf.f2.stagiaires}</td>
            <td className="py-3 text-gray-800 font-medium">{bpf.f2.heures}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
