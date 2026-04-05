interface SectionAProps {
  entityName: string;
}

export function SectionA({ entityName }: SectionAProps) {
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
    </div>
  );
}
