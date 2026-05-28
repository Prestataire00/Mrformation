/**
 * Template HTML devis pour génération PDF côté serveur (em-c-10).
 *
 * Pattern identique à facture-email.ts (cf. ce fichier pour la doc complète).
 * Variables substituées avant Puppeteer :
 *   - {{entity_name}}, {{entity_address}}, {{entity_postal_code}}, {{entity_city}}
 *   - {{entity_siret}}, {{entity_nda}}, {{entity_phone}}, {{entity_email}}, {{entity_website}}
 *   - {{entity_logo_html}} (img tag ou vide)
 *   - {{entity_stamp_html}}
 *   - {{reference}}, {{created_at_fr}}, {{valid_until_fr}}, {{status_label}}
 *   - {{recipient_name}} (client / prospect)
 *   - {{lines_rows_html}}
 *   - {{total_ht_fr}}, {{tva_label}}, {{tva_amount_fr}}, {{total_ttc_fr}}
 *   - {{notes_block_html}}, {{signature_block_html}} (texte signataire si dispo)
 *   - {{mentions_legales_html}}
 */

export const DEVIS_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Proposition {{reference}}</title>
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
    margin-bottom: 24px;
    border-bottom: 2px solid #2563eb;
    padding-bottom: 12px;
  }
  .org-name { font-size: 16pt; font-weight: 700; color: #111827; margin-bottom: 4px; }
  .org-info { font-size: 9pt; color: #4b5563; line-height: 1.5; }
  .header-right { text-align: right; min-width: 160px; }
  .logo { max-width: 140px; max-height: 70px; object-fit: contain; }
  .doc-title {
    text-align: center;
    font-size: 22pt;
    font-weight: 800;
    color: #2563eb;
    letter-spacing: 2px;
    margin: 18px 0 8px;
  }
  .doc-meta {
    display: flex;
    justify-content: space-between;
    margin-bottom: 18px;
    font-size: 10pt;
  }
  .doc-meta-block strong { color: #111827; }
  .recipient-block {
    border-left: 3px solid #2563eb;
    padding: 8px 12px;
    background: #eff6ff;
    margin-bottom: 18px;
  }
  .recipient-block .label {
    font-size: 9pt;
    color: #2563eb;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }
  .recipient-block .name { font-weight: 700; }
  table.lines {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 14px;
  }
  table.lines th {
    background: #2563eb;
    color: #fff;
    padding: 8px 10px;
    text-align: left;
    font-size: 9pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  table.lines th.num { text-align: right; }
  table.lines td {
    padding: 8px 10px;
    border-bottom: 1px solid #e5e7eb;
    font-size: 10pt;
  }
  table.lines td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .totals {
    margin-left: auto;
    width: 240px;
    font-size: 10pt;
  }
  .totals-row { display: flex; justify-content: space-between; padding: 6px 10px; }
  .totals-row.ttc {
    border-top: 2px solid #2563eb;
    font-weight: 800;
    font-size: 12pt;
    background: #eff6ff;
    margin-top: 4px;
  }
  .notes {
    margin-top: 22px;
    padding: 10px 12px;
    background: #f0fdf4;
    border-left: 3px solid #16a34a;
    font-size: 9.5pt;
  }
  .signature-block {
    margin-top: 24px;
    padding: 12px;
    border: 1px dashed #6b7280;
    background: #f9fafb;
    font-size: 10pt;
  }
  .signature-block .label {
    font-size: 9pt;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }
  .mentions {
    margin-top: 24px;
    font-size: 8pt;
    color: #6b7280;
    line-height: 1.4;
  }
  .footer-stamp { margin-top: 30px; text-align: right; }
  .stamp {
    max-width: 110px;
    max-height: 110px;
    object-fit: contain;
    opacity: 0.85;
  }
</style>
</head>
<body>

<div class="header">
  <div class="header-left">
    <div class="org-name">{{entity_name}}</div>
    <div class="org-info">
      {{entity_address}}<br>
      {{entity_postal_code}} {{entity_city}}<br>
      SIRET : {{entity_siret}} · NDA : {{entity_nda}}<br>
      Tél : {{entity_phone}} · {{entity_email}}<br>
      {{entity_website}}
    </div>
  </div>
  <div class="header-right">
    {{entity_logo_html}}
  </div>
</div>

<h1 class="doc-title">PROPOSITION COMMERCIALE</h1>

<div class="doc-meta">
  <div class="doc-meta-block">
    <strong>Référence :</strong> {{reference}}<br>
    <strong>Date d'émission :</strong> {{created_at_fr}}<br>
    <strong>Valable jusqu'au :</strong> {{valid_until_fr}}<br>
    <strong>Statut :</strong> {{status_label}}
  </div>
</div>

<div class="recipient-block">
  <div class="label">Destinataire</div>
  <div class="name">{{recipient_name}}</div>
</div>

<table class="lines">
  <thead>
    <tr>
      <th>Description</th>
      <th class="num">Qté</th>
      <th class="num">PU HT</th>
      <th class="num">Total HT</th>
    </tr>
  </thead>
  <tbody>
    {{lines_rows_html}}
  </tbody>
</table>

<div class="totals">
  <div class="totals-row">
    <span>Total HT</span>
    <strong>{{total_ht_fr}}</strong>
  </div>
  <div class="totals-row">
    <span>{{tva_label}}</span>
    <strong>{{tva_amount_fr}}</strong>
  </div>
  <div class="totals-row ttc">
    <span>Total TTC</span>
    <strong>{{total_ttc_fr}}</strong>
  </div>
</div>

{{notes_block_html}}

{{signature_block_html}}

<div class="mentions">
  {{mentions_legales_html}}
</div>

<div class="footer-stamp">
  {{entity_stamp_html}}
</div>

</body>
</html>`;
