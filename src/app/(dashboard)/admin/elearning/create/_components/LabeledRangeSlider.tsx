"use client";

/**
 * EL-14 audit BMAD — Slider numérique avec label / icône / range bornes,
 * extrait du wizard create où le pattern était dupliqué (numChapters
 * + finalExamCount × 2 modes = 4 occurrences).
 *
 * Style aligné sur l'existant : carte blanche, valeur en gros à droite,
 * range input HTML5 stylisé via tailwind arbitraires.
 */

import type { ReactNode } from "react";

interface Props {
  icon: ReactNode;
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Couleur tailwind du nombre + thumb (ex: "blue", "amber"). */
  colorClass:
    | "blue"
    | "amber"
    | "purple"
    | "emerald";
  onChange: (value: number) => void;
}

const COLOR_MAP = {
  blue: {
    text: "text-blue-600",
    accent: "accent-blue-600 [&::-webkit-slider-thumb]:bg-blue-600",
  },
  amber: {
    text: "text-amber-600",
    accent: "accent-amber-500 [&::-webkit-slider-thumb]:bg-amber-500",
  },
  purple: {
    text: "text-purple-600",
    accent: "accent-purple-600 [&::-webkit-slider-thumb]:bg-purple-600",
  },
  emerald: {
    text: "text-emerald-600",
    accent: "accent-emerald-500 [&::-webkit-slider-thumb]:bg-emerald-500",
  },
};

export function LabeledRangeSlider({
  icon,
  label,
  description,
  value,
  min,
  max,
  step,
  colorClass,
  onChange,
}: Props) {
  const colors = COLOR_MAP[colorClass];
  const labelWidth = String(max).length <= 1 ? "w-4" : "w-6";
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            {icon}
            {label}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{description}</p>
        </div>
        <span className={`text-2xl font-bold ${colors.text}`}>{value}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className={`text-xs text-gray-400 ${labelWidth} text-center`}>{min}</span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`flex-1 h-2 bg-gray-200 rounded-full appearance-none cursor-pointer ${colors.accent} [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md`}
        />
        <span className={`text-xs text-gray-400 ${labelWidth} text-center`}>{max}</span>
      </div>
    </div>
  );
}
