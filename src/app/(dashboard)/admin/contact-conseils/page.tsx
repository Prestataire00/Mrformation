"use client";

import {
  Mail, ExternalLink, Shield, BookOpen, Lightbulb,
  CheckCircle, LifeBuoy,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const RESSOURCES = [
  { label: "Qualiopi", url: "https://www.qualiopi.fr", description: "Référentiel national qualité" },
  { label: "Mon Compte Formation", url: "https://www.moncompteformation.gouv.fr", description: "CPF et droits à la formation" },
  { label: "Centre Inffo", url: "https://www.centre-inffo.fr", description: "Actualités de la formation professionnelle" },
  { label: "Légifrance", url: "https://www.legifrance.gouv.fr", description: "Textes réglementaires officiels" },
  { label: "OPCO", url: "https://www.les-opco.fr", description: "Opérateurs de compétences" },
  { label: "Data Dock", url: "https://www.data-dock.fr", description: "Référencement des organismes" },
];

const CONSEILS = [
  "Mettez à jour vos indicateurs Qualiopi tous les trimestres et documentez chaque modification.",
  "Conservez systématiquement les preuves d'amélioration continue : réclamations traitées, actions correctives, évolutions de programmes.",
  "Recueillez les évaluations à chaud ET à froid pour chaque formation — c'est un critère audité.",
  "Vérifiez régulièrement que vos CGV, règlement intérieur et politique de confidentialité sont à jour et accessibles.",
  "Formalisez le processus d'accueil des personnes en situation de handicap, même si vous n'avez pas encore eu de demande.",
  "Préparez un tableau de suivi des compétences de vos formateurs avec les justificatifs à jour (CV, diplômes, certifications).",
];

export default function ContactConseilsPage() {
  return (
    <div className="space-y-6 p-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Contact & Conseils</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ressources, contacts utiles et conseils pour votre organisme de formation
        </p>
      </div>

      {/* Section 1 — Nous contacter */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <LifeBuoy className="h-4 w-4" /> Nous contacter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="p-4 bg-muted/30 rounded-lg space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-teal-50 rounded-lg">
                <Shield className="h-5 w-5 text-[#DC2626]" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">IA INFINITY</p>
                <p className="text-sm text-muted-foreground">
                  Support technique et évolutions de la plateforme
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 ml-12">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-gray-700">acces.prestataires@i-a-infinity.com</span>
            </div>
            <div className="ml-12">
              <a
                href="mailto:acces.prestataires@i-a-infinity.com"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: "#DC2626" }}
              >
                <Mail className="h-3.5 w-3.5" /> Contacter le support
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 2 — Ressources utiles */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Ressources utiles
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {RESSOURCES.map((r) => (
              <a
                key={r.label}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors group"
              >
                <ExternalLink className="h-4 w-4 text-[#DC2626] shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 group-hover:text-[#DC2626] transition-colors">
                    {r.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{r.description}</p>
                </div>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Section 3 — Conseils Qualiopi */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Lightbulb className="h-4 w-4" /> Conseils Qualiopi
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {CONSEILS.map((conseil, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                <p className="text-sm text-gray-700">{conseil}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
