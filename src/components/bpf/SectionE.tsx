import { BPFData } from "./types";

interface SectionEProps {
  bpf: BPFData;
}

export function SectionE({ bpf }: SectionEProps) {
  return (
    <div className="bg-[#e0f5f8] rounded-xl p-6 mb-4">
      <h2 className="font-bold text-gray-900 text-base mb-4">
        E. Personnes dispensant des heures de formation
      </h2>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left py-2 w-1/2"></th>
            <th className="text-left py-2">Nombre</th>
            <th className="text-left py-2">Nombre d&apos;heures de formation dispensées</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-gray-300">
            <td className="py-3 text-gray-700">Personnes de votre organisme dispensant des heures de formation</td>
            <td className="py-3 text-gray-800 font-medium">{bpf.personnesInternes.nombre}</td>
            <td className="py-3 text-gray-800 font-medium">{bpf.personnesInternes.heures}</td>
          </tr>
          <tr className="border-t border-gray-200">
            <td className="py-3 text-gray-700">Personnes extérieures à votre organisme dispensant des heures de formation dans le cadre de contrats de sous-traitance</td>
            <td className="py-3 text-gray-800 font-medium">{bpf.personnesExternes.nombre}</td>
            <td className="py-3 text-gray-800 font-medium">{bpf.personnesExternes.heures}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
