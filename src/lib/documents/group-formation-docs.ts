export interface RawFormationDoc {
  id: string;
  doc_type: string;
  source_id: string;
  owner_type: string | null;
  owner_id: string | null;
  file_url: string | null;
  status: string;
  created_at: string;
}
export interface SessionLite { id: string; title: string; start_date: string; }
export interface LearnerLite { id: string; first_name: string; last_name: string; }
export interface GroupedDoc {
  id: string;
  typeLabel: string;
  recipientLabel: string;
  status: string;
  fileUrl: string | null;
  createdAt: string;
}
export interface SessionDocGroup { session: SessionLite; docs: GroupedDoc[]; }

export function groupFormationDocsBySession(
  docs: RawFormationDoc[],
  sessions: SessionLite[],
  learnersById: Map<string, LearnerLite>,
  labelOf: (docType: string) => string,
): SessionDocGroup[] {
  const sessionsById = new Map(sessions.map((s) => [s.id, s]));
  const groups = new Map<string, GroupedDoc[]>();

  for (const d of docs) {
    if (!sessionsById.has(d.source_id)) continue;
    let recipientLabel: string;
    if (d.owner_type === "company") {
      recipientLabel = "Entreprise";
    } else {
      const l = d.owner_id ? learnersById.get(d.owner_id) : undefined;
      recipientLabel = l ? `${l.first_name} ${l.last_name}`.trim() : "Apprenant";
    }
    const g = groups.get(d.source_id) ?? [];
    g.push({
      id: d.id,
      typeLabel: labelOf(d.doc_type),
      recipientLabel,
      status: d.status,
      fileUrl: d.file_url,
      createdAt: d.created_at,
    });
    groups.set(d.source_id, g);
  }

  const rank = (gd: GroupedDoc) => (gd.recipientLabel === "Entreprise" ? 0 : 1);
  for (const list of groups.values()) {
    list.sort((a, b) => rank(a) - rank(b) || a.recipientLabel.localeCompare(b.recipientLabel) || a.createdAt.localeCompare(b.createdAt));
  }

  return Array.from(groups.entries())
    .map(([sid, d]) => ({ session: sessionsById.get(sid)!, docs: d }))
    .sort((a, b) => b.session.start_date.localeCompare(a.session.start_date));
}
