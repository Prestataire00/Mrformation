interface SectionGProps {
  editingFinancial: boolean;
  sectionGManual: { stagiaires: number; heures: number };
  onSectionGChange: (updater: (prev: { stagiaires: number; heures: number }) => { stagiaires: number; heures: number }) => void;
}

export function SectionG({ editingFinancial, sectionGManual, onSectionGChange }: SectionGProps) {
  return (
    <div className="bg-[#e0f5f8] rounded-xl p-6 mb-4">
      <h2 className="font-bold text-gray-900 text-base mb-4">
        G. Bilan pédagogique : stagiaires dont la formation a été confiée à votre organisme par un autre organisme de formation
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
            <td className="py-3 text-gray-700">Formations confiées à votre organisme par un autre organisme de formation</td>
            {editingFinancial ? (
              <>
                <td className="py-3">
                  <input
                    type="number"
                    min="0"
                    value={sectionGManual.stagiaires || ""}
                    onChange={(e) => onSectionGChange((prev) => ({ ...prev, stagiaires: parseInt(e.target.value) || 0 }))}
                    className="w-24 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-[#3DB5C5]"
                  />
                </td>
                <td className="py-3">
                  <input
                    type="number"
                    min="0"
                    value={sectionGManual.heures || ""}
                    onChange={(e) => onSectionGChange((prev) => ({ ...prev, heures: parseInt(e.target.value) || 0 }))}
                    className="w-24 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-[#3DB5C5]"
                  />
                </td>
              </>
            ) : (
              <>
                <td className="py-3 text-gray-800 font-medium">{sectionGManual.stagiaires}</td>
                <td className="py-3 text-gray-800 font-medium">{sectionGManual.heures}</td>
              </>
            )}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
