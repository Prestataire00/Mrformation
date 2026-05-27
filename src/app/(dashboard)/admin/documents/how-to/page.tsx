"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Download,
  FileText,
  ListChecks,
  Upload,
  FlaskConical,
  ExternalLink,
  Lightbulb,
} from "lucide-react";
import Link from "next/link";
import { TEMPLATE_VARIABLES } from "@/lib/template-variables";
import { DocumentsTabsNav } from "../_components/DocumentsTabsNav";

const VARIABLE_COUNT = TEMPLATE_VARIABLES.length;

export default function HowToPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <DocumentsTabsNav />
      {/* Header */}
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Comment créer un nouveau type de document</h1>
          <p className="text-sm text-muted-foreground">
            Guide pas-à-pas pour ajouter un template Word personnalisé en autonomie (~5 min).
          </p>
        </div>
      </div>

      {/* Intro */}
      <Card className="border-blue-200 bg-blue-50/40">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Lightbulb className="h-5 w-5 text-blue-700 mt-0.5" />
            <div className="text-sm text-blue-900">
              <p className="font-semibold mb-1">Avant de commencer</p>
              <p>
                Le système supporte deux types de templates : (1) les <strong>templates système</strong> (fournis par
                votre dev, codés en TypeScript dans <code className="text-xs bg-blue-100 px-1.5 py-0.5 rounded">src/lib/templates/</code>),
                et (2) les <strong>templates custom</strong> que vous uploadez via cette interface au format Word (.docx).
                Cette page concerne le 2ème cas.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Steps */}
      <div className="space-y-4">
        {/* Step 1 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Badge variant="outline" className="text-sm">1</Badge>
              <Download className="h-4 w-4 text-gray-600" />
              Télécharger un template Word d&apos;exemple
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-700">
              Récupérez un template existant (convention, attestation, certificat…) pour partir d&apos;une base qui
              fonctionne déjà. Vous pouvez aussi créer un .docx vide dans Word/LibreOffice.
            </p>
            <p className="text-sm text-gray-700">
              Le fichier doit respecter ces critères :
            </p>
            <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
              <li>Format <strong>.docx</strong> (Word 2007+ — pas .doc ancien)</li>
              <li>Polices web standards (Arial, Helvetica, Times New Roman)</li>
              <li>Images insérées directement (pas de liens externes)</li>
              <li>Taille maxi : 5 Mo</li>
            </ul>
          </CardContent>
        </Card>

        {/* Step 2 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Badge variant="outline" className="text-sm">2</Badge>
              <FileText className="h-4 w-4 text-gray-600" />
              Insérer les balises variables <code className="text-xs">[%...%]</code> dans le Word
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-700">
              Aux endroits où vous voulez insérer des données dynamiques (nom apprenant, dates, lieu, etc.), tapez la
              balise correspondante exactement comme dans le catalogue (avec les crochets et le pourcent).
            </p>
            <div className="bg-gray-50 border rounded-md p-3 text-sm">
              <p className="text-gray-600 mb-2">Exemple :</p>
              <pre className="text-xs font-mono text-gray-800 whitespace-pre-wrap">
{`Je soussigné, [%Nom du représentant de l'organisme%],
représentant de l'organisme de formation [%Nom de l'organisme%],
atteste que [%Nom de l'apprenant%] a suivi la formation
[%Nom de la formation%] du [%Date de début de la formation%]
au [%Date de fin de la formation%].`}
              </pre>
            </div>
            <p className="text-sm text-gray-700">
              ⚠️ <strong>Important</strong> : copiez-collez les balises depuis le catalogue (étape 3) pour éviter les
              fautes de frappe. Le système détectera les balises inconnues et vous les signalera à l&apos;import.
            </p>
          </CardContent>
        </Card>

        {/* Step 3 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Badge variant="outline" className="text-sm">3</Badge>
              <ListChecks className="h-4 w-4 text-gray-600" />
              Vérifier les variables disponibles dans le catalogue
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-700">
              Le catalogue contient <strong>{VARIABLE_COUNT} balises</strong> classées par catégorie (organisme,
              apprenant, formateur, formation, dates, montants, signatures, etc.). Cliquez sur une balise pour la copier
              dans le presse-papier, puis collez-la dans votre Word.
            </p>
            <Link href="/admin/documents/variables">
              <Button variant="outline" className="gap-2">
                <ExternalLink className="h-4 w-4" />
                Ouvrir le catalogue des {VARIABLE_COUNT} balises
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Step 4 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Badge variant="outline" className="text-sm">4</Badge>
              <Upload className="h-4 w-4 text-gray-600" />
              Importer le template via la page d&apos;import
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-700">
              Allez sur la page d&apos;import, glissez-déposez votre .docx (ou plusieurs simultanément). Pour chaque
              fichier, l&apos;outil va :
            </p>
            <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
              <li>Parser le contenu pour détecter les balises utilisées</li>
              <li>Comparer avec le catalogue → vous signaler les balises inconnues (typos)</li>
              <li>Vous demander de nommer le template + choisir son type (catégorie)</li>
              <li>Vous proposer de marquer ce template comme &ldquo;par défaut&rdquo; pour le type</li>
            </ul>
            <p className="text-sm text-gray-700">
              Si un template avec le même nom existe déjà, vous serez prévenu avant l&apos;overwrite.
            </p>
            <Link href="/admin/documents/import">
              <Button variant="outline" className="gap-2">
                <ExternalLink className="h-4 w-4" />
                Aller à la page d&apos;import
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Step 5 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Badge variant="outline" className="text-sm">5</Badge>
              <FlaskConical className="h-4 w-4 text-gray-600" />
              Tester la génération
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-700">
              Avant d&apos;utiliser le template en prod, générez un PDF de test via la page test-convention. Vérifiez :
            </p>
            <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
              <li>Que toutes les balises sont remplacées (pas de <code className="text-xs">[%...%]</code> visible)</li>
              <li>Que les dates s&apos;affichent au format français (ex: <em>15/09/2025</em>)</li>
              <li>Que les images (logo, cachet) sont rendues correctement</li>
              <li>Que la mise en page tient sur les bonnes pages (pas de coupures bizarres)</li>
            </ul>
            <Link href="/admin/test-convention">
              <Button variant="outline" className="gap-2">
                <ExternalLink className="h-4 w-4" />
                Ouvrir la page de test
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Troubleshooting */}
      <Card className="border-amber-200 bg-amber-50/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-amber-900">
            🔧 Problèmes fréquents
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-amber-900">
          <div>
            <p className="font-semibold">La balise <code className="text-xs bg-amber-100 px-1.5 py-0.5 rounded">[%MaVariable%]</code> reste affichée telle quelle</p>
            <p>→ La balise n&apos;est pas dans le catalogue (faute de frappe ou variable inexistante). Vérifiez en copiant-collant depuis le catalogue.</p>
          </div>
          <div>
            <p className="font-semibold">Une variable affiche &ldquo;undefined&rdquo; ou est vide alors qu&apos;elle devrait avoir une valeur</p>
            <p>→ Le contexte de génération ne contient pas la donnée. Exemple : <code className="text-xs">[%Nom de l&apos;apprenant%]</code> dans un doc per-session (pas per-learner) sera vide.</p>
          </div>
          <div>
            <p className="font-semibold">Les images ne s&apos;affichent pas</p>
            <p>→ Vérifiez qu&apos;elles sont insérées directement dans le Word (pas en lien externe). Format JPG/PNG max 2 Mo par image.</p>
          </div>
          <div>
            <p className="font-semibold">Le PDF généré est différent du Word original (mise en page cassée)</p>
            <p>→ Conversion Word→PDF via CloudConvert (haute fidélité). Évitez les fonctionnalités Word avancées (champs calculés, contrôles de formulaire, macros). Restez sur du texte simple + tables + images.</p>
          </div>
        </CardContent>
      </Card>

      {/* Quick links footer */}
      <Card className="border-gray-200">
        <CardContent className="pt-6">
          <p className="text-sm font-semibold text-gray-900 mb-3">Liens rapides</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/documents/variables">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ListChecks className="h-3.5 w-3.5" />
                Catalogue {VARIABLE_COUNT} balises
              </Button>
            </Link>
            <Link href="/admin/documents/import">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Upload className="h-3.5 w-3.5" />
                Importer un template
              </Button>
            </Link>
            <Link href="/admin/test-convention">
              <Button variant="outline" size="sm" className="gap-1.5">
                <FlaskConical className="h-3.5 w-3.5" />
                Tester la génération
              </Button>
            </Link>
            <Link href="/admin/documents">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ArrowLeft className="h-3.5 w-3.5" />
                Retour Documents
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
