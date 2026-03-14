interface SectionAProps {
  entityName: string;
  showFinancier: boolean;
  onToggleFinancier: () => void;
}

export function SectionA({ entityName, showFinancier, onToggleFinancier }: SectionAProps) {
  return (
    <div className="bg-[#e0f5f8] rounded-xl p-6 mb-4">
      <h2 className="font-bold text-gray-900 text-base mb-4 uppercase">
        A. Identification de l&apos;organisme de formation
      </h2>
      <div className="space-y-2 text-sm text-gray-800">
        <p>Numéro de déclaration: <strong>93132013113</strong></p>
        <p>Numéro de SIRET: <strong>91311329600036</strong></p>
        <p>Code NAF: <strong>8559A</strong></p>
        <p>Nom et prénom ou dénomination (sigle): <strong>{entityName}</strong></p>
        <p>Adresse: <strong>24/26 Boulevard Gay Lussac 13014 Marseille</strong></p>
        <p>Téléphone: <strong>0750461245</strong></p>
        <p>Email: <strong>contact@mrformation.fr</strong></p>
      </div>

      <div className="flex items-center justify-end gap-3 mt-6">
        <span className="text-sm text-gray-600">Réglages du bilan financier</span>
        <button
          onClick={onToggleFinancier}
          className={`w-12 h-6 rounded-full transition-colors relative ${showFinancier ? "bg-[#3DB5C5]" : "bg-gray-300"}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${showFinancier ? "translate-x-6" : "translate-x-0.5"}`} />
        </button>
      </div>
    </div>
  );
}
