"use client";

import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Star } from "lucide-react";

export type QuestionFieldType =
  | "rating"
  | "text"
  | "multiple_choice"
  | "yes_no"
  | "program_objectives";

export interface QuestionFieldData {
  id: string;
  text: string;
  type: QuestionFieldType;
  options: string[] | null;
  is_required: boolean;
}

interface QuestionFieldProps {
  question: QuestionFieldData;
  index: number;
  value: string | number | undefined;
  onChange: (value: string | number) => void;
  readOnly?: boolean;
  hasError?: boolean;
}

/**
 * Rendu présentationnel d'UNE question de questionnaire (carte + input selon le
 * type). Stateless : la page parente gère l'état des réponses, la validation et
 * la soumission. Partagé entre le remplissage apprenant et formateur (EF-3.4).
 */
export function QuestionField({
  question,
  index,
  value,
  onChange,
  readOnly = false,
  hasError = false,
}: QuestionFieldProps) {
  return (
    <div
      className={cn(
        "bg-white border rounded-xl p-5 transition-colors",
        hasError ? "border-red-300 bg-red-50/30" : "border-gray-200"
      )}
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600 shrink-0 mt-0.5">
          {index + 1}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900">
            {question.text}
            {question.is_required && <span className="text-red-500 ml-1">*</span>}
          </p>
        </div>
      </div>

      {/* Rating */}
      {question.type === "rating" && (
        <div className="flex items-center gap-1.5 pl-9">
          {[1, 2, 3, 4, 5].map((star) => {
            const currentValue = (value as number) || 0;
            return (
              <button
                key={star}
                type="button"
                disabled={readOnly}
                onClick={() => onChange(star)}
                className={cn(
                  "p-1 rounded transition-colors",
                  readOnly ? "cursor-default" : "hover:scale-110 cursor-pointer"
                )}
              >
                <Star
                  className={cn(
                    "w-7 h-7 transition-colors",
                    star <= currentValue
                      ? "text-yellow-400 fill-yellow-400"
                      : "text-gray-200 fill-gray-200"
                  )}
                />
              </button>
            );
          })}
          {(value as number) > 0 && (
            <span className="text-sm text-gray-500 ml-2">{value} / 5</span>
          )}
        </div>
      )}

      {/* Text */}
      {question.type === "text" && (
        <div className="pl-9">
          <Textarea
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Votre reponse..."
            rows={3}
            disabled={readOnly}
            className="text-sm"
          />
        </div>
      )}

      {/* Multiple choice */}
      {question.type === "multiple_choice" && question.options && (
        <div className="space-y-2 pl-9">
          {question.options.map((option) => {
            const isSelected = value === option;
            return (
              <button
                key={option}
                type="button"
                disabled={readOnly}
                onClick={() => onChange(option)}
                className={cn(
                  "w-full text-left px-4 py-2.5 rounded-lg border text-sm transition-all",
                  isSelected
                    ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50",
                  readOnly && "cursor-default"
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center",
                      isSelected ? "border-blue-500" : "border-gray-300"
                    )}
                  >
                    {isSelected && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                  </div>
                  {option}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Yes/No */}
      {question.type === "yes_no" && (
        <div className="flex gap-3 pl-9">
          {[
            { label: "Oui", value: "oui" },
            { label: "Non", value: "non" },
          ].map(({ label, value: optValue }) => {
            const isSelected = value === optValue;
            return (
              <button
                key={optValue}
                type="button"
                disabled={readOnly}
                onClick={() => onChange(optValue)}
                className={cn(
                  "flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all",
                  isSelected
                    ? optValue === "oui"
                      ? "border-green-500 bg-green-50 text-green-700"
                      : "border-red-500 bg-red-50 text-red-700"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50",
                  readOnly && "cursor-default"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Balise program_objectives non-expansée */}
      {question.type === "program_objectives" && (
        <div className="ml-9 text-xs text-gray-500 italic bg-gray-50 border border-dashed border-gray-200 rounded p-2">
          Aucune action requise sur cette section.
        </div>
      )}

      {hasError && (
        <p className="text-xs text-red-600 mt-2 pl-9">Cette question est obligatoire</p>
      )}
    </div>
  );
}
