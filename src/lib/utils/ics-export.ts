/**
 * PLAN-7 audit BMAD — Génère un fichier .ics (iCalendar RFC 5545) à
 * partir des créneaux d'une session. Permet aux formateurs / admins
 * d'importer le planning dans Google Calendar, Outlook, Apple Calendar.
 *
 * Format pur texte généré côté client (pas de lib externe nécessaire).
 * Téléchargé via Blob + <a download> dans le composant appelant.
 */

import type { FormationTimeSlot } from "@/lib/types";

/**
 * Convertit une ISO UTC en format iCalendar UTC : YYYYMMDDTHHmmssZ.
 */
function toIcsDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

/**
 * Échappe les caractères spéciaux ICS dans un champ texte
 * (RFC 5545 §3.3.11). Concatène les retours à la ligne avec `\n`.
 */
function escapeIcs(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Plie les lignes ICS > 75 octets selon RFC 5545 §3.1 (CRLF + espace).
 * Approximé en chars JS (suffisant pour notre usage ASCII/UTF-8).
 */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  for (let i = 0; i < line.length; i += 74) {
    out.push((i === 0 ? "" : " ") + line.slice(i, i + 74));
  }
  return out.join("\r\n");
}

export interface IcsExportInput {
  sessionId: string;
  sessionTitle: string;
  slots: FormationTimeSlot[];
  /** Domaine utilisé pour l'UID (mailto-like). Par défaut "mr-formation.fr". */
  uidDomain?: string;
}

export function slotsToIcs(input: IcsExportInput): string {
  const domain = input.uidDomain ?? "mr-formation.fr";
  const now = toIcsDate(new Date().toISOString());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LMS MR Formation//Planning//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:${escapeIcs(input.sessionTitle)}`),
  ];

  for (const slot of input.slots) {
    const summary = slot.module_title || slot.title || input.sessionTitle;
    const descriptionParts: string[] = [];
    if (slot.module_objectives) descriptionParts.push(`Objectifs : ${slot.module_objectives}`);
    if (slot.module_themes) descriptionParts.push(`Thèmes : ${slot.module_themes}`);
    if (slot.module_exercises) descriptionParts.push(`Exercices : ${slot.module_exercises}`);
    const description = descriptionParts.join("\n\n");

    lines.push(
      "BEGIN:VEVENT",
      fold(`UID:${slot.id}@${domain}`),
      `DTSTAMP:${now}`,
      `DTSTART:${toIcsDate(slot.start_time)}`,
      `DTEND:${toIcsDate(slot.end_time)}`,
      fold(`SUMMARY:${escapeIcs(summary)}`),
    );
    if (description) {
      lines.push(fold(`DESCRIPTION:${escapeIcs(description)}`));
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
