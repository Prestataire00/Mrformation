import type { Session } from "@/lib/types";

interface TemplateData {
  formation: Session;
  learner?: { first_name: string; last_name: string; email?: string };
  company?: { company_name: string };
  trainer?: { first_name: string; last_name: string };
  entityName: string;
}

function formatDateFr(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function todayFr(): string {
  return new Date().toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function getLogoPath(entityName: string): string {
  if (entityName.toLowerCase().includes("c3v")) return "/logo-c3v-formation.png";
  return "/logo-mr-formation.png";
}

function wrap(entityName: string, title: string, body: string): string {
  const logoSrc = getLogoPath(entityName);
  return `<div style="font-family: Helvetica, Arial, sans-serif; color: #1e293b; max-width: 794px; margin: 0 auto; padding: 40px 50px; line-height: 1.6;">
  <!-- Header -->
  <div style="border-bottom: 3px solid #374151; padding-bottom: 16px; margin-bottom: 32px; display: flex; justify-content: space-between; align-items: center;">
    <div>
      <p style="font-size: 20px; font-weight: 700; margin: 0; color: #111827;">${entityName}</p>
      <p style="font-size: 12px; color: #6b7280; margin: 4px 0 0 0;">Organisme de formation professionnelle</p>
    </div>
    <img src="${logoSrc}" alt="${entityName}" style="width: 80px; height: auto; object-fit: contain;" />
  </div>

  <!-- Title -->
  <h1 style="font-size: 22px; font-weight: 700; text-align: center; text-transform: uppercase; color: #111827; margin: 0 0 32px 0; letter-spacing: 1px;">${title}</h1>

  <!-- Body -->
  ${body}

  <!-- Footer -->
  <div style="border-top: 1px solid #e5e7eb; margin-top: 48px; padding-top: 16px;">
    <p style="font-size: 11px; color: #9ca3af; margin: 0; text-align: center;">
      Document généré le ${todayFr()} — ${entityName}
    </p>
  </div>
</div>`;
}

function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding: 8px 12px; font-weight: 600; color: #374151; white-space: nowrap; vertical-align: top;">${label}</td>
    <td style="padding: 8px 12px; color: #1e293b;">${value}</td>
  </tr>`;
}

function infoTable(rows: string): string {
  return `<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; background: #f9fafb; border-radius: 8px; overflow: hidden;">
    <tbody>${rows}</tbody>
  </table>`;
}

// ──────────────────────────────────────────────
// Templates
// ──────────────────────────────────────────────

function convocation(data: TemplateData): string {
  const { formation, learner, entityName } = data;
  const fullName = learner ? `${learner.first_name} ${learner.last_name}` : "—";

  const body = `
    <p style="margin-bottom: 24px;">Madame, Monsieur <strong>${fullName}</strong>,</p>
    <p style="margin-bottom: 24px;">Nous avons le plaisir de vous confirmer votre inscription à la formation suivante :</p>
    ${infoTable(
      infoRow("Formation", formation.title || "—") +
      infoRow("Date de début", formatDateFr(formation.start_date)) +
      infoRow("Date de fin", formatDateFr(formation.end_date)) +
      infoRow("Lieu", formation.location || "À distance") +
      infoRow("Modalité", formation.mode || "—") +
      infoRow("Durée", formation.planned_hours ? `${formation.planned_hours} heure(s)` : "—")
    )}
    <p style="margin-bottom: 16px;">Nous vous invitons à vous présenter <strong>15 minutes avant le début de la formation</strong> muni(e) d'une pièce d'identité.</p>
    <p style="margin-bottom: 16px;">Pour toute question, n'hésitez pas à nous contacter.</p>
    <p style="margin-top: 32px;">Cordialement,<br/><strong>${entityName}</strong></p>`;

  return wrap(entityName, "Convocation à la formation", body);
}

function certificatRealisation(data: TemplateData): string {
  const { formation, learner, entityName } = data;
  const fullName = learner ? `${learner.first_name} ${learner.last_name}` : "—";

  const body = `
    <p style="margin-bottom: 24px;">Je soussigné(e), responsable de l'organisme de formation <strong>${entityName}</strong>, atteste que :</p>
    ${infoTable(
      infoRow("Participant(e)", fullName) +
      infoRow("Formation", formation.title || "—") +
      infoRow("Du", formatDateFr(formation.start_date)) +
      infoRow("Au", formatDateFr(formation.end_date)) +
      infoRow("Lieu", formation.location || "À distance") +
      infoRow("Durée", formation.planned_hours ? `${formation.planned_hours} heure(s)` : "—")
    )}
    <p style="margin-bottom: 24px;">a bien suivi l'intégralité de l'action de formation citée ci-dessus.</p>
    <p style="margin-bottom: 8px;">Fait pour servir et valoir ce que de droit.</p>
    <p style="margin-bottom: 32px;">Fait à ${formation.location || "—"}, le ${todayFr()}</p>
    <div style="display: flex; justify-content: space-between; margin-top: 40px;">
      <div>
        <p style="font-size: 12px; color: #6b7280; margin: 0 0 48px 0;">Le responsable de l'organisme</p>
        <div style="border-bottom: 1px solid #d1d5db; width: 200px;"></div>
      </div>
      <div>
        <p style="font-size: 12px; color: #6b7280; margin: 0 0 48px 0;">Le/La participant(e)</p>
        <div style="border-bottom: 1px solid #d1d5db; width: 200px;"></div>
      </div>
    </div>`;

  return wrap(entityName, "Certificat de réalisation", body);
}

function attestationAssiduite(data: TemplateData): string {
  const { formation, learner, entityName } = data;
  const fullName = learner ? `${learner.first_name} ${learner.last_name}` : "—";

  const body = `
    <p style="margin-bottom: 24px;">Je soussigné(e), responsable de l'organisme de formation <strong>${entityName}</strong>, atteste que :</p>
    ${infoTable(
      infoRow("Participant(e)", fullName) +
      infoRow("Formation", formation.title || "—") +
      infoRow("Période", `Du ${formatDateFr(formation.start_date)} au ${formatDateFr(formation.end_date)}`) +
      infoRow("Durée totale", formation.planned_hours ? `${formation.planned_hours} heure(s)` : "—")
    )}
    <p style="margin-bottom: 24px;">a suivi la formation avec <strong>assiduité</strong> pour la durée totale indiquée ci-dessus.</p>
    <p style="margin-bottom: 8px;">Fait pour servir et valoir ce que de droit.</p>
    <p style="margin-bottom: 32px;">Fait à ${formation.location || "—"}, le ${todayFr()}</p>
    <div style="margin-top: 40px;">
      <p style="font-size: 12px; color: #6b7280; margin: 0 0 48px 0;">Signature et cachet de l'organisme</p>
      <div style="border-bottom: 1px solid #d1d5db; width: 200px;"></div>
    </div>`;

  return wrap(entityName, "Attestation d'assiduité", body);
}

function feuilleEmargement(data: TemplateData): string {
  const { formation, learner, entityName } = data;
  const fullName = learner ? `${learner.first_name} ${learner.last_name}` : "—";

  const body = `
    ${infoTable(
      infoRow("Formation", formation.title || "—") +
      infoRow("Période", `Du ${formatDateFr(formation.start_date)} au ${formatDateFr(formation.end_date)}`) +
      infoRow("Lieu", formation.location || "À distance")
    )}
    <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
      <thead>
        <tr style="background: #f3f4f6;">
          <th style="border: 1px solid #d1d5db; padding: 10px; text-align: left; font-size: 13px;">Participant(e)</th>
          <th style="border: 1px solid #d1d5db; padding: 10px; text-align: center; font-size: 13px;">Matin</th>
          <th style="border: 1px solid #d1d5db; padding: 10px; text-align: center; font-size: 13px;">Après-midi</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="border: 1px solid #d1d5db; padding: 10px; font-size: 13px;">${fullName}</td>
          <td style="border: 1px solid #d1d5db; padding: 10px; height: 50px;"></td>
          <td style="border: 1px solid #d1d5db; padding: 10px; height: 50px;"></td>
        </tr>
      </tbody>
    </table>
    <p style="font-size: 11px; color: #9ca3af; margin-top: 16px;">Chaque participant doit émarger par demi-journée.</p>`;

  return wrap(entityName, "Feuille d'émargement", body);
}

function conventionEntreprise(data: TemplateData): string {
  const { formation, company, entityName } = data;
  const companyName = company?.company_name || "—";

  const body = `
    <p style="margin-bottom: 24px; font-weight: 600;">Entre les soussignés :</p>
    ${infoTable(
      infoRow("Organisme de formation", entityName) +
      infoRow("Ci-après dénommé", "« Le prestataire »")
    )}
    ${infoTable(
      infoRow("Entreprise", companyName) +
      infoRow("Ci-après dénommée", "« Le client »")
    )}
    <p style="font-weight: 600; margin-bottom: 16px;">Il a été convenu ce qui suit :</p>
    <p style="font-weight: 600; margin: 24px 0 8px 0;">Article 1 — Objet</p>
    <p style="margin-bottom: 16px;">Le prestataire s'engage à organiser l'action de formation suivante :</p>
    ${infoTable(
      infoRow("Intitulé", formation.title || "—") +
      infoRow("Du", formatDateFr(formation.start_date)) +
      infoRow("Au", formatDateFr(formation.end_date)) +
      infoRow("Lieu", formation.location || "À distance") +
      infoRow("Durée", formation.planned_hours ? `${formation.planned_hours} heure(s)` : "—") +
      infoRow("Prix", formation.total_price ? `${Number(formation.total_price).toFixed(2)} € HT` : "—")
    )}
    <p style="font-weight: 600; margin: 24px 0 8px 0;">Article 2 — Modalités de paiement</p>
    <p style="margin-bottom: 16px;">Le règlement du prix de la formation est dû à réception de la facture. Tout retard de paiement entraînera l'application de pénalités conformément à la réglementation en vigueur.</p>
    <p style="font-weight: 600; margin: 24px 0 8px 0;">Article 3 — Annulation</p>
    <p style="margin-bottom: 24px;">Toute annulation doit être signalée par écrit au moins 10 jours ouvrés avant le début de la formation.</p>
    <div style="display: flex; justify-content: space-between; margin-top: 48px;">
      <div>
        <p style="font-size: 12px; color: #6b7280; margin: 0;">Pour le prestataire</p>
        <p style="font-weight: 600; margin: 4px 0 48px 0;">${entityName}</p>
        <div style="border-bottom: 1px solid #d1d5db; width: 200px;"></div>
        <p style="font-size: 11px; color: #9ca3af; margin-top: 4px;">Date et signature</p>
      </div>
      <div>
        <p style="font-size: 12px; color: #6b7280; margin: 0;">Pour le client</p>
        <p style="font-weight: 600; margin: 4px 0 48px 0;">${companyName}</p>
        <div style="border-bottom: 1px solid #d1d5db; width: 200px;"></div>
        <p style="font-size: 11px; color: #9ca3af; margin-top: 4px;">Date et signature</p>
      </div>
    </div>`;

  return wrap(entityName, "Convention de formation", body);
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

const GENERATORS: Record<string, (data: TemplateData) => string> = {
  convocation,
  certificat_realisation: certificatRealisation,
  attestation_assiduite: attestationAssiduite,
  feuille_emargement: feuilleEmargement,
  convention_entreprise: conventionEntreprise,
};

export function getDefaultTemplate(docType: string, data: TemplateData): string | null {
  const generator = GENERATORS[docType];
  if (!generator) return null;
  return generator(data);
}
