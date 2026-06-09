# BPF Manual Overrides — Design Spec

**Date :** 2026-06-09
**Auteur :** Wissam
**Statut :** Approuve

## Probleme

Les sections C/D/E/F1/F3/F4 du BPF sont calculees automatiquement depuis les donnees Supabase. L'admin ne peut pas corriger une valeur directement — il doit aller modifier la donnee source (fiche apprenant, formation, devis...) ce qui est lourd et parfois impossible (ajustements comptables).

## Solution

Permettre a l'admin d'overrider manuellement chaque valeur numerique du BPF. L'override est stocke localement dans le BPF (pas de modification des donnees sources). La valeur overridee prend priorite sur la valeur calculee dans l'affichage et les exports.

## Data Model

**Migration :** ajouter `overrides JSONB DEFAULT '{}'` sur la table existante `bpf_financial_data`.

Contrainte existante : unique `(entity_id, fiscal_year)` + upsert deja en place.

**Structure JSONB :**

```typescript
interface BpfOverrides {
  section_c?: Record<string, number>;        // "line_1": 15000
  section_d?: Record<string, number>;        // "total_charges": 45000
  section_e?: {
    internes?: { nombre?: number; heures?: number };
    externes?: { nombre?: number; heures?: number };
  };
  section_f1?: Record<string, { stagiaires?: number; heures?: number }>;
  section_f3?: Record<string, { stagiaires?: number; heures?: number }>;
  section_f4?: Array<{ code: string; label: string; stagiaires: number; heures: number }>;
}
```

Quand un override existe pour un champ, il prend priorite. Sinon, valeur calculee.

## UX — Interaction

**Pattern : clic sur la valeur → input inline**

1. **Etat normal** : affiche la valeur (calculee ou overridee)
2. **Clic** : la cellule se transforme en `<Input type="number">`
3. **Enter ou blur** : sauvegarde l'override (upsert immediat)
4. **Echap** : annule l'edition

**Indicateurs visuels :**
- Valeur overridee : texte violet + badge "modifie"
- Icone reset (Undo2) au hover : supprime l'override, restaure la valeur calculee
- Tooltip sur valeur overridee : "Valeur calculee : X — Modifiee manuellement"

**Sauvegarde :** upsert immediat sur `bpf_financial_data.overrides` (pas de bouton global).

**Export PDF/Excel :** utilise `override ?? calcule` pour chaque valeur.

## Composant EditableCell

```typescript
interface EditableCellProps {
  value: number;                              // valeur calculee
  override?: number | undefined;              // valeur overridee
  onOverride: (value: number | null) => void; // null = reset
  suffix?: string;                            // "h", "EUR"
}
```

Reutilise dans chaque sous-composant BPF (SectionC, D, E, F1, F3, F4).

## Flux de donnees

```
BPFForm.tsx
  ├─ fetchData() charge overrides depuis bpf_financial_data.overrides
  ├─ state: overrides (JSONB parse)
  ├─ handleOverride(section, key, value) → upsert bpf_financial_data
  │
  ├─ SectionC  props: sectionC + overrides.section_c + onOverride
  ├─ SectionD  props: sectionD + overrides.section_d + onOverride
  ├─ SectionE  props: bpf + overrides.section_e + onOverride
  ├─ SectionF1 props: bpf + overrides.section_f1 + onOverride
  ├─ SectionF3 props: bpf + overrides.section_f3 + onOverride
  └─ SectionF4 props: bpf + overrides.section_f4 + onOverride
```

## Fichiers impactes

| Fichier | Action |
|---------|--------|
| `supabase/migrations/add_bpf_overrides.sql` | Creer — 1 colonne JSONB |
| `src/components/bpf/EditableCell.tsx` | Creer — composant reutilisable |
| `src/components/BPFForm.tsx` | Modifier — charger/sauvegarder overrides |
| `src/components/bpf/SectionC.tsx` | Modifier — utiliser EditableCell |
| `src/components/bpf/SectionD.tsx` | Modifier — utiliser EditableCell |
| `src/components/bpf/SectionE.tsx` | Modifier — utiliser EditableCell |
| `src/components/bpf/SectionF1.tsx` | Modifier — utiliser EditableCell |
| `src/components/bpf/SectionF3.tsx` | Modifier — utiliser EditableCell |
| `src/components/bpf/SectionF4.tsx` | Modifier — utiliser EditableCell |

## Contraintes

- 0 `any`, entity_id filtre, try/catch + toast
- Pas de refactoring massif — props optionnelles sur composants existants
- Sans les props override, comportement identique (read-only, backward compatible)
- Pas d'historique des modifications (scope V1)

## Effort

M (2-3j)
