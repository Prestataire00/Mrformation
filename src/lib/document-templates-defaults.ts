import type { Session } from "@/lib/types";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface TemplateData {
  formation: Session;
  learner?: { id?: string; first_name: string; last_name: string; email?: string };
  company?: { company_name: string; address?: string | null; siret?: string | null; contacts?: Array<{ first_name: string; last_name: string; is_primary: boolean }> };
  trainer?: { first_name: string; last_name: string };
  entityName: string;
  // Heures effectives (calculées depuis signatures)
  effectiveHours?: number;
  attendanceRate?: number;
  signedSlots?: Array<{ date: string; hours: number }>;
  // Magic link pour apprenants
  magicLinkUrl?: string;
  qrCodeDataUrl?: string;
  missedSlots?: Array<{ date: string; hours: number }>;
  // Date figée du document (exigence Qualiopi)
  doc?: { document_date?: string | null; confirmed_at?: string | null };
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function formatDateFr(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateFrLong(dateStr: string | null | undefined): string {
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

function todayFrShort(): string {
  return new Date().toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Résout la date "officielle" d'un document pour affichage PDF.
 * Priorité : document_date > confirmed_at > aujourd'hui.
 * Une fois confirmé, la date ne change plus (exigence Qualiopi).
 */
function docDate(doc?: { document_date?: string | null; confirmed_at?: string | null }): string {
  if (doc?.document_date) return formatDateFr(doc.document_date);
  if (doc?.confirmed_at) return formatDateFr(doc.confirmed_at);
  return todayFrShort();
}

function docDateLong(doc?: { document_date?: string | null; confirmed_at?: string | null }): string {
  if (doc?.document_date) return formatDateFrLong(doc.document_date);
  if (doc?.confirmed_at) return formatDateFrLong(doc.confirmed_at);
  return todayFr();
}

function getLogoPath(entityName: string): string {
  if (entityName.toLowerCase().includes("c3v")) return "/logo-c3v-formation.png";
  return "/logo-mr-formation.png";
}

function getCompanyInfo(entityName: string) {
  if (entityName.toLowerCase().includes("c3v")) {
    return {
      name: "C3V FORMATION",
      address: "24/26 Boulevard Gay Lussac 13014 Marseille",
      email: "contact@c3vformation.fr",
      tel: "0750461245",
      website: "http://www.c3vformation.fr",
      siret: "à compléter",
      nda: "à compléter",
      region: "PACA",
      president: "VICHOT Marc",
    };
  }
  return {
    name: "MR FORMATION",
    address: "24/26 Boulevard Gay Lussac 13014 Marseille",
    email: "contact@mrformation.fr",
    tel: "0750461245",
    website: "http://www.mrformation.fr",
    siret: "91311329600036",
    nda: "93132013113",
    region: "PACA",
    president: "VICHOT Marc",
  };
}

function signatureToDataUrl(svgData: string): string {
  if (svgData.startsWith("data:")) return svgData;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgData)))}`;
}

function findSignature(
  signatures: Array<{ time_slot_id?: string | null; signer_id?: string | null; signer_type?: string | null; signature_data?: string | null; signed_at?: string | null }>,
  slotId: string,
  signerId: string,
  signerType: string
): { signature_data: string; signed_at: string } | null {
  const sig = signatures.find(
    (s) => s.time_slot_id === slotId && s.signer_id === signerId && s.signer_type === signerType && s.signature_data
  );
  return sig ? { signature_data: sig.signature_data!, signed_at: sig.signed_at || "" } : null;
}

function renderSignatureCell(
  sig: { signature_data: string; signed_at: string } | null,
  slotIsPast: boolean,
  height: string = "50px"
): string {
  if (sig) {
    const dataUrl = signatureToDataUrl(sig.signature_data);
    return `<div style="text-align:center;">
      <img src="${dataUrl}" alt="Signature" style="max-width:120px;height:${height};object-fit:contain;" />
    </div>`;
  }
  if (slotIsPast) {
    return `<span style="color:#ef4444;font-size:9px;font-style:italic;">Non signé</span>`;
  }
  return "";
}

const MODE_LABELS: Record<string, string> = {
  presentiel: "En présentiel",
  distanciel: "À distance",
  hybride: "Hybride",
};

// ──────────────────────────────────────────────
// Wrapper HTML
// ──────────────────────────────────────────────

function header(entityName: string): string {
  const co = getCompanyInfo(entityName);
  const logoSrc = getLogoPath(entityName);
  return `<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px;">
    <div>
      <p style="font-size: 18px; font-weight: 700; margin: 0; color: #111827;">${co.name}</p>
      <p style="font-size: 10px; color: #6b7280; margin: 2px 0 0 0;">${co.address}</p>
      <p style="font-size: 10px; color: #6b7280; margin: 1px 0;">Email: ${co.email}</p>
      <p style="font-size: 10px; color: #6b7280; margin: 1px 0;">Tel: ${co.tel}</p>
      <p style="font-size: 10px; color: #6b7280; margin: 1px 0;">${co.website}</p>
    </div>
    <img src="${logoSrc}" alt="${co.name}" style="width: 90px; height: auto; object-fit: contain;" />
  </div>`;
}

function footer(entityName: string): string {
  const co = getCompanyInfo(entityName);
  return `<div style="border-top: 1px solid #e5e7eb; margin-top: 40px; padding-top: 12px;">
    <p style="font-size: 9px; color: #9ca3af; margin: 0; text-align: center; font-style: italic;">
      ${co.name}, ${co.address} , Numéro SIRET: ${co.siret}, Numéro de déclaration d'activité: ${co.nda}
    </p>
    <p style="font-size: 9px; color: #9ca3af; margin: 2px 0 0 0; text-align: center; font-style: italic;">
      (auprès du préfet de région de: ${co.region})
    </p>
  </div>`;
}

function wrap(entityName: string, title: string, body: string): string {
  return `<div style="font-family: Helvetica, Arial, sans-serif; color: #1e293b; max-width: 794px; margin: 0 auto; padding: 32px 40px; line-height: 1.5; font-size: 12px;">
  ${header(entityName)}
  <h1 style="font-size: 18px; font-weight: 700; text-align: center; text-transform: uppercase; color: #111827; margin: 0 0 24px 0; letter-spacing: 0.5px;">${title}</h1>
  ${body}
  ${footer(entityName)}
</div>`;
}

function article(num: string, title: string, content: string): string {
  return `<div style="margin-bottom: 16px;">
    <p style="font-weight: 700; margin: 0 0 6px 0; font-size: 12px;">${num ? `Article ${num} : ` : ""}${title}</p>
    <div style="font-size: 11px; line-height: 1.6;">${content}</div>
  </div>`;
}

function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding: 6px 10px; font-weight: 600; color: #374151; white-space: nowrap; vertical-align: top; font-size: 11px;">${label}</td>
    <td style="padding: 6px 10px; color: #1e293b; font-size: 11px;">${value}</td>
  </tr>`;
}

function infoTable(rows: string): string {
  return `<table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; background: #f9fafb; border-radius: 6px; overflow: hidden;">
    <tbody>${rows}</tbody>
  </table>`;
}

// ──────────────────────────────────────────────
// DOCUMENT 1 — CONVENTION DE FORMATION
// ──────────────────────────────────────────────

function conventionEntreprise(data: TemplateData): string {
  const { formation, company, entityName } = data;
  const co = getCompanyInfo(entityName);
  const companyName = company?.company_name || "[Nom client]";
  const companyAddress = company?.address || "[Adresse client]";
  const companySiret = company?.siret || "[SIRET client]";
  const representant = company?.contacts?.length
    ? `${company.contacts.find((c) => c.is_primary)?.last_name?.toUpperCase() || company.contacts[0].last_name.toUpperCase()} ${company.contacts.find((c) => c.is_primary)?.first_name || company.contacts[0].first_name}`
    : "[Représentant]";

  const enrollments = formation.enrollments || [];
  const effectifs = enrollments.length || "[Effectifs]";
  const listeApprenants = enrollments
    .filter((e) => e.learner)
    .map((e) => `${e.learner!.last_name?.toUpperCase()} ${e.learner!.first_name}`)
    .join(", ") || "[Liste apprenants]";

  const totalPrice = formation.total_price || 0;
  const montantHt = totalPrice.toFixed(2);
  const tva = (totalPrice * 0.2).toFixed(2);
  const ttc = (totalPrice * 1.2).toFixed(2);

  const body = `
    <p style="font-size: 10px; text-align: center; color: #6b7280; margin: -16px 0 20px 0;">(Articles L.6353-1 et D.6353-1 du Code du travail)</p>

    <p style="margin-bottom: 12px;">Entre les soussignés :</p>

    <p style="margin-bottom: 12px;">1) <strong>${co.name}</strong> enregistré sous le numéro de déclaration d'activité : ${co.nda} auprès de la Direction Régionale de l'Economie, de l'Emploi, du Travail et des Solidarités (DREETS) ${co.region}, Représenté par Monsieur ${co.president}, en qualité de : Président</p>

    <p style="text-align: center; margin: 12px 0; font-style: italic;">et</p>

    <p style="margin-bottom: 12px;">2) <strong>${companyName}</strong>, Adresse : ${companyAddress}, SIRET : ${companySiret}</p>
    <p style="margin-bottom: 16px;">Représentée par ${representant}. Est conclue la convention suivante, en application des dispositions du Livre III de la Sixième partie du Code du travail portant organisation de la formation professionnelle continue.</p>

    ${article("1er", "Objet de la convention", `
      <p>L'organisme nommé ci-dessus organisera l'action de formation suivante :</p>
      <ul style="margin: 8px 0; padding-left: 20px;">
        <li>Intitulé du stage : <strong>${formation.title}</strong></li>
        <li>Type d'action de formation (article L.6313-1 du Code du travail) : Action de formation</li>
        <li>Objectifs, modalités et méthodes : Voir programme en annexe</li>
        <li>Dates : Du ${formatDateFr(formation.start_date)} au ${formatDateFr(formation.end_date)}</li>
        <li>Durée : ${formation.planned_hours || "[Durée]"} heure(s)</li>
        <li>Lieu : ${formation.location || "[Lieu]"}</li>
      </ul>
    `)}

    ${article("2", "Effectif formé", `
      <p>Nombre de participants : <strong>${effectifs}</strong></p>
      <p>NOM Prénom des stagiaires : ${listeApprenants}</p>
    `)}

    ${article("3", "Dispositions financières", `
      <p>Le coût de la formation, objet de la présente convention, s'élève à : <strong>${montantHt}€</strong> soit <strong>${ttc}€ TTC</strong> (TVA 20% = ${tva}€), frais de déplacement de l'intervenant(e) inclus.</p>
    `)}

    ${article("4", "Modalités de règlement", `
      <p>En application de l'article L441-6 du code de commerce, il est convenu entre les signataires de la présente convention, que les sommes dues devront être réglées afin de mois date de facturation. Toute somme, y compris l'acompte, non payée à sa date d'exigibilité pourra produire de plein droit des intérêts de retard équivalents au triple du taux d'intérêt légal de l'année en cours ainsi que le paiement d'une somme forfaitaire de 40 euros due au titre des frais de recouvrement. En contrepartie des sommes reçues, l'organisme de formation s'engage à fournir tout document et pièce de nature à justifier la réalité et la validité des dépenses de formation engagées à ce titre. Dans la mesure où l'organisme de formation édite la présente convention de formation pour l'action commandée, il revient à l'entreprise de vérifier l'imputabilité de celle-ci.</p>
    `)}

    ${article("5", "Dédit ou abandon", `
      <p>Toute formation ou cycle commencé est dû en totalité, sauf accord contraire exprès de ${co.name}. Toute annulation d'une formation à l'initiative du Client devra être communiquée par écrit dans les conditions qui suivent : Pour les formations Inter et intra entreprises (hors Cycles et Parcours) : La demande devra être communiquée au moins dix (10) jours calendaires avant le début de la formation. A défaut, un montant forfaitaire restera immédiatement exigible à titre d'indemnité forfaitaire. Pour les Cycles et Parcours : La demande devra être communiquée au moins quinze (15) jours calendaires avant le début de la formation. A défaut, un montant forfaitaire de la formation restera immédiatement exigible à titre d'indemnité forfaitaire.</p>
    `)}

    ${article("6", "Matériels mis à disposition de l'organisme de formation", `
      <p>Dans le cas de formation en intra entreprise dans le respect des contenus du programme de formation, l'entreprise s'engage à mettre à titre gratuit à la disposition de l'organisme de formation pendant l'intégralité de la durée de l'action de formation : une salle équipée de tables et de chaises en nombre suffisant, un mur de projection. Le matériel spécifique à la formation et matériel stagiaire nécessaire sont précisés sur la convocation à la formation. Dans le cas des formations intra entreprise, l'article sur la sécurité et l'hygiène du règlement intérieur du client s'appliquera, notre livret d'accueil reprenant tous les éléments nécessaires est disponible sur notre site internet.</p>
    `)}

    ${article("7", "Replacement d'un participant", `
      <p>Quel que soit le type de la formation, sur demande écrite avant le début de la formation, le Client a la possibilité de remplacer un participant sans facturation supplémentaire.</p>
    `)}

    ${article("8", "Règlement par un Opérateur de Compétences", `
      <p>Si le Client souhaite que le règlement soit exécuté par l'Opérateur de Compétences dont il dépend, il lui appartient :</p>
      <ul style="margin: 8px 0; padding-left: 20px;">
        <li>de faire une demande de prise en charge avant le début de la formation et de s'assurer de la bonne fin de cette demande ;</li>
        <li>de l'indiquer explicitement sur son bon de commande ;</li>
        <li>de s'assurer de la bonne fin du paiement par l'Opérateur de Compétences qu'il aura désigné.</li>
      </ul>
      <p>Si l'Opérateur de Compétences ne prend en charge que partiellement le coût de la formation, le reliquat sera facturé au Client. Si ${co.name} n'a pas reçu la prise en charge de l'Opérateur de Compétences au 1er jour de la formation, le Client sera facturé de l'intégralité du coût de la formation concernée par ce financement. En cas de non-paiement par l'Opérateur de Compétences, pour quelque motif que ce soit à la faute du client, le client sera redevable de l'intégralité du coût de la formation et sera facturé du montant correspondant cependant en cas de subrogation de paiement ${co.name} est responsable de la gestion du paiement de ses factures.</p>
    `)}

    ${article("9", "Obligations du Client", `
      <p>Le Client s'engage à :</p>
      <ul style="margin: 8px 0; padding-left: 20px;">
        <li>payer le prix de la formation ;</li>
        <li>n'effectuer aucune reproduction de matériel ou documents dont les droits d'auteur appartiennent à ${co.name}, sans l'accord écrit et préalable de ce dernier ; et</li>
        <li>ne pas utiliser de matériel d'enregistrement audio ou vidéo lors des formations, sans l'accord écrit et préalable de ${co.name}.</li>
      </ul>
    `)}

    ${article("10", "Différends éventuels", `
      <p>Si une contestation ou un différend ne peuvent être réglés à l'amiable, le Tribunal de Salon de Provence sera seul compétent pour régler le litige.</p>
    `)}

    <div style="margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 16px;">
      <p>Date du terme de la convention : ${formatDateFr(formation.end_date)}</p>
      <p>Convention établie en double exemplaires à Marseille, le ${docDate(data.doc)}</p>
      <p style="font-style: italic; font-size: 10px; color: #6b7280; margin-top: 8px;">La signature de cette convention vaut acceptation du livret d'accueil disponible sur notre site internet.</p>
    </div>

    <div style="display: flex; justify-content: space-between; margin-top: 32px;">
      <div>
        <p style="font-size: 11px; color: #6b7280; margin: 0;">Pour l'organisme de formation,</p>
        <p style="font-weight: 600; margin: 4px 0;">${co.name},</p>
        <p style="margin: 0 0 48px 0;">${co.president}</p>
        <div style="border-bottom: 1px solid #d1d5db; width: 200px;"></div>
      </div>
      <div>
        <p style="font-size: 11px; color: #6b7280; margin: 0;">Pour le bénéficiaire</p>
        <p style="font-weight: 600; margin: 4px 0;">${companyName},</p>
        <p style="margin: 0 0 48px 0;">${representant}</p>
        <div style="border-bottom: 1px solid #d1d5db; width: 200px;"></div>
      </div>
    </div>`;

  return wrap(entityName, "Convention de formation professionnelle", body);
}

// ──────────────────────────────────────────────
// DOCUMENT 2 — FEUILLE D'ÉMARGEMENT (HTML)
// ──────────────────────────────────────────────

function feuilleEmargement(data: TemplateData): string {
  const { formation, learner, company, entityName } = data;
  const co = getCompanyInfo(entityName);
  const companyName = company?.company_name || "";
  const modalite = MODE_LABELS[formation.mode] || formation.mode;
  const enrollments = formation.enrollments || [];
  const trainers = formation.formation_trainers || [];
  const timeSlots = formation.formation_time_slots || [];
  const signatures = formation.signatures || [];
  const formateursNoms = trainers.filter((ft) => ft.trainer).map((ft) => `${ft.trainer!.last_name?.toUpperCase()} ${ft.trainer!.first_name}`).join(", ") || "[Formateur]";

  // ── Format INDIVIDUEL (Document 10) quand learner est passé ──
  if (learner) {
    const fullName = `${learner.last_name?.toUpperCase()} ${learner.first_name}`;
    const learnerId = learner.id || enrollments.find((e) => e.learner?.last_name === learner.last_name && e.learner?.first_name === learner.first_name)?.learner?.id;
    const now = new Date();

    const infoBlock = `
      <div style="border: 1px solid #333; padding: 12px 16px; margin-bottom: 20px; font-size: 12px; line-height: 1.8;">
        Nom du stagiaire: <strong>${fullName}</strong><br/>
        Nom de la formation: <strong>${formation.title}</strong><br/>
        Date de la formation: du <strong>${formatDateFr(formation.start_date)}</strong> au <strong>${formatDateFr(formation.end_date)}</strong><br/>
        Lieu de la formation: <strong>${modalite}</strong><br/>
        Durée: <strong>${formation.planned_hours || "—"} heure(s)</strong> heures<br/>
        Prestataire de la formation: <strong>${co.name} N° de déclaration d'activité: ${co.nda}</strong><br/>
        Formateur(s): ${formateursNoms}
      </div>`;

    let slotBlocks = "";
    for (const slot of timeSlots) {
      const dateStr = formatDateFr(slot.start_time);
      const startTime = new Date(slot.start_time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
      const endTime = new Date(slot.end_time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
      const slotIsPast = new Date(slot.end_time) < now;

      // Find actual signature objects for this slot
      const trainerSigBlocks = trainers.filter((ft) => ft.trainer).map((ft) => {
        const sig = findSignature(signatures, slot.id, ft.trainer!.id, "trainer");
        return `
          <tr>
            <td style="border:1px solid #d1d5db;padding:8px 10px;font-size:11px;width:40%;">${ft.trainer!.last_name?.toUpperCase()} ${ft.trainer!.first_name} <span style="color:#6b7280;font-size:9px;">(Formateur)</span></td>
            <td style="border:1px solid #d1d5db;padding:8px 10px;text-align:center;height:60px;">${renderSignatureCell(sig, slotIsPast)}</td>
          </tr>`;
      }).join("");

      const learnerSig = learnerId ? findSignature(signatures, slot.id, learnerId, "learner") : null;
      const learnerSigBlock = `
        <tr>
          <td style="border:1px solid #d1d5db;padding:8px 10px;font-size:11px;font-weight:600;width:40%;">${fullName} <span style="color:#6b7280;font-size:9px;">(Apprenant)</span></td>
          <td style="border:1px solid #d1d5db;padding:8px 10px;text-align:center;height:60px;">${renderSignatureCell(learnerSig, slotIsPast)}</td>
        </tr>`;

      slotBlocks += `
        <div style="margin-bottom: 16px;">
          <p style="font-weight:600;font-size:11px;margin:0 0 6px;color:#374151;">Créneau: ${dateStr} — ${startTime} à ${endTime}</p>
          <table style="width:100%;border-collapse:collapse;">
            <tr style="background:#f3f4f6;">
              <th style="border:1px solid #d1d5db;padding:6px 10px;text-align:left;font-size:10px;width:40%;">Nom</th>
              <th style="border:1px solid #d1d5db;padding:6px 10px;text-align:center;font-size:10px;">Signature</th>
            </tr>
            ${trainerSigBlocks}
            ${learnerSigBlock}
          </table>
        </div>`;
    }

    const legend = `
      <div style="margin-top:20px;padding:10px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;font-size:9px;color:#6b7280;">
        <strong>Légende :</strong> Les signatures électroniques affichées ci-dessus ont été apposées via la plateforme ${co.name}.
        <span style="color:#ef4444;">Non signé</span> = créneau passé sans signature enregistrée.
        Document généré le ${docDateLong(data.doc)}.
      </div>`;

    const body = `
      ${infoBlock}
      <h2 style="text-align: center; font-weight: 700; font-size: 14px; margin: 20px 0 12px 0;">Tableau de signature</h2>
      ${slotBlocks.length > 0 ? slotBlocks : `<p style="color: #999; font-style: italic;">Aucun créneau planifié.</p>`}
      ${legend}`;

    return wrap(entityName, "Feuille d'émargement", body);
  }

  // ── Format COLLECTIF (Document 2) — pas de learner passé ──

  const now = new Date();
  const contextLine = `Formation : ${formation.title} - Lieu de formation : ${modalite} (${formation.location || "—"}) - Client : ${companyName}`;

  // Info block
  const infoBlock = `
    <div style="border: 1px solid #d1d5db; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; font-size: 11px;">
      <p style="margin: 2px 0;">Entreprise: <strong>${companyName || "—"}</strong></p>
      <p style="margin: 2px 0;">Nom de la formation: <strong>${formation.title}</strong></p>
      <p style="margin: 2px 0;">Date de la formation: du ${formatDateFr(formation.start_date)} au ${formatDateFr(formation.end_date)}</p>
      <p style="margin: 2px 0;">Lieu de la formation: ${modalite} - ${formation.location || "—"} - ${companyName}</p>
      <p style="margin: 2px 0;">Durée: ${formation.planned_hours || "—"} heure(s)</p>
      <p style="margin: 2px 0;">Prestataire de la formation: ${co.name} N° de déclaration d'activité: ${co.nda}</p>
      <p style="margin: 2px 0;">Formateur(s): ${formateursNoms}</p>
    </div>`;

  // Signature tables per time slot
  let slotTables = "";
  if (timeSlots.length > 0) {
    for (const slot of timeSlots) {
      const start = new Date(slot.start_time);
      const end = new Date(slot.end_time);
      const hour = start.getHours();
      const period = hour < 13 ? "MATIN" : "APRES MIDI";
      const dateStr = formatDateFr(slot.start_time);
      const startTime = start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
      const endTime = end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
      const slotIsPast = end < now;

      slotTables += `
        <p style="font-weight: 600; margin: 16px 0 8px 0; font-size: 11px;">Créneau: De ${dateStr} - ${startTime} À ${dateStr} - ${endTime} (${period})</p>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
          <tr style="background: #f3f4f6;">
            <th style="border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; font-size: 10px; width: 40%;">Formateurs</th>
            <th style="border: 1px solid #d1d5db; padding: 6px 8px; text-align: center; font-size: 10px;">Signature</th>
          </tr>
          ${trainers.filter((ft) => ft.trainer).map((ft) => {
            const sig = findSignature(signatures, slot.id, ft.trainer!.id, "trainer");
            return `
            <tr>
              <td style="border: 1px solid #d1d5db; padding: 6px 8px; font-size: 10px;">${ft.trainer!.last_name?.toUpperCase()} ${ft.trainer!.first_name}</td>
              <td style="border: 1px solid #d1d5db; padding: 6px 8px; height: 60px; text-align: center;">${renderSignatureCell(sig, slotIsPast)}</td>
            </tr>`;
          }).join("")}
        </table>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
          <tr style="background: #f3f4f6;">
            <th style="border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; font-size: 10px; width: 40%;">Apprenants</th>
            <th style="border: 1px solid #d1d5db; padding: 6px 8px; text-align: center; font-size: 10px;">Signature</th>
          </tr>
          ${enrollments.filter((e) => e.learner).map((e) => {
            const sig = findSignature(signatures, slot.id, e.learner!.id, "learner");
            return `
            <tr>
              <td style="border: 1px solid #d1d5db; padding: 6px 8px; font-size: 10px;">${e.learner!.last_name?.toUpperCase()} ${e.learner!.first_name}</td>
              <td style="border: 1px solid #d1d5db; padding: 6px 8px; height: 60px; text-align: center;">${renderSignatureCell(sig, slotIsPast)}</td>
            </tr>`;
          }).join("")}
        </table>`;
    }
  } else {
    slotTables = `<p style="color: #9ca3af; font-style: italic;">Aucun créneau planifié.</p>`;
  }

  const legend = `
    <div style="margin-top:20px;padding:10px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;font-size:9px;color:#6b7280;">
      <strong>Légende :</strong> Les signatures électroniques affichées ci-dessus ont été apposées via la plateforme ${co.name}.
      <span style="color:#ef4444;">Non signé</span> = créneau passé sans signature enregistrée.
      Document généré le ${docDateLong(data.doc)}.
    </div>`;

  const body = `
    <p style="font-size: 10px; text-align: center; color: #6b7280; font-style: italic; margin: -16px 0 16px 0;">${contextLine}</p>
    ${infoBlock}
    <h2 style="font-size: 14px; font-weight: 700; margin: 20px 0 12px 0;">Tableau de signature</h2>
    ${slotTables}
    ${legend}`;

  return wrap(entityName, "Feuille d'émargement", body);
}

// ──────────────────────────────────────────────
// DOCUMENT 3 — PROGRAMME DE FORMATION
// ──────────────────────────────────────────────

function programmeFormation(data: TemplateData): string {
  const { formation, entityName } = data;
  const program = formation.program;
  const programContent = (program?.content || {}) as Record<string, string>;
  const modalite = MODE_LABELS[formation.mode] || formation.mode;

  const body = `
    <p style="font-size: 11px; color: #6b7280; margin-bottom: 16px;">${formation.description || program?.description || ""}</p>

    <p style="font-size: 10px; color: #6b7280; margin-bottom: 4px;">
      Date de creation: ${formation.created_at ? formatDateFr(formation.created_at) : "—"} | Durée: ${formation.planned_hours || program?.duration_hours || "—"} heure(s) | ${formation.planned_hours ? (Number(formation.planned_hours) / 7).toFixed(2) : "—"} jour(s) (du ${formatDateFr(formation.start_date)} au ${formatDateFr(formation.end_date)})
    </p>
    <p style="font-size: 10px; color: #6b7280; margin-bottom: 16px;">
      Version : ${program?.version || "1"} | Modalité : ${modalite} | Lieu : ${formation.location || "—"}
    </p>

    <h2 style="font-size: 13px; font-weight: 700; text-transform: uppercase; margin: 20px 0 8px 0; color: #111827;">A qui s'adresse cette formation ?</h2>
    <p style="font-size: 11px;"><strong>Profil du stagiaire :</strong> ${programContent.target_audience || "[Public cible]"}</p>
    <p style="font-size: 11px;"><strong>Prérequis :</strong> ${programContent.prerequisites || "aucun"}</p>

    <h2 style="font-size: 13px; font-weight: 700; text-transform: uppercase; margin: 20px 0 8px 0; color: #111827;">Objectifs pédagogiques</h2>
    ${program?.objectives
      ? `<ul style="margin: 4px 0; padding-left: 20px; font-size: 11px;">${program.objectives.split("\n").filter(Boolean).map((o: string) => `<li>${o.replace(/^[-•]\s*/, "")}</li>`).join("")}</ul>`
      : "<p style='font-size: 11px; color: #9ca3af;'>[Objectifs pédagogiques]</p>"
    }

    <h2 style="font-size: 13px; font-weight: 700; text-transform: uppercase; margin: 20px 0 8px 0; color: #111827;">Contenu (progression pédagogique)</h2>
    ${programContent.progression
      ? `<div style="font-size: 11px; white-space: pre-line;">${programContent.progression}</div>`
      : "<p style='font-size: 11px; color: #9ca3af;'>[Contenu du programme]</p>"
    }

    <h2 style="font-size: 13px; font-weight: 700; text-transform: uppercase; margin: 20px 0 8px 0; color: #111827;">Organisation</h2>
    <p style="font-size: 11px; font-weight: 600;">Moyens pédagogiques et techniques</p>
    ${programContent.teaching_methods
      ? `<div style="font-size: 11px; white-space: pre-line;">${programContent.teaching_methods}</div>`
      : `<ul style="margin: 4px 0; padding-left: 20px; font-size: 11px;">
          <li>Alternance d'apports théoriques et d'ateliers pratiques. Mises en situation et analyse de situations.</li>
          <li>Pour faciliter l'ancrage et conformément à l'ADN ${getCompanyInfo(entityName).name}, nos ateliers utilisent la Ludo pédagogie : jeux, simulations, quizz…</li>
          <li>Remise d'un support de synthèse</li>
        </ul>`
    }

    <p style="font-size: 11px; font-weight: 600; margin-top: 12px;">Dispositif de suivi de l'exécution et d'évaluation des résultats de la formation</p>
    ${programContent.evaluation_methods
      ? `<div style="font-size: 11px; white-space: pre-line;">${programContent.evaluation_methods}</div>`
      : `<ul style="margin: 4px 0; padding-left: 20px; font-size: 11px;">
          <li>Évaluation des acquis en cours de formation via des mises en situation analysées et des exercices pratiques.</li>
          <li>Quizz d'évaluation des acquis en fin de formation</li>
          <li>Évaluation de l'impact de la formation « à chaud »</li>
          <li>Formation sanctionnée par une attestation</li>
        </ul>`
    }

    <h2 style="font-size: 13px; font-weight: 700; text-transform: uppercase; margin: 20px 0 8px 0; color: #111827;">Qualité — Indicateurs de Résultats</h2>
    <p style="font-size: 11px;">Nombre de stagiaires : ${(formation.enrollments?.length) || "[Effectifs]"}</p>

    <h2 style="font-size: 13px; font-weight: 700; text-transform: uppercase; margin: 20px 0 8px 0; color: #111827;">Accessibilité</h2>
    <p style="font-size: 11px;">Pour le bon déroulement de la formation, nous vous remercions de bien vouloir nous signaler si un besoin d'adaptation lié à une situation de handicap (ou toute autre situation spécifique) est nécessaire. Nous ferons tout notre possible pour que chacun puisse suivre notre formation dans les meilleures conditions possibles.</p>`;

  return wrap(entityName, `Programme de formation : ${formation.title}`, body);
}

// ──────────────────────────────────────────────
// DOCUMENT 4 — CGV (17 articles)
// ──────────────────────────────────────────────

function cgv(data: TemplateData): string {
  const { entityName } = data;
  const co = getCompanyInfo(entityName);

  const body = `
    <p style="font-size: 11px; margin-bottom: 12px;"><strong>Définitions</strong></p>
    <p style="font-size: 11px; margin-bottom: 4px;">Client : co-contractant de ${co.name}</p>
    <p style="font-size: 11px; margin-bottom: 4px;">Contrat : convention de formation professionnelle conclue entre ${co.name} et le Client. Cette convention peut prendre la forme d'un contrat en bonne et due forme, d'un bon de commande émis par le Client et validé par ${co.name} ou une facture établie pour la réalisation des actions de formation professionnelle.</p>
    <p style="font-size: 11px; margin-bottom: 4px;">Formation interentreprises : Formation réalisée dans les locaux de ${co.name} ou dans des locaux mis à sa disposition par tout tiers et/ou à distance.</p>
    <p style="font-size: 11px; margin-bottom: 16px;">Formation intra-entreprise : Formation réalisée sur mesure pour le compte du Client, réalisée dans les locaux du Client, de tout tiers et/ou à distance.</p>

    ${article("1", "Objet et champ d'application", `<p>Tout Contrat implique l'acceptation sans réserve par le Client et son adhésion pleine et entière aux présentes Conditions Générales de Vente qui prévalent sur tout autre document du Client, et notamment sur toutes conditions générales d'achat. Aucune dérogation aux présentes Conditions Générales n'est opposable à ${co.name} si elle n'a pas été expressément acceptée par écrit par celle-ci.</p>`)}

    ${article("2", "Documents contractuels", `<p>Le Contrat précisera l'intitulé de la formation, sa nature, sa durée, ses effectifs, les modalités de son déroulement et la sanction de la formation ainsi que son prix et les contributions financières éventuelles de personnes publiques. Tout Contrat sera établi selon les dispositions légales et réglementaires en vigueur et plus précisément suivant les articles L6353-1 et L6353-2 du Code du travail.</p>`)}

    ${article("3", "Report / annulation d'une formation par " + co.name, `<p>${co.name} se réserve la possibilité d'annuler ou de reporter des formations planifiées, sans indemnités, sous réserve d'en informer le Client avec un préavis raisonnable.</p>`)}

    ${article("4", "Annulation d'une formation par le Client", `<p>Toute formation ou cycle commencé est dû en totalité, sauf accord contraire exprès de ${co.name}. Toute annulation d'une formation à l'initiative du Client devra être communiquée par écrit dans les conditions qui suivent :</p>
    <p>- Pour les formations Inter et intra entreprises (hors Cycles et Parcours) : La demande devra être communiquée au moins dix (10) jours calendaires avant le début de la formation. A défaut, 100% du montant de la formation restera immédiatement exigible à titre d'indemnité forfaitaire.</p>
    <p>- Pour les Cycles et Parcours : La demande devra être communiquée au moins quinze (15) jours calendaires avant le début de la formation. A défaut, 50% du montant de la formation restera immédiatement exigible à titre d'indemnité forfaitaire.</p>`)}

    ${article("5", "Replacement d'un participant", `<p>Quel que soit le type de la formation, sur demande écrite avant le début de la formation, le Client a la possibilité de remplacer un participant sans facturation supplémentaire.</p>`)}

    ${article("6", "Dématérialisation des supports", `<p>Dans le cadre d'un engagement environnemental, toute la documentation relative à la formation est remise sur des supports dématérialisés.</p>`)}

    ${article("7", "Refus de former", `<p>Dans le cas où un Contrat serait conclu entre le Client et ${co.name} sans avoir procédé au paiement de la (des) formation(s) précédente(s), ${co.name} pourra, sans autre motif et sans engager sa responsabilité, refuser d'honorer le Contrat et de délivrer les formations concernées, sans que le Client puisse prétendre à une quelconque indemnité, pour quelque raison que ce soit.</p>`)}

    ${article("8", "Prix et règlements", `<p>Les prix couvrent les frais pédagogiques. Les frais de repas, hébergement, transport, etc ne sont pas compris dans le prix des formations. Ils restent à la charge du client ou seront facturés en sus.</p>
    <p>Pour les formations interentreprises les factures sont émises et payables à l'inscription.</p>
    <p>Pour les formations intra-entreprises, un acompte minimum de 50% devra être versé par le Client à la conclusion du Contrat.</p>
    <p>Tous les prix sont indiqués en euros et nets de taxes. S'ils venaient à être soumis à la TVA, les prix seront majorés de la TVA au taux en vigueur au jour de l'émission de la facture correspondante. Dans le cadre d'un engagement environnemental les factures sont transmises par voie dématérialisée et payables à réception par virement aux coordonnées bancaires de ${co.name}, sans escompte pour règlement anticipé. Toute somme non payée à l'échéance donnera lieu au paiement par le Client de pénalités de retard égales au taux d'intérêt légal assorti du taux d'intérêt appliqué par la BCE à son opération de refinancement la plus récente majoré de 10 points de pourcentage.</p>
    <p>Ces pénalités sont exigibles de plein droit, sans mise en demeure préalable, dès le premier jour de retard de paiement par rapport à la date d'exigibilité du paiement.</p>
    <p>En outre, conformément aux dispositions législatives et réglementaires en vigueur, toute somme non payée à l'échéance donnera lieu au paiement par le Client d'une indemnité forfaitaire pour frais de recouvrement d'un montant de quarante euros (40€). Cette indemnité est due de plein droit, sans mise en demeure préalable dès le premier jour de retard de paiement et pour chaque facture impayée à son échéance.</p>`)}

    ${article("9", "Règlement par un Opérateur de Compétences", `<p>Si le Client souhaite que le règlement soit effectué par l'Opérateur de Compétences dont il dépend, il lui appartient :</p>
    <p>- de faire une demande de prise en charge avant le début de la formation et de s'assurer de la bonne fin de cette demande ;</p>
    <p>- de l'indiquer explicitement sur son bon de commande ;</p>
    <p>- de s'assurer de la bonne fin du paiement par l'Opérateur de Compétences qu'il aura désigné.</p>
    <p>Si l'Opérateur de Compétences ne prend en charge que partiellement le coût de la formation, le reliquat sera facturé au Client. Si ${co.name} n'a pas reçu la prise en charge de l'Opérateur de Compétences au 1er jour de la formation, le Client sera facturé de l'intégralité du coût de la formation concernée par ce financement. En cas de non-paiement par l'Opérateur de Compétences, pour quelque motif que ce soit, le Client sera redevable de l'intégralité du coût de la formation et sera facturé du montant correspondant.</p>`)}

    ${article("10", "Obligations et Responsabilité de " + co.name, `<p>${co.name} s'engage à fournir la formation avec diligence et soin raisonnables. S'agissant d'une prestation intellectuelle, ${co.name} n'est tenu qu'à une obligation de moyens.</p>
    <p>En conséquence, ${co.name} sera responsable uniquement des dommages directs résultant d'une mauvaise exécution de ses prestations de formation, à l'exclusion de tout dommage immatériel ou indirect consécutifs ou non.</p>
    <p>En toutes hypothèses, la responsabilité globale de ${co.name}, au titre ou à l'occasion de la formation, sera limitée au prix total de la formation.</p>`)}

    ${article("11", "Obligations du Client", `<p>Le Client s'engage à :</p>
    <p>- payer le prix de la formation ;</p>
    <p>- n'effectuer aucune reproduction de matériel ou documents dont les droits d'auteur appartiennent à ${co.name}, sans l'accord écrit et préalable de ce dernier ; et</p>
    <p>- ne pas utiliser de matériel d'enregistrement audio ou vidéo lors des formations, sans l'accord écrit et préalable de ${co.name}.</p>`)}

    ${article("12", "Formations en distanciel", `<p>Les règles ci-dessus s'appliquent aux formations en distanciel. Les participants doivent disposer d'un ordinateur équipé d'une carte son et de hauts parleurs, d'un écran, d'une connexion internet stable, d'un navigateur web, avant la signature de la commande.</p>`)}

    ${article("13", "Confidentialité et Propriété Intellectuelle", `<p>Il est expressément convenu que toute information divulguée par ${co.name} au titre ou à l'occasion de la formation doit être considérée comme confidentielle et ne peut être communiquée à des tiers ou utilisée pour un objet différent de celui de la formation, sans l'accord préalable écrit de ${co.name}. Le droit de propriété sur toutes les Informations que ${co.name} divulgue, quel qu'en soit la nature, le support et le mode de communication, dans le cadre ou à l'occasion de la formation, appartient exclusivement à ${co.name}.</p>
    <p>En conséquence, le Client s'engage à conserver les Informations en lieu sûr et à y apporter au minimum, les mêmes mesures de protection que celles qu'il applique habituellement à ses propres informations. Le Client se porte fort du respect de ces stipulations de confidentialité et de conservation par les apprenants.</p>
    <p>Par dérogation, ${co.name} accorde à l'apprenant, sous réserve des droits des tiers, une licence d'utilisation non exclusive, non-cessible et strictement personnelle du support de formation fourni. L'apprenant a le droit d'effectuer une photocopie de ce support pour son usage personnel à des fins d'étude, à condition que la mention des droits d'auteur de ${co.name} soient reproduites sur chaque copie.</p>`)}

    ${article("14", "Responsabilité", `<p>La responsabilité de ${co.name} ne saurait être engagée dans le cas où des dégradations ou des dommages seraient causés à des tiers, aux locaux et matériels mis à disposition de ${co.name} mais utilisés par les stagiaires, salariés des entreprises clientes pendant la durée des sessions de formation. Dans le cadre d'un stage réalisé en intra-entreprise, et sauf dispositions particulières, l'entreprise d'accueil se charge de toute la partie logistique. L'entreprise d'accueil est garante du bon fonctionnement de ses équipements.</p>`)}

    ${article("15", "Protection des données personnelles", `<p>Dans le cadre de la réalisation des formations, ${co.name} est amené à collecter des données à caractère personnel. L'accès à ces données est strictement limité aux employés et préposés de ${co.name}, habilités à les traiter en raison de leurs fonctions.</p>
    <p>${co.name} s'engage à :</p>
    <p>- Ne traiter les données personnelles que pour le strict besoin des formations et en toute neutralité ;</p>
    <p>- Conserver les données personnelles pendant trois (3) ans ou une durée supérieure pour se conformer aux obligations légales ;</p>
    <p>- En cas de sous-traitance, ${co.name} se porte fort du respect par ses sous-traitants de tous ses engagements en matière de sécurité et de protection des données personnelles.</p>`)}

    ${article("16", "Communication", `<p>Le Client autorise expressément ${co.name} à mentionner son nom, son logo et à faire mention à titre de références de la conclusion d'un Contrat et de toute opération découlant de son application dans l'ensemble de leurs documents commerciaux.</p>`)}

    ${article("17", "Loi applicable et juridiction", `<p>Les Contrat et tous les rapports entre ${co.name} et son Client relèvent de la Loi française. Tous litiges qui ne pourraient être réglés à l'amiable dans un délai de soixante (60) jours compté à partir de la date de la première présentation de la lettre recommandée avec accusé de réception, que la partie qui soulève le différend devra avoir adressée à l'autre, seront de la compétence exclusive du tribunal de commerce de Marseille quel que soit le siège du Client, nonobstant pluralité de défendeurs ou appel en garantie.</p>`)}`;

  return wrap(entityName, "Conditions Générales de Vente", body);
}

// ──────────────────────────────────────────────
// DOCUMENT 5 — RÈGLEMENT INTÉRIEUR (8 articles)
// ──────────────────────────────────────────────

function reglementInterieur(data: TemplateData): string {
  const { entityName } = data;
  const co = getCompanyInfo(entityName);

  const body = `
    ${article("1", "", `<p>Le présent règlement est établi conformément aux dispositions des articles L.6352-3 et L.6352-4 et R.6352-1 à R.6352-15 du Code du travail. Il s'applique à tous les stagiaires, et ce pour la durée de la formation suivie.</p>`)}

    ${article("2", "Discipline", `<p>Il est formellement interdit aux stagiaires :</p>
    <ul style="margin: 4px 0; padding-left: 20px;">
      <li>D'introduire des boissons alcoolisées dans les locaux de l'organisme ;</li>
      <li>De se présenter aux formations en état d'ébriété, et/ou sous l'effet de stupéfiants ;</li>
      <li>De modifier les supports de formation ;</li>
      <li>D'emporter tout support documentaire ou de formation sans autorisation explicite du Responsable pédagogique ;</li>
      <li>D'utiliser leurs téléphones portables durant les sessions.</li>
    </ul>`)}

    ${article("3", "Sanctions", `<p>Tout agissement considéré comme fautif par la direction de l'organisme de formation pourra, en fonction de sa nature et de sa gravité, faire l'objet de l'une ou l'autre des sanctions ci-après par ordre croissant d'importance :</p>
    <ul style="margin: 4px 0; padding-left: 20px;">
      <li>Avertissement écrit par le Directeur de l'organisme de formation ;</li>
      <li>Exclusion définitive de la formation</li>
    </ul>`)}

    ${article("4", "Entretien préalable à une sanction et procédure", `<p>Aucune sanction ne peut être infligée au stagiaire sans que celui-ci ne soit informé dans le même temps et par écrit des griefs retenus contre lui.</p>
    <p>Lorsque l'organisme de formation envisage une prise de sanction, il convoque le stagiaire par lettre recommandée avec accusé de réception ou remise à l'intéressé contre décharge en lui indiquant l'objet de la convocation, la date, l'heure et le lieu de l'entretien, sauf si la sanction envisagée n'a pas d'incidence sur la présence du stagiaire pour la suite de la formation.</p>
    <p>Au cours de l'entretien, le stagiaire a la possibilité de se faire assister par une personne de son choix, stagiaire ou salarié de l'organisme de formation.</p>
    <p>La sanction ne peut intervenir moins d'un jour franc ni plus de 15 jours après l'entretien. Elle fait l'objet d'une notification écrite et motivée au stagiaire sous forme lettre recommandée, ou d'une lettre remise contre décharge. L'organisme de formation informe concomitamment l'employeur, et éventuellement l'organisme paritaire prenant à sa charge les frais de formation, de la sanction prise.</p>`)}

    ${article("5", "Hygiène et sécurité", `<p>La prévention des risques d'accidents et de maladies est impérative et exige de chacun le respect total de toutes les prescriptions applicables en matière d'hygiène et de sécurité. A cet effet, les consignes générales et particulières de sécurité en vigueur dans l'organisme, lorsqu'elles existent, doivent être strictement respectées sous peine de sanctions disciplinaires.</p>`)}

    ${article("6", "Horaires des formations – Absence / retard", `<p>Les horaires de stage sont fixés par l'organisme de formation et portés à la connaissance des stagiaires sur la convocation à la formation.</p>
    <p>Les stagiaires sont tenus de respecter scrupuleusement les horaires qui leur sont communiqués sous peine de l'application des dispositions suivantes :</p>
    <ul style="margin: 4px 0; padding-left: 20px;">
      <li>en cas d'absence ou de retard, les stagiaires doivent avertir l'organisme de formation par téléphone au 06 50 14 93 89 ou sur l'adresse ${co.email} et s'en justifier. Par ailleurs, les stagiaires ne peuvent s'absenter pendant les heures de formation, sauf circonstances exceptionnelles validées par le directeur du centre de formation.</li>
      <li>lorsque les stagiaires sont des salariés en formation dans le cadre du plan de formation, l'organisme de formation informe préalablement l'employeur de ces absences.</li>
      <li>Les manquements non justifiés à l'obligation d'assiduité constitue une faute passible de sanctions disciplinaires.</li>
      <li>pour les stagiaires demandeurs d'emploi rémunérés par l'État ou une région, les absences non justifiées entraîneront une retenue de rémunération proportionnelle à la durée des dites absences.</li>
    </ul>`)}

    ${article("7", "Réclamations", `<p>Les stagiaires, les employeurs font part de leurs réclamations au Référent Pédagogique qui leur accorde une attention particulière. La confidentialité des échanges est assurée.</p>
    <p>Les stagiaires sont reçus sur place à leur demande par le Référent Pédagogique, aux pauses, avant/après les horaires de formation, ou sur rendez-vous au 06 50 14 93 89 ou sur l'adresse ${co.email}.</p>
    <p>Les employeurs peuvent communiquer leurs réclamations par téléphone, ou courriel, ou sur rendez-vous, au 06 50 14 93 89 ou sur l'adresse ${co.email}.</p>
    <p>Après connaissance des réclamations, les mesures correctives appropriées sont mises en œuvre par le Référent Pédagogique.</p>`)}

    ${article("8", "Publicité du Règlement Intérieur", `<p>Un exemplaire du présent règlement est remis à chaque stagiaire (avant toute inscription définitive).</p>`)}`;

  return wrap(entityName, "Règlement intérieur", body);
}

// ──────────────────────────────────────────────
// DOCUMENT 6 — POLITIQUE RGPD (6 sections)
// ──────────────────────────────────────────────

function politiqueRgpd(data: TemplateData): string {
  const { entityName } = data;
  const co = getCompanyInfo(entityName);

  const body = `
    <p style="font-size: 11px; margin-bottom: 16px;"><strong>Introduction</strong></p>
    <p style="font-size: 11px; margin-bottom: 16px;">Notre organisme de formation accorde une importance majeure à la protection et à la confidentialité des données à caractère personnel collectées et traitées dans le cadre de ses activités. Conformément au Règlement Général sur la Protection des Données (RGPD) et à la loi Informatique et Libertés, nous adoptons des mesures techniques et organisationnelles rigoureuses afin de garantir la sécurité, la confidentialité, l'intégrité et la disponibilité des données personnelles.</p>

    ${article("1", "Finalité du traitement des données", `<p>Les données collectées visent exclusivement à :</p>
    <ul style="margin: 4px 0; padding-left: 20px;">
      <li>Assurer la gestion administrative et pédagogique des formations.</li>
      <li>Gérer l'inscription, le suivi pédagogique, et l'évaluation des stagiaires.</li>
      <li>Répondre aux obligations légales et réglementaires (déclaration d'activité, suivi qualité, etc.).</li>
    </ul>`)}

    ${article("2", "Catégories de données collectées", `<ul style="margin: 4px 0; padding-left: 20px;">
      <li>Nom et prénom</li>
      <li>Adresse email</li>
    </ul>
    <p>Aucune autre information sensible n'est stockée dans notre base de données.</p>`)}

    ${article("3", "Mesures techniques de sécurité", `<p><strong>Chiffrement des données :</strong></p>
    <ul style="margin: 4px 0; padding-left: 20px;">
      <li>Toutes les données collectées sont systématiquement chiffrées lors de leur stockage (AES 256 bits).</li>
      <li>Utilisation du protocole sécurisé HTTPS pour tous les échanges de données en ligne.</li>
    </ul>
    <p><strong>Contrôle d'accès :</strong></p>
    <ul style="margin: 4px 0; padding-left: 20px;">
      <li>Authentification sécurisée des utilisateurs avec des mots de passe robustes, renouvelés régulièrement.</li>
      <li>Gestion stricte des droits d'accès selon le principe du moindre privilège, limitant l'accès aux seules données nécessaires à la fonction de l'utilisateur.</li>
    </ul>
    <p><strong>Sauvegarde et récupération des données :</strong></p>
    <ul style="margin: 4px 0; padding-left: 20px;">
      <li>Sauvegardes automatiques quotidiennes stockées sur des serveurs sécurisés distants.</li>
      <li>Test régulier des procédures de restauration des données pour assurer la continuité d'activité.</li>
    </ul>
    <p><strong>Protection des équipements :</strong></p>
    <ul style="margin: 4px 0; padding-left: 20px;">
      <li>Systèmes antivirus et pare-feu professionnels mis à jour automatiquement.</li>
      <li>Sécurisation physique des locaux avec contrôle d'accès restreint et vidéo-surveillance.</li>
    </ul>`)}

    ${article("4", "Mesures organisationnelles de sécurité", `<p><strong>Politique interne de confidentialité :</strong></p>
    <ul style="margin: 4px 0; padding-left: 20px;">
      <li>Sensibilisation régulière du personnel à la sécurité des données et à la confidentialité par des formations dédiées.</li>
      <li>Signature d'accords de confidentialité par chaque employé.</li>
    </ul>
    <p><strong>Gestion des incidents de sécurité :</strong></p>
    <ul style="margin: 4px 0; padding-left: 20px;">
      <li>Procédure claire pour la gestion et la notification immédiate des violations de données.</li>
      <li>Analyse systématique et documentation des incidents afin de mettre en œuvre des actions correctives efficaces.</li>
    </ul>
    <p><strong>Sous-traitance :</strong></p>
    <ul style="margin: 4px 0; padding-left: 20px;">
      <li>Sélection rigoureuse des prestataires et sous-traitants, avec signature systématique d'un contrat de traitement des données conforme au RGPD.</li>
      <li>Audits réguliers des sous-traitants pour s'assurer du respect des engagements pris en matière de sécurité des données.</li>
    </ul>
    <p><strong>Conservation limitée des données :</strong></p>
    <ul style="margin: 4px 0; padding-left: 20px;">
      <li>Respect strict des durées de conservation définies en fonction des finalités du traitement et des obligations légales.</li>
      <li>Destruction sécurisée ou anonymisation des données au terme de la période de conservation.</li>
    </ul>`)}

    ${article("5", "Droits des personnes concernées", `<p>Conformément au RGPD, chaque personne dispose des droits suivants :</p>
    <ul style="margin: 4px 0; padding-left: 20px;">
      <li>Accès à ses données personnelles</li>
      <li>Rectification et mise à jour</li>
      <li>Opposition et limitation du traitement</li>
      <li>Effacement (droit à l'oubli)</li>
      <li>Portabilité des données</li>
    </ul>
    <p>Toute demande relative à ces droits doit être adressée au Responsable de la Protection des Données (DPO), désigné au sein de notre organisme, par email ou courrier postal.</p>`)}

    ${article("6", "Mise à jour de la politique", `<p>La présente politique est revue annuellement ou lors d'évolutions significatives des pratiques internes ou réglementaires.</p>`)}

    <div style="margin-top: 20px; padding: 12px; background: #f9fafb; border-radius: 6px;">
      <p style="font-size: 11px; font-weight: 600; margin: 0 0 4px 0;">Contact du DPO :</p>
      <p style="font-size: 11px; margin: 0;">Email : ${co.email}</p>
      <p style="font-size: 11px; margin: 0;">Adresse : ${co.address}</p>
    </div>`;

  return wrap(entityName, "Politique RGPD", body);
}

// ──────────────────────────────────────────────
// DOCUMENT 7 — CONVOCATION (format officiel)
// ──────────────────────────────────────────────

function convocation(data: TemplateData): string {
  const { formation, learner, entityName, magicLinkUrl, qrCodeDataUrl } = data;
  const co = getCompanyInfo(entityName);
  const fullName = learner ? `${learner.last_name?.toUpperCase()} ${learner.first_name}` : "—";
  const modalite = MODE_LABELS[formation.mode] || "En présentiel";
  const timeSlots = formation.formation_time_slots || [];

  const slotsHtml = timeSlots.length > 0
    ? `<ul style="margin: 8px 0; padding-left: 20px; font-size: 12px;">${timeSlots.map((slot) => {
        const d = formatDateFr(slot.start_time);
        const s = new Date(slot.start_time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
        const e = new Date(slot.end_time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
        return `<li>De ${d} - ${s} À ${d} - ${e}</li>`;
      }).join("")}</ul>`
    : `<p style="color: #999; font-style: italic;">Créneaux non encore planifiés.</p>`;

  const body = `
    <p style="text-align: center; font-weight: 600; font-size: 16px; margin-bottom: 20px;">Convocation à la formation professionnelle</p>

    <p>Bonjour <strong>${fullName}</strong>, Vous êtes convoqué pour la formation :</p>

    <p style="font-weight: 700; font-size: 16px; margin: 16px 0;">${formation.title}</p>

    <p>
      Lieu de la formation: <strong>${modalite} - ${formation.location || "—"}</strong><br/>
      Durée de la formation: <strong>${formation.planned_hours || "—"} heure(s)</strong><br/>
      Dates de la formation: <strong>Du ${formatDateFr(formation.start_date)} au ${formatDateFr(formation.end_date)}</strong>
    </p>

    <p style="font-weight: 700;">Vos dates en détail :</p>
    ${slotsHtml}

    ${magicLinkUrl && qrCodeDataUrl ? `
    <div style="margin: 24px 0; padding: 20px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; text-align: center;">
      <p style="margin: 0 0 8px; font-weight: 700; font-size: 14px; color: #374151;">Votre accès à votre espace personnel</p>
      <p style="margin: 0 0 16px; font-size: 12px; color: #6b7280;">Documents, planning, questionnaires, émargement électronique</p>
      <img src="${qrCodeDataUrl}" alt="QR Code" style="width: 160px; height: 160px; margin: 0 auto 12px; display: block;" />
      <p style="margin: 0; font-size: 11px; color: #374151;"><a href="${magicLinkUrl}" style="color: #DC2626;">Accéder à mon espace →</a></p>
    </div>
    ` : `<p style="color: #999; font-style: italic; font-size: 11px;">Un lien d'accès personnel vous sera envoyé par email séparément.</p>`}

    <p>En cas d'indisponibilité ou de renoncement, veuillez nous prévenir le plus rapidement possible.</p>

    <p><strong>Important :</strong><br/>
    Vous trouverez dans votre extranet notre <strong>règlement intérieur</strong> dont vous devez avoir pris connaissance <strong>avant</strong> votre entrée en formation, afin d'être informé des règles de fonctionnement dans le cadre de la formation.<br/>
    Pour les formations qui se déroulent dans votre entreprise, le règlement intérieur de votre entreprise s'applique pour la partie <strong>Sécurité</strong> (article 5).</p>

    <p style="margin-top: 24px;">Nous restons à votre disposition.<br/>Bien cordialement,<br/><strong>${co.name}</strong><br/>${co.address}</p>`;

  return wrap(entityName, "", body);
}

// ──────────────────────────────────────────────
// DOCUMENT 8 — CERTIFICAT DE RÉALISATION
// ──────────────────────────────────────────────

function certificatRealisation(data: TemplateData): string {
  const { formation, learner, company, entityName, effectiveHours, attendanceRate } = data;
  const co = getCompanyInfo(entityName);
  const fullName = learner ? `${learner.last_name?.toUpperCase()} ${learner.first_name}` : "—";
  const clientName = company?.company_name || formation.formation_companies?.[0]?.client?.company_name || "—";
  const objectives = formation.program?.objectives || "";
  const planned = formation.planned_hours || 0;
  const effective = effectiveHours ?? planned;
  const rate = attendanceRate ?? (planned > 0 ? (effective / planned) * 100 : 100);

  const body = `
    <h2 style="text-align: center; color: #374151; font-size: 18px; font-weight: 700; text-transform: uppercase; margin-bottom: 24px;">Certificat réalisation de formation</h2>

    <p>Je, soussigné: <strong>${co.president}</strong>, représentant de l'organisme de formation <strong>${co.name}</strong>,</p>

    <p>atteste que: <strong>${fullName}</strong> a suivi la formation:</p>

    <p>
      Nom de la formation: <strong>${formation.title}</strong><br/>
      Lieu de la formation: ${formation.location || "—"}<br/>
      Dates de la formation: du <strong>${formatDateFr(formation.start_date)}</strong> au <strong>${formatDateFr(formation.end_date)}</strong><br/>
      Durée prévue: <strong>${planned || "—"} heure(s)</strong><br/>
      Heures effectivement suivies: <strong>${effective} heure(s)</strong><br/>
      Taux d'assiduité: <strong>${rate.toFixed(0)}%</strong><br/>
      Présenté par : <strong>${clientName}</strong>
    </p>
    ${rate < 80 ? `<p style="color: #b45309; font-size: 11px; margin: 8px 0;">⚠️ Le stagiaire a suivi moins de 80% de la durée prévue.</p>` : ""}

    <hr style="border: 0; border-top: 0.5px solid #ccc; margin: 16px 0;"/>

    <p style="font-style: italic; font-size: 11px;">Nature de l'action concourant au développement des compétences :</p>

    <p style="font-size: 12px; line-height: 2;">
      ☑ Action de formation<br/>
      ☐ Bilan de compétences<br/>
      ☐ Action de VAE<br/>
      ☐ Action de formation par apprentissage
    </p>

    <hr style="border: 0; border-top: 0.5px solid #ccc; margin: 16px 0;"/>

    <p style="font-style: italic; font-size: 11px;">Sans préjudice des délais imposés par les règles fiscales, comptables ou commerciales, je m'engage à conserver l'ensemble des pièces justificatives qui ont permis d'établir le présent certificat pendant une durée de 3 ans à compter de la fin de l'année du dernier paiement. En cas de cofinancement des fonds européens la durée de conservation est étendue conformément aux obligations conventionnelles spécifiques.</p>

    <hr style="border: 0; border-top: 0.5px solid #ccc; margin: 16px 0;"/>

    <p><strong>Objectifs de la formation :</strong></p>
    ${objectives
      ? `<div style="font-size: 11px; white-space: pre-line;">${objectives}</div>`
      : `<p style="font-size: 11px; color: #999;"></p>`
    }

    <p>Résultat de l'évaluation des acquis jalonnant ou terminant la formation (QUIZZ, TEST, QCM etc....) : <strong>ACQUIS</strong></p>

    <p>La feuille d'émargement attestant cette assiduité est fournie en annexe.</p>

    <p style="margin-top: 24px;">Fait à Marseille, le ${docDate(data.doc)}</p>`;

  return wrap(entityName, "", body);
}

// ──────────────────────────────────────────────
// DOCUMENT 9 — ATTESTATION D'ASSIDUITÉ
// ──────────────────────────────────────────────

function attestationAssiduite(data: TemplateData): string {
  const { formation, learner, entityName, signedSlots: extSignedSlots, missedSlots: extMissedSlots } = data;
  const co = getCompanyInfo(entityName);
  const fullName = learner ? `${learner.last_name?.toUpperCase()} ${learner.first_name}` : "—";
  const modalite = MODE_LABELS[formation.mode] || "En présentiel";

  // Calculate effective hours from signatures
  const signatures = formation.signatures || [];
  const timeSlots = formation.formation_time_slots || [];
  const learnerId = learner ? (formation.enrollments || []).find((e) => e.learner?.last_name === learner.last_name && e.learner?.first_name === learner.first_name)?.learner?.id : null;

  let heuresEffectives = 0;
  if (learnerId && timeSlots.length > 0) {
    for (const slot of timeSlots) {
      const signed = signatures.some(
        (s) => s.time_slot_id === slot.id && s.signer_id === learnerId && s.signer_type === "learner"
      );
      if (signed) {
        const ms = new Date(slot.end_time).getTime() - new Date(slot.start_time).getTime();
        heuresEffectives += ms / 3600000;
      }
    }
  }
  // Fallback: if no signature data, use total planned hours
  if (heuresEffectives === 0 && formation.planned_hours) {
    heuresEffectives = Number(formation.planned_hours);
  }
  const totalHours = Number(formation.planned_hours) || heuresEffectives;
  const tauxRealisation = totalHours > 0 ? ((heuresEffectives / totalHours) * 100).toFixed(2) : "100.00";

  const body = `
    <h1 style="text-align: center; font-size: 28px; font-weight: 700; margin-bottom: 24px;">Attestation d'assiduité</h1>

    <p>Je, soussigné: <strong>${co.president}</strong>, représentant de l'organisme de formation <strong>${co.name}</strong>,</p>

    <p>atteste que: <strong>${fullName}</strong> a suivi la formation:</p>

    <h2 style="text-align: center; font-size: 22px; font-weight: 700; margin: 20px 0;">${formation.title}</h2>

    <p>
      Lieu de la formation: <strong>${modalite}</strong><br/>
      Dates de la formation: du <strong>${formatDateFr(formation.start_date)}</strong> au <strong>${formatDateFr(formation.end_date)}</strong><br/>
      Durée de la formation: <strong>${formation.planned_hours || "—"} heure(s)</strong><br/>
      Type d'action de formation: <strong>Action de formation</strong>
    </p>

    <h2 style="font-size: 22px; font-weight: 700; margin: 24px 0 12px 0;">Assiduité du stagiaire</h2>

    <p>Durée effectivement suivie par le/la stagiaire: <strong>${heuresEffectives.toFixed(0)}h</strong>,<br/>
    soit un taux de réalisation de <strong>${tauxRealisation} %</strong>.</p>

    ${extSignedSlots && extSignedSlots.length > 0 ? `
    <p style="font-weight: 700; margin-top: 16px; font-size: 12px;">Créneaux suivis :</p>
    <ul style="font-size: 11px; margin: 4px 0 12px 0; padding-left: 20px;">
      ${extSignedSlots.map(s => `<li>${formatDateFr(s.date)} — ${s.hours.toFixed(1)}h</li>`).join("")}
    </ul>` : ""}
    ${extMissedSlots && extMissedSlots.length > 0 ? `
    <p style="font-weight: 700; margin-top: 12px; color: #b45309; font-size: 12px;">Créneaux manqués :</p>
    <ul style="font-size: 11px; color: #b45309; margin: 4px 0 12px 0; padding-left: 20px;">
      ${extMissedSlots.map(s => `<li>${formatDateFr(s.date)} — ${s.hours.toFixed(1)}h</li>`).join("")}
    </ul>` : ""}

    <p>Résultat de l'évaluation des acquis jalonnant ou terminant la formation (QUIZZ, TEST, QCM etc....) : ACQUIS</p>

    <p>La feuille d'émargement attestant cette assiduité est fournie en annexe.</p>

    <p style="margin-top: 24px;">Fait à Marseille, le ${docDate(data.doc)}</p>`;

  return wrap(entityName, "", body);
}

// ──────────────────────────────────────────────
// DOCUMENT 10 — FEUILLE ÉMARGEMENT (individuelle si learner passé)
// ──────────────────────────────────────────────
// Note: feuilleEmargement() (Document 2) already handles the collective format.
// When a learner is passed in TemplateData, we generate the individual format.
// The existing function at line 277 already handles this — we just need the
// feuille_emargement key in GENERATORS to point to the updated function.
// The function feuilleEmargement() was already updated above to handle both cases.

// ──────────────────────────────────────────────
// DOCUMENT 11 — CERTIFICAT DE RÉUSSITE (design graphique)
// ──────────────────────────────────────────────

// microCertificat supprimé (demande Loris V1)

// ──────────────────────────────────────────────
// DOCUMENT — PLANNING SEMAINE
// ──────────────────────────────────────────────
function planningSemaine(data: TemplateData): string {
  const { formation, entityName } = data;
  const co = getCompanyInfo(entityName);
  const enrollments = formation.enrollments || [];
  const trainers = formation.formation_trainers || [];
  const formateursNoms = trainers.filter((ft) => ft.trainer).map((ft) => `${ft.trainer!.last_name?.toUpperCase()} ${ft.trainer!.first_name}`).join(", ") || "[Formateur]";

  const jours = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
  const colHeaders = jours.flatMap((j) => [`${j} M`, `${j} AM`]);

  const headerCells = colHeaders.map((h) => `<th style="border:1px solid #d1d5db;padding:4px 2px;font-size:8px;text-align:center;writing-mode:vertical-lr;min-width:28px;height:70px;">${h}</th>`).join("");

  const learnerRows = enrollments.filter((e) => e.learner).map((e) => {
    const name = `${e.learner!.last_name?.toUpperCase()} ${e.learner!.first_name}`;
    const cells = colHeaders.map(() => `<td style="border:1px solid #d1d5db;padding:2px;min-width:28px;height:30px;"></td>`).join("");
    return `<tr><td style="border:1px solid #d1d5db;padding:4px 6px;font-size:10px;white-space:nowrap;">${name}</td>${cells}</tr>`;
  }).join("");

  // Add empty rows to reach at least 12
  const emptyCount = Math.max(0, 12 - enrollments.filter((e) => e.learner).length);
  const emptyRows = Array.from({ length: emptyCount }, () => {
    const cells = colHeaders.map(() => `<td style="border:1px solid #d1d5db;padding:2px;min-width:28px;height:30px;"></td>`).join("");
    return `<tr><td style="border:1px solid #d1d5db;padding:4px 6px;font-size:10px;">&nbsp;</td>${cells}</tr>`;
  }).join("");

  const body = `
    <div style="border:1px solid #d1d5db;border-radius:6px;padding:12px 16px;margin-bottom:16px;font-size:11px;">
      <p style="margin:2px 0;">Formation: <strong>${formation.title}</strong></p>
      <p style="margin:2px 0;">Dates: du ${formatDateFr(formation.start_date)} au ${formatDateFr(formation.end_date)}</p>
      <p style="margin:2px 0;">Formateur(s): ${formateursNoms}</p>
      <p style="margin:2px 0;">Prestataire: ${co.name} — NDA: ${co.nda}</p>
    </div>
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="border:1px solid #d1d5db;padding:4px 6px;text-align:left;font-size:10px;min-width:140px;">Nom</th>
            ${headerCells}
          </tr>
        </thead>
        <tbody>
          ${learnerRows}${emptyRows}
        </tbody>
      </table>
    </div>
    <div style="margin-top:16px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr style="background:#f3f4f6;">
          <th style="border:1px solid #d1d5db;padding:4px 6px;text-align:left;font-size:10px;width:50%;">Signature Formateur</th>
          <th style="border:1px solid #d1d5db;padding:4px 6px;text-align:left;font-size:10px;width:50%;">Signature Responsable</th>
        </tr>
        <tr>
          <td style="border:1px solid #d1d5db;padding:4px;height:60px;"></td>
          <td style="border:1px solid #d1d5db;padding:4px;height:60px;"></td>
        </tr>
      </table>
    </div>`;

  return wrap(entityName, "Planning de la semaine — Feuille d'émargement", body);
}

// ──────────────────────────────────────────────
// DOCUMENT — FEUILLE D'ÉMARGEMENT COLLECTIVE MATRICIELLE
// ──────────────────────────────────────────────
function feuilleEmargementMatriciel(data: TemplateData): string {
  const { formation, company, entityName } = data;
  const co = getCompanyInfo(entityName);
  const modalite = MODE_LABELS[formation.mode] || formation.mode;
  const enrollments = (formation.enrollments || []).filter(e => e.learner);
  const trainers = (formation.formation_trainers || []).filter(ft => ft.trainer);
  const timeSlots = formation.formation_time_slots || [];
  const formateursNoms = trainers.map(ft => `${ft.trainer!.last_name?.toUpperCase()} ${ft.trainer!.first_name}`).join(", ") || "[Formateur]";

  // Filtrer apprenants par entreprise si fournie
  const filtered = company ? enrollments.filter(e => e.client_id === (company as unknown as { id?: string }).id) : enrollments;

  // Grouper créneaux par jour
  const slots = timeSlots.map(slot => {
    const s = new Date(slot.start_time);
    const e = new Date(slot.end_time);
    return {
      id: slot.id,
      date: formatDateFr(slot.start_time),
      dateIso: `${s.getFullYear()}-${String(s.getMonth()+1).padStart(2,"0")}-${String(s.getDate()).padStart(2,"0")}`,
      startTime: s.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }),
      endTime: e.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }),
    };
  }).sort((a, b) => a.dateIso.localeCompare(b.dateIso) || a.startTime.localeCompare(b.startTime));

  const dayGroups: Array<{ date: string; slots: typeof slots }> = [];
  for (const slot of slots) {
    const last = dayGroups[dayGroups.length - 1];
    if (last && last.slots[0]?.dateIso === slot.dateIso) { last.slots.push(slot); }
    else { dayGroups.push({ date: slot.date, slots: [slot] }); }
  }

  const signatures = formation.signatures || [];
  const now = new Date();
  const hc = "#14B8A6"; // teal header

  const dayHeaderCells = dayGroups.map(dg => `<th colspan="${dg.slots.length}" style="background:${hc};color:#fff;border:1px solid #d1d5db;padding:8px 10px;text-align:left;font-size:11px;font-weight:700;">${dg.date}</th>`).join("");
  const slotHeaderCells = slots.map(s => `<th style="background:#f9fafb;border:1px solid #d1d5db;padding:6px 8px;font-size:9px;font-weight:500;color:#374151;min-width:100px;vertical-align:top;">${s.startTime} - ${s.endTime}</th>`).join("");

  function sigCellsForPerson(personId: string, signerType: string): string {
    return slots.map(s => {
      const slotEnd = timeSlots.find(ts => ts.id === s.id);
      const isPast = slotEnd ? new Date(slotEnd.end_time) < now : false;
      const sig = findSignature(signatures, s.id, personId, signerType);
      return `<td style="border:1px solid #d1d5db;padding:4px;min-height:40px;background:#fff;text-align:center;vertical-align:middle;">${renderSignatureCell(sig, isPast, "40px")}</td>`;
    }).join("");
  }

  const learnerRows = filtered.length > 0
    ? filtered.map(e => `<tr><td style="border:1px solid #d1d5db;padding:10px;font-size:11px;background:#fff;">${e.learner!.last_name?.toUpperCase()} ${e.learner!.first_name}</td>${sigCellsForPerson(e.learner!.id, "learner")}</tr>`).join("")
    : `<tr><td colspan="${slots.length+1}" style="border:1px solid #d1d5db;padding:20px;text-align:center;color:#999;font-style:italic;font-size:11px;">Aucun apprenant inscrit</td></tr>`;

  const trainerRows = trainers.length > 0
    ? trainers.map(ft => `<tr><td style="border:1px solid #d1d5db;padding:10px;font-size:11px;background:#fff;">${ft.trainer!.last_name?.toUpperCase()} ${ft.trainer!.first_name}</td>${sigCellsForPerson(ft.trainer!.id, "trainer")}</tr>`).join("")
    : `<tr><td colspan="${slots.length+1}" style="border:1px solid #d1d5db;padding:20px;text-align:center;color:#999;font-style:italic;font-size:11px;">Aucun formateur</td></tr>`;

  const legend = `
    <div style="margin-top:20px;padding:10px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;font-size:9px;color:#6b7280;">
      <strong>Légende :</strong> Les signatures électroniques affichées ci-dessus ont été apposées via la plateforme ${co.name}.
      <span style="color:#ef4444;">Non signé</span> = créneau passé sans signature enregistrée.
      Document généré le ${docDateLong(data.doc)}.
    </div>`;

  const body = `
    <h1 style="text-align:center;font-size:18px;font-weight:700;margin:0 0 16px;color:#111827;">Feuille d'émargement</h1>
    <div style="margin-bottom:16px;font-size:11px;">
      <p style="margin:2px 0;"><strong>Formation :</strong> ${formation.title}</p>
      <p style="margin:2px 0;"><strong>Dates :</strong> du ${formatDateFr(formation.start_date)} au ${formatDateFr(formation.end_date)}</p>
      <p style="margin:2px 0;"><strong>Lieu :</strong> ${modalite}${formation.location ? ` - ${formation.location}` : ""}${company?.company_name ? ` (${company.company_name})` : ""}</p>
      <p style="margin:2px 0;"><strong>Durée :</strong> ${formation.planned_hours || "—"} heures</p>
      <p style="margin:2px 0;"><strong>Prestataire :</strong> ${co.name} — NDA : ${co.nda}</p>
      <p style="margin:2px 0;"><strong>Formateur(s) :</strong> ${formateursNoms}</p>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <thead>
        <tr><th style="background:${hc};color:#fff;border:1px solid #d1d5db;padding:8px 10px;text-align:left;font-size:11px;font-weight:700;min-width:140px;">APPRENANTS</th>${dayHeaderCells}</tr>
        <tr><th style="background:#f9fafb;border:1px solid #d1d5db;padding:6px;"></th>${slotHeaderCells}</tr>
      </thead>
      <tbody>${learnerRows}</tbody>
    </table>
    <table style="width:100%;border-collapse:collapse;page-break-inside:avoid;">
      <thead>
        <tr><th style="background:${hc};color:#fff;border:1px solid #d1d5db;padding:8px 10px;text-align:left;font-size:11px;font-weight:700;min-width:140px;">FORMATEURS</th>${dayHeaderCells}</tr>
        <tr><th style="background:#f9fafb;border:1px solid #d1d5db;padding:6px;"></th>${slotHeaderCells}</tr>
      </thead>
      <tbody>${trainerRows}</tbody>
    </table>
    ${legend}`;

  return wrap(entityName, "", body);
}

const GENERATORS: Record<string, (data: TemplateData) => string> = {
  convocation,
  certificat_realisation: certificatRealisation,
  attestation_assiduite: attestationAssiduite,
  feuille_emargement: feuilleEmargement,
  feuille_emargement_collectif: feuilleEmargementMatriciel,
  convention_entreprise: conventionEntreprise,
  cgv,
  reglement_interieur: reglementInterieur,
  politique_confidentialite: politiqueRgpd,
  programme_formation: programmeFormation,
  planning_semaine: planningSemaine,
};

export function getDefaultTemplate(docType: string, data: TemplateData): string | null {
  const generator = GENERATORS[docType];
  if (!generator) return null;
  return generator(data);
}
