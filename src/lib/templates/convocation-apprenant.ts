/**
 * Template HTML système — Convocation à la formation professionnelle.
 *
 * Document **par (session, apprenant)** : 1 convocation par apprenant
 * inscrit à la session.
 *
 * Reproduit le PDF Loris `Convocation-Formation-mrformation-apprenant.pdf` :
 * header organisme + titre + corps avec coordonnées formation + liste des
 * créneaux détaillés + QR code (lien vers l'extranet apprenant) + bloc
 * "Important" sur règlement intérieur + signature/cachet.
 *
 * NB sur les variables : la mapping Loris utilise `[%Dates de la formation%]`
 * pour le détail (liste créneaux), mais cette variable est déjà aliasée à
 * "Du X au Y" pour la convention entreprise. On a donc créé un nouvel alias
 * `[%Vos dates en détail%]` qui rend les créneaux.
 *
 * NB sur la signature : Loris écrit `[%Signature de l'organisme%]` mais le
 * PDF de référence montre clairement le cachet complet (adresse + SIRET +
 * scribble). On utilise donc `[%Cachet de l'organisme%]` (entity.stamp_url)
 * comme pour les conventions entreprise + intervention.
 */

export const CONVOCATION_APPRENANT_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Convocation à la formation professionnelle</title>
<style>
  @page { size: A4; margin: 18mm 16mm 22mm 16mm; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.55;
    color: #1f2937;
    margin: 0;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 16px;
  }
  .header .org-info { flex: 1; padding-right: 12px; }
  .header .org-name {
    font-size: 17pt;
    font-weight: 700;
    color: #111827;
    margin: 0 0 6px;
    letter-spacing: 0.3px;
  }
  .header .org-address {
    font-size: 8.5pt;
    line-height: 1.5;
    color: #374151;
  }
  .header .logo-cell { width: 130px; text-align: right; }
  .header .logo-cell img { max-width: 130px; max-height: 110px; }

  h1.title {
    font-size: 13pt;
    font-weight: 700;
    text-align: center;
    margin: 20px 0 14px;
    color: #111827;
  }

  h2.formation-title {
    font-size: 11pt;
    font-weight: 700;
    margin: 14px 0 8px;
    color: #111827;
  }

  p { margin: 0 0 6px; }

  ul.dates-list {
    list-style: none;
    padding: 0;
    margin: 4px 0 14px 4px;
  }
  ul.dates-list > li {
    padding: 2px 0 2px 16px;
    position: relative;
  }
  ul.dates-list > li::before {
    content: "\\2022";
    color: #111827;
    font-weight: 700;
    position: absolute;
    left: 2px;
    top: 2px;
  }

  .qr-block {
    text-align: center;
    margin: 28px 0;
  }
  .qr-block img {
    width: 200px;
    height: 200px;
  }

  .important-block {
    margin-top: 14px;
  }
  .important-block h3 {
    font-size: 11pt;
    font-weight: 700;
    margin: 14px 0 6px;
  }

  .signature-block {
    margin-top: 24px;
    font-size: 10pt;
  }
  .signature-block .org-line { margin: 0; }
  .signature-cachet { margin-top: 8px; min-height: 100px; }
  .signature-cachet img { max-width: 220px; max-height: 110px; }

  strong { font-weight: 700; }
</style>
</head>
<body>

  <div class="header">
    <div class="org-info">
      <div class="org-name">[%Nom de l'organisme%]</div>
      <div class="org-address">
        [%Adresse de l'organisme%]<br>
        Email: [%Email de l'organisme%]<br>
        Tel: [%Téléphone de l'organisme%]<br>
        [%Site web de l'organisme%]
      </div>
    </div>
    <div class="logo-cell">[%Logo de l'organisme%]</div>
  </div>

  <h1 class="title">Convocation à la formation professionnelle</h1>

  <p>Bonjour <strong>[%Nom de l'apprenant%]</strong>, Vous êtes convoqué pour la formation :</p>

  <h2 class="formation-title">[%Nom de la formation%]</h2>

  <p>Lieu de la formation : <strong>[%Lieu de la formation%] - [%Adresse de la formation%]</strong></p>
  <p>Durée de la formation : <strong>[%Durée de la formation%]</strong></p>
  <p>Dates de la formation : <strong>Du [%Date de début de la formation%] au [%Date de fin de la formation%]</strong></p>

  <p><strong>Vos dates en détail :</strong></p>
  [%Vos dates en détail%]

  <p><strong>Vous trouverez des informations complémentaires concernant la formation sur la page web dédiée aux stagiaires de cette formation :</strong></p>

  <div class="qr-block">[%QR Code de l'extranet de l'apprenant%]</div>

  <p>Vous pourrez vous connecter à cette page en scannant le QR code ci-dessus.</p>
  <p>En cas d'indisponibilité ou de renoncement, veuillez nous prévenir le plus rapidement possible.</p>

  <div class="important-block">
    <h3>Important :</h3>
    <p>Vous trouverez dans votre extranet notre <strong>règlement intérieur</strong> dont vous devez avoir pris connaissance <strong>avant</strong> votre entrée en formation, afin d'être informé des règles de fonctionnement dans le cadre de la formation.</p>
    <p>Pour les formations qui se déroulent dans votre entreprise, le règlement intérieur de votre entreprise s'applique pour la partie <strong>Sécurité</strong> (article 5).</p>
    <p>Nous restons à votre disposition.</p>
  </div>

  <div class="signature-block">
    <p class="org-line">Bien cordialement,</p>
    <p class="org-line">[%Nom de l'organisme%]</p>
    <p class="org-line">[%Adresse de l'organisme%]</p>
    <div class="signature-cachet">[%Cachet de l'organisme%]</div>
  </div>

</body>
</html>`;

export const CONVOCATION_APPRENANT_FOOTER_TEMPLATE = `<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 7.5pt; color: #6b7280; font-style: italic; width: 100%; padding: 0 16mm; text-align: center; line-height: 1.4;">
  <div>[%Nom de l'organisme%], [%Adresse de l'organisme%] , Numéro SIRET: [%SIRET de l'organisme%], Numéro de déclaration d'activité: [%NDA de l'organisme%]</div>
  <div>(auprès du préfet de région de: PACA)</div>
  <div style="margin-top: 2px;"><span class="pageNumber"></span></div>
</div>`;
