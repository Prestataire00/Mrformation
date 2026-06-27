"use client";

/**
 * Preview du contenu d'un programme sélectionné dans la pop-up de
 * création de session sur /admin/trainings.
 *
 * But métier : montrer à l'admin tout ce qui remontera AUTOMATIQUEMENT
 * dans les documents générés (convention, programme PDF, attestations,
 * convocations) quand cette session sera créée avec ce programme.
 *
 * Affiche sections :
 *  - Description + Objectifs (sont copiés tels quels dans la convention)
 *  - Modules / créneaux pédagogiques (réutilisés par le programme PDF)
 *  - Public cible + prérequis (Qualiopi : section "Profil des apprenants")
 *  - Méthodes d'évaluation + ressources pédagogiques (Qualiopi)
 *  - Modalités de certification
 *
 * Collapse / expand pour éviter d'envahir la pop-up.
 */

import { useState } from "react";
import Link from "next/link";
import type { ProgramContent } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  BookOpen,
  Target,
  Users as UsersIcon,
  CheckCircle2,
  Award,
} from "lucide-react";

interface Props {
  program: {
    id: string;
    title: string;
    description: string | null;
    objectives: string | null;
    duration_hours: number | null;
    content: ProgramContent | null;
  };
}

interface SectionProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}

function Section({ icon: Icon, title, children }: SectionProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 uppercase tracking-wide">
        <Icon className="h-3 w-3" />
        {title}
      </div>
      <div className="text-xs text-gray-700 leading-relaxed">{children}</div>
    </div>
  );
}

export function ProgramContentPreview({ program }: Props) {
  const [open, setOpen] = useState(true);
  const content = program.content;

  // Sépare objectifs / topics / etc. par retour à la ligne ou puce.
  const splitLines = (raw: string | null | undefined): string[] => {
    if (!raw) return [];
    return raw
      .split("\n")
      .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
      .filter(Boolean);
  };

  const objectivesList = splitLines(program.objectives);
  const modules = content?.modules ?? [];
  const evaluations = content?.evaluation_methods ?? [];
  const resources = content?.pedagogical_resources ?? [];
  const generalObjectives = content?.general_objectives ?? [];
  // Lot A1 — un module est "enrichi" s'il porte au moins un champ de séquence
  // détaillée. On affiche alors un rendu déplié au lieu du badge compact.
  const hasEnrichedModules = modules.some(
    (m) =>
      m.summary_objective ||
      (m.operational_objectives && m.operational_objectives.length > 0) ||
      (m.content_details && m.content_details.length > 0) ||
      m.methods ||
      m.evaluation,
  );

  return (
    <div className="border border-purple-200 bg-purple-50/30 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-purple-50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-3.5 w-3.5 text-purple-600 shrink-0" />
          <span className="text-xs font-semibold text-purple-900 truncate">
            Contenu du programme — sera repris dans les documents générés
          </span>
        </div>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-purple-600 shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-purple-600 shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-purple-200 bg-white">
          {/* Header lien détail */}
          <div className="flex items-center justify-between gap-2 pt-2.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{program.title}</p>
              {program.duration_hours != null && (
                <p className="text-[11px] text-gray-500">
                  Durée prévue : {program.duration_hours} h
                </p>
              )}
            </div>
            <Button asChild size="sm" variant="outline" className="h-7 text-[11px] gap-1 shrink-0">
              <Link href={`/admin/programs/${program.id}`} target="_blank">
                <ExternalLink className="h-3 w-3" />
                Voir le détail
              </Link>
            </Button>
          </div>

          {/* Description */}
          {program.description && (
            <Section icon={BookOpen} title="Description (convention)">
              <p className="line-clamp-3">{program.description}</p>
            </Section>
          )}

          {/* Objectifs */}
          {objectivesList.length > 0 && (
            <Section icon={Target} title={`Objectifs pédagogiques (${objectivesList.length})`}>
              <ul className="list-disc list-inside space-y-0.5">
                {objectivesList.slice(0, 5).map((obj, i) => (
                  <li key={i} className="line-clamp-2">{obj}</li>
                ))}
                {objectivesList.length > 5 && (
                  <li className="text-gray-400 italic list-none">
                    + {objectivesList.length - 5} autre{objectivesList.length - 5 > 1 ? "s" : ""}…
                  </li>
                )}
              </ul>
            </Section>
          )}

          {/* Objectifs généraux (Lot A1 — page 1 enrichie) */}
          {generalObjectives.length > 0 && (
            <Section icon={Target} title={`Objectifs généraux (${generalObjectives.length})`}>
              <ul className="list-disc list-inside space-y-0.5">
                {generalObjectives.map((obj, i) => (
                  <li key={i}>{obj}</li>
                ))}
              </ul>
            </Section>
          )}

          {/* Profil cible + prérequis */}
          {(content?.target_audience || content?.prerequisites) && (
            <Section icon={UsersIcon} title="Profil des apprenants (Qualiopi)">
              {content.target_audience && (
                <p className="line-clamp-2">
                  <span className="font-medium">Public :</span> {content.target_audience}
                </p>
              )}
              {content.prerequisites && (
                <p className="line-clamp-2 mt-0.5">
                  <span className="font-medium">Prérequis :</span> {content.prerequisites}
                </p>
              )}
            </Section>
          )}

          {/* Délais et modalités d'accès (Lot A1) */}
          {content?.access_terms && (
            <Section icon={CheckCircle2} title="Délais et modalités d'accès">
              <p className="whitespace-pre-line">{content.access_terms}</p>
            </Section>
          )}

          {/* Modules / séquences pédagogiques */}
          {modules.length > 0 && !hasEnrichedModules && (
            <Section icon={BookOpen} title={`Modules pédagogiques (${modules.length})`}>
              <ul className="space-y-1">
                {modules.slice(0, 4).map((m, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                      {m.duration_hours ? `${m.duration_hours}h` : `M${i + 1}`}
                    </Badge>
                    <span className="line-clamp-1">{m.title}</span>
                  </li>
                ))}
                {modules.length > 4 && (
                  <li className="text-gray-400 italic">+ {modules.length - 4} autres modules…</li>
                )}
              </ul>
            </Section>
          )}

          {/* Séquences détaillées (Lot A1 — rendu enrichi) */}
          {modules.length > 0 && hasEnrichedModules && (
            <Section icon={BookOpen} title={`Séquences pédagogiques (${modules.length})`}>
              <div className="space-y-3">
                {modules.map((m, i) => (
                  <div key={i} className="rounded border border-gray-200 bg-gray-50/50 p-2 space-y-1.5">
                    <div className="flex items-start gap-1.5">
                      <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                        {m.duration_hours ? `${m.duration_hours}h` : `Séq. ${i + 1}`}
                      </Badge>
                      <span className="font-medium text-gray-900">{m.title}</span>
                    </div>
                    {m.summary_objective && (
                      <p className="text-gray-600 italic">{m.summary_objective}</p>
                    )}
                    {/* Lot A1 — un module legacy (sans champs enrichis) présent
                        dans une liste enrichie ne doit pas s'afficher vide : on
                        rend aussi ses `topics` avec le style de puces compact. */}
                    {m.topics && m.topics.length > 0 && (
                      <div>
                        <p className="font-medium text-gray-700">Sujets abordés</p>
                        <ul className="list-disc list-inside space-y-0.5">
                          {m.topics.map((t, j) => (
                            <li key={j}>{t}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {m.operational_objectives && m.operational_objectives.length > 0 && (
                      <div>
                        <p className="font-medium text-gray-700">Objectifs opérationnels</p>
                        <ul className="list-disc list-inside space-y-0.5">
                          {m.operational_objectives.map((o, j) => (
                            <li key={j}>{o}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {m.content_details && m.content_details.length > 0 && (
                      <div>
                        <p className="font-medium text-gray-700">Contenus détaillés</p>
                        <ul className="list-disc list-inside space-y-0.5">
                          {m.content_details.map((c, j) => (
                            <li key={j}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {m.methods && (
                      <p>
                        <span className="font-medium text-gray-700">Méthodes : </span>
                        {m.methods}
                      </p>
                    )}
                    {m.evaluation && (
                      <p>
                        <span className="font-medium text-gray-700">Évaluation : </span>
                        {m.evaluation}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Évaluations */}
          {evaluations.length > 0 && (
            <Section icon={CheckCircle2} title="Méthodes d'évaluation (Qualiopi)">
              <ul className="list-disc list-inside space-y-0.5">
                {evaluations.slice(0, 3).map((e, i) => (
                  <li key={i} className="line-clamp-2">{e}</li>
                ))}
                {evaluations.length > 3 && (
                  <li className="text-gray-400 italic list-none">+ {evaluations.length - 3} autres…</li>
                )}
              </ul>
            </Section>
          )}

          {/* Ressources pédagogiques */}
          {resources.length > 0 && (
            <Section icon={BookOpen} title="Moyens pédagogiques (Qualiopi)">
              <ul className="list-disc list-inside space-y-0.5">
                {resources.slice(0, 3).map((r, i) => (
                  <li key={i} className="line-clamp-2">{r}</li>
                ))}
                {resources.length > 3 && (
                  <li className="text-gray-400 italic list-none">+ {resources.length - 3} autres…</li>
                )}
              </ul>
            </Section>
          )}

          {/* Certification */}
          {(content?.certification_results || content?.certification_terms) && (
            <Section icon={Award} title="Modalités de certification">
              {content.certification_results && (
                <p className="line-clamp-2">
                  <span className="font-medium">Résultats :</span> {content.certification_results}
                </p>
              )}
              {content.certification_terms && (
                <p className="line-clamp-2 mt-0.5">
                  <span className="font-medium">Modalités :</span> {content.certification_terms}
                </p>
              )}
            </Section>
          )}

          {/* État vide si rien */}
          {!program.description &&
            objectivesList.length === 0 &&
            modules.length === 0 &&
            !content?.target_audience &&
            evaluations.length === 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                ⚠ Ce programme est vide. Les documents générés afficheront des champs [Placeholder]. Complétez-le avant de créer la session.
              </p>
            )}
        </div>
      )}
    </div>
  );
}
