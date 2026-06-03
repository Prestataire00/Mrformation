/**
 * PLAN-5 audit BMAD — Helper pure de distribution des modules pédagogiques
 * d'un programme sur les créneaux d'une session.
 *
 * Aujourd'hui : `program.content.modules[]` est complètement déconnecté
 * des `formation_time_slots[].module_*` — le formateur ressaisit tout.
 * Ce helper propose un mapping automatique 1-1 par ordre, qui sert ensuite
 * à un UPDATE batch des slots.
 *
 * Algorithme V1 (simple et prédictif) :
 *  - On trie les slots par `start_time` croissant (ordre chronologique).
 *  - On trie les modules par `id` (= ordre de saisie du programme).
 *  - On assigne module[i] au slot[i] :
 *      → Si #slots > #modules : les slots en surplus restent vides.
 *      → Si #modules > #slots : les modules en surplus sont ignorés
 *        (signalé dans le résultat pour avertir l'utilisateur).
 *  - Aucun split prorata duration_hours (compliqué + peu prévisible) ;
 *    1 module = 1 créneau.
 *
 * Contenu transféré :
 *  - `module_title` ← module.title
 *  - `module_objectives` ← module.objectives.join("\n")
 *  - `module_themes` ← module.topics.join("\n")
 *  - `module_exercises` reste inchangé (champ libre formateur).
 */

import type { FormationTimeSlot, ProgramContentModule } from "@/lib/types";

export interface SlotModuleAssignment {
  slotId: string;
  /** Patch à appliquer sur le slot (3 champs sur 4 — exercises reste libre). */
  patch: {
    module_title: string | null;
    module_objectives: string | null;
    module_themes: string | null;
  };
}

export interface DistributeResult {
  /** Affectations à pousser via updateTimeSlot. */
  assignments: SlotModuleAssignment[];
  /** Nombre de slots qui resteront vides (pas assez de modules). */
  emptySlots: number;
  /** Nombre de modules non assignés (pas assez de slots). */
  unassignedModules: number;
  /** Slots dont au moins un champ pédagogique est déjà rempli — déclenche un confirm UI. */
  slotsAlreadyFilled: number;
}

function joinNonEmpty(items: string[] | undefined): string | null {
  if (!items) return null;
  const cleaned = items.map((i) => i.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join("\n") : null;
}

export function distributeModulesToSlots(
  modules: ProgramContentModule[],
  slots: FormationTimeSlot[],
): DistributeResult {
  // Tri stable : slots par start_time croissant, modules par id croissant.
  const sortedSlots = [...slots].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  );
  const sortedModules = [...modules].sort((a, b) => a.id - b.id);

  const assignments: SlotModuleAssignment[] = [];
  const len = Math.min(sortedSlots.length, sortedModules.length);

  let slotsAlreadyFilled = 0;
  for (let i = 0; i < len; i++) {
    const slot = sortedSlots[i];
    const m = sortedModules[i];
    if (slot.module_title || slot.module_objectives || slot.module_themes) {
      slotsAlreadyFilled++;
    }
    assignments.push({
      slotId: slot.id,
      patch: {
        module_title: m.title?.trim() || null,
        module_objectives: joinNonEmpty(m.objectives),
        module_themes: joinNonEmpty(m.topics),
      },
    });
  }

  return {
    assignments,
    emptySlots: Math.max(0, sortedSlots.length - sortedModules.length),
    unassignedModules: Math.max(0, sortedModules.length - sortedSlots.length),
    slotsAlreadyFilled,
  };
}
