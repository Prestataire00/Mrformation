import QRCode from "qrcode";

/**
 * Génère un data URL (image base64) d'un QR code pointant vers la page login
 * avec le username pré-rempli.
 */
export async function buildLoginQrCodeDataUrl(
  username: string,
  entitySlug?: string,
): Promise<string> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://mrformationcrm.netlify.app";
  const params = new URLSearchParams({ prefill_username: username });
  if (entitySlug) params.set("entity", entitySlug);
  const url = `${baseUrl}/login?${params.toString()}`;
  return QRCode.toDataURL(url, { width: 150, margin: 1 });
}

/**
 * Génère le bloc HTML "Accès plateforme e-learning" pour un apprenant.
 * Retourne une chaîne HTML intégrable dans un template convention.
 *
 * Si l'apprenant n'a pas de profile_id (accès non créé), retourne un message d'avertissement.
 * Si l'apprenant a déjà activé son compte (first_login_at non-null), le password affiché
 * est "Défini par l'apprenant" au lieu du temp_password obsolète.
 */
export async function buildCredentialsHtmlBlock(learner: {
  first_name?: string;
  last_name?: string;
  username?: string | null;
  temp_password?: string | null;
  profile_id?: string | null;
  first_login_at?: string | null;
}, entitySlug?: string): Promise<string> {
  if (!learner.profile_id || !learner.username) {
    return `<div style="padding:4px 0;color:#9ca3af;font-size:7.5pt;"><em>${learner.last_name?.toUpperCase() ?? ""} ${learner.first_name ?? ""} — Accès plateforme non créé</em></div>`;
  }

  const passwordDisplay = learner.first_login_at
    ? "Défini par l'apprenant"
    : (learner.temp_password || "—");

  let qrImgTag = "";
  try {
    const qrDataUrl = await buildLoginQrCodeDataUrl(learner.username, entitySlug);
    qrImgTag = `<img src="${qrDataUrl}" width="80" height="80" style="display:block;" alt="QR login"/>`;
  } catch {
    qrImgTag = `<span style="font-size:7pt;color:#9ca3af;">[QR indisponible]</span>`;
  }

  return `<tr style="border-bottom:1px solid #e5e7eb;">
  <td style="padding:4px 6px;font-size:8pt;font-weight:600;">${learner.last_name?.toUpperCase() ?? ""} ${learner.first_name ?? ""}</td>
  <td style="padding:4px 6px;font-size:8pt;font-family:monospace;">${learner.username}</td>
  <td style="padding:4px 6px;font-size:8pt;font-family:monospace;">${passwordDisplay}</td>
  <td style="padding:4px 6px;text-align:center;">${qrImgTag}</td>
</tr>`;
}

/**
 * Génère le bloc HTML complet "Accès E-Learning" pour un ensemble d'apprenants.
 * Retourne un bloc HTML avec tableau des credentials + QR codes.
 */
export async function buildCredentialsSectionHtml(
  learners: Array<{
    first_name?: string;
    last_name?: string;
    username?: string | null;
    temp_password?: string | null;
    profile_id?: string | null;
    first_login_at?: string | null;
  }>,
  entitySlug?: string,
): Promise<string> {
  if (learners.length === 0) return "";

  const hasAnyCredentials = learners.some((l) => l.profile_id && l.username);
  if (!hasAnyCredentials) return "";

  const rows = await Promise.all(
    learners.map((l) => buildCredentialsHtmlBlock(l, entitySlug)),
  );

  return `
<div style="margin-top:8px;page-break-inside:avoid;">
  <h2 style="font-size:9pt;font-weight:700;color:#7f1d1d;margin:6px 0 4px;">Accès Plateforme E-Learning</h2>
  <p style="font-size:7.5pt;color:#6b7280;margin:0 0 4px;">Connectez-vous sur : <strong>https://mrformationcrm.netlify.app/login</strong></p>
  <table style="width:100%;border-collapse:collapse;border:1px solid #d1d5db;font-size:8pt;">
    <thead>
      <tr style="background:#f9fafb;">
        <th style="padding:3px 6px;text-align:left;font-size:7.5pt;font-weight:600;border-bottom:1px solid #d1d5db;">Stagiaire</th>
        <th style="padding:3px 6px;text-align:left;font-size:7.5pt;font-weight:600;border-bottom:1px solid #d1d5db;">Identifiant</th>
        <th style="padding:3px 6px;text-align:left;font-size:7.5pt;font-weight:600;border-bottom:1px solid #d1d5db;">Mot de passe</th>
        <th style="padding:3px 6px;text-align:center;font-size:7.5pt;font-weight:600;border-bottom:1px solid #d1d5db;">QR</th>
      </tr>
    </thead>
    <tbody>
      ${rows.join("\n      ")}
    </tbody>
  </table>
  <p style="font-size:7pt;color:#9ca3af;margin:3px 0 0;font-style:italic;">Les mots de passe temporaires doivent être changés à la première connexion.</p>
</div>`;
}
