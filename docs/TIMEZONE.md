# Gestion de la timezone — MR Formation

## Principe

L'application utilise **Europe/Paris** comme timezone de reference pour toutes les saisies utilisateur et affichages.

La base de donnees stocke en `TIMESTAMPTZ` (UTC) pour une coherence internationale.

## Regles imperatives

### 1. Saisie utilisateur vers base de donnees

Toujours utiliser `toUtcIsoFromParisTime()` du module `@/lib/timezone` :

```typescript
import { toUtcIsoFromParisTime } from "@/lib/timezone";

const startTimeIso = toUtcIsoFromParisTime("2026-04-22", "09:00");
// -> "2026-04-22T07:00:00.000Z" (UTC correct, Paris = UTC+2 en ete)
```

### 2. Base de donnees vers affichage utilisateur

Toujours utiliser les helpers d'affichage :

```typescript
import { formatTimeInParis, formatDateTimeInParis } from "@/lib/timezone";

formatTimeInParis(slot.start_time);        // "09:00"
formatDateTimeInParis(slot.start_time);    // "22/04/2026 09:00"
```

Ou avec `toLocaleTimeString` si dans un template HTML (pas de module import) :

```typescript
new Date(iso).toLocaleTimeString("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris"  // <-- OBLIGATOIRE
});
```

### 3. NE JAMAIS FAIRE

- `new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })` sans `timeZone`
- `start_time: "${dateStr}T${timeStr}:00"` (ISO naif = interprete en UTC par PostgreSQL)
- `start_time: "${dateStr}T${timeStr}:00+02:00"` (offset hardcode, faux en hiver)

## Pourquoi Europe/Paris explicitement ?

- Heure d'ete (fin mars - fin octobre) : UTC+2 (CEST)
- Heure d'hiver (fin octobre - fin mars) : UTC+1 (CET)

`date-fns-tz` et `Intl` gerent automatiquement ce basculement.

## Fichiers cles

- `src/lib/timezone.ts` : utilitaire centralise
- `src/app/(dashboard)/admin/formations/[id]/_components/BulkSlotCreator.tsx` : creation des creneaux
- `src/lib/document-templates-defaults.ts` : templates PDF (utilise toLocaleTimeString avec timeZone)
