/**
 * Template HTML facture pour génération PDF côté serveur (em-c-10).
 *
 * Usage : appelé par resolveFacture dans email-attachments-resolver.ts.
 * Substitution Mustache simple `{{var}}` (pas Sellsy `[%xxx%]`) car le contexte
 * financier (entity + invoice + lines) diffère du contexte pédagogique
 * (session + learner + company + trainer) utilisé par les 30 autres templates.
 *
 * Visuellement proche du PDF jsPDF de TabFinances mais pas pixel-perfect.
 * Story em-c-12 future pour unifier les 2 versions.
 *
 * Variables disponibles (toutes substituées avant Puppeteer) :
 *   - {{entity_name}}, {{entity_address}}, {{entity_postal_code}}, {{entity_city}}
 *   - {{entity_siret}}, {{entity_nda}}, {{entity_phone}}, {{entity_email}}, {{entity_website}}
 *   - {{entity_logo_html}} (img tag ou vide si pas de logo)
 *   - {{entity_stamp_html}} (img tag ou vide)
 *   - {{entity_footer_text}}, {{entity_penalty_text}}
 *   - {{doc_title}} = "FACTURE" ou "AVOIR" selon is_avoir
 *   - {{reference}}, {{created_at_fr}}, {{due_date_fr}}, {{status_label}}
 *   - {{recipient_name}}, {{recipient_address_block}} (block adresse multi-lignes)
 *   - {{session_title}}, {{session_period}} (e.g. "du 01/06/2026 au 03/06/2026")
 *   - {{lines_rows_html}} (tr×N pré-renderés)
 *   - {{total_ht_fr}}, {{tva_label}}, {{tva_amount_fr}}, {{total_ttc_fr}}
 *   - {{notes_block_html}} (block notes ou vide)
 *   - {{bank_block_html}} (block coordonnées bancaires ou vide)
 *   - {{mentions_legales_html}}
 */

export const FACTURE_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>{{doc_title}} {{reference}}</title>
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
    border-bottom: 2px solid #374151;
    padding-bottom: 12px;
  }
  .header-left {
    flex: 1;
  }
  .org-name {
    font-size: 16pt;
    font-weight: 700;
    color: #111827;
    margin-bottom: 4px;
  }
  .org-info {
    font-size: 9pt;
    color: #4b5563;
    line-height: 1.5;
  }
  .header-right {
    text-align: right;
    min-width: 160px;
  }
  .logo {
    max-width: 140px;
    max-height: 70px;
    object-fit: contain;
  }
  .doc-title {
    text-align: center;
    font-size: 22pt;
    font-weight: 800;
    color: #1f2937;
    letter-spacing: 2px;
    margin: 18px 0 8px;
  }
  .doc-meta {
    display: flex;
    justify-content: space-between;
    margin-bottom: 18px;
    font-size: 10pt;
  }
  .doc-meta-block {
    flex: 1;
  }
  .doc-meta-block strong { color: #111827; }
  .recipient-block {
    border-left: 3px solid #6b7280;
    padding: 8px 12px;
    background: #f9fafb;
    margin-bottom: 18px;
  }
  .recipient-block .label {
    font-size: 9pt;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }
  .recipient-block .name { font-weight: 700; }
  .session-info {
    background: #eff6ff;
    border-left: 3px solid #3b82f6;
    padding: 8px 12px;
    margin-bottom: 18px;
    font-size: 10pt;
  }
  table.lines {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 14px;
  }
  table.lines th {
    background: #374151;
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
  .totals-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 10px;
  }
  .totals-row.ttc {
    border-top: 2px solid #374151;
    font-weight: 800;
    font-size: 12pt;
    background: #f3f4f6;
    margin-top: 4px;
  }
  .notes {
    margin-top: 22px;
    padding: 10px 12px;
    background: #fffbeb;
    border-left: 3px solid #f59e0b;
    font-size: 9.5pt;
  }
  .bank-block {
    margin-top: 18px;
    padding: 10px 12px;
    background: #f3f4f6;
    font-size: 9pt;
  }
  .bank-block strong { color: #111827; }
  .mentions {
    margin-top: 24px;
    font-size: 8pt;
    color: #6b7280;
    line-height: 1.4;
  }
  .footer-stamp {
    margin-top: 30px;
    text-align: right;
  }
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

<h1 class="doc-title">{{doc_title}}</h1>

<div class="doc-meta">
  <div class="doc-meta-block">
    <strong>Référence :</strong> {{reference}}<br>
    <strong>Date d'émission :</strong> {{created_at_fr}}<br>
    <strong>Échéance :</strong> {{due_date_fr}}<br>
    <strong>Statut :</strong> {{status_label}}
  </div>
</div>

<div class="recipient-block">
  <div class="label">Destinataire</div>
  <div class="name">{{recipient_name}}</div>
  {{recipient_address_block}}
</div>

{{session_block_html}}

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

{{bank_block_html}}

<div class="mentions">
  {{mentions_legales_html}}
</div>

<div class="footer-stamp">
  {{entity_stamp_html}}
</div>

</body>
</html>`;
